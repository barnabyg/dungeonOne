// #251: engine, runtime, browser and harness tests play test-owned modules
// from tests/fixtures/, so a change to a shipped module in adventures/5e/
// breaks only the tests about that content. This test scans every test file
// and fixture for the ways a test can reach a shipped module: its path, the
// built-in loader, its id or title, a browser server that loads the built-in
// modules by default, or the real launcher.
import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * The tests about shipped content, and why each may read a shipped module.
 * Everything else under tests/ must use fixtures.
 */
export const CONTENT_TESTS = new Map([
  [
    "tests/fixture-separation.test.mjs",
    "this check: it names the shipped modules to look for them",
  ],
  [
    "tests/shipped-modules.test.mjs",
    "loads and validates every shipped module, its budget and tiers, the gate's verdict on each, and the browser's adventure list",
  ],
  [
    "tests/abandoned-delve.test.mjs",
    "the Abandoned Delve's content, gate verdict and scripted runs",
  ],
  [
    "tests/abandoned-delve-browser.test.mjs",
    "the Abandoned Delve's handoff run through the browser",
  ],
  [
    "tests/issue-137-browser.test.mjs",
    "the default launch's handoff run of the Abandoned Delve, which only the shipped modules reach",
  ],
  [
    "tests/issue-138.test.mjs",
    "the command-line adapter and the DM evaluation, which play the Abandoned Delve by design",
  ],
  ["tests/issue-140.test.mjs", "the #140 release run of the Abandoned Delve"],
  [
    "tests/issue-211.test.mjs",
    "the Tinker's Toll's content, gate verdict and #211 release run",
  ],
  [
    "tests/issue-211-browser.test.mjs",
    "the Tinker's Toll's handoff run through the browser",
  ],
]);

/**
 * Tests that start the real launcher, which loads the shipped modules, only
 * to check how it starts and what it refuses.
 */
const LAUNCHER_TESTS = new Set(["tests/issue-137.test.mjs"]);

async function testFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return testFiles(path);
      }
      return entry.name.endsWith(".mjs") ? [path] : [];
    }),
  );
  return files.flat();
}

/** The text inside the bracket at `start` in `source` and its match. */
function bracketed(source, start) {
  const open = source[start];
  const close = open === "(" ? ")" : "}";
  let depth = 0;
  let end = start;
  do {
    depth += source[end] === open ? 1 : source[end] === close ? -1 : 0;
    end++;
  } while (depth > 0 && end < source.length);
  return source.slice(start + 1, end - 1);
}

/** The argument text of each call to `name` in `source`. */
const callArguments = (source, name) =>
  [...source.matchAll(new RegExp(`\\b${name}\\(`, "gu"))].map((match) =>
    bracketed(source, match.index + match[0].length - 1),
  );

/**
 * Whether a browser server's options `args` name its adventures, directly or
 * in an object constant they spread.
 */
function namesAdventures(source, args) {
  return (
    /\badventures\b/u.test(args) ||
    [...args.matchAll(/\.\.\.(\w+)/gu)].some(([, name]) => {
      const defined = new RegExp(`\\bconst ${name} = \\{`, "u").exec(source);
      return (
        defined !== null &&
        /\badventures\b/u.test(
          bracketed(source, defined.index + defined[0].length - 1),
        )
      );
    })
  );
}

const shipped = await loadBuiltInFifthAdventures();
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const RULES = [
  ["names a shipped module's path", /adventures\/5e\/(?!bestiary\.json)/u],
  [
    "loads the built-in modules",
    /\b(?:loadBuiltInFifthAdventures|FIFTH_ADVENTURE_FILES)\b/u,
  ],
  ...shipped.flatMap(({ id, title }) => [
    [
      `names shipped module id ${id}`,
      new RegExp(`(?<![\\w-])${id}(?![\\w-])`, "u"),
    ],
    [
      `names shipped module title ${title}`,
      new RegExp(escape(title.replace(/^The /u, "")), "iu"),
    ],
  ]),
];

/** Why `file`, whose text is `source`, reaches a shipped module, if it does. */
function violations(file, source) {
  const found = RULES.filter(([, pattern]) => pattern.test(source)).map(
    ([reason]) => reason,
  );
  if (
    callArguments(source, "startFifthBrowserServer").some(
      (args) => !namesAdventures(source, args),
    )
  ) {
    found.push("starts a browser server on the built-in modules");
  }
  if (
    /\blaunchDefault\(/u.test(source) &&
    !LAUNCHER_TESTS.has(file) &&
    !file.endsWith("fixtures/default-launch.mjs")
  ) {
    found.push("plays through the real launcher");
  }
  return found;
}

test("only the content tests read a shipped module (#251)", async () => {
  const files = await testFiles(join(root, "tests"));
  const reaching = [];
  for (const path of files) {
    const file = relative(root, path).replaceAll("\\", "/");
    if (CONTENT_TESTS.has(file)) {
      continue;
    }
    const found = violations(file, await readFile(path, "utf8"));
    if (found.length > 0) {
      reaching.push(`${file}: ${found.join("; ")}`);
    }
  }
  assert.deepEqual(reaching, []);
});

test("the check catches each way a test can reach a shipped module (#251)", () => {
  const [{ id, title }] = shipped;
  for (const source of [
    'readFile("../adventures/5e/x.json")',
    "await loadBuiltInFifthAdventures()",
    `find(({ id }) => id === "${id}")`,
    `getByRole("button", { name: "Start ${title}" })`,
    "await startFifthBrowserServer({ libraryPath, seed: 0 })",
    "const OPTIONS = { seed: 0 }; await startFifthBrowserServer({ ...OPTIONS })",
    "await launchDefault(directory, args)",
  ]) {
    assert.notDeepEqual(violations("tests/x.test.mjs", source), [], source);
  }
  for (const source of [
    'loadBuiltInFifthBestiary(); new URL("../adventures/5e/bestiary.json")',
    `const ${id.replaceAll("-", "")}Fixture = "${id}-fixture";`,
    "await startFifthBrowserServer({ libraryPath, seed: 0, adventures })",
    "const OPTIONS = { adventures: [loneGoblin] }; await startFifthBrowserServer({ ...OPTIONS, seed: 0 })",
  ]) {
    assert.deepEqual(violations("tests/x.test.mjs", source), [], source);
  }
});

test("every content test exists (#251)", async () => {
  const files = new Set(
    (await testFiles(join(root, "tests"))).map((path) =>
      relative(root, path).replaceAll("\\", "/"),
    ),
  );
  for (const file of [...CONTENT_TESTS.keys(), ...LAUNCHER_TESTS]) {
    assert.ok(files.has(file), file);
  }
});
