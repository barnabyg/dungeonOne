// #355: a saved session whose history holds a reaction roll card (#304)
// loads again, with the card unchanged. The validator's roll purposes come
// from the runtime's own list, so every purpose a card can carry survives a
// save; unknown purposes and reaction bands are still refused. The other
// literal lists a roll group's fields are checked against (its keys,
// outcomes, check bands and damage adjustments) come from the runtime too.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REACTION_BANDS } from "../dist/reaction-5e.js";
import { DAMAGE_ADJUSTMENTS } from "../dist/encounter-5e.js";
import {
  ROLL_GROUP_BANDS,
  ROLL_GROUP_KEYS,
  ROLL_OUTCOMES,
  ROLL_PURPOSES,
} from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { waryTunnels } from "./fixtures/modules.mjs";

const MOVE = { type: "move", destinationId: "rat-cellar" };

/** A DM that moves into the cellar, then says nothing more. */
const intoTheCellar = {
  async respond(request) {
    return request.toolResults.length === 0
      ? {
          toolCalls: [
            {
              id: "move-1",
              name: "move",
              argumentsJson: '{"destination":"rat-cellar"}',
            },
          ],
        }
      : { text: "" };
  },
};

/** The first seed whose rat makes a reaction roll that does not fight. */
function reactionSeed() {
  for (let seed = 0; seed < 200; seed++) {
    const session = FifthSession.begin(seed, waryTunnels, TEST_FIGHTER);
    session.act(MOVE, "click");
    const band = session.state.reactions[0]?.roll.band;
    if (band !== undefined && band !== "hostile") {
      return seed;
    }
  }
  throw new Error("no seed with a reaction roll");
}

/** The reaction group in a session file's history, found by its purpose. */
const reactionGroup = (file) =>
  file.history
    .flatMap(({ cards }) => cards)
    .flatMap(({ lines }) => lines)
    .flatMap(({ rolls }) => rolls)
    .find(({ purpose }) => purpose === "reaction");

/** A session saved at `path` after the reaction roll, and its file. */
async function savedReaction(path) {
  const session = await FifthSession.create(
    path,
    "c".repeat(32),
    reactionSeed(),
    waryTunnels,
    TEST_FIGHTER,
  );
  await session.converse("I go into the cellar.", intoTheCellar);
  await session.persist();
  return { session, good: JSON.parse(await readFile(path, "utf8")) };
}

/** Loads `good` from `path` with `change` made to its reaction group. */
async function loadChanged(path, good, change) {
  const copy = structuredClone(good);
  change(reactionGroup(copy));
  await writeFile(path, JSON.stringify(copy));
  return FifthSession.load(path, [waryTunnels]);
}

test("a session holding a reaction roll card saves and loads unchanged; unknown purposes and bands are refused", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-355-"));
  try {
    const path = join(directory, "session.json");
    const { session, good } = await savedReaction(path);
    const group = reactionGroup(good);
    assert.ok(group, "the history holds a reaction roll");
    assert.ok(REACTION_BANDS.includes(group.reaction), group.reaction);

    const resumed = await FifthSession.load(path, [waryTunnels]);
    assert.deepEqual(resumed.history, session.history);
    assert.deepEqual(reactionGroup({ history: resumed.history }), group);
    assert.deepEqual(resumed.state, session.state);

    const loads = (change) => loadChanged(path, good, change);
    // Every purpose the runtime's cards use is accepted.
    for (const purpose of ROLL_PURPOSES) {
      await loads((roll) => (roll.purpose = purpose));
    }
    for (const reaction of REACTION_BANDS) {
      await loads((roll) => (roll.reaction = reaction));
    }
    await assert.rejects(
      loads((roll) => (roll.purpose = "mood")),
      /Invalid adventure session/,
    );
    await assert.rejects(
      loads((roll) => (roll.reaction = "ecstatic")),
      /Invalid adventure session/,
    );
    await assert.rejects(
      loads((roll) => (roll.reaction = 3)),
      /Invalid adventure session/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a saved roll group accepts every key, outcome, check band and damage adjustment the runtime lists, and refuses others", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-355-"));
  try {
    const path = join(directory, "session.json");
    const { good } = await savedReaction(path);
    const loads = (change) => loadChanged(path, good, change);
    const refused = (change) =>
      assert.rejects(loads(change), /Invalid adventure session/);

    // A group with every field the runtime lists loads.
    const everyField = {
      purpose: "damage",
      roller: "Ada",
      target: "Rat",
      dice: [{ sides: 6, value: 2 }],
      modifier: 1,
      total: 3,
      rollOff: [4, 9],
      mode: "advantage (Help)",
      armorClass: 12,
      label: "Strength saving throw",
      proficiency: 2,
      dc: 13,
      outcome: "success",
      reaction: "indifferent",
      band: "success-by-5",
      halved: true,
      adjustment: "resistance",
      damageType: "fire",
      hpAfter: 1,
      maxHp: 7,
    };
    assert.deepEqual(
      Object.keys(everyField).sort(),
      [...ROLL_GROUP_KEYS].sort(),
    );
    await loads((roll) => {
      for (const key of Object.keys(roll)) {
        delete roll[key];
      }
      Object.assign(roll, everyField);
    });
    await refused((roll) => (roll.mood = "calm"));

    const lists = [
      ["outcome", ROLL_OUTCOMES],
      ["band", ROLL_GROUP_BANDS],
      ["adjustment", DAMAGE_ADJUSTMENTS],
    ];
    for (const [field, list] of lists) {
      assert.ok(list.length > 0, field);
      for (const value of list) {
        await loads((roll) => (roll[field] = value));
      }
      await refused((roll) => (roll[field] = "mood"));
      // Only the string itself: a list holding it is not coerced to it.
      await refused((roll) => (roll[field] = [list[0]]));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
