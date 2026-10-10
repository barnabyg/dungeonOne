// #338: area spells in the 5e runtime, with the test-only caster (Sage).
// The bar offers an area spell once per slot level, with the foes it may
// catch and its most; the AI DM's cast tool takes a list of targets, and too
// many, or one twice, is refused. A trace replays a cast at several targets.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { offeredToolsMatchActions } from "../dist/dm-evaluation-5e.js";
import {
  describeFifthResult,
  FIFTH_PROMPT_VERSION,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { testCasterAt } from "../dist/test-caster-5e.js";
import {
  FIFTH_TRACE_FORMAT,
  FifthTraceRun,
  verifyFifthTraceFile,
  writeFifthTrace,
} from "../dist/trace-5e.js";
import { goblinTrio } from "./fixtures/modules.mjs";

/** Sage at level 3, preparing Burning Hands and Shatter. */
const SAGE = testCasterAt(3, {
  cantrips: ["fire-bolt", "sacred-flame"],
  prepared: ["burning-hands", "shatter", "cure-wounds"],
});

/** The goblins in initiative order, as the bar and the tool list them. */
const foesOf = (session) =>
  session.state.encounter.order
    .map(({ combatantId }) => combatantId)
    .filter((id) => id !== "pc");

/** The first seeded session in the goblin trio's fight at Sage's turn. */
function sagesTurn() {
  for (let seed = 0; ; seed++) {
    const session = FifthSession.begin(seed, goblinTrio, SAGE);
    if (session.runtime.projectFight(session.state).turn !== undefined) {
      return session;
    }
  }
}

const areaViews = (session) =>
  session.runtime
    .projectActions(session.state)
    .filter(({ action, spell }) => action === "cast" && spell.maxTargets);

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

test("the save and trace formats and the prompt version bump", () => {
  assert.equal(FIFTH_SESSION_FORMAT, 43);
  assert.equal(FIFTH_TRACE_FORMAT, 37);
  assert.equal(FIFTH_PROMPT_VERSION, "5e-dm-v28");
});

test("the bar offers an area spell once per slot level, with its foes and its most", () => {
  const session = sagesTurn();
  const foes = foesOf(session);
  const views = areaViews(session);
  assert.deepEqual(
    views.map(({ spell, targets, target, available }) => [
      spell.id,
      spell.slotLevel,
      spell.maxTargets,
      targets.map(({ id }) => id),
      target,
      available,
    ]),
    [
      ["burning-hands", 1, 2, foes, undefined, true],
      ["burning-hands", 2, 2, foes, undefined, true],
      ["shatter", 2, 2, foes, undefined, true],
    ],
  );
  // Each stands for the cast at the first of its foes, up to its most.
  assert.deepEqual(session.runtime.actionOf(views[0]), {
    type: "cast",
    actorId: "pc",
    spellId: "burning-hands",
    targetIds: foes.slice(0, 2),
    slotLevel: 1,
  });
});

test("Burning Hands at two goblins: one roll, a save each", () => {
  const session = sagesTurn();
  const rolls = [];
  const { result } = session.act(
    {
      type: "cast",
      actorId: "pc",
      spellId: "burning-hands",
      targetIds: ["warrior", "minion-2"],
      slotLevel: 1,
    },
    "click",
  );
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  const lines = renderFifthResult(result).split("\n");
  assert.equal(
    lines[0],
    "You cast Burning Hands at Goblin Warrior and Goblin Minion 2 with a 1st-level spell slot (3 of 4 left).",
  );
  assert.match(
    lines[1],
    /^Burning Hands: damage \d+ \+ \d+ \+ \d+ = \d+ fire, and each of its 2 targets saves against it\.$/u,
  );
  assert.match(
    lines[2],
    /^Goblin Warrior makes a Dexterity saving throw against Burning Hands: \d+ [+−] \d+ = \d+ against DC 13\. (Success: Goblin Warrior takes half of \d+, \d+,|Failure: Goblin Warrior takes the full \d+) fire; Goblin Warrior has \d+\/\d+ HP\.$/u,
  );
  assert.ok(lines.some((line) => line.startsWith("Goblin Minion 2 makes")));
  // The card's dice: the damage once, then each save.
  const last = session.transitions.at(-1);
  rolls.push(...last.rolls);
  const described = describeFifthResult(result, rolls, "Sage");
  assert.deepEqual(
    described
      .slice(1, 4)
      .map(({ rolls: groups }) => groups.map(({ purpose }) => purpose)),
    [["damage"], ["save"], ["save"]],
  );
  assert.equal(described[1].rolls[0].dice.length, 3);
});

test("scripted DM: the cast tool takes a list of targets; too many or a repeat is refused", async () => {
  const session = sagesTurn();
  const tool = session.runtime
    .getGameToolDefinitions(session.state)
    .find(({ name }) => name === "cast");
  assert.deepEqual(tool.parameters.required, [
    "spell",
    "slot_level",
    "targets",
  ]);
  assert.equal(tool.parameters.properties.targets.type, "array");
  const foes = foesOf(session);
  for (const id of foes) {
    assert.ok(tool.parameters.properties.targets.items.enum.includes(id));
  }
  assert.match(
    tool.description,
    /burning-hands \(Burning Hands: Dexterity save, 3d6 fire, half on a success; 1st level: slot_level 1 or 2; up to 2 different targets from [a-z0-9-]+ \(Goblin [^)]+\), [a-z0-9-]+ \(Goblin [^)]+\) and [a-z0-9-]+ \(Goblin [^)]+\)\)/u,
  );
  assert.ok(offeredToolsMatchActions(session));
  const before = session.state;
  for (const [targets, code, reason] of [
    [foes, "too-many-targets", "Burning Hands catches at most 2 opponents."],
    [
      ["warrior", "warrior"],
      "duplicate-target",
      "Burning Hands can't catch the same creature twice.",
    ],
  ]) {
    const { turn } = await session.converse(
      "I cast Burning Hands at all of them!",
      scriptedDm("cast", { spell: "burning-hands", slot_level: 1, targets }),
    );
    assert.deepEqual(attempt(turn).result.engineResult.rejection, {
      code,
      reason,
    });
    assert.equal(session.state, before);
  }
  // A target that isn't a list never reaches the engine.
  const { turn } = await session.converse(
    "Burning Hands at the warrior.",
    scriptedDm("cast", {
      spell: "burning-hands",
      slot_level: 1,
      targets: "warrior",
    }),
  );
  assert.equal(
    attempt(turn).result.modelOutput.error.code,
    "invalid-arguments",
  );
});

test("a trace replays a cast at several targets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-338-"));
  try {
    const path = join(directory, "session.json");
    const created = await FifthSession.create(
      path,
      "a".repeat(32),
      sagesTurn().seed,
      goblinTrio,
      SAGE,
    );
    const run = new FifthTraceRun(created);
    await run.message(
      "Burning Hands at both minions.",
      scriptedDm("cast", {
        spell: "burning-hands",
        slot_level: 1,
        targets: ["minion-1", "minion-2"],
      }),
    );
    const tracePath = join(directory, "trace.json");
    await writeFifthTrace(tracePath, run.trace);
    const replayed = await verifyFifthTraceFile(tracePath, [goblinTrio]);
    assert.deepEqual(replayed.state, run.session.state);
    await run.session.persist();
    const loaded = await FifthSession.load(path, [goblinTrio]);
    assert.deepEqual(loaded.state, run.session.state);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
