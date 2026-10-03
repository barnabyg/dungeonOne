import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CharacterCareer } from "../dist/character-career.js";
import { SaveSession } from "../dist/save.js";
import { loadAdventure } from "../dist/adventure-loader.js";
import { CHARACTER_TREASURE_SCHEMA } from "../dist/character-adventure-schema.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { createCharacter, characterProfile } from "../dist/character-rules.js";
import { createSeededRandom } from "../dist/random.js";
import {
  BROWSER_RELEASES,
  startableCharacterAdventures,
} from "../dist/browser-releases.js";
import {
  beaconExamine,
  stonebridgeExamine,
  stonebridgePeaceful,
} from "./fixtures/character-journeys.mjs";

// Hollow Beacon v14 rewritten as a schema 18 document with treasure.
function treasureDocument(treasure) {
  const story = JSON.parse(
    readFileSync("adventures/hollow-beacon-story.json", "utf8"),
  );
  return {
    ...story,
    schemaVersion: 18,
    rulesVersion: "character-adventure-rules-v3",
    characterAdventure: { ...story.characterAdventure, treasure },
  };
}
const PURSE = {
  id: "raider-purse",
  trigger: "actor-defeated",
  targetId: "ridge-raider",
  silver: 6,
  items: [],
};

test("schema 18 adventures award treasure on authored triggers (#119)", () => {
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v18.schema.json", "utf8")),
    CHARACTER_TREASURE_SCHEMA,
  );
  const loaded = loadAdventure(
    JSON.stringify(
      treasureDocument([
        PURSE,
        {
          id: "keeper-draught",
          trigger: "completion",
          targetId: "",
          silver: 0,
          items: ["healing-draught"],
        },
      ]),
    ),
  );
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  assert.equal(loaded.adventure.snapshot.characterAdventure.treasure.length, 2);
});

test("treasure must be unique, reachable and worth something (#119)", () => {
  for (const [treasure, message] of [
    [[{ ...PURSE, targetId: "nobody" }], /unknown trigger target/],
    [[PURSE, PURSE], /unique/],
    [[{ ...PURSE, id: "hollow-beacon-completion" }], /unique/],
    [[{ ...PURSE, silver: 0 }], /awards nothing/],
  ]) {
    const loaded = loadAdventure(JSON.stringify(treasureDocument(treasure)));
    assert.equal(loaded.ok, false);
    assert.match(
      loaded.diagnostics.map(({ message }) => message).join("\n"),
      message,
    );
  }
  const unknownItem = loadAdventure(
    JSON.stringify(treasureDocument([{ ...PURSE, items: ["vorpal-sword"] }])),
  );
  assert.equal(unknownItem.ok, false);
  // Schema 17 keeps its released syntax: no treasure, no rules v3.
  const story = treasureDocument([PURSE]);
  for (const document of [
    { ...story, schemaVersion: 17 },
    {
      ...story,
      characterAdventure: {
        ...story.characterAdventure,
        treasure: undefined,
      },
      rulesVersion: "character-adventure-rules-v2",
    },
  ]) {
    assert.equal(loadAdventure(JSON.stringify(document)).ok, false);
  }
});

const TREASURE = [
  PURSE,
  {
    id: "sack-draught",
    trigger: "discovery",
    targetId: "raider-motive",
    silver: 0,
    items: ["healing-draught"],
  },
  {
    id: "beacon-purse",
    trigger: "completion",
    targetId: "",
    silver: 15,
    items: [],
  },
];
const v3 = (inventory = { silver: 0, items: [] }) => ({
  ...createCharacter("Ada", "stout", "a".repeat(32), "fighter-rules-v3"),
  inventory,
});

/** Plays a command list, failing on any rejection; returns state and text. */
function play(runtime, commands, seed = 0, state = runtime.createSession()) {
  const random = createSeededRandom(seed);
  const texts = [];
  for (const command of commands) {
    const result = runtime.handleAction(
      state,
      runtime.parseCommand(command),
      random,
    );
    assert.equal(result.rejection, undefined, command);
    texts.push(runtime.renderResult(result));
    state = result.state;
  }
  return { state, text: texts.join("\n") };
}

/** Defeats the ridge raider on the first seed the character survives. */
function defeatRaider(runtime) {
  for (let seed = 0; ; seed++) {
    let { state, text } = play(runtime, ["move ridge-trail"], seed);
    const random = createSeededRandom(seed + 1000);
    while (state.status === "playing" && state.combat !== undefined) {
      const result = runtime.handleAction(
        state,
        runtime.parseCommand("attack ridge-raider"),
        random,
      );
      text += "\n" + runtime.renderResult(result);
      state = result.state;
    }
    if (state.status === "playing") {
      return { state, text };
    }
  }
}

const adventure = () => {
  const loaded = loadAdventure(JSON.stringify(treasureDocument(TREASURE)));
  assert.equal(loaded.ok, true);
  return loaded.adventure;
};

test("treasure is found on its triggers and credited on surviving completion (#119)", () => {
  const runtime = createDataRuntime(adventure(), v3());
  const fought = defeatRaider(runtime);
  assert.match(fought.text, /6 silver/);
  assert.deepEqual(
    runtime.projectCharacterStatus(fought.state).pendingTreasure,
    {
      silver: 6,
      items: [],
    },
  );
  const searched = play(
    runtime,
    ["examine supply-sack", "move watch-yard"],
    0,
    fought.state,
  );
  assert.match(searched.text, /Healing draught/i);
  const done = play(runtime, beaconExamine, 0, searched.state);
  assert.equal(done.state.status, "victory");
  assert.match(done.text, /15 silver/);
  assert.match(done.text, /Treasure kept: 21 silver, healing draught/);
  const result = done.state.characterResult;
  assert.deepEqual(result.inventory, {
    silver: 21,
    items: ["healing-draught"],
  });
  for (const id of ["raider-purse", "sack-draught", "beacon-purse"]) {
    assert.ok(result.earnedRewards.includes(id), id);
  }
  // Treasure is earned once per character: a replay finds nothing new.
  const again = createDataRuntime(adventure(), {
    ...result,
    hp: characterProfile(result).maxHp,
  });
  const replay = play(again, beaconExamine);
  assert.doesNotMatch(replay.text, /silver/);
  assert.deepEqual(replay.state.characterResult.inventory, result.inventory);
});

test("characters made before fighter-rules-v3 receive no treasure (#119)", () => {
  const sheet = createCharacter("Bram", "stout", "b".repeat(32));
  const runtime = createDataRuntime(adventure(), sheet);
  const { state, text } = play(runtime, beaconExamine);
  assert.equal(state.status, "victory");
  assert.doesNotMatch(text, /silver/);
  assert.equal(state.characterResult.inventory, undefined);
  assert.equal(
    runtime.projectCharacterStatus(state).pendingTreasure,
    undefined,
  );
});

test("a carried healing draught can be drunk once, and is gone afterwards (#119)", () => {
  const runtime = createDataRuntime(
    adventure(),
    v3({ silver: 3, items: ["healing-draught", "healing-draught"] }),
  );
  const start = runtime.createSession();
  assert.deepEqual(
    runtime
      .projectCharacterStatus(start)
      .collectedItems.map(({ name }) => name),
    ["healing draught", "healing draught"],
  );
  const wounded = { ...start, fighter: { ...start.fighter, hp: 10 } };
  const drunk = runtime.handleAction(
    wounded,
    runtime.parseCommand("use healing draught"),
    { roll: () => 4 },
  );
  assert.equal(drunk.rejection, undefined);
  assert.equal(drunk.state.fighter.hp, 15);
  assert.equal(
    runtime.projectCharacterStatus(drunk.state).collectedItems.length,
    1,
  );
  const done = play(runtime, beaconExamine, 0, drunk.state);
  assert.deepEqual(done.state.characterResult.inventory, {
    silver: 18,
    items: ["healing-draught"],
  });
});

test("released schema 17 sessions are unchanged by treasure (#119)", () => {
  const story = loadAdventure(
    readFileSync("adventures/hollow-beacon-story.json", "utf8"),
  ).adventure;
  const sheet = createCharacter("Bram", "stout", "b".repeat(32));
  const state = createDataRuntime(story, sheet).createSession();
  assert.equal("pendingTreasure" in state, false);
  assert.deepEqual(createDataRuntime(story, v3()).createSession(), {
    ...state,
    character: v3(),
  });
});

const bundled = (file) =>
  JSON.parse(readFileSync(`adventures/${file}`, "utf8"));

test("Hollow Beacon v15 and Stonebridge v2 start new adventures with treasure; earlier releases keep continuing (#119)", async () => {
  const rows = BROWSER_RELEASES.filter(({ mode }) => mode === "character");
  assert.deepEqual(
    rows.map(({ id, version, starts }) => `${id}@${version}:${starts}`),
    [
      "hollow-beacon@12:false",
      "hollow-beacon@13:false",
      "hollow-beacon@14:false",
      "stonebridge@1:false",
      "hollow-beacon@15:true",
      "stonebridge@2:true",
    ],
  );
  for (const row of rows.slice(-2)) {
    assert.equal(row.rulesVersion, "character-adventure-rules-v3");
    assert.equal(row.schemaVersion, 18);
  }
  assert.deepEqual(
    (await startableCharacterAdventures()).map(
      ({ snapshot }) => `${snapshot.id}@${snapshot.contentVersion}`,
    ),
    ["hollow-beacon@15", "stonebridge@2"],
  );
});

test("v15 and Stonebridge v2 change only their tuple and treasure (#119)", () => {
  for (const [before, after] of [
    ["hollow-beacon-story.json", "hollow-beacon-loot.json"],
    ["stonebridge-characters.json", "stonebridge-loot.json"],
  ]) {
    const old = bundled(before);
    const next = bundled(after);
    const { treasure, ...support } = next.characterAdventure;
    assert.deepEqual(
      {
        ...next,
        schemaVersion: old.schemaVersion,
        contentVersion: old.contentVersion,
        rulesVersion: old.rulesVersion,
        characterAdventure: support,
      },
      old,
      after,
    );
    assert.ok(treasure.length > 0);
  }
});

// Treasure stays rare and small: at most one draught and 25 silver per module,
// and the draught needs an optional fight.
test("treasure is rare and of low value (#119)", () => {
  for (const file of ["hollow-beacon-loot.json", "stonebridge-loot.json"]) {
    const { treasure } = bundled(file).characterAdventure;
    assert.ok(treasure.reduce((sum, { silver }) => sum + silver, 0) <= 25);
    assert.ok(treasure.flatMap(({ items }) => items).length <= 1);
  }
  for (const [file, route] of [
    ["hollow-beacon-loot.json", beaconExamine],
    ["stonebridge-loot.json", stonebridgePeaceful],
  ]) {
    const loaded = loadAdventure(readFileSync(`adventures/${file}`, "utf8"));
    assert.equal(loaded.ok, true, file);
    const { state } = play(createDataRuntime(loaded.adventure, v3()), route);
    assert.equal(state.status, "victory");
    assert.deepEqual(state.characterResult.inventory.items, [], file);
    assert.ok(state.characterResult.inventory.silver <= 15, file);
  }
});

// On seed 4 the character wins each optional fight but is wounded.
const STONEBRIDGE_SEED = 4;
const BEACON_SEED = 4;

/** Commits commands to a saved session, failing on any rejection. */
async function commitAll(session, commands) {
  for (const command of commands) {
    const result = await session.commit(
      command,
      session.runtime.parseCommand(command),
    );
    assert.equal(result.rejection, undefined, command);
  }
}

/** Attacks until the fight ends; the chosen seeds win it. */
async function fight(session, opponent) {
  while (session.state.combat !== undefined) {
    await commitAll(session, ["attack " + opponent]);
  }
  assert.equal(session.state.status, "playing");
}

test("the library keeps treasure only on surviving completion, and abandonment rolls back drunk draughts (#119)", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-119-"));
  const career = new CharacterCareer(join(directory, "characters.json"));
  const sheet = async () => (await career.library.read()).characters[0].sheet;
  const start = async (adventure, seed) => {
    const data = await career.library.read();
    return SaveSession.load(
      await career.start(id, adventure, data.revision, seed, true),
    );
  };
  const rest = async () =>
    career.rest(id, (await career.library.read()).revision);
  const abandon = async () =>
    career.abandon(id, (await career.library.read()).revision, true);
  let id;
  try {
    const created = await career.library.create(
      "Ada",
      "stout",
      (await career.library.read()).revision,
    );
    id = created.characters[0].sheet.id;
    // Hollow Beacon on the valley road: only the completion purse.
    let session = await start("hollow-beacon", 0);
    await commitAll(session, beaconExamine);
    await career.acceptSession(session.path);
    assert.deepEqual((await sheet()).inventory, { silver: 10, items: [] });
    await rest();

    // Stonebridge's raider cache is found, then abandoned: nothing is kept.
    session = await start("stonebridge", STONEBRIDGE_SEED);
    await commitAll(session, ["move raider-den"]);
    await fight(session, "toll-raider");
    assert.deepEqual(
      session.runtime.projectCharacterStatus(session.state).pendingTreasure,
      { silver: 5, items: ["healing-draught"] },
    );
    await abandon();
    assert.deepEqual((await sheet()).inventory, { silver: 10, items: [] });
    assert.ok(
      !(await sheet()).earnedRewards.includes("stonebridge-raider-cache"),
    );
    await rest();

    // A second try keeps the cache and the completion share.
    session = await start("stonebridge", STONEBRIDGE_SEED);
    await commitAll(session, ["move raider-den"]);
    await fight(session, "toll-raider");
    await commitAll(session, ["move toll-yard", ...stonebridgeExamine]);
    await career.acceptSession(session.path);
    assert.deepEqual((await sheet()).inventory, {
      silver: 30,
      items: ["healing-draught"],
    });
    await rest();

    // Drinking the draught and abandoning restores it with the rest of the sheet.
    session = await start("hollow-beacon", BEACON_SEED);
    await commitAll(session, ["move ridge-trail"]);
    await fight(session, "ridge-raider");
    assert.ok(session.state.fighter.hp < session.state.fighter.maxHp);
    await commitAll(session, ["use healing draught"]);
    await abandon();
    assert.deepEqual((await sheet()).inventory, {
      silver: 30,
      items: ["healing-draught"],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the DM is told treasure is engine-owned only in treasure releases (#119)", () => {
  const load = (file) =>
    loadAdventure(readFileSync(`adventures/${file}`, "utf8")).adventure;
  const loot = createDataRuntime(load("hollow-beacon-loot.json"), v3());
  assert.equal(loot.promptVersion, "character-adventure-dm-v4");
  assert.equal(loot.toolSchemaVersion, "character-adventure-tools-v3");
  assert.match(loot.systemPrompt, /Treasure is engine-owned/);
  const story = createDataRuntime(load("hollow-beacon-story.json"), v3());
  assert.equal(story.promptVersion, "character-adventure-dm-v3");
  assert.doesNotMatch(story.systemPrompt, /Treasure/);
});
