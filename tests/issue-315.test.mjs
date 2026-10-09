// #315: two Fighter features the sheet described are played. Remarkable
// Athlete (Champion, level 3) gives initiative advantage, which cancels a
// surprised character's disadvantage; Tactical Mind (level 2) spends a use
// of Second Wind on a failed check to add 1d10, kept if the check still
// fails.
import assert from "node:assert/strict";
import test from "node:test";

import { characterProfile } from "../dist/character-5e.js";
import { FIGHTER } from "../dist/fighter-5e.js";
import {
  createFifthRuntime,
  describeFifthResult,
  FIFTH_DM_SYSTEM_PROMPT,
  FIFTH_PROMPT_VERSION,
  renderFifthEvent,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER, testFighterAt } from "../dist/test-fighter-5e.js";
import { FIFTH_TRACE_FORMAT } from "../dist/trace-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import {
  gradedCellar,
  lurkingTunnels,
  moduleFile,
  ratTunnels,
  sealedCrypt,
} from "./fixtures/modules.mjs";

const MOVE = { type: "move", destinationId: "rat-cellar" };
// Ada's passive Perception is 12 at levels 1–3; the lurking rat's Stealth +4.
const HIDES = [20, 10];
const SPOTTED = [20, 7];
const RAT = [[20, 2]];

function accepted(using, state, action, random = dice()) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

const begun = (using) =>
  accepted(using, using.createSession(), { type: "begin" }).state;
const initiativeOf = (events, id) =>
  events
    .find(({ type }) => type === "initiative")
    .order.find(({ combatantId }) => combatantId === id);

test("Remarkable Athlete's class data gives Athletics and initiative advantage", () => {
  const athlete = FIGHTER.subclasses[0].features.find(
    ({ id }) => id === "remarkable-athlete",
  );
  assert.deepEqual(athlete.effect, [
    { kind: "check-advantage", skills: ["athletics"] },
    { kind: "initiative-advantage" },
  ]);
});

test("a level-3 Champion rolls initiative with advantage, naming Remarkable Athlete", () => {
  const champion = createFifthRuntime(ratTunnels, testFighterAt(3));
  const random = dice([20, 4], [20, 15], ...RAT);
  const result = accepted(champion, begun(champion), MOVE, random);
  const ada = initiativeOf(result.events, "pc");
  assert.equal(ada.d20, 15);
  assert.deepEqual(ada.mode, {
    d20s: [4, 15],
    advantage: ["Remarkable Athlete"],
    disadvantage: [],
  });
  assert.equal(ada.total, 17);
  // The card's initiative line names the advantage and drops the lower die.
  const line = describeFifthResult(result, random.drawn, "Ada").find(
    ({ rolls }) => rolls.some(({ purpose }) => purpose === "initiative"),
  );
  const roll = line.rolls.find(({ roller }) => roller === "Ada");
  assert.equal(roll.mode, "advantage (Remarkable Athlete)");
  assert.deepEqual(roll.dice, [
    { sides: 20, value: 4, dropped: true },
    { sides: 20, value: 15 },
  ]);
  assert.match(
    line.text,
    /Ada \(advantage: Remarkable Athlete, d20s 4 and 15, kept\) 15 \+ 2 = 17/u,
  );
  // The fight's projection keeps both dice for the initiative breakdown.
  const row = champion
    .projectFight(result.state)
    .encounter.combatants.find(({ id }) => id === "pc");
  assert.deepEqual(row.initiative.mode.advantage, ["Remarkable Athlete"]);
});

test("below level 3, initiative is a single d20", () => {
  for (const sheet of [TEST_FIGHTER, testFighterAt(2)]) {
    const using = createFifthRuntime(ratTunnels, sheet);
    const result = accepted(using, begun(using), MOVE, dice([20, 9], ...RAT));
    assert.equal(initiativeOf(result.events, "pc").mode, undefined);
  }
});

test("a surprised Champion's advantage and disadvantage cancel: one d20, and the card says so", () => {
  const champion = createFifthRuntime(lurkingTunnels, testFighterAt(3));
  const random = dice(HIDES, [20, 11], ...RAT);
  const result = accepted(champion, begun(champion), MOVE, random);
  const lurk = result.events.find(({ type }) => type === "lurk");
  assert.match(
    renderFifthEvent(result.state, lurk),
    /you are surprised and roll initiative with disadvantage\.$/u,
  );
  const ada = initiativeOf(result.events, "pc");
  assert.equal(ada.d20, 11);
  assert.deepEqual(ada.mode, {
    d20s: [11],
    advantage: ["Remarkable Athlete"],
    disadvantage: ["surprised"],
  });
  const line = describeFifthResult(result, random.drawn, "Ada").find(
    ({ rolls }) => rolls.some(({ purpose }) => purpose === "initiative"),
  );
  const roll = line.rolls.find(({ roller }) => roller === "Ada");
  assert.equal(
    roll.mode,
    "advantage (Remarkable Athlete) and disadvantage (surprised) cancel",
  );
  assert.deepEqual(roll.dice, [{ sides: 20, value: 11 }]);
  assert.match(
    line.text,
    /Ada \(advantage: Remarkable Athlete and disadvantage: surprised cancel\) 11 \+ 2 = 13/u,
  );
  // Spotting the lurker leaves the advantage alone.
  const spotted = accepted(
    champion,
    begun(champion),
    MOVE,
    dice(SPOTTED, [20, 3], [20, 8], ...RAT),
  );
  assert.deepEqual(initiativeOf(spotted.events, "pc").mode.d20s, [3, 8]);
});

test("the sheet's initiative is unchanged: advantage is on the roll", () => {
  assert.equal(
    characterProfile(testFighterAt(3)).initiative,
    characterProfile(TEST_FIGHTER).initiative,
  );
});

// Tactical Mind, on the graded cellar and the sealed crypt. Level-2 Ada:
// Perception +2, Athletics +5, Animal Handling +0, Dexterity +2; two uses of
// Second Wind.
const ADA_2 = testFighterAt(2);
const cellar = createFifthRuntime(gradedCellar, ADA_2);
const EXAMINE = { type: "examine", targetId: "rubble-heap" };
const TACTICAL_MIND = { type: "tactical-mind" };
const types = (events) => events.map(({ type }) => type);
const offered = (using, state) =>
  using
    .projectActions(state)
    .filter(({ action }) => action === "tactical-mind");

test("a failed check offers Tactical Mind; a success, a level-1 Fighter or no uses left does not", () => {
  const failed = accepted(cellar, begun(cellar), EXAMINE, dice([20, 8]));
  assert.equal(failed.events[0].band, "failure");
  assert.deepEqual(failed.state.tacticalMind, {
    site: { kind: "examine", id: "rubble-heap" },
    roll: failed.events[0].roll,
  });
  assert.deepEqual(offered(cellar, failed.state), [
    { action: "tactical-mind", available: true },
  ]);
  // A success leaves nothing to add to.
  const passed = accepted(cellar, begun(cellar), EXAMINE, dice([20, 12]));
  assert.equal(passed.state.tacticalMind, undefined);
  assert.deepEqual(offered(cellar, passed.state), []);
  // Level 1 has no Tactical Mind.
  const novice = createFifthRuntime(gradedCellar, TEST_FIGHTER);
  const plain = accepted(novice, begun(novice), EXAMINE, dice([20, 8]));
  assert.equal(plain.state.tacticalMind, undefined);
  assert.deepEqual(offered(novice, plain.state), []);
  const refused = novice.handleAction(plain.state, TACTICAL_MIND, dice());
  assert.equal(refused.rejection.code, "no-tactical-mind");
  assert.equal(refused.rejection.reason, "You don't have Tactical Mind.");
  assert.equal(refused.state, plain.state);
  // With no use of Second Wind left, nothing is offered.
  const spent = {
    ...begun(cellar),
    character: {
      ...begun(cellar).character,
      featureUses: { "second-wind": 0 },
    },
  };
  const tired = accepted(cellar, spent, EXAMINE, dice([20, 8]));
  assert.equal(tired.state.tacticalMind, undefined);
  assert.equal(
    cellar.handleAction(tired.state, TACTICAL_MIND, dice()).rejection.code,
    "no-failed-check",
  );
});

test("Tactical Mind turning a failure into a success: graded again, one use spent, never rerolled", () => {
  const failed = accepted(cellar, begun(cellar), EXAMINE, dice([20, 8]));
  // 10 + d10 3 = 13 against DC 12: a success, so the ring is revealed. Only
  // the d10 is drawn: the d20 stands.
  const random = dice([10, 3]);
  const result = accepted(cellar, failed.state, TACTICAL_MIND, random);
  assert.deepEqual(types(result.events), [
    "tactical-mind",
    "examined",
    "revealed",
  ]);
  const [mind] = result.events;
  assert.deepEqual(mind.die, { sides: 10, value: 3 });
  assert.equal(mind.roll.total, 13);
  assert.equal(mind.roll.d20, 8);
  assert.equal(mind.band, "success");
  assert.equal(mind.spent, true);
  assert.deepEqual(mind.secondWind, { uses: 1, max: 2 });
  assert.equal(
    renderFifthEvent(result.state, mind),
    "Tactical Mind: you add 1d10 to the Perception check. 10 + 3 = 13 against DC 12. Success: a use of Second Wind is spent (1 of 2 left).",
  );
  assert.equal(result.state.character.featureUses["second-wind"], 1);
  assert.equal(result.state.tacticalMind, undefined);
  // The outcome is remembered as the new band.
  assert.deepEqual(result.state.checks, [
    { id: "examine:rubble-heap", band: "success", tacticalMind: true },
  ]);
  assert.ok(
    cellar
      .projectRoom(result.state)
      .items.some(({ id }) => id === "silver-ring"),
  );
  // Offered once: it is gone, and the pips show the use spent.
  assert.deepEqual(offered(cellar, result.state), []);
  assert.equal(
    cellar.handleAction(result.state, TACTICAL_MIND, dice()).rejection.code,
    "no-failed-check",
  );
  assert.deepEqual(cellar.projectFight(result.state).features.secondWind, {
    uses: 1,
    max: 2,
  });
  // The card: the d10 added to the earlier total, against the DC.
  const [line] = describeFifthResult(result, random.drawn, "Ada");
  assert.deepEqual(line.rolls, [
    {
      purpose: "check",
      roller: "Ada",
      label: "Perception check (Tactical Mind)",
      dice: [{ sides: 10, value: 3 }],
      modifier: 10,
      proficiency: 0,
      total: 13,
      dc: 12,
      outcome: "success",
    },
  ]);
});

test("Tactical Mind that still fails keeps the use, and the failure stands", () => {
  const failed = accepted(cellar, begun(cellar), EXAMINE, dice([20, 8]));
  const result = accepted(cellar, failed.state, TACTICAL_MIND, dice([10, 1]));
  const [mind] = result.events;
  assert.equal(mind.roll.total, 11);
  assert.equal(mind.band, "failure");
  assert.equal(mind.spent, false);
  assert.equal(
    renderFifthEvent(result.state, mind),
    "Tactical Mind: you add 1d10 to the Perception check. 10 + 1 = 11 against DC 12. Failure: the use of Second Wind is kept (2 of 2 left).",
  );
  assert.equal(result.state.character.featureUses["second-wind"], 2);
  assert.deepEqual(result.state.checks, [
    { id: "examine:rubble-heap", band: "failure", tacticalMind: true },
  ]);
  // Nothing more to add, and the check is not made again.
  assert.deepEqual(offered(cellar, result.state), []);
  const again = accepted(cellar, result.state, EXAMINE);
  assert.deepEqual(types(again.events), ["examined"]);
});

test("Tactical Mind is offered only right after the failure", () => {
  const failed = accepted(cellar, begun(cellar), EXAMINE, dice([20, 8]));
  const looked = accepted(cellar, failed.state, {
    type: "examine",
    targetId: "cracked-cask",
  });
  assert.equal(looked.state.tacticalMind, undefined);
  const late = cellar.handleAction(looked.state, TACTICAL_MIND, dice());
  assert.equal(late.rejection.code, "no-failed-check");
  assert.equal(
    late.rejection.reason,
    "Tactical Mind adds to an ability check you have just failed, and there is none.",
  );
  // A refused action leaves the offer in place.
  const typo = cellar.handleAction(
    failed.state,
    { type: "examine", targetId: "nowhere" },
    dice(),
  );
  assert.ok(typo.rejection);
  assert.equal(typo.state.tacticalMind, failed.state.tacticalMind);
});

test("failing by 5 or more: its damage stands, and the new band's effects apply", () => {
  // 6 against 12: the stones fall for 1d6 4. Then 6 + 6 = 12, a success.
  const failed = accepted(
    cellar,
    begun(cellar),
    EXAMINE,
    dice([20, 4], [6, 4]),
  );
  assert.equal(failed.events[0].band, "failure-by-5");
  const hp = failed.state.character.hp;
  const result = accepted(cellar, failed.state, TACTICAL_MIND, dice([10, 6]));
  assert.deepEqual(types(result.events), [
    "tactical-mind",
    "examined",
    "revealed",
  ]);
  assert.equal(result.state.character.hp, hp);
  // Still failing, but by less: the band changes, and its words are told.
  const nearer = accepted(cellar, failed.state, TACTICAL_MIND, dice([10, 2]));
  assert.equal(nearer.events[0].band, "failure");
  assert.deepEqual(types(nearer.events), [
    "tactical-mind",
    "examined",
    "outcome",
  ]);
  assert.equal(nearer.state.character.hp, hp);
});

test("a failure graded into a lesser failure deals no damage again", () => {
  // A cellar whose plain failure hurts too: the lesser failure's words
  // are told, but its damage is not dealt on top of the first.
  const file = moduleFile("graded-cellar");
  const heap = file.rooms[0].features[0].check.bands;
  heap.failure.effects = heap["failure-by-5"].effects;
  const harsh = createFifthRuntime(validateModule(file), ADA_2);
  const failed = accepted(harsh, begun(harsh), EXAMINE, dice([20, 4], [6, 4]));
  const hp = failed.state.character.hp;
  const nearer = accepted(harsh, failed.state, TACTICAL_MIND, dice([10, 2]));
  assert.equal(nearer.events[0].band, "failure");
  assert.deepEqual(types(nearer.events), [
    "tactical-mind",
    "examined",
    "outcome",
  ]);
  assert.equal(nearer.state.character.hp, hp);
});

test("Tactical Mind at a door, a topic, a search and a trap", () => {
  // Forcing the hatch: d20 3 + 5 = 8 against 12; + d10 4 = 12 opens it.
  const force = { type: "force", doorId: "warped-hatch" };
  const stuck = accepted(cellar, begun(cellar), force, dice([20, 3]));
  const forced = accepted(cellar, stuck.state, TACTICAL_MIND, dice([10, 4]));
  assert.deepEqual(types(forced.events), ["tactical-mind", "door"]);
  assert.equal(forced.events[1].opened, true);
  assert.ok(forced.state.openedDoorIds.includes("warped-hatch"));
  // Asking the cat: d20 5 + 0 = 5 against 10; + d10 5 = 10, and it answers.
  const ask = { type: "talk", topicId: "the-cask" };
  const shrug = accepted(cellar, begun(cellar), ask, dice([20, 5]));
  const asked = accepted(cellar, shrug.state, TACTICAL_MIND, dice([10, 5]));
  assert.deepEqual(types(asked.events), ["tactical-mind", "talked"]);
  assert.equal(
    asked.events[1].words,
    "The cat pads to the cracked cask and paws at the rag.",
  );
  // The crypt's hall: Perception d20 5 + 2 = 7 against the search's DC 13;
  // + d10 6 = 13 finds the dart trap. Disarming it: Dexterity d20 3 + 2 = 5
  // against 12; + d10 7 = 12 disarms it.
  const crypt = createFifthRuntime(sealedCrypt, ADA_2);
  const hall = accepted(crypt, begun(crypt), {
    type: "move",
    destinationId: "hall",
  }).state;
  const missed = accepted(
    crypt,
    hall,
    { type: "search", roomId: "hall" },
    dice([20, 5]),
  );
  const found = accepted(crypt, missed.state, TACTICAL_MIND, dice([10, 6]));
  assert.deepEqual(types(found.events), ["tactical-mind", "searched"]);
  assert.deepEqual(found.state.foundTrapIds, ["dart-trap"]);
  const fumbled = accepted(
    crypt,
    found.state,
    { type: "disarm", trapId: "dart-trap" },
    dice([20, 3]),
  );
  assert.equal(fumbled.state.character.featureUses["second-wind"], 1);
  const disarmed = accepted(crypt, fumbled.state, TACTICAL_MIND, dice([10, 7]));
  assert.deepEqual(types(disarmed.events), ["tactical-mind", "disarmed"]);
  assert.equal(disarmed.events[1].success, true);
  assert.deepEqual(disarmed.state.disarmedTrapIds, ["dart-trap"]);
  assert.equal(disarmed.state.character.featureUses["second-wind"], 0);
});

test("a saving throw offers no Tactical Mind", () => {
  // Walking through the armed trap: a Dexterity save, then its damage.
  const crypt = createFifthRuntime(sealedCrypt, ADA_2);
  const hall = accepted(crypt, begun(crypt), {
    type: "move",
    destinationId: "hall",
  }).state;
  const sprung = accepted(
    crypt,
    hall,
    { type: "move", destinationId: "offering-room" },
    dice([20, 2], [4, 1], [4, 1]),
  );
  assert.equal(sprung.state.tacticalMind, undefined);
});

// The AI DM's tactical_mind tool.

/** A scripted AI DM that makes one tool call, then answers with `text`. */
const scriptedDm = (name, argumentsJson = "{}", text = "Done.") => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? { toolCalls: [{ id: `${name}-1`, name, argumentsJson }] }
      : { text };
  },
});
const attempt = (turn) => turn.toolAttempts[0];
const toolNames = (session) =>
  session.runtime.getGameToolDefinitions(session.state).map(({ name }) => name);

/** The first seed's session where level-2 Ada fails the rubble heap. */
function failedHeap() {
  for (let seed = 0; seed < 200; seed++) {
    const session = FifthSession.begin(seed, gradedCellar, ADA_2);
    session.act(EXAMINE, "click");
    if (
      session.state.tacticalMind !== undefined &&
      session.state.status === "playing"
    ) {
      return session;
    }
  }
  assert.fail("no seed below 200 fails the rubble heap");
}

test("scripted DM: asking to use Tactical Mind after a failed check calls tactical_mind", async () => {
  const session = failedHeap();
  const tool = session.runtime
    .getGameToolDefinitions(session.state)
    .find(({ name }) => name === "tactical_mind");
  assert.deepEqual(tool.parameters.properties, {});
  assert.match(
    tool.description,
    /^Only when the player asks to use Tactical Mind[^]*Perception check: d20 \d+ \+ 0 \+ 2 proficiency = \d+ against DC 12\. Failure/u,
  );
  const uses = session.state.character.featureUses["second-wind"];
  const { turn } = await session.converse(
    "I use Tactical Mind to push through.",
    scriptedDm("tactical_mind"),
  );
  assert.equal(attempt(turn).disposition.executed, true);
  const [mind] = attempt(turn).result.engineResult.events;
  assert.equal(mind.type, "tactical-mind");
  assert.match(
    JSON.stringify(turn),
    /Tactical Mind: you add 1d10 to the Perception check\./u,
  );
  assert.equal(
    session.state.character.featureUses["second-wind"],
    uses - (mind.spent ? 1 : 0),
  );
  // Used once, it is gone.
  assert.ok(!toolNames(session).includes("tactical_mind"));
});

test("scripted DM: asking for Tactical Mind when it isn't offered is refused", async () => {
  // Before any check: not offered, and the engine refuses it.
  const fresh = FifthSession.begin(0, gradedCellar, ADA_2);
  assert.ok(!toolNames(fresh).includes("tactical_mind"));
  const before = fresh.state;
  const { turn } = await fresh.converse(
    "Tactical Mind!",
    scriptedDm("tactical_mind"),
  );
  assert.equal(
    attempt(turn).result.engineResult.rejection.code,
    "no-failed-check",
  );
  assert.equal(fresh.state, before);
  // Arguments it doesn't take are malformed.
  const session = failedHeap();
  const extra = await session.converse(
    "Tactical Mind, plus ten!",
    scriptedDm("tactical_mind", JSON.stringify({ bonus: 10 })),
  );
  assert.equal(
    attempt(extra.turn).result.modelOutput.error.code,
    "invalid-arguments",
  );
  // A level-1 Fighter has no Tactical Mind.
  const novice = FifthSession.begin(0, gradedCellar, TEST_FIGHTER);
  novice.act(EXAMINE, "click");
  const refused = await novice.converse(
    "Tactical Mind!",
    scriptedDm("tactical_mind"),
  );
  assert.equal(
    attempt(refused.turn).result.engineResult.rejection.code,
    "no-tactical-mind",
  );
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /only then is tactical_mind offered\. Call it only when the player asks to use Tactical Mind/u,
  );
});

test("the save and trace formats and the prompt version bump", () => {
  assert.ok(FIFTH_SESSION_FORMAT >= 35);
  assert.ok(FIFTH_TRACE_FORMAT >= 29);
  assert.equal(FIFTH_PROMPT_VERSION, "5e-dm-v21");
});
