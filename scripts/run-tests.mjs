// Runs the test files: all of them by default (verify and CI), or the tiers
// or files asked for (scripts/test-tiers.mjs; AGENTS.md says which to run
// when).
//
//   npm test                                  every test file
//   npm test -- --tier quick                  one tier (or quick,browser)
//   npm test -- --tier content --modules a,b  gate only those shipped modules
//   npm test -- --changed [<base>]            what the changes since <base>
//                                             (origin/main) call for
//   npm test -- tests/x.test.mjs ...          just those files
//   npm test -- --test-name-pattern <pattern> only the tests it matches
//   npm test -- --ci-part <part>              one of the parts CI runs on its
//                                             own runner (CI_PARTS)
//
// The test files run concurrently, then the files that run worker threads of
// their own, one at a time. At most half the hardware threads run test files
// at once: many test files start a browser or a launcher of their own, and
// one per thread, or a file's workers beside them, starves them past their
// timeouts. Every test has a 10-minute timeout unless it sets its own, so a
// frozen test fails instead of running on (#469).
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { pathToFileURL } from "node:url";

import { CONTENT_TESTS } from "../tests/fixtures/content-tests.mjs";
import { selectForChanges, TIERS, tiersOf } from "./test-tiers.mjs";

/** Test files that run worker threads, run after the rest, one at a time. */
const ALONE = ["tests/shipped-modules.test.mjs"];

/**
 * The parts CI splits every test file into, each on its own runner beside
 * the others (.github/workflows/verify.yml lists them): `checks` runs the
 * files that start no browser, `browser-<n>` every other browser file, and
 * `gate-<n>` the files that run worker threads, gating a share of the
 * shipped modules (gateShares).
 */
export const CI_PARTS = Object.freeze([
  "checks",
  "browser-1",
  "browser-2",
  "gate-1",
  "gate-2",
]);

/** The number of CI parts named `<kind>-<n>`. */
const ciShards = (kind) =>
  CI_PARTS.filter((part) => part.startsWith(`${kind}-`)).length;

/** Each test's timeout unless it sets its own: a hang guard only (#469). */
const TEST_TIMEOUT_MS = 10 * 60_000;

/** The environment variable naming the only shipped modules to gate. */
export const MODULES_VARIABLE = "DUNGEON_ONE_TEST_MODULES";

const USAGE = [
  "Usage: npm test -- [--tier <tier,tier>] [--modules <id,id>] [tests/x.test.mjs ...]",
  "       [--test-name-pattern <pattern>]",
  "       npm test -- --changed [<base>]",
  "       npm test -- --ci-part <part>",
  `Tiers: ${TIERS.join(", ")}.`,
  `CI parts: ${CI_PARTS.join(", ")}.`,
].join("\n");

/** Reads the command line. */
export function parseArguments(args) {
  const parsed = {
    tiers: [],
    modules: [],
    files: [],
    changed: undefined,
    ciPart: undefined,
    nodeArgs: [],
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index].replaceAll("\\", "/");
    const list = () => {
      index += 1;
      if (index >= args.length) {
        throw new Error(USAGE);
      }
      return args[index].split(",").filter(Boolean);
    };
    if (argument === "--tier") {
      parsed.tiers.push(...list());
    } else if (argument === "--modules") {
      parsed.modules.push(...list());
    } else if (argument === "--ci-part") {
      index += 1;
      if (index >= args.length || !CI_PARTS.includes(args[index])) {
        throw new Error(USAGE);
      }
      parsed.ciPart = args[index];
    } else if (argument === "--changed") {
      const next = args[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        parsed.changed = next;
        index += 1;
      } else {
        parsed.changed = "origin/main";
      }
    } else if (/^tests\/[^/]+\.test\.mjs$/u.test(argument)) {
      parsed.files.push(argument);
    } else if (argument === "--test-name-pattern") {
      // Passed on to node --test, which runs only the tests it matches.
      index += 1;
      if (index >= args.length) {
        throw new Error(USAGE);
      }
      parsed.nodeArgs.push(argument, args[index]);
    } else if (argument.startsWith("--test-name-pattern=")) {
      parsed.nodeArgs.push(args[index]);
    } else {
      throw new Error(USAGE);
    }
  }
  const chooses =
    (parsed.changed !== undefined ? 1 : 0) +
    (parsed.ciPart !== undefined ? 1 : 0) +
    (parsed.tiers.length > 0 ||
    parsed.files.length > 0 ||
    parsed.modules.length > 0
      ? 1
      : 0);
  if (parsed.tiers.some((tier) => !TIERS.includes(tier)) || chooses > 1) {
    throw new Error(USAGE);
  }
  // Modules alone ask for their content tests.
  if (
    parsed.modules.length > 0 &&
    parsed.tiers.length === 0 &&
    parsed.files.length === 0
  ) {
    parsed.tiers.push("content");
  }
  return parsed;
}

/** Every test file under `directory`, with its tiers. */
export function testFiles(directory = "tests") {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => {
      const path = `tests/${name}`;
      return {
        path,
        tiers: tiersOf(
          path,
          readFileSync(`${directory}/${name}`, "utf8"),
          CONTENT_TESTS,
        ),
      };
    });
}

/** The files changed since `base`: committed, staged, unstaged or new. */
function changedPaths(base) {
  const git = (args) => {
    const result = spawnSync("git", args, { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
    }
    return result.stdout.split("\n").filter(Boolean);
  };
  const [mergeBase] = git(["merge-base", base, "HEAD"]);
  return [
    ...new Set([
      ...git(["diff", "--name-only", mergeBase]),
      ...git(["ls-files", "--others", "--exclude-standard"]),
    ]),
  ].sort();
}

/**
 * The test files to run and the shipped modules to gate (none: every one)
 * for `parsed`, given every test file and its tiers, and lines that say what
 * was chosen and why. A CI part's files are `files` cut by kind and shard;
 * a gate part's modules are its share of `shares` (gateShares).
 */
export function plan(parsed, files, changes = changedPaths, shares = []) {
  const lines = [];
  if (parsed.ciPart !== undefined) {
    const [kind, shard] = parsed.ciPart.split("-");
    const browser = ({ path, tiers }) =>
      tiers.includes("browser") && !ALONE.includes(path);
    let chosen;
    let modules = [];
    if (kind === "checks") {
      chosen = files.filter(
        (file) => !browser(file) && !ALONE.includes(file.path),
      );
    } else if (kind === "browser") {
      chosen = files
        .filter(browser)
        .filter((_, index) => index % ciShards(kind) === shard - 1);
    } else {
      chosen = files.filter(({ path }) => ALONE.includes(path));
      modules = shares[shard - 1] ?? [];
      if (shares.length !== ciShards(kind) || modules.length === 0) {
        throw new Error(
          `CI part ${parsed.ciPart} has no shipped modules to gate.`,
        );
      }
    }
    const gating = modules.length > 0 ? `, gating ${modules.join(", ")}` : "";
    lines.push(
      `Running CI part ${parsed.ciPart}${gating}: ${chosen.length} files.`,
    );
    return { files: chosen.map(({ path }) => path), modules, lines };
  }
  let { tiers, modules, files: named } = parsed;
  if (parsed.changed !== undefined) {
    const selected = selectForChanges(changes(parsed.changed));
    lines.push(
      `Changes since ${parsed.changed}:`,
      ...selected.reasons.map((reason) => `  ${reason}`),
    );
    if (selected.full) {
      lines.push(`Running every test file: ${files.length} files.`);
      return { files: files.map(({ path }) => path), modules: [], lines };
    }
    ({ tiers, modules, files: named } = selected);
    if (tiers.length === 0 && named.length === 0) {
      lines.push("No test file covers these changes.");
      return { files: [], modules: [], lines };
    }
  }
  if (tiers.length === 0 && named.length === 0) {
    return { files: files.map(({ path }) => path), modules, lines };
  }
  const known = new Set(files.map(({ path }) => path));
  const missing = named.filter((path) => !known.has(path));
  if (missing.length > 0) {
    throw new Error(`No such test file: ${missing.join(", ")}`);
  }
  const chosen = files
    .filter(
      (file) =>
        file.tiers.some((tier) => tiers.includes(tier)) ||
        named.includes(file.path),
    )
    .map(({ path }) => path);
  const what = [
    ...(tiers.length > 0 ? [`the ${tiers.join(" and ")} tier`] : []),
    ...(named.length > 0 ? [named.join(", ")] : []),
  ].join(" and ");
  const gating = modules.length > 0 ? `, gating ${modules.join(", ")}` : "";
  lines.push(`Running ${what}${gating}: ${chosen.length} files.`);
  return { files: chosen, modules, lines };
}

/** The shipped modules dealt into the gate parts' shares (gateShares). */
export async function shippedGateShares() {
  // Loaded only when asked: they need the build that npm test makes first.
  const [{ loadBuiltInFifthAdventures }, { gateShares }] = await Promise.all([
    import("../dist/adventure-5e.js"),
    import("../tests/fixtures/gate-workers.mjs"),
  ]);
  return gateShares(await loadBuiltInFifthAdventures(), ciShards("gate"));
}

async function main(args) {
  let chosen;
  let parsed;
  try {
    parsed = parseArguments(args);
    const shares = parsed.ciPart?.startsWith("gate-")
      ? await shippedGateShares()
      : [];
    chosen = plan(parsed, testFiles(), changedPaths, shares);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
  for (const line of chosen.lines) {
    process.stdout.write(`${line}\n`);
  }
  const concurrency = Math.max(1, Math.floor(availableParallelism() / 2));
  const together = chosen.files.filter((file) => !ALONE.includes(file));
  const alone = chosen.files.filter((file) => ALONE.includes(file));
  const env =
    chosen.modules.length > 0
      ? { ...process.env, [MODULES_VARIABLE]: chosen.modules.join(",") }
      : process.env;
  let failed = false;
  for (const batch of [together, ...alone.map((file) => [file])]) {
    if (batch.length > 0) {
      const { status } = spawnSync(
        process.execPath,
        [
          `--test-concurrency=${concurrency}`,
          `--test-timeout=${TEST_TIMEOUT_MS}`,
          "--test",
          ...parsed.nodeArgs,
          ...batch,
        ],
        { stdio: "inherit", env },
      );
      failed ||= status !== 0;
    }
  }
  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
