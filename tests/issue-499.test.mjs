// #499: Last Stand in the 5e runtime. Brought to 0 HP by an opponent's
// attack with a potion carried and the reaction free, the character's fall
// waits: the bar offers only Drink for each potion and Fall, the AI DM only
// use_item, and the fight view doesn't count the character defeated yet.
// The session format goes to 65 and the trace format to 59 (a pending Last
// Stand changes what a saved fight holds); the DM prompt to v46.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { offeredToolsMatchActions } from "../dist/dm-evaluation-5e.js";
import {
  createFifthRuntime,
  FIFTH_DM_SYSTEM_PROMPT,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import {
  FIFTH_TRACE_FORMAT,
  FifthTraceRun,
  verifyFifthTraceFile,
  writeFifthTrace,
} from "../dist/trace-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { waitsAtLastStand } from "./fixtures/last-stand.mjs";
import { potionCellar } from "./fixtures/modules.mjs";

const sheet = testFighterAt(1);

function accepted(using, state, action, random = dice()) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

const lines = (result) => renderFifthResult(result).split("\n");
const bar = (using, state) =>
  using
    .projectActions(state)
    .map(({ action, target, available }) => [
      action,
      target?.id ?? null,
      available,
    ]);

/**
 * The character at 2 HP with the potion, in the cellar's fight: the goblin
 * first (18 against 2), its 15 + 4 hitting and its 6 damage bringing the
 * character to 0 HP, and its death saving throw `save`.
 */
function standing(save = 12) {
  const using = createFifthRuntime(potionCellar, sheet);
  const begun = accepted(using, using.createSession(), { type: "begin" });
  const held = accepted(using, begun.state, {
    type: "take",
    itemId: "healing-potion",
  }).state;
  const hurt = { ...held, character: { ...held.character, hp: 2 } };
  const result = accepted(
    using,
    hurt,
    { type: "move", destinationId: "cellar" },
    dice([20, 2], [20, 18], [20, 15], [6, 4], [20, save]),
  );
  return { using, result };
}

test("a fall to 0 HP waits for Last Stand: the bar offers Drink and Fall, and the fight view keeps the character up", () => {
  const { using, result } = standing();
  const { state } = result;
  assert.equal(state.status, "playing");
  assert.equal(state.character.hp, 0);
  assert.equal(
    lines(result).at(-1),
    `Last Stand: ${sheet.name} drops to 0 HP and makes a death saving throw: 12 against DC 11. Success: ${sheet.name} clings on, and can drink the Potion of Healing with the reaction to rise again, or fall.`,
  );
  assert.deepEqual(bar(using, state), [
    ["use", "healing-potion", true],
    ["fall", null, true],
  ]);
  const { encounter } = using.projectFight(state);
  assert.deepEqual(encounter.pendingReaction, {
    attacker: "Goblin Warrior",
    lastStand: true,
  });
  assert.equal(
    encounter.combatants.find(({ id }) => id === "pc").defeated,
    false,
  );
  // The AI DM is offered use_item with the potion, and no tool to fall.
  assert.ok(offeredToolsMatchActions({ runtime: using, state }));
  assert.deepEqual(
    using
      .getGameToolDefinitions(state)
      .map(({ name }) => name)
      .filter((name) => !["look", "get_character_status"].includes(name)),
    ["use_item"],
  );
  // Nothing else is accepted until it is answered.
  const ended = using.handleAction(
    state,
    { type: "end-turn", actorId: "pc" },
    dice(),
  );
  assert.equal(ended.rejection?.code, "reaction-pending");
});

test("a failed death saving throw ends the adventure at once", () => {
  const { result } = standing(9);
  assert.equal(result.state.status, "defeat");
  assert.ok(
    lines(result).includes(
      `Last Stand: ${sheet.name} drops to 0 HP and makes a death saving throw: 9 against DC 11. Failure: ${sheet.name} falls.`,
    ),
  );
});

test("drinking the potion as Last Stand raises the character to its roll and uses it up", () => {
  const { using, result } = standing();
  const drunk = accepted(
    using,
    result.state,
    { type: "use-item", itemId: "healing-potion" },
    dice([4, 3], [4, 2]),
  );
  assert.equal(
    lines(drunk)[0],
    // The test Fighter's sheet is at full HP.
    `Last Stand: you drink the Potion of Healing with your reaction: 3 + 2 + 2 = 7; you rise again with 7/${sheet.hp} HP.`,
  );
  assert.equal(drunk.state.character.hp, 7);
  assert.ok(!drunk.state.inventory.includes("healing-potion"));
  assert.equal(drunk.state.encounter.pendingReaction, undefined);
  // The character's turn comes, with the reaction spent until it starts.
  assert.equal(using.projectFight(drunk.state).turn !== undefined, true);
});

test("falling instead ends the adventure in its defeat ending", () => {
  const { using, result } = standing();
  const fallen = accepted(using, result.state, {
    type: "fall",
    actorId: "pc",
  });
  assert.equal(fallen.state.status, "defeat");
  assert.equal(fallen.state.endingId, "fallen-in-the-cellar");
});

test("the DM prompt tells the AI DM how Last Stand is answered", () => {
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /death saving throw \(Last Stand\); on a success its fall waits for the player's answer: only use_item is offered/u,
  );
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /Falling instead is the player's choice alone, in the action bar: no tool takes it/u,
  );
});

test("a saved session waiting for Last Stand reloads it, a trace replays it, and older formats are refused", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-499-"));
  try {
    const path = join(directory, "session.json");
    // The first seed whose death saving throw succeeds.
    let seed = 0;
    while (!waitsAtLastStand(FifthSession.begin(seed, potionCellar, sheet))) {
      seed++;
    }
    const created = await FifthSession.create(
      path,
      "a".repeat(32),
      seed,
      potionCellar,
      sheet,
    );
    const run = new FifthTraceRun(created);
    const click = (action) => {
      const { result } = run.click(action);
      assert.equal(result.rejection, undefined, result.rejection?.reason);
    };
    click({ type: "take", itemId: "healing-potion" });
    click({ type: "move", destinationId: "cellar" });
    // The character only waits, until the goblin brings it to 0 HP.
    while (run.session.state.encounter.pendingReaction?.kind !== "last-stand") {
      assert.equal(run.session.state.status, "playing");
      click({ type: "end-turn", actorId: "pc" });
    }
    await run.session.persist();
    const loaded = await FifthSession.load(path, [potionCellar]);
    assert.deepEqual(loaded.state, run.session.state);
    click({ type: "use-item", itemId: "healing-potion" });
    assert.ok(run.session.state.character.hp > 0);
    const tracePath = join(directory, "trace.json");
    await writeFifthTrace(tracePath, run.trace);
    const replayed = await verifyFifthTraceFile(tracePath, [potionCellar]);
    assert.deepEqual(replayed.state, run.session.state);
    // Older formats are refused, naming the file.
    const saved = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ ...saved, formatVersion: 64 }));
    await assert.rejects(
      FifthSession.load(path, [potionCellar]),
      new RegExp(
        String.raw`session\.json is an adventure session in format version 64, not ${FIFTH_SESSION_FORMAT}\. This build cannot continue it\. Move it aside; the file has not been changed\.`,
        "u",
      ),
    );
    const trace = JSON.parse(await readFile(tracePath, "utf8"));
    await writeFile(tracePath, JSON.stringify({ ...trace, formatVersion: 58 }));
    await assert.rejects(
      verifyFifthTraceFile(tracePath, [potionCellar]),
      new RegExp(
        String.raw`trace\.json is a trace in format version 58, not ${FIFTH_TRACE_FORMAT}\. This build cannot replay it\. Move it aside; the file has not been changed\.`,
        "u",
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
