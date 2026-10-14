// #438: the thirteen modules the four-module plan (docs/four-module-plan.md)
// retires in #446 are named only where retiring them deletes or edits the
// name: their own files and tests, the gate verdicts, the shipped-module
// lists, and the docs and README. Every other test plays a fixture or a kept
// module, so the retirement is pure deletion. The check matches module ids
// and titles without their article, not single title words.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * Each retiring module's id and its title without the article; the
 * Counting-House on Mallow Quay goes by its first words, as its tests and
 * docs call it.
 */
const RETIRING = {
  "drowned-chapel": "Drowned Chapel",
  "goblin-warren": "Goblin Warren",
  "gravediggers-lodge": "Gravedigger's Lodge",
  "hollow-chantry": "Hollow Chantry",
  "mallow-counting-house": "Counting-House",
  "ravagers-tower": "Ravager's Tower",
  "robbers-barrow": "Robbers' Barrow",
  "shepherds-bothy": "Shepherd's Bothy",
  "silvervein-mine": "Silvervein Mine",
  "smugglers-cellar": "Smugglers' Cellar",
  "tinkers-toll": "Tinker's Toll",
  "warden-crypt": "Warden's Crypt",
  "wolfstone-hillfort": "Wolfstone Hillfort",
};
const NAMES = Object.entries(RETIRING).map(([id, title]) => ({
  id,
  pattern: new RegExp(
    `(?<![\\w-])${id}(?![\\w-])|${title.replace(/'/gu, "['’]")}`,
    "u",
  ),
}));

/** The release modules' own tests, besides any named for the module. */
const RELEASE_TESTS = new Set([
  "tests/issue-211.test.mjs",
  "tests/issue-211-browser.test.mjs",
  "tests/issue-241.test.mjs",
  "tests/issue-241-browser.test.mjs",
  "tests/issue-275-browser.test.mjs",
  "tests/issue-289-browser.test.mjs",
]);

/**
 * The places allowed to name a retiring module: `where` matches the path,
 * and `lines`, when given, is what every naming line must match.
 */
const ALLOWED = [
  // The rules entries and history: handoffs, plans, ADRs.
  { where: (path) => path.startsWith("docs/") },
  // The README's entries and the old ticket proposals.
  {
    where: (path) =>
      /^(?:README|dnd-expansion-implementation-plan|increment-\d+-ticket-proposal)\.md$/u.test(
        path,
      ),
  },
  // The modules and their gate verdicts.
  { where: (path) => /^adventures\/5e\/[a-z-]+\.json$/u.test(path) },
  // A module's own tests.
  {
    where: (path) =>
      RELEASE_TESTS.has(path) ||
      Object.hasOwn(RETIRING, /^tests\/([a-z-]+)\.test\.mjs$/u.exec(path)?.[1]),
  },
  // The shipped modules' tests, routes and release runs, edited in #446.
  {
    where: (path) =>
      [
        "tests/shipped-modules.test.mjs",
        "tests/fixtures/content-tests.mjs",
        "src/release-run-5e.ts",
        "scripts/qualify-release-live.mjs",
      ].includes(path),
  },
  // The shipped module list, and only it.
  {
    where: (path) => path === "src/adventure-5e.ts",
    lines: /^ {2}"[a-z-]+": "[a-z-]+\.json",$/u,
  },
  // This check.
  { where: (path) => path === "tests/retiring-modules.test.mjs" },
];

/** The repository's tracked files, with forward slashes. */
function trackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split("\0").filter((path) => path !== "");
}

/** Each line of `paths` that names a retiring module where it may not. */
async function strayReferences(paths) {
  const stray = [];
  for (const path of paths) {
    const allowed = ALLOWED.find(({ where }) => where(path));
    if (allowed !== undefined && allowed.lines === undefined) {
      continue;
    }
    const source = await readFile(`${root}${path}`, "utf8");
    source.split(/\r?\n/u).forEach((line, index) => {
      if (allowed?.lines.test(line)) {
        return;
      }
      for (const { id, pattern } of NAMES) {
        if (pattern.test(line)) {
          stray.push(`${path}:${index + 1}: names ${id}`);
        }
      }
    });
  }
  return stray;
}

test("a retiring module is named only where retiring it deletes the name", async () => {
  assert.deepEqual(await strayReferences(trackedFiles()), []);
});

test("the check finds a module's id or title, not a lone title word or a longer id", () => {
  const named = (line) =>
    NAMES.filter(({ pattern }) => pattern.test(line)).map(({ id }) => id);
  assert.deepEqual(named('startAdventure(page, "hollow-chantry")'), [
    "hollow-chantry",
  ]);
  assert.deepEqual(named("the Robbers’ Barrow's lintel"), ["robbers-barrow"]);
  assert.deepEqual(named("on to the Counting-House"), [
    "mallow-counting-house",
  ]);
  for (const unrelated of [
    "a Smugglers' Den room",
    "the Wolfstone Reaver",
    "the warden's key",
    "the burned counting-house",
    'startAdventure(page, "hollow-chantry-copy")',
    "the old_hollow-chantry2 id",
  ]) {
    assert.deepEqual(named(unrelated), []);
  }
});
