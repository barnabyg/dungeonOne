// #446: the thirteen modules the four-module plan (docs/four-module-plan.md)
// retired are named only in history: the acceptance handoffs and live-run
// evidence, the ADRs, the plans and the old ticket proposals. Every test plays
// a fixture or one of the four shipped modules, and the README and the rules
// describe only those (#438 set this check up before the retirement). The
// check matches module ids and titles without their article, not single
// title words.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * Each retired module's id and its title without the article; the
 * Counting-House on Mallow Quay goes by its first words, as its tests and
 * docs called it.
 */
const RETIRED = {
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
const NAMES = Object.entries(RETIRED).map(([id, title]) => ({
  id,
  pattern: new RegExp(
    `(?<![\\w-])${id}(?![\\w-])|${title.replace(/'/gu, "['’]")}`,
    "u",
  ),
}));

/** Whether `path` is history, or this check, and so may name a retired module. */
const isHistory = (path) =>
  /^docs\/(?:acceptance|adr)\//u.test(path) ||
  [
    "docs/four-module-plan.md",
    "docs/published-module-survey.md",
    "tests/retired-modules.test.mjs",
  ].includes(path) ||
  /^(?:dnd-expansion-implementation-plan|increment-\d+-ticket-proposal)\.md$/u.test(
    path,
  );

/** The repository's tracked files, with forward slashes. */
function trackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split("\0").filter((path) => path !== "");
}

/** Each line of `paths` that names a retired module outside history. */
async function strayReferences(paths) {
  const stray = [];
  for (const path of paths.filter((entry) => !isHistory(entry))) {
    const source = await readFile(`${root}${path}`, "utf8");
    source.split(/\r?\n/u).forEach((line, index) => {
      for (const { id, pattern } of NAMES) {
        if (pattern.test(line)) {
          stray.push(`${path}:${index + 1}: names ${id}`);
        }
      }
    });
  }
  return stray;
}

test("a retired module is named only in history (#446)", async () => {
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
