// #159: each result card carries its rolls grouped by purpose beside the
// engine-authored line they belong to, and the session save (format 5)
// stores them.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { buildFighter, rollAbilitySet } from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import {
  createFifthRuntime,
  describeFifthResult,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";

const adventures = await loadBuiltInFifthAdventures();
const storeroom = adventures.find(({ id }) => id === "goblin-storeroom");
const CHOICES = {
  placement: {
    strength: 0,
    dexterity: 1,
    constitution: 2,
    intelligence: 3,
    wisdom: 4,
    charisma: 5,
  },
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
};
const END_TURN = { type: "end-turn", actorId: "pc" };

const fighter = (seed) =>
  buildFighter(
    "a".repeat(32),
    "Ada",
    rollAbilitySet(createSeededRandom(seed)),
    CHOICES,
  );

/** Plays the storeroom fight on `seed`; each action's result and dice. */
function play(seed) {
  const runtime = createFifthRuntime(storeroom, fighter(seed));
  const source = createSeededRandom(seed + 1);
  let drawn = [];
  const random = {
    roll(sides) {
      const value = source.roll(sides);
      drawn.push({ sides, value });
      return value;
    },
  };
  const steps = [];
  let state = runtime.createSession();
  let action = { type: "begin" };
  for (;;) {
    drawn = [];
    const result = runtime.handleAction(state, action, random);
    steps.push({ result, rolls: drawn });
    state = result.state;
    if (state.status !== "playing") {
      return steps;
    }
    const targets = runtime.attackTargets(state);
    action =
      targets.length === 0
        ? END_TURN
        : { type: "attack", actorId: "pc", targetId: targets[0].id };
  }
}

const groups = (steps) =>
  steps.flatMap(({ result, rolls }) =>
    describeFifthResult(result, rolls, "Ada").flatMap((line) => line.rolls),
  );

const sappedAttack = (group) =>
  group.purpose === "attack" && group.mode === "disadvantage (Sap)";

let seed = 0;
while (!groups(play(seed)).some(sappedAttack)) {
  seed++;
  assert.ok(seed < 5000, "no storeroom fight with a sapped attack");
}

test("each line of a result card carries its rolls, grouped by purpose", () => {
  const steps = play(seed);
  for (const { result, rolls } of steps) {
    const lines = describeFifthResult(result, rolls, "Ada");
    // The card text stays the engine's, split line by line.
    assert.equal(
      lines.map(({ text }) => text).join("\n"),
      renderFifthResult(result),
    );
    // Every die drawn appears in a group, except initiative roll-offs.
    const shown = lines
      .flatMap((line) => line.rolls)
      .reduce(
        (count, group) =>
          count + group.dice.length + (group.rollOff?.length ?? 0),
        0,
      );
    assert.equal(shown, rolls.length);
  }
  const all = groups(steps);
  const initiative = all.filter(({ purpose }) => purpose === "initiative");
  assert.equal(initiative.length, storeroom.encounters[0].opponents.length + 1);
  for (const group of initiative) {
    assert.deepEqual(group.dice.length, 1);
    assert.equal(group.dice[0].sides, 20);
    assert.equal(group.total, group.dice[0].value + group.modifier);
  }
  for (const group of all.filter(({ purpose }) => purpose === "attack")) {
    const kept = group.dice.filter(({ dropped }) => !dropped);
    assert.equal(kept.length, 1);
    assert.equal(group.total, kept[0].value + group.modifier);
    assert.ok(["hit", "critical", "miss"].includes(group.outcome));
    assert.equal(typeof group.armorClass, "number");
    assert.ok(group.roller && group.target);
  }
  for (const group of all.filter(({ purpose }) => purpose === "damage")) {
    assert.equal(
      group.total,
      Math.max(
        0,
        group.dice.reduce((sum, { value }) => sum + value, 0) + group.modifier,
      ),
    );
    assert.ok(group.hpAfter <= group.maxHp);
    assert.equal(typeof group.damageType, "string");
  }
  // Sap: both d20s, the higher one not kept.
  const sapped = all.find(sappedAttack);
  assert.equal(sapped.dice.length, 2);
  assert.ok(sapped.dice.every(({ sides }) => sides === 20));
  const dropped = sapped.dice.find(({ dropped }) => dropped);
  const kept = sapped.dice.find(({ dropped }) => !dropped);
  assert.ok(dropped.value >= kept.value);
});

test("dice that do not match the events are refused", () => {
  const [begin] = play(seed);
  assert.throws(
    () => describeFifthResult(begin.result, begin.rolls.slice(1), "Ada"),
    /dice do not match/,
  );
  assert.throws(
    () =>
      describeFifthResult(
        begin.result,
        [...begin.rolls, { sides: 20, value: 1 }],
        "Ada",
      ),
    /dice do not match/,
  );
});

test("the session saves grouped rolls (format 5) and refuses format 3", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-159-"));
  try {
    const path = join(directory, "session.json");
    const session = await FifthSession.create(
      path,
      "b".repeat(32),
      seed + 1,
      storeroom,
      fighter(seed),
    );
    const file = JSON.parse(await readFile(path, "utf8"));
    assert.equal(file.formatVersion, 11);
    const [card] = file.history[0].cards;
    assert.equal(card.kind, "result");
    assert.deepEqual(Object.keys(card).sort(), ["kind", "lines", "text"]);
    assert.match(card.lines[0].text, /^Initiative: /);
    assert.equal(card.lines[0].rolls[0].purpose, "initiative");
    const loaded = await FifthSession.load(path, adventures);
    assert.deepEqual(loaded.history, session.history);

    // A card whose lines do not make up its text is refused.
    const tampered = structuredClone(file);
    tampered.history[0].cards[0].lines[0].text += "!";
    await writeFile(path, JSON.stringify(tampered));
    await assert.rejects(
      FifthSession.load(path, adventures),
      /Invalid adventure session/,
    );
    // The format 3 card shape, with ungrouped rolls, is refused by version.
    const older = structuredClone(file);
    older.formatVersion = 3;
    older.history[0].cards[0] = {
      kind: "result",
      text: card.text,
      rolls: file.transitions[0].rolls,
    };
    await writeFile(path, JSON.stringify(older));
    await assert.rejects(
      FifthSession.load(path, adventures),
      /format version 3, not 11\. This build cannot continue it\. Move it aside/,
    );
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), older);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("entering a room without a fight is a narration card", async () => {
  const smugglers = adventures.find(({ id }) => id === "smugglers-cellar");
  const directory = await mkdtemp(join(tmpdir(), "issue-159-"));
  try {
    const session = await FifthSession.create(
      join(directory, "session.json"),
      "c".repeat(32),
      1,
      smugglers,
      fighter(0),
    );
    const moved = session.act(
      { type: "move", destinationId: "alcove" },
      "click",
    );
    const card = session.card(moved.result, moved.rolls);
    assert.equal(card.kind, "narration");
    assert.match(card.text, /^You enter the /);
    const examined = session.act(
      { type: "examine", targetId: "iron-chest" },
      "click",
    );
    assert.equal(session.card(examined.result, examined.rolls).kind, "result");
    const refused = session.act(
      { type: "move", destinationId: "nowhere" },
      "click",
    );
    assert.deepEqual(session.card(refused.result, refused.rolls), {
      kind: "rejection",
      text: refused.result.rejection.reason,
      lines: [{ text: refused.result.rejection.reason, rolls: [] }],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
