// #509: the character and progression settings. Ability scores by 4d6 drop
// lowest, the standard array, point buy or 4d6 with one reroll, kept by the
// pending creation in the library (format 27); and the XP rate, applied to
// every award when an adventure settles, by the adventure's own settings.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ABILITY_METHODS,
  DEFAULT_SETTINGS,
  SETTINGS,
  scaleXp,
  settingsPathFor,
} from "../dist/settings-5e.js";
import {
  FIFTH_LIBRARY_FORMAT,
  FifthCharacterLibrary,
} from "../dist/character-library-5e.js";
import {
  keptTotal,
  pointBuyCost,
  projectCreation,
  STANDARD_ARRAY,
  validateCharacter,
} from "../dist/character-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import {
  FifthSession,
  settleFifthSession,
  startFifthAdventure,
} from "../dist/session-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { TEST_FIGHTER_CHOICES } from "../dist/test-fighter-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { lintelBarrow as barrow, moduleFile } from "./fixtures/modules.mjs";
import { ada } from "./fixtures/playthroughs.mjs";
import { barrowFightStep, winBarrowSeed } from "./fixtures/library.mjs";

const withDirectory = async (run) => {
  const directory = await mkdtemp(join(tmpdir(), "issue-509-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

// Every choice but the placement, for point buy.
const OTHER_CHOICES = { ...TEST_FIGHTER_CHOICES };
delete OTHER_CHOICES.placement;
/** Strength 15, Dexterity 14, Constitution 13 and the rest 8: 27 points. */
const BOUGHT = {
  strength: 15,
  dexterity: 14,
  constitution: 13,
  intelligence: 10,
  wisdom: 10,
  charisma: 8,
};

test("the defaults are today's game: 4d6 drop lowest and XP × 1", () => {
  assert.equal(DEFAULT_SETTINGS.abilityScores, "roll");
  assert.equal(DEFAULT_SETTINGS.xpRate, 1);
  assert.deepEqual(ABILITY_METHODS, [
    "roll",
    "standard-array",
    "point-buy",
    "roll-reroll",
  ]);
  assert.deepEqual(
    SETTINGS.xpRate.choices.map(({ value }) => value),
    [0.5, 1, 1.5, 2],
  );
  assert.deepEqual(STANDARD_ARRAY, [15, 14, 13, 12, 10, 8]);
  // SRD 5.2 costs: the standard array is a 27-point buy.
  assert.equal(pointBuyCost(BOUGHT), 9 + 7 + 5 + 2 + 2 + 0);
  assert.equal(
    pointBuyCost({
      strength: 15,
      dexterity: 14,
      constitution: 13,
      intelligence: 12,
      wisdom: 10,
      charisma: 8,
    }),
    27,
  );
  assert.equal(scaleXp(25, 0.5), 12);
  assert.equal(scaleXp(25, 1.5), 37);
  assert.equal(scaleXp(25, 2), 50);
});

test("at the defaults, a creation rolls as before and its pending creation records the method", async () =>
  withDirectory(async (directory) => {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      7,
    );
    const started = await library.startCreation();
    const { dice } = started.pendingCreation;
    assert.deepEqual(Object.keys(started.pendingCreation).sort(), [
      "dice",
      "method",
      "number",
    ]);
    assert.equal(started.pendingCreation.method, "roll");
    // The same dice a library of format 26 rolled for this seed and number.
    const twin = new FifthCharacterLibrary(join(directory, "twin.json"), 7);
    assert.deepEqual(
      (await twin.startCreation("roll-reroll")).pendingCreation.dice,
      dice,
    );
    const saved = await library.create(
      "Ada",
      TEST_FIGHTER_CHOICES,
      started.revision,
    );
    const sheet = saved.characters[0].sheet;
    assert.equal(sheet.baseScores, undefined);
    assert.equal(sheet.abilities.strength, keptTotal(dice[0]) + 2);
    const file = JSON.parse(await readFile(library.path, "utf8"));
    assert.equal(file.formatVersion, FIFTH_LIBRARY_FORMAT);
    assert.equal(FIFTH_LIBRARY_FORMAT, 28);
  }));

test("the standard array is placed freely, and the sheet keeps the scores, not dice", async () =>
  withDirectory(async (directory) => {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      7,
    );
    const started = await library.startCreation("standard-array");
    assert.deepEqual(started.pendingCreation, {
      number: 1,
      method: "standard-array",
    });
    const preview = projectCreation(
      "standard-array",
      TEST_FIGHTER_CHOICES,
      "fighter",
    );
    assert.deepEqual(
      preview.rows.map(({ score }) => score),
      [17, 14, 14, 12, 10, 8],
    );
    await assert.rejects(
      library.create(
        "Ada",
        { ...OTHER_CHOICES, scores: BOUGHT },
        started.revision,
      ),
      /Only point buy chooses scores/,
    );
    const saved = await library.create(
      "Ada",
      TEST_FIGHTER_CHOICES,
      started.revision,
    );
    const { sheet } = saved.characters[0];
    assert.equal(sheet.abilityRolls, undefined);
    assert.deepEqual(sheet.baseScores, {
      strength: 15,
      dexterity: 14,
      constitution: 13,
      intelligence: 12,
      wisdom: 10,
      charisma: 8,
    });
    assert.equal(sheet.abilities.strength, 17);
    assert.equal(sheet.level, 1);
    assert.equal(saved.pendingCreation, undefined);
    // It reads back, and its next creation starts by the method of the moment.
    assert.deepEqual((await library.read()).characters[0].sheet, sheet);
    assert.equal(
      (await library.startCreation("roll")).pendingCreation.method,
      "roll",
    );
  }));

test("point buy spends up to 27 points on scores of 8–15, and refuses a score or total out of range", async () =>
  withDirectory(async (directory) => {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      7,
    );
    const started = await library.startCreation("point-buy");
    assert.deepEqual(started.pendingCreation, {
      number: 1,
      method: "point-buy",
    });
    const over = { ...BOUGHT, wisdom: 15 };
    const projected = projectCreation(
      "point-buy",
      { ...OTHER_CHOICES, scores: over },
      "fighter",
    );
    assert.deepEqual(projected.pointBuy, { spent: 32, points: 27 });
    assert.equal(
      projected.unfinished.scores,
      "These scores cost 32 points; you have 27. Lower a score.",
    );
    assert.equal(projected.sheet, undefined);
    const fine = projectCreation(
      "point-buy",
      { ...OTHER_CHOICES, scores: BOUGHT },
      "fighter",
    );
    assert.deepEqual(fine.pointBuy, { spent: 25, points: 27 });
    assert.deepEqual(fine.unfinished, {});
    for (const [scores, message] of [
      [over, /cost 32 points; you have 27/],
      [{ ...BOUGHT, charisma: 7 }, /each score is 8–15/],
      [{ ...BOUGHT, strength: 16 }, /each score is 8–15/],
      [{ ...BOUGHT, strength: 14.5 }, /each score is 8–15/],
    ]) {
      await assert.rejects(
        library.create("Ada", { ...OTHER_CHOICES, scores }, started.revision),
        message,
      );
    }
    await assert.rejects(
      library.create("Ada", TEST_FIGHTER_CHOICES, started.revision),
      /Point buy chooses scores, not a placement/,
    );
    const saved = await library.create(
      "Ada",
      { ...OTHER_CHOICES, scores: BOUGHT },
      started.revision,
    );
    const { sheet } = saved.characters[0];
    assert.deepEqual(sheet.baseScores, BOUGHT);
    assert.equal(sheet.abilities.strength, 17);
    assert.equal(sheet.abilities.constitution, 14);
    // A stored sheet with an over-budget buy, or dice and scores both, is invalid.
    assert.throws(
      () =>
        validateCharacter({
          ...sheet,
          baseScores: over,
          abilities: { ...sheet.abilities, wisdom: 15 },
        }),
      /cost 32 points/,
    );
    assert.throws(
      () => validateCharacter({ ...ada, baseScores: BOUGHT }),
      /dice or base scores, not both/,
    );
  }));

test("4d6 with one reroll: the whole set is rolled again once, kept, and survives a reload; deleting is not a reroll", async () =>
  withDirectory(async (directory) => {
    const path = join(directory, "characters.json");
    const library = new FifthCharacterLibrary(path, 7);
    const started = await library.startCreation("roll-reroll");
    const first = started.pendingCreation;
    assert.equal(first.rerolled, false);
    // An unused reroll is saved with the dice; another start leaves both.
    const again = await new FifthCharacterLibrary(path, 99).startCreation(
      "point-buy",
    );
    assert.deepEqual(again.pendingCreation, first);
    await assert.rejects(library.reroll("0".repeat(32)), /stale/);
    const rerolled = await library.reroll(again.revision);
    const second = rerolled.pendingCreation;
    assert.equal(second.method, "roll-reroll");
    assert.equal(second.rerolled, true);
    assert.equal(second.number, first.number);
    assert.notDeepEqual(second.dice, first.dice);
    await assert.rejects(
      library.reroll(rerolled.revision),
      /The reroll is used; keep these dice\./,
    );
    // A restart with another seed keeps the second set.
    assert.deepEqual(
      (await new FifthCharacterLibrary(path, 3).startCreation())
        .pendingCreation,
      second,
    );
    // The first set's dice are refused; the second set's are kept.
    const { characters } = await library.create(
      "Ada",
      TEST_FIGHTER_CHOICES,
      rerolled.revision,
    );
    assert.deepEqual(characters[0].sheet.abilityRolls.strength, second.dice[0]);

    // Deleting a character while a reroll is unused keeps it unused.
    const next = await library.startCreation("roll-reroll");
    const deleted = await library.delete(
      characters[0].sheet.id,
      "Ada",
      next.revision,
    );
    assert.deepEqual(deleted.pendingCreation, next.pendingCreation);
    assert.equal(deleted.pendingCreation.rerolled, false);
    // Only this method has a reroll.
    const other = new FifthCharacterLibrary(join(directory, "other.json"), 7);
    const plain = await other.startCreation("roll");
    await assert.rejects(
      other.reroll(plain.revision),
      /This creation's ability scores have no reroll\./,
    );
  }));

test("an older library is refused with the move-aside message; a malformed pending creation is invalid", async () =>
  withDirectory(async (directory) => {
    const path = join(directory, "characters.json");
    const older = JSON.stringify({
      kind: "dungeon-one-characters",
      formatVersion: 26,
      revision: "0".repeat(32),
      creationsStarted: 1,
      sessionsStarted: 0,
      pendingCreation: { number: 1, dice: [] },
      characters: [],
    });
    await writeFile(path, older);
    const library = new FifthCharacterLibrary(path, 7);
    await assert.rejects(library.read(), {
      message: `${path} is a character library in format version 26, not 28. This build creates 5e characters and cannot read it. Move it aside, or choose another --characters path; the file has not been changed.`,
    });
    assert.equal(await readFile(path, "utf8"), older);

    await assert.rejects(library.startCreation(), /format version 26/);
    await rm(path);
    await library.startCreation("standard-array");
    const stored = JSON.parse(await readFile(path, "utf8"));
    for (const pendingCreation of [
      {
        number: 1,
        method: "standard-array",
        dice: Array(6).fill([1, 2, 3, 4]),
      },
      { number: 1, method: "roll" },
      { number: 1, method: "point-buy", rerolled: false },
      { number: 1, method: "best-of-three" },
      { number: 1, method: "roll-reroll", dice: [], rerolled: "no" },
    ]) {
      await writeFile(path, JSON.stringify({ ...stored, pendingCreation }));
      await assert.rejects(
        library.read(),
        /Invalid pending character creation/,
      );
    }
  }));

test("the server starts a creation by the settings file's method; changing it later changes neither method nor dice", async () =>
  withDirectory(async (directory) => {
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      adventures: [barrow],
      qualifies: () => true,
      libraryPath,
      seed: 0,
    });
    const post = async (path, body) => {
      const response = await fetch(`${server.url}${path}`, {
        method: "POST",
        headers: { Origin: server.url, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    try {
      await post("/api/5e/settings", {
        id: "abilityScores",
        value: "roll-reroll",
      });
      const opened = (await post("/api/5e/creation", {})).body;
      const pending = opened.pendingCreation;
      assert.equal(pending.method, "roll-reroll");
      assert.deepEqual(pending.reroll, { used: false });
      assert.equal(pending.rolls.length, 6);
      await post("/api/5e/settings", {
        id: "abilityScores",
        value: "point-buy",
      });
      const reopened = (await post("/api/5e/creation", {})).body;
      assert.deepEqual(reopened.pendingCreation, pending);
      const rerolled = await post("/api/5e/creation/reroll", {
        revision: reopened.revision,
      });
      assert.equal(rerolled.status, 200);
      assert.deepEqual(rerolled.body.pendingCreation.reroll, { used: true });
      assert.notDeepEqual(rerolled.body.pendingCreation.rolls, pending.rolls);
      const twice = await post("/api/5e/creation/reroll", {
        revision: rerolled.body.revision,
      });
      assert.deepEqual(twice, {
        status: 409,
        body: { error: "The reroll is used; keep these dice." },
      });
      const saved = await post("/api/5e/characters", {
        revision: rerolled.body.revision,
        name: "Ada",
        ...TEST_FIGHTER_CHOICES,
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));

      // Now point buy, as the file says: the view sends the points and costs.
      const bought = (await post("/api/5e/creation", {})).body.pendingCreation;
      assert.equal(bought.method, "point-buy");
      assert.equal(bought.rolls, undefined);
      assert.deepEqual(bought.pointBuy.costs.slice(-2), [
        { score: 14, cost: 7 },
        { score: 15, cost: 9 },
      ]);
      assert.deepEqual(bought.defaultScores.fighter, {
        strength: 15,
        constitution: 14,
        dexterity: 13,
        wisdom: 12,
        charisma: 10,
        intelligence: 8,
      });
      const previewed = await post("/api/5e/creation/preview", {
        ...OTHER_CHOICES,
        scores: { ...BOUGHT, wisdom: 15 },
      });
      assert.equal(previewed.status, 200);
      assert.deepEqual(previewed.body.pointBuy, { spent: 32, points: 27 });
      assert.equal(
        (
          await post("/api/5e/characters", {
            revision: (await post("/api/5e/creation", {})).body.revision,
            name: "Bram",
            ...OTHER_CHOICES,
            scores: { ...BOUGHT, wisdom: 15 },
          })
        ).body.error,
        "Point buy: these scores cost 32 points; you have 27.",
      );
    } finally {
      await server.close();
    }
    void settingsPathFor;
  }));

/** Plays `actions` in order, each accepted; returns the final state. */
function play(runtime, actions, random) {
  let state = runtime.createSession();
  for (const action of actions) {
    const result = runtime.handleAction(state, action, random);
    assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
    state = result.state;
  }
  return state;
}

/** Returns queued values in order. */
function dice(...queue) {
  return {
    roll(sides) {
      assert.ok(queue.length > 0, `unexpected d${sides}`);
      return queue.shift();
    },
  };
}

const leaving = (runtime, state) =>
  runtime.projectActions(state).find(({ action }) => action === "leave")
    .leaving;

test("each XP award is scaled by the rate and rounded down: encounters, endings, and the leave confirmation", () => {
  // Ada wins initiative and fells the goblin with one critical hit.
  const looting = [
    { type: "begin" },
    { type: "move", destinationId: "burial-hall" },
    { type: "attack", actorId: "pc", targetId: "barrow-goblin" },
    { type: "examine", targetId: "stone-bier" },
    { type: "take", itemId: "silver-torc" },
    { type: "move", destinationId: "barrow-mouth" },
    { type: "leave", roomId: "barrow-mouth" },
  ];
  const awards = (xpRate) => {
    const runtime = createFifthRuntime(
      barrow,
      ada,
      {},
      { ...DEFAULT_SETTINGS, xpRate },
    );
    const begun = play(runtime, [{ type: "begin" }]);
    const ended = play(runtime, looting, dice(20, 1, 20, 6, 6));
    return {
      leaving: leaving(runtime, begun),
      xp: runtime
        .projectSettlement(ended)
        .xp.map(({ name, xp }) => `${name}: ${xp}`),
    };
  };
  const base = awards(1);
  assert.deepEqual(base.xp, [
    "Defeated Goblin Warrior: 50",
    "Out with the silver: 250",
  ]);
  assert.deepEqual(awards(2).xp, [
    "Defeated Goblin Warrior: 100",
    "Out with the silver: 500",
  ]);
  assert.deepEqual(awards(1.5).xp, [
    "Defeated Goblin Warrior: 75",
    "Out with the silver: 375",
  ]);
  assert.deepEqual(awards(0.5).xp, [
    "Defeated Goblin Warrior: 25",
    "Out with the silver: 125",
  ]);
  assert.match(
    awards(2).leaving.warning,
    /Leaving now gives up the 500 XP for “Out with the silver”\./u,
  );

  // Odd awards round down: an escape of 51 XP and a victory of 401.
  const file = moduleFile("shifting-ossuary");
  file.endings.find(({ kind }) => kind === "victory").xp = 401;
  file.endings.find(({ kind }) => kind === "escape-without-loot").xp = 51;
  const ossuary = validateModule(file);
  for (const [xpRate, earns, givesUp] of [
    [0.5, 25, 200],
    [1.5, 76, 601],
  ]) {
    const runtime = createFifthRuntime(
      ossuary,
      ada,
      {},
      { ...DEFAULT_SETTINGS, xpRate },
    );
    const begun = play(runtime, [{ type: "begin" }]);
    const view = leaving(runtime, begun);
    assert.equal(view.ending.xp, earns);
    assert.match(
      view.warning,
      new RegExp(
        `earns ${earns} XP for “Out empty-handed” but gives up the ${givesUp} XP`,
        "u",
      ),
    );
  }

  // An award scaled to 0 is still credited, so it is earned only once.
  file.endings.find(({ kind }) => kind === "escape-without-loot").xp = 1;
  const tiny = validateModule(file);
  const halved = createFifthRuntime(
    tiny,
    ada,
    {},
    { ...DEFAULT_SETTINGS, xpRate: 0.5 },
  );
  const left = play(halved, [
    { type: "begin" },
    { type: "leave", roomId: tiny.startRoomId },
  ]);
  assert.deepEqual(
    halved.projectSettlement(left).xp.map(({ name, xp }) => `${name}: ${xp}`),
    ["Out empty-handed: 0"],
  );
});

test("an adventure settles at its own XP rate, even after a restart under other settings", async () =>
  withDirectory(async (directory) => {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      7,
    );
    const started = await library.startCreation();
    const created = await library.create(
      "Ada",
      TEST_FIGHTER_CHOICES,
      started.revision,
    );
    const { sheet } = created.characters[0];
    const seed = winBarrowSeed(barrow, sheet, 1);
    const session = await startFifthAdventure(
      library,
      seed,
      sheet.id,
      barrow,
      created.revision,
      { ...DEFAULT_SETTINGS, xpRate: 2 },
    );
    const act = (action) =>
      assert.equal(session.act(action, "click").result.rejection, undefined);
    act({ type: "move", destinationId: "burial-hall" });
    while (session.state.encounter?.outcome === "ongoing") {
      act(barrowFightStep(session.runtime, session.state));
    }
    act({ type: "move", destinationId: "barrow-mouth" });
    act({ type: "leave", roomId: "barrow-mouth" });
    await session.persist();
    // A restart: the settings file now says × 1, and the session settles at × 2.
    await writeFile(
      settingsPathFor(library.path),
      JSON.stringify({
        kind: "dungeon-one-settings",
        formatVersion: 1,
        settings: { xpRate: 1 },
      }),
    );
    const restarted = await FifthSession.load(session.path, [barrow]);
    assert.equal(restarted.settings.xpRate, 2);
    const settled = await settleFifthSession(library, restarted);
    const after = settled.characters[0].sheet;
    // The goblin's 50 XP, doubled; no loot, so the empty-handed ending's none.
    assert.equal(after.xp, 100);
    assert.deepEqual(after.xpAwards, ["lintel-barrow/encounter/barrow-goblin"]);
  }));
