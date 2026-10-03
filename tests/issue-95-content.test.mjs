// Hollow Beacon v14 (#95): the v13 module with its player-facing text
// rewritten as plain story after the first unfamiliar-player session, and
// without the four generic assessment checks. Mechanics are unchanged.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadAdventure } from "../dist/adventure-loader.js";
import { browserInformation } from "../dist/browser-information.js";
import {
  BROWSER_RELEASES,
  startableCharacterAdventures,
} from "../dist/browser-releases.js";
import { createCharacter } from "../dist/character-rules.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { SaveSession } from "../dist/save.js";

const raw = async (file) =>
  JSON.parse(
    await readFile(
      fileURLToPath(new URL(`../adventures/${file}`, import.meta.url)),
      "utf8",
    ),
  );
const v13 = () => raw("hollow-beacon-examine.json");
const v14 = () => raw("hollow-beacon-story.json");

/** Every string a player can read, with its JSON path. */
function playerText(content) {
  const out = [];
  const walk = (value, path) => {
    if (typeof value === "string") {
      out.push([path, value]);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
    } else if (value !== null && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        walk(item, `${path}.${key}`);
      }
    }
  };
  for (const key of [
    "introduction",
    "objective",
    "locations",
    "features",
    "discoveries",
    "searches",
    "clocks",
    "monsterDefinitions",
    "items",
    "endings",
  ]) {
    walk(content[key], key);
  }
  for (const [index, npc] of content.npcs.entries()) {
    walk(npc.topics, `npcs[${index}].topics`);
    walk(npc.remains, `npcs[${index}].remains`);
  }
  walk(content.characterAdventure.checks, "characterAdventure.checks");
  // Ids, aliases and conditions are not prose.
  return out.filter(
    ([path]) => !/\.(id|aliases\[\d+\]|type|locationId|featureId)$/.test(path),
  );
}

test("v14 starts new Hollow Beacon adventures; v13 saves keep continuing", async () => {
  const rows = BROWSER_RELEASES.filter(
    ({ id, mode }) => id === "hollow-beacon" && mode === "character",
  );
  assert.deepEqual(
    rows.map(({ version, starts }) => [version, starts]),
    [
      ["12", false],
      ["13", false],
      ["14", true],
    ],
  );
  const v14Row = rows.at(-1);
  assert.equal(v14Row.file, "hollow-beacon-story.json");
  assert.equal(v14Row.rulesVersion, "character-adventure-rules-v2");
  assert.equal(v14Row.schemaVersion, 17);
  assert.deepEqual(
    (await startableCharacterAdventures()).map(
      ({ snapshot }) => `${snapshot.id}@${snapshot.contentVersion}`,
    ),
    ["hollow-beacon@14", "stonebridge@1"],
  );
});

test("v14 keeps v13's structure apart from the removed checks and bluff", async () => {
  const [before, after] = [await v13(), await v14()];
  assert.equal(after.contentVersion, "14");
  assert.equal(after.rulesVersion, before.rulesVersion);
  const shape = (content) =>
    JSON.stringify(content, (key, value) =>
      typeof value === "string" &&
      ![
        "id",
        "type",
        "locationId",
        "featureId",
        "destinationId",
        "targetId",
      ].includes(key)
        ? "text"
        : value,
    );
  // v14 also drops Iona's bluff, its correction and the bluff's roll.
  const bluff = ["safe-signal", "correct-signal"];
  const withoutChecks = (content) => ({
    ...content,
    contentVersion: "",
    npcs: content.npcs.map((npc) => ({
      ...npc,
      topics: npc.topics.filter(({ id }) => !bluff.includes(id)),
    })),
    socialChallenges: content.socialChallenges.filter(
      ({ id }) => id !== "iona-safe-signal",
    ),
    characterAdventure: {
      ...content.characterAdventure,
      socialAbilities: content.characterAdventure.socialAbilities.filter(
        ({ challengeId }) => challengeId !== "iona-safe-signal",
      ),
      checks: [],
      rewards: [],
    },
  });
  assert.equal(
    shape(withoutChecks(after)),
    shape(withoutChecks(before)),
    "only text, the assessment checks and the bluff change",
  );
  assert.deepEqual(
    after.characterAdventure.checks.map(({ id }) => id),
    ["read-beacon"],
  );
  assert.deepEqual(
    after.characterAdventure.rewards.map(({ id }) => id),
    ["hollow-beacon-completion", "hollow-beacon-read-beacon"],
  );
  assert.equal(loadAdventure(JSON.stringify(after)).ok, true);
});

test("v14 player text is free of engine jargon", async () => {
  const jargon =
    /\bDC \d|remembered|reroll|\b0 days\b|no dice|min\(|\bsession\b|[Gg]ameplay|milestone|local walk|\bconfirm(s|ed)? no\b|no rescue is/;
  const offending = playerText(await v14()).filter(([, text]) =>
    jargon.test(text),
  );
  assert.deepEqual(offending, []);
  // The same check finds plenty in v13, so it is a real check.
  assert.ok(
    playerText(await v13()).filter(([, text]) => jargon.test(text)).length > 40,
  );
});

test("v14 opens with a story that introduces the watch, the beacon and the deadline", async () => {
  const { introduction, npcs } = await v14();
  const paragraphs = introduction.split("\n\n");
  assert.ok(paragraphs.length >= 4);
  assert.ok(paragraphs.every((paragraph) => paragraph.length <= 420));
  for (const needed of [
    /Captain Iona, who commands the beacon watch/,
    /aims it at the fork/,
    /Day 3/,
    /Ridge Trail takes 2 days/,
    /Valley Road is safe but takes 4 days/,
  ]) {
    assert.match(introduction, needed);
  }
  const iona = npcs.find(({ id }) => id === "iona");
  const names = iona.topics.map(({ name }) => name);
  assert.ok(!names.some((name) => /familiar signal|how the watch/.test(name)));
  // The bluff had no story reason to exist (owner playtest).
  assert.ok(!names.some((name) => /bluff/i.test(name)));
  assert.ok(!iona.topics.some(({ intent }) => intent === "claim"));
});

test("v14 journal leads are plain directions; v13 keeps its released leads", async () => {
  const leads = async (file) => {
    const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-95-leads-"));
    try {
      const runtime = createDataRuntime(
        loadAdventure(JSON.stringify(await raw(file))).adventure,
        createCharacter("Ada", "balanced"),
      );
      const session = await SaveSession.start(
        join(directory, "save.json"),
        runtime,
        0,
      );
      return browserInformation(session).currentLeads;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
  assert.deepEqual(await leads("hollow-beacon-story.json"), [
    "Find out whether the beacon's aim was changed: examine the setting plate in the Signal Records Room, or the camp survey and the sighting frame at the Refugee Overlook.",
  ]);
  assert.deepEqual(await leads("hollow-beacon-examine.json"), [
    "Compare the setting plate at the watch or the camp survey and sighting frame. Testimony and beliefs remain attributed accounts.",
  ]);
});
