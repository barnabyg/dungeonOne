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

// Hollow Beacon v14 rewritten as a schema 18 document with treasure: silver
// found in the supply sack or given by the tower runner, and a draught placed
// in the sack.
const DRAUGHT_ITEM = {
  id: "sack-draught",
  name: "healing draught",
  aliases: ["healing draught", "draught"],
  description: "A small stoppered flask.",
  locationId: "ridge-trail",
  featureId: "supply-sack",
  healing: { dice: 1, sides: 4, modifier: 1, target: "fighter" },
};
function treasureDocument(
  treasure,
  treasureItems = [],
  items = [DRAUGHT_ITEM],
) {
  const story = JSON.parse(
    readFileSync("adventures/hollow-beacon-story.json", "utf8"),
  );
  return {
    ...story,
    schemaVersion: 18,
    rulesVersion: "character-adventure-rules-v3",
    items: [...story.items, ...items],
    characterAdventure: {
      ...story.characterAdventure,
      treasure,
      treasureItems,
    },
  };
}
const PURSE = {
  id: "raider-purse",
  trigger: "discovery",
  targetId: "raider-motive",
  giverId: "",
  silver: 6,
  text: "The raider's purse holds 6 silver.",
};
const THANKS = {
  id: "runner-thanks",
  trigger: "completion",
  targetId: "",
  giverId: "tower-runner",
  silver: 15,
  text: "The tower runner hands you 15 silver for the warning.",
};
const KEEP_DRAUGHT = {
  id: "keep-sack-draught",
  itemId: "sack-draught",
  item: "healing-draught",
};

test("schema 18 treasure is found or given, with placed items to keep (#119)", () => {
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v18.schema.json", "utf8")),
    CHARACTER_TREASURE_SCHEMA,
  );
  const loaded = loadAdventure(
    JSON.stringify(treasureDocument([PURSE, THANKS], [KEEP_DRAUGHT])),
  );
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  assert.equal(loaded.adventure.snapshot.characterAdventure.treasure.length, 2);
});

test("treasure always has a source and is never simply awarded (#119)", () => {
  for (const [document, message] of [
    [treasureDocument([{ ...PURSE, targetId: "nobody" }]), /unknown trigger/],
    [treasureDocument([PURSE, PURSE]), /unique/],
    [
      treasureDocument([{ ...PURSE, id: "hollow-beacon-completion" }]),
      /unique/,
    ],
    [treasureDocument([{ ...THANKS, giverId: "" }]), /needs a giver/],
    [treasureDocument([{ ...THANKS, giverId: "nobody" }]), /needs a giver/],
    [treasureDocument([{ ...PURSE, giverId: "iona" }]), /needs a giver/],
    [
      treasureDocument([], [{ ...KEEP_DRAUGHT, itemId: "nothing" }]),
      /placed items/,
    ],
    [
      treasureDocument([], [{ ...KEEP_DRAUGHT, itemId: "signal-component" }]),
      /placed items/,
    ],
    [
      treasureDocument([], [KEEP_DRAUGHT, { ...KEEP_DRAUGHT, id: "again" }]),
      /placed items/,
    ],
  ]) {
    const loaded = loadAdventure(JSON.stringify(document));
    assert.equal(loaded.ok, false);
    assert.match(
      loaded.diagnostics.map(({ message }) => message).join("\n"),
      message,
    );
  }
  // Defeats, checks and milestones award XP, never treasure.
  for (const trigger of ["actor-defeated", "check-success", "milestone"]) {
    assert.equal(
      loadAdventure(
        JSON.stringify(
          treasureDocument([{ ...PURSE, trigger, targetId: "ridge-raider" }]),
        ),
      ).ok,
      false,
      trigger,
    );
  }
  assert.equal(
    loadAdventure(JSON.stringify(treasureDocument([{ ...PURSE, silver: 0 }])))
      .ok,
    false,
  );
  // Schema 17 keeps its released syntax: no treasure, no rules v3.
  const story = treasureDocument([PURSE]);
  for (const document of [
    { ...story, schemaVersion: 17 },
    {
      ...story,
      characterAdventure: {
        ...story.characterAdventure,
        treasure: undefined,
        treasureItems: undefined,
      },
      rulesVersion: "character-adventure-rules-v2",
    },
  ]) {
    assert.equal(loadAdventure(JSON.stringify(document)).ok, false);
  }
});

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
  const loaded = loadAdventure(
    JSON.stringify(treasureDocument([PURSE, THANKS], [KEEP_DRAUGHT])),
  );
  assert.equal(loaded.ok, true);
  return loaded.adventure;
};

test("treasure is found by examining, given by a person, and kept on surviving completion (#119)", () => {
  const runtime = createDataRuntime(adventure(), v3());
  const fought = defeatRaider(runtime);
  // Defeating the raider awards nothing by itself.
  assert.doesNotMatch(fought.text, /silver|Treasure/);
  const searched = play(runtime, ["examine supply-sack"], 0, fought.state);
  assert.match(
    searched.text,
    /The raider's purse holds 6 silver\. You keep it if you finish the adventure alive\./,
  );
  const taken = play(runtime, ["take healing draught"], 0, searched.state);
  assert.match(taken.text, /keep the healing draught/);
  assert.deepEqual(
    runtime.projectCharacterStatus(taken.state).pendingTreasure,
    { silver: 6, items: ["healing-draught"] },
  );
  const done = play(
    runtime,
    ["move watch-yard", ...beaconExamine],
    0,
    taken.state,
  );
  assert.equal(done.state.status, "victory");
  assert.match(done.text, /The tower runner hands you 15 silver/);
  assert.match(done.text, /Treasure kept: 21 silver, healing draught/);
  const result = done.state.characterResult;
  assert.deepEqual(result.inventory, {
    silver: 21,
    items: ["healing-draught"],
  });
  for (const id of ["raider-purse", "runner-thanks", "keep-sack-draught"]) {
    assert.ok(result.earnedRewards.includes(id), id);
  }
  // Treasure is earned once per character: a replay keeps nothing new.
  const again = createDataRuntime(adventure(), {
    ...result,
    hp: characterProfile(result).maxHp,
  });
  const replay = play(again, beaconExamine);
  assert.doesNotMatch(replay.text, /silver/);
  assert.deepEqual(replay.state.characterResult.inventory, result.inventory);
});

test("a found draught can be drunk at once, and is then not kept (#119)", () => {
  const runtime = createDataRuntime(adventure(), v3());
  const fought = defeatRaider(runtime);
  assert.ok(fought.state.fighter.hp < fought.state.fighter.maxHp);
  const drunk = play(
    runtime,
    ["take healing draught", "use healing draught"],
    0,
    fought.state,
  );
  assert.match(drunk.text, /healing draught is consumed/);
  assert.deepEqual(
    runtime.projectCharacterStatus(drunk.state).pendingTreasure,
    { silver: 0, items: [] },
  );
  const done = play(
    runtime,
    ["move watch-yard", ...beaconExamine],
    0,
    drunk.state,
  );
  assert.deepEqual(done.state.characterResult.inventory, {
    silver: 15,
    items: [],
  });
  assert.ok(
    !done.state.characterResult.earnedRewards.includes("keep-sack-draught"),
  );
});

test("a giver who is dead gives nothing (#119)", () => {
  const runtime = createDataRuntime(adventure(), v3());
  let state = runtime.createSession();
  state = {
    ...state,
    npcHealth: { ...state.npcHealth, "tower-runner": { hp: 0, maxHp: 8 } },
  };
  const done = play(runtime, beaconExamine, 0, state);
  assert.equal(done.state.status, "victory");
  assert.doesNotMatch(done.text, /tower runner hands you/);
  assert.equal(done.state.characterResult.inventory.silver, 0);
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

test("v15 and Stonebridge v2 add only a placed draught and its treasure (#119)", () => {
  for (const [before, after] of [
    ["hollow-beacon-story.json", "hollow-beacon-loot.json"],
    ["stonebridge-characters.json", "stonebridge-loot.json"],
  ]) {
    const old = bundled(before);
    const next = bundled(after);
    const { treasure, treasureItems, ...support } = next.characterAdventure;
    const draught = next.items.find(({ id }) => id === "healing-draught");
    assert.ok(draught.healing, after);
    assert.ok(treasure.length > 0);
    assert.deepEqual(
      treasureItems.map(({ itemId }) => itemId),
      ["healing-draught"],
    );
    assert.deepEqual(
      {
        ...next,
        schemaVersion: old.schemaVersion,
        contentVersion: old.contentVersion,
        rulesVersion: old.rulesVersion,
        items: next.items.filter((item) => item !== draught),
        // The supply sack now holds the raider's purse and the flask.
        searches: next.searches.map((search) =>
          search.id === "search-supply-sack"
            ? old.searches.find(({ id }) => id === search.id)
            : search,
        ),
        characterAdventure: support,
      },
      old,
      after,
    );
  }
});

// Treasure stays rare and small: at most one draught and 25 silver per module,
// and the draught lies on the optional fight's ground.
test("treasure is rare and of low value (#119)", () => {
  for (const [file, location] of [
    ["hollow-beacon-loot.json", "ridge-trail"],
    ["stonebridge-loot.json", "raider-den"],
  ]) {
    const content = bundled(file);
    const { treasure, treasureItems } = content.characterAdventure;
    assert.ok(treasure.reduce((sum, { silver }) => sum + silver, 0) <= 25);
    assert.equal(treasureItems.length, 1);
    assert.equal(
      content.items.find(({ id }) => id === treasureItems[0].itemId).locationId,
      location,
    );
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
    assert.ok(state.characterResult.inventory.silver <= 10, file);
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
    // Hollow Beacon on the valley road: only the tower runner's thanks.
    let session = await start("hollow-beacon", 0);
    await commitAll(session, beaconExamine);
    await career.acceptSession(session.path);
    assert.deepEqual((await sheet()).inventory, { silver: 10, items: [] });
    await rest();

    // Stonebridge's draught is taken, then abandoned: nothing is kept.
    session = await start("stonebridge", STONEBRIDGE_SEED);
    await commitAll(session, ["move raider-den"]);
    await fight(session, "toll-raider");
    await commitAll(session, ["take healing draught"]);
    assert.deepEqual(
      session.runtime.projectCharacterStatus(session.state).pendingTreasure,
      { silver: 0, items: ["healing-draught"] },
    );
    await abandon();
    assert.deepEqual((await sheet()).inventory, { silver: 10, items: [] });
    assert.ok(
      !(await sheet()).earnedRewards.includes("stonebridge-den-draught"),
    );
    await rest();

    // A second try keeps the draught and the purse in the archive chest.
    session = await start("stonebridge", STONEBRIDGE_SEED);
    await commitAll(session, ["move raider-den"]);
    await fight(session, "toll-raider");
    await commitAll(session, [
      "take healing draught",
      "move toll-yard",
      ...stonebridgeExamine,
    ]);
    await career.acceptSession(session.path);
    assert.deepEqual((await sheet()).inventory, {
      silver: 15,
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
      silver: 15,
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
