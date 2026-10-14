// #438: the thirteen modules the four-module plan (docs/four-module-plan.md)
// retires in #446 are named only where retiring them deletes or edits the
// name: their own files and tests, the gate verdicts, the shipped-module
// lists, and the docs and README. Every other test plays a fixture or a kept
// module, so the retirement is pure deletion. The check matches module ids
// and full titles, not single title words.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Each retiring module's id and the title words that name it. */
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
  pattern: new RegExp(`\\b${id}\\b|${title.replace(/'/gu, "['’]")}`, "u"),
}));

/**
 * The places allowed to name a retiring module, each with why. `lines`, when
 * given, is what every naming line must match.
 */
const ALLOWED = [
  [/^docs\//u, "the rules entries and history: handoffs, plans, ADRs"],
  [/^[^/]+\.md$/u, "the README's entries and the old ticket proposals"],
  [/^adventures\/5e\/[a-z-]+\.json$/u, "the modules and their gate verdicts"],
  [
    /^tests\/(?:shepherds-bothy|drowned-chapel|gravediggers-lodge|ravagers-tower|hollow-chantry|mallow-counting-house|wolfstone-hillfort)\.test\.mjs$/u,
    "a module's own content tests",
  ],
  [
    /^tests\/issue-(?:211|241|275|289)(?:-browser)?\.test\.mjs$/u,
    "a release module's own tests: its content, release run and handoff",
  ],
  [
    /^(?:tests\/shipped-modules\.test\.mjs|tests\/fixtures\/content-tests\.mjs|src\/release-run-5e\.ts|scripts\/qualify-release-live\.mjs)$/u,
    "the shipped modules' tests, routes and release runs, edited in #446",
  ],
  [
    /^src\/adventure-5e\.ts$/u,
    "the shipped module list",
    /^ {2}"[a-z-]+": "[a-z-]+\.json",$/u,
  ],
  [/^tests\/retiring-modules\.test\.mjs$/u, "this check"],
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
    const allowed = ALLOWED.find(([where]) => where.test(path));
    if (allowed !== undefined && allowed[2] === undefined) {
      continue;
    }
    const source = await readFile(`${root}${path}`, "utf8");
    source.split(/\r?\n/u).forEach((line, index) => {
      if (allowed?.[2]?.test(line)) {
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

test("the check finds a module's id or full title, not a lone title word", () => {
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
  ]) {
    assert.deepEqual(named(unrelated), []);
  }
});
