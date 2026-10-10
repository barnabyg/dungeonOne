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
//
// The test files run concurrently, then the files that measure CPU time on
// their own: other processes sharing the cores inflate a process's CPU time
// (by about half on a loaded machine), so a budget measured alongside them
// fails on load, not on a slower engine. At most half the hardware threads
// run test files at once: many test files start a browser or a launcher of
// their own, and one per thread starves them past their timeouts.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { pathToFileURL } from "node:url";

import { CONTENT_TESTS } from "../tests/fixtures/content-tests.mjs";
import { selectForChanges, TIERS, tiersOf } from "./test-tiers.mjs";

/** Test files with a CPU-time budget, run after the rest, one at a time. */
const ALONE = ["tests/shipped-modules.test.mjs"];

/** The environment variable naming the only shipped modules to gate. */
export const MODULES_VARIABLE = "DUNGEON_ONE_TEST_MODULES";

const USAGE = [
  "Usage: npm test -- [--tier <tier,tier>] [--modules <id,id>] [tests/x.test.mjs ...]",
  "       [--test-name-pattern <pattern>]",
  "       npm test -- --changed [<base>]",
  `Tiers: ${TIERS.join(", ")}.`,
].join("\n");

/** Reads the command line. */
export function parseArguments(args) {
  const parsed = {
    tiers: [],
    modules: [],
    files: [],
    changed: undefined,
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
  if (
    parsed.tiers.some((tier) => !TIERS.includes(tier)) ||
    (parsed.changed !== undefined &&
      (parsed.tiers.length > 0 ||
        parsed.files.length > 0 ||
        parsed.modules.length > 0))
  ) {
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
 * was chosen and why.
 */
export function plan(parsed, files, changes = changedPaths) {
  const lines = [];
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

function main(args) {
  let chosen;
  let parsed;
  try {
    parsed = parseArguments(args);
    chosen = plan(parsed, testFiles());
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
  process.exitCode = main(process.argv.slice(2));
}
