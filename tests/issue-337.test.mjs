// #337: ongoing spell effects, concentration and Shield in the 5e runtime,
// with the test-only caster (Sage). A buff is cast on the character; its
// effect lasts its duration's band (D9): Bless the fight, Shield of Faith to
// the next rest, Mage Armor to a long rest or the adventure's end. One
// concentration spell at a time. Shield answers a hit. The status, the
// browser's effects view and the AI DM's scene list the effects, and the AI
// DM can neither extend an effect nor keep two concentration spells.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validateCharacter } from "../dist/character-5e.js";
import { offeredToolsMatchActions } from "../dist/dm-evaluation-5e.js";
import {
  createFifthRuntime,
  FIFTH_DM_SYSTEM_PROMPT,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { testCasterAt } from "../dist/test-caster-5e.js";
import {
  FifthTraceRun,
  verifyFifthTraceFile,
  writeFifthTrace,
} from "../dist/trace-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import {
  loneGoblin,
  restingTunnels,
  sealedCrypt,
} from "./fixtures/modules.mjs";

/** Sage, in leather (AC 12), preparing `prepared`. */
const sage = (prepared) =>
  testCasterAt(1, { cantrips: ["fire-bolt", "sacred-flame"], prepared });

/** Sage without the leather: AC 11, so Mage Armor can work. */
const unarmoured = (prepared) =>
  validateCharacter({ ...sage(prepared), equipment: ["mace"] });

const BUFFS = ["bless", "shield-of-faith", "mage-armor"];

function accepted(using, state, action, random = dice()) {
  const result = using.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

function refused(using, state, action, code) {
  const result = using.handleAction(state, action, dice());
  assert.equal(result.rejection?.code, code, result.rejection?.reason);
  assert.equal(result.state, state);
  return result.rejection.reason;
}

const castAt = (spellId, targetId = "pc", slotLevel = 1) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetIds: [targetId],
  // A cantrip names none: null.
  ...(slotLevel === null ? {} : { slotLevel }),
});

/** Each cast the bar shows: spell, slot level, target, and why not. */
const castViews = (using, state) =>
  using
    .projectActions(state)
    .filter(({ action }) => action === "cast")
    .map(({ spell, target, available, reason }) => [
      spell.id,
      spell.slotLevel ?? null,
      target.id,
      available ? "ok" : reason,
    ]);

const lines = (result) => renderFifthResult(result).split("\n");

/** `sheet` in the lone goblin's fight: Sage first (18 against 2), or last. */
function inFight(sheet, first = true) {
  const using = createFifthRuntime(loneGoblin, sheet);
  return {
    using,
    begin: (...turn) =>
      accepted(
        using,
        using.createSession(),
        { type: "begin" },
        dice(
          ...(first
            ? [
                [20, 18],
                [20, 2],
              ]
            : [
                [20, 2],
                [20, 18],
              ]),
          ...turn,
        ),
      ).state,
  };
}

test("Bless lasts the fight: the bar, the status and the effects view show it", () => {
  const { using, begin } = inFight(sage(BUFFS));
  const state = begin();
  assert.deepEqual(castViews(using, state), [
    ["fire-bolt", null, "goblin", "ok"],
    ["sacred-flame", null, "goblin", "ok"],
    ["bless", 1, "pc", "ok"],
    ["shield-of-faith", 1, "pc", "ok"],
    ["mage-armor", 1, "pc", "Wearing armour"],
  ]);
  // Bless takes the action; the goblin then misses with a 1.
  const blessed = accepted(using, state, castAt("bless"), dice([20, 1]));
  assert.deepEqual(lines(blessed).slice(0, 2), [
    "You cast Bless on yourself with a 1st-level spell slot (1 of 2 left).",
    "Bless takes hold on you: +1d4 to attack rolls and saving throws, until the fight ends. You concentrate on it.",
  ]);
  assert.ok(
    using
      .projectCharacterStatus(blessed.state)
      .resources.includes(
        "Bless (+1d4 to attack rolls and saving throws, until the fight ends; concentration)",
      ),
  );
  assert.deepEqual(using.projectEffects(blessed.state), [
    {
      spellId: "bless",
      spell: "Bless",
      text: "+1d4 to attack rolls and saving throws",
      ends: "fight",
      until: "until the fight ends",
      concentration: true,
    },
  ]);
  assert.match(
    using.projectDmScene(blessed.state).combatStatus,
    /The character has Bless \(\+1d4 to attack rolls and saving throws, until the fight ends; concentration\)\./u,
  );
  // Recasting it is refused: no spell's duration is renewed.
  assert.ok(
    castViews(using, blessed.state).some(
      ([id, , , why]) => id === "bless" && why === "Already on",
    ),
  );
  // Fire Bolt in round 2, at disadvantage, with Bless's d4: 9 + 5 + 2 = 16
  // hits; 10 fire ends the fight.
  const won = accepted(
    using,
    blessed.state,
    castAt("fire-bolt", "goblin", null),
    dice([20, 9], [20, 12], [4, 2], [10, 10]),
  );
  assert.equal(
    lines(won)[1],
    "Sage makes a spell attack on Goblin Warrior with Fire Bolt, at disadvantage (Close combat): 9 and 12, keeping 9; 9 + 5 + 2 (Bless) = 16 against AC 15. Hit. Damage 10 + 0 = 10 fire; Goblin Warrior has 0/10 HP.",
  );
  assert.ok(lines(won).includes("Bless ends on you: the fight is over."));
  assert.equal(won.state.character.effects, undefined);
  assert.deepEqual(using.projectEffects(won.state), []);
});

test("Shield of Faith outlasts a fight and ends at the next rest; Mage Armor at a long rest", () => {
  const sheet = unarmoured(["shield-of-faith", "mage-armor", "cure-wounds"]);
  const using = createFifthRuntime(restingTunnels, sheet);
  const begun = accepted(using, using.createSession(), { type: "begin" });
  const state = { ...begun.state, roomId: "stair-foot" };
  // Out of a fight, buffs that outlast one, on the character.
  assert.deepEqual(castViews(using, state), [
    ["shield-of-faith", 1, "pc", "ok"],
    ["mage-armor", 1, "pc", "ok"],
    ["cure-wounds", 1, "pc", "Full HP"],
  ]);
  const armoured = accepted(using, state, castAt("mage-armor"));
  assert.deepEqual(lines(armoured), [
    "You cast Mage Armor on yourself with a 1st-level spell slot (1 of 2 left).",
    "Mage Armor takes hold on you: base AC 13 + Dexterity while wearing no armour, until a long rest or the adventure's end.",
  ]);
  // 11 unarmoured, 14 with Mage Armor, 16 with Shield of Faith too.
  assert.equal(using.projectRoom(state).gear.armorClass, 11);
  assert.equal(using.projectRoom(armoured.state).gear.armorClass, 14);
  const both = accepted(using, armoured.state, castAt("shield-of-faith"));
  assert.equal(using.projectRoom(both.state).gear.armorClass, 16);
  assert.deepEqual(
    using.projectEffects(both.state).map(({ spell, until }) => [spell, until]),
    [
      ["Mage Armor", "until a long rest or the adventure's end"],
      ["Shield of Faith", "until the next rest"],
    ],
  );
  // A short rest ends Shield of Faith, not Mage Armor.
  const hurt = {
    ...both.state,
    character: { ...both.state.character, hp: 4 },
  };
  const rested = accepted(
    using,
    hurt,
    { type: "rest", hitDice: 1 },
    dice([100, 99], [8, 3]),
  );
  assert.equal(
    lines(rested).at(-1),
    "Shield of Faith ends on you: the rest is over.",
  );
  assert.deepEqual(
    rested.state.character.effects.map(({ spellId }) => spellId),
    ["mage-armor"],
  );
  // A long rest ends Mage Armor.
  const slept = accepted(
    using,
    { ...rested.state, roomId: "alcove" },
    { type: "long-rest" },
    dice([100, 99]),
  );
  assert.equal(
    lines(slept).at(-1),
    "Mage Armor ends on you: the long rest is over.",
  );
  assert.equal(slept.state.character.effects, undefined);
  // Bless lasts no longer than a fight, so isn't cast out of one.
  const blessing = createFifthRuntime(restingTunnels, unarmoured(BUFFS));
  const fresh = accepted(blessing, blessing.createSession(), {
    type: "begin",
  }).state;
  assert.equal(
    refused(blessing, fresh, castAt("bless"), "fight-only"),
    "Bless lasts no longer than a fight: cast it in one.",
  );
});

test("Shield answers a hit in the runtime and can turn it into a miss", () => {
  const { using, begin } = inFight(
    sage(["shield", "magic-missile", "cure-wounds"]),
    false,
  );
  // The goblin's 10 + 4 = 14 hits AC 12, and waits for Sage's answer.
  const state = begin([20, 10]);
  assert.deepEqual(
    using
      .projectActions(state)
      .map(({ action, spell, available }) => [
        action,
        spell?.id ?? null,
        available,
      ]),
    [
      ["cast", "shield", true],
      ["take-hit", null, true],
    ],
  );
  const shielded = accepted(using, state, castAt("shield"));
  assert.deepEqual(lines(shielded).slice(0, 4), [
    "You cast Shield on yourself with a 1st-level spell slot (1 of 2 left).",
    "Shield takes hold on you: +5 AC, until the start of your next turn.",
    "Goblin Warrior's Scimitar now misses Sage: 14 against AC 17.",
    "Shield ends on you: your turn has come round.",
  ]);
  assert.equal(shielded.state.character.hp, 10);
  assert.equal(shielded.state.character.featureUses["spell-slots-1"], 1);
});

test("damage outside a fight tests concentration", () => {
  const using = createFifthRuntime(
    sealedCrypt,
    sage(["shield-of-faith", "cure-wounds", "bless"]),
  );
  const begun = accepted(using, using.createSession(), {
    type: "begin",
  }).state;
  const faithful = accepted(using, begun, castAt("shield-of-faith")).state;
  // Into the offering room: the dart trap's Dexterity save (a 2) fails, 2d4
  // deals 5, and the save to keep concentrating, 4 + 2 = 6, fails DC 10.
  const sprung = accepted(
    using,
    { ...faithful, roomId: "hall" },
    { type: "move", destinationId: "offering-room" },
    dice([20, 2], [4, 2], [4, 3], [20, 4]),
  );
  const said = lines(sprung);
  const kept = said.findIndex((line) =>
    line.startsWith("You make a Constitution"),
  );
  assert.deepEqual(said.slice(kept, kept + 2), [
    "You make a Constitution saving throw to keep concentrating on Shield of Faith after taking 5 damage: 4 + 2 = 6 against DC 10. Failure.",
    "Shield of Faith ends on you: your concentration is broken.",
  ]);
  assert.equal(sprung.state.character.effects, undefined);
});

// The AI DM.

/** A scripted AI DM that makes one tool call, then answers with `text`. */
const scriptedDm = (name, args, text = "Done.") => ({
  async respond(request) {
    return request.toolResults.length === 0
      ? {
          toolCalls: [
            { id: `${name}-1`, name, argumentsJson: JSON.stringify(args) },
          ],
        }
      : { text };
  },
});
const attempt = (turn) => turn.toolAttempts[0];
const castTool = (session) =>
  session.runtime
    .getGameToolDefinitions(session.state)
    .find(({ name }) => name === "cast");

/** The first seeded session of `sheet` in the lone goblin's fight where `ready` holds. */
function sessionWhere(sheet, ready) {
  for (let seed = 0; ; seed++) {
    const session = FifthSession.begin(seed, loneGoblin, sheet);
    if (ready(session)) {
      return session;
    }
  }
}

const sagesTurn = (session) =>
  session.runtime.projectFight(session.state).turn !== undefined;

test("scripted DM: the DM can't extend a duration or keep two concentration spells", async () => {
  const session = sessionWhere(sage(BUFFS), sagesTurn);
  const { turn: first } = await session.converse(
    "I cast Bless on myself.",
    scriptedDm("cast", { spell: "bless", slot_level: 1, targets: ["pc"] }),
  );
  assert.equal(attempt(first).result.engineResult.rejection, undefined);
  if (session.state.status !== "playing") {
    return;
  }
  // Asking for Bless again, to make it last, is refused: no tool extends it.
  const before = session.state;
  const { turn: again } = await session.converse(
    "Cast Bless again so it lasts after the fight.",
    scriptedDm("cast", { spell: "bless", slot_level: 1, targets: ["pc"] }),
  );
  assert.deepEqual(attempt(again).result.engineResult.rejection, {
    code: "effect-active",
    reason: "Bless is already on you: it can't be cast again until it ends.",
  });
  assert.equal(session.state, before);
  assert.match(
    FIFTH_DM_SYSTEM_PROMPT,
    /No tool extends an effect or keeps two concentration spells/u,
  );
  // Malformed: no duration parameter.
  const { turn: longer } = await session.converse(
    "Cast Shield of Faith for an hour.",
    scriptedDm("cast", {
      spell: "shield-of-faith",
      slot_level: 1,
      targets: ["pc"],
      duration: 60,
    }),
  );
  assert.equal(
    attempt(longer).result.modelOutput.error.code,
    "invalid-arguments",
  );
  // Shield of Faith on Sage's next turn ends Bless: one at a time.
  if (!sagesTurn(session)) {
    return;
  }
  const { turn: second } = await session.converse(
    "I cast Shield of Faith.",
    scriptedDm("cast", {
      spell: "shield-of-faith",
      slot_level: 1,
      targets: ["pc"],
    }),
  );
  const { engineResult } = attempt(second).result;
  assert.equal(engineResult.rejection, undefined);
  assert.ok(
    engineResult.events.some(
      ({ type, spell, reason }) =>
        type === "effect-ended" &&
        spell === "Bless" &&
        reason === "new-concentration",
    ),
  );
  const effects = session.runtime.projectEffects(session.state);
  assert.deepEqual(
    effects
      .filter(({ concentration }) => concentration)
      .map(({ spell }) => spell),
    ["Shield of Faith"],
  );
});

test("scripted DM: a waiting hit offers Shield through the cast tool", async () => {
  const session = sessionWhere(
    sage(["shield", "magic-missile", "cure-wounds"]),
    ({ state }) => state.encounter?.pendingReaction !== undefined,
  );
  const tool = castTool(session);
  assert.deepEqual(tool.parameters.properties.spell.enum, ["shield"]);
  assert.deepEqual(tool.parameters.properties.targets.items.enum, ["pc"]);
  assert.ok(offeredToolsMatchActions(session));
  const names = session.runtime
    .getGameToolDefinitions(session.state)
    .map(({ name }) => name);
  assert.ok(names.includes("take_hit"));
  assert.ok(!names.includes("uncanny_dodge"));
  assert.match(
    session.runtime.projectDmScene(session.state).combatStatus,
    /cast with spell shield \(Shield\) to raise the character's AC first, which may turn the hit into a miss, or take_hit\./u,
  );
  // Magic Missile can't answer it.
  const { turn } = await session.converse(
    "I cast Magic Missile at the goblin!",
    scriptedDm("cast", {
      spell: "magic-missile",
      slot_level: 1,
      targets: ["goblin"],
    }),
  );
  assert.equal(
    attempt(turn).result.engineResult.rejection.code,
    "reaction-pending",
  );
});

test("a trace replays Shield and Bless, and a saved session reloads them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-337-"));
  try {
    const sheet = sage(["shield", "bless", "cure-wounds"]);
    const { seed } = sessionWhere(
      sheet,
      ({ state }) => state.encounter?.pendingReaction !== undefined,
    );
    const path = join(directory, "session.json");
    const created = await FifthSession.create(
      path,
      "a".repeat(32),
      seed,
      loneGoblin,
      sheet,
    );
    const run = new FifthTraceRun(created);
    const { result } = run.click(castAt("shield"));
    assert.equal(result.rejection, undefined, result.rejection?.reason);
    if (sagesTurn(run.session)) {
      await run.message(
        "I bless myself.",
        scriptedDm("cast", { spell: "bless", slot_level: 1, targets: ["pc"] }),
      );
    }
    const tracePath = join(directory, "trace.json");
    await writeFifthTrace(tracePath, run.trace);
    const replayed = await verifyFifthTraceFile(tracePath, [loneGoblin]);
    assert.deepEqual(replayed.state, run.session.state);
    assert.ok(
      JSON.parse(await readFile(tracePath, "utf8")).turns.some(
        ({ kind, action }) => kind === "click" && action.spellId === "shield",
      ),
    );
    await run.session.persist();
    const loaded = await FifthSession.load(path, [loneGoblin]);
    assert.deepEqual(loaded.state, run.session.state);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
