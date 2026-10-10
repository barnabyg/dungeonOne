// #241: The Silvervein Mine, the increment 13 release module, with the
// content the owner approved: kobolds in the sorting shed, one of which may
// flee and one surrender and give up the iron key; the drowned miners, a
// Zombie and a Skeleton; a Giant Spider in the winze; and a Bugbear overseer
// behind the iron door, its loot rolled from its treasure type. Scripted-DM
// journeys reach each of its endings, and the release run clears it through
// the browser server to the library file. shipped-modules.test.mjs checks it
// qualifies at its declared difficulty, with the gate figures its proposal
// quotes.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findableValue,
  loadBuiltInFifthAdventures,
} from "../dist/adventure-5e.js";
import { requiredPath } from "../dist/balance-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { startSavedAdventureOverHttp } from "../dist/dm-evaluation-5e.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { characterProfile } from "../dist/character-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { MINE_FULL_ROUTE, playReleaseRun } from "../dist/release-run-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { levelThreeLibrary, testFighterAt } from "../dist/test-fighter-5e.js";
import { treasureBudget } from "../dist/treasure-5e.js";
import { narratingDm } from "./fixtures/session-layout.mjs";

const mine = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "silvervein-mine",
);
const room = (id) => mine.rooms.find((entry) => entry.id === id);
const opponents = (encounterId) =>
  mine.encounters.find(({ id }) => id === encounterId).opponents;
/** The loot in a room: treasure, coin and potions. */
const lootIn = (roomId) =>
  room(roomId).items.filter(({ kind }) => kind !== "key");

test("the mine is a six-room level 2–3 Medium module (#252), entered and left by the mine mouth", () => {
  assert.equal(mine.title, "The Silvervein Mine");
  assert.deepEqual(mine.recommendedLevels, { min: 2, max: 3 });
  assert.equal(mine.difficulty, "medium");
  assert.equal(mine.startRoomId, "mine-mouth");
  assert.deepEqual(
    mine.rooms.filter(({ exit }) => exit).map(({ id }) => id),
    ["mine-mouth"],
  );
  assert.deepEqual(
    mine.passages.map(({ between, door }) => [between, door?.state]),
    [
      [["mine-mouth", "sorting-shed"], undefined],
      [["sorting-shed", "main-gallery"], undefined],
      [["main-gallery", "flooded-drift"], undefined],
      [["main-gallery", "webbed-winze"], undefined],
      [["main-gallery", "overseers-office"], "locked"],
    ],
  );
  // The escape endings only: there is no victory to win.
  assert.deepEqual(
    mine.endings.map(({ id, kind, xp }) => [id, kind, xp]),
    [
      ["out-with-the-silver", "escape-with-loot", 300],
      ["out-empty-handed", "escape-without-loot", undefined],
      ["lost-in-the-mine", "defeat", undefined],
    ],
  );
});

test("it fights five bestiary monsters, an undead and a poison user among them", () => {
  const fights = mine.encounters.map(({ id, opponents }) => [
    id,
    opponents.map(({ statBlock }) => statBlock.name),
  ]);
  assert.deepEqual(fights, [
    ["shed-kobolds", ["Kobold", "Kobold"]],
    ["drift-dead", ["Zombie", "Skeleton"]],
    ["winze-spider", ["Giant Spider"]],
    ["office-bugbear", ["Bugbear Warrior"]],
  ]);
  const blocks = mine.encounters.flatMap(({ opponents }) =>
    opponents.map(({ statBlock }) => statBlock),
  );
  assert.ok(blocks.some(({ type }) => type === "Undead"));
  assert.ok(
    blocks.some(({ attacks }) =>
      attacks.some(({ rider }) => rider?.condition?.kind === "poisoned"),
    ),
  );
});

test("the kobolds can break: one flees, and the tunneller may surrender and give up the key", () => {
  const [lookout, tunneller] = opponents("shed-kobolds");
  assert.equal(lookout.statBlock.morale, 8);
  assert.equal(lookout.surrender, undefined);
  assert.equal(tunneller.statBlock.morale, 8);
  assert.deepEqual(
    tunneller.surrender.topics.map(({ id, gives }) => [id, gives]),
    [
      ["the-spider", undefined],
      ["the-overseer", undefined],
      ["the-iron-door", ["iron-key"]],
    ],
  );
  assert.equal(tunneller.surrender.xp, 25);
  const key = room("sorting-shed").items.find(({ id }) => id === "iron-key");
  assert.equal(key.hiddenIn, "kobold-tunneller");
  // The key opens the overseer's door; a pick or a break does too.
  const { door } = mine.passages.find(({ id }) => id === "gallery-to-office");
  assert.equal(door.keyItemId, "iron-key");
  assert.deepEqual([door.pick.dc, door.break.dc], [15, 17]);
});

test("nothing lies at the mine mouth: the first loot is behind the kobolds, and the rest is off the required path", () => {
  assert.deepEqual(lootIn("mine-mouth"), []);
  assert.deepEqual(requiredPath(mine).roomIds, ["mine-mouth", "sorting-shed"]);
  assert.deepEqual(
    lootIn("sorting-shed").map(({ id, hiddenIn }) => [id, hiddenIn]),
    [
      ["shed-potion", "ore-bin"],
      ["kobold-takings", "ore-bin"],
      ["kobold-lookout-coins", "kobold-lookout"],
      ["kobold-tunneller-coins", "kobold-tunneller"],
    ],
  );
  assert.deepEqual(lootIn("main-gallery"), []);
});

test("its treasure is within the level-3 budget, the monsters' loot rolled from their treasure types", () => {
  // Rolled with `npm run loot -- adventures/5e/silvervein-mine.json --seed 241`.
  const carried = mine.rooms.flatMap(({ items }) =>
    items
      .filter(({ id }) => id.endsWith("-coins") || id.endsWith("-trinket"))
      .map(({ id, coins, treasure }) => [id, coins ?? treasure]),
  );
  assert.deepEqual(carried, [
    ["kobold-lookout-coins", { cp: 9 }],
    ["kobold-tunneller-coins", { cp: 8 }],
    ["bugbear-overseer-coins", { sp: 12 }],
    ["bugbear-overseer-trinket", "gem-10gp"],
  ]);
  // In copper: 300 gp 3 sp 7 cp, within the level-3 budget.
  assert.equal(findableValue(mine), 30037);
  assert.ok(findableValue(mine) <= treasureBudget(mine.recommendedLevels.max));
});

function scripted(responses) {
  return {
    async respond() {
      assert.ok(responses.length > 0, "the scripted DM ran out of responses");
      return responses.shift();
    },
  };
}

const call = (name, args = {}) => ({
  toolCalls: [{ id: "call-1", name, argumentsJson: JSON.stringify(args) }],
});

/**
 * Plays `steps` as scripted-DM turns from a new session on `seed`, each one
 * tool call the engine must offer and accept. Each fight is fought to its
 * end: at half HP or less with Second Wind, or else a potion; otherwise an
 * attack on `target` while it stands, or the first opponent offered. Leaving
 * is the browser's action, never the DM's, so it goes to the engine directly.
 * Stops early once the adventure ends.
 */
async function journey(sheet, seed, steps, target) {
  const runtime = createFifthRuntime(mine, sheet);
  const random = createSeededRandom(seed);
  const { maxHp } = characterProfile(sheet);
  const offered = (state, name) =>
    runtime.getGameToolDefinitions(state).find((tool) => tool.name === name);
  const dm = async (state, name, args = {}) => {
    const tool = offered(state, name);
    assert.ok(tool, `${name} is offered`);
    for (const [key, value] of Object.entries(args)) {
      assert.ok(
        tool.parameters.properties[key].enum.includes(value),
        `${name} ${value} is offered`,
      );
    }
    const result = await runDmTurn({
      state,
      playerInput: `${name} ${JSON.stringify(args)}`,
      transcript: [],
      random,
      model: scripted([call(name, args)]),
      runtime,
    });
    const refused = result.toolResults.find(
      ({ engineResult }) => engineResult?.rejection !== undefined,
    );
    assert.equal(refused, undefined, `${name} ${JSON.stringify(args)}`);
    return result.state;
  };
  const fight = async (start) => {
    let state = start;
    while (
      state.status === "playing" &&
      state.encounter?.outcome === "ongoing"
    ) {
      const heal =
        state.character.hp * 2 <= maxHp
          ? (offered(state, "second_wind") ?? offered(state, "use_item"))
          : undefined;
      const attack = offered(state, "attack");
      if (heal !== undefined) {
        state = await dm(
          state,
          heal.name,
          heal.name === "use_item"
            ? { item: heal.parameters.properties.item.enum[0] }
            : {},
        );
      } else if (attack !== undefined) {
        const targets = attack.parameters.properties.target.enum;
        state = await dm(state, "attack", {
          target: targets.includes(target) ? target : targets[0],
        });
      } else {
        state = await dm(state, "end_turn");
      }
    }
    return state;
  };
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  for (const [name, args] of steps) {
    if (state.status !== "playing") {
      break;
    }
    state =
      name === "leave"
        ? runtime.handleAction(state, { type: "leave", roomId: args }).state
        : await fight(await dm(state, name, args));
  }
  return { state, runtime };
}

/** The release route as scripted-DM tool calls. */
const ARGUMENT = {
  move: "destination",
  examine: "target",
  take: "item",
  talk: "topic",
  unlock: "door",
};
const FULL_CLEAR = MINE_FULL_ROUTE.map(({ action, target }) =>
  action === "leave"
    ? ["leave", target]
    : [action, { [ARGUMENT[action]]: target }],
);

/**
 * Seeds the scripted-DM journeys below are played on, found by search: a
 * change to these monsters or the dice order moves them. About 1 seed in 100
 * clears the whole mine at level 3 with the tunneller surrendering; the
 * Champion's initiative advantage (#315) moved the full clear from 30 to 144.
 */
const SEEDS = { fullClear: 144, flee: 8, defeat: 0 };

const xpOf = (runtime, state) =>
  runtime.projectSettlement(state).xp.map(({ name, xp }) => [name, xp]);

test("scripted DM: a level-3 Fighter clears the mine, sparing the tunneller for its key, and gets out with the silver", async () => {
  const { state, runtime } = await journey(
    testFighterAt(3),
    SEEDS.fullClear,
    FULL_CLEAR,
  );
  assert.equal(state.status, "escaped");
  assert.equal(state.endingId, "out-with-the-silver");
  assert.deepEqual(state.surrenderedOpponents, [
    {
      encounterId: "shed-kobolds",
      opponentId: "kobold-tunneller",
      engaged: false,
    },
  ]);
  assert.deepEqual(state.fledOpponents, []);
  assert.deepEqual(state.clearedEncounterIds, [
    "shed-kobolds",
    "drift-dead",
    "office-bugbear",
    "winze-spider",
  ]);
  // The shed's potion was drunk in a fight on the way.
  assert.deepEqual(state.inventory, [
    "iron-key",
    "silver-locket",
    "bugbear-overseer-trinket",
    "uncut-sapphire",
    "winze-potion",
  ]);
  // 40 sp, 9 cp, 12 sp and 60 gp, in copper.
  assert.equal(state.possessions.purse, 400 + 9 + 120 + 6000);
  // The spared tunneller exchanged no blows: its sparing XP, not half its own.
  assert.deepEqual(xpOf(runtime, state), [
    ["Defeated Kobold Lookout; spared Kobold Tunneller", 50],
    ["Defeated Drowned Miner and Miner's Bones", 100],
    ["Defeated Bugbear Overseer", 200],
    ["Defeated Giant Spider", 200],
    ["Out with the silver", 300],
  ]);
});

test("scripted DM: cut down first, the tunneller leaves the key on its body, and the lookout flees with its coins", async () => {
  const { state, runtime } = await journey(
    testFighterAt(2),
    SEEDS.flee,
    [
      ["move", { destination: "sorting-shed" }],
      ["examine", { target: "kobold-tunneller" }],
      ["take", { item: "iron-key" }],
      ["take", { item: "kobold-tunneller-coins" }],
      ["examine", { target: "ore-bin" }],
      ["take", { item: "kobold-takings" }],
      ["move", { destination: "mine-mouth" }],
      ["leave", "mine-mouth"],
    ],
    "kobold-tunneller",
  );
  assert.equal(state.endingId, "out-with-the-silver");
  assert.deepEqual(state.fledOpponents, [
    {
      encounterId: "shed-kobolds",
      opponentId: "kobold-lookout",
      engaged: true,
    },
  ]);
  assert.deepEqual(state.surrenderedOpponents, []);
  assert.deepEqual(state.inventory, ["iron-key"]);
  // The tunneller's 8 cp and the bin's 40 sp; the lookout's 9 cp left with it.
  assert.equal(state.possessions.purse, 8 + 400);
  // A fled lookout that fought gives half its 25 XP, rounded down.
  assert.deepEqual(xpOf(runtime, state), [
    ["Defeated Kobold Tunneller; drove off Kobold Lookout", 37],
    ["Out with the silver", 300],
  ]);
});

test("scripted DM: turning back at the mine mouth gets out empty-handed", async () => {
  const { state } = await journey(testFighterAt(2), 0, [
    ["examine", { target: "ore-cart" }],
    ["leave", "mine-mouth"],
  ]);
  assert.equal(state.status, "escaped");
  assert.equal(state.endingId, "out-empty-handed");
});

test("scripted DM: a level-2 Fighter who walks straight into the webs falls to the spider", async () => {
  const { state } = await journey(testFighterAt(2), SEEDS.defeat, [
    ["move", { destination: "sorting-shed" }],
    ["move", { destination: "main-gallery" }],
    ["move", { destination: "webbed-winze" }],
  ]);
  assert.equal(state.status, "defeat");
  assert.equal(state.endingId, "lost-in-the-mine");
  assert.equal(state.roomId, "webbed-winze");
  assert.equal(state.character.hp, 0);
});

test("the handoff's level-3 library is Ada at level 3, as the release runs start", async () => {
  const input = new URL(
    "../docs/acceptance/inputs/increment-13/level-3-ada.json",
    import.meta.url,
  );
  // Regenerate it from levelThreeLibrary() when the library format changes.
  assert.deepEqual(
    JSON.parse(await readFile(input, "utf8")),
    JSON.parse(JSON.stringify(levelThreeLibrary())),
  );
  const [{ sheet }] = levelThreeLibrary().characters;
  assert.deepEqual([sheet.name, sheet.level, sheet.xp], ["Ada", 3, 900]);
  assert.equal(sheet.hp, characterProfile(sheet).maxHp);
});

/**
 * A browser seed on which the release run clears the mine and gets out: 47
 * since the Champion's initiative advantage (#315) moved the dice; 26 before.
 */
const RELEASE_SEED = 47;

test("the release run clears the mine through the server to the library file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-241-"));
  const libraryPath = join(directory, "characters.json");
  await writeFile(libraryPath, JSON.stringify(levelThreeLibrary()));
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: RELEASE_SEED,
    dmModel: narratingDm(),
    // shipped-modules.test.mjs gates every shipped module; skip it here.
    qualifies: () => true,
  });
  try {
    const { session, turns } = await playReleaseRun({
      url: server.url,
      session: await startSavedAdventureOverHttp(server.url, "silvervein-mine"),
      route: MINE_FULL_ROUTE,
    });
    assert.equal(session.status, "escaped");
    assert.equal(session.ending.kind, "escape-with-loot");
    assert.deepEqual(
      turns.filter(({ skipped }) => skipped !== undefined),
      [],
    );
    assert.equal(new Set(turns.map(({ room }) => room)).size, 6);
    const cards = turns.flatMap(({ cards }) => cards.map(({ text }) => text));
    assert.ok(
      cards.some((text) =>
        /Kobold Tunneller throws down its arms and surrenders\./u.test(text),
      ),
    );
    assert.ok(
      cards.some((text) =>
        /Kobold Tunneller offers you the Iron Key\./u.test(text),
      ),
    );
    // The run hit the tunneller before it yielded: half its 25 XP and its
    // sparing XP.
    assert.deepEqual(session.ending.rewards.xp[0], {
      name: "Defeated Kobold Lookout; spared Kobold Tunneller",
      xp: 25 + 12 + 25,
    });
    // 900 XP before; the fights' 562 and the ending's 300.
    assert.equal(session.ending.rewards.totalXp, 900 + 562 + 300);
    assert.equal(session.ending.rewards.level, 3);
    assert.deepEqual(
      session.ending.rewards.treasure.map(({ name }) => name),
      ["Silver Locket", "Bugbear Overseer's Rough Gem", "Uncut Sapphire"],
    );
    assert.equal(session.ending.rewards.coin, "65 gp 2 sp 9 cp");
    const [ada] = JSON.parse(await readFile(libraryPath, "utf8")).characters;
    assert.equal(ada.session, undefined);
    assert.equal(ada.sheet.purse, 6529);
    assert.equal(ada.sheet.xp, 1762);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
