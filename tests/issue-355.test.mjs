// #355: a saved session whose history holds a reaction roll card (#304)
// loads again, with the card unchanged. The validator's roll purposes come
// from the runtime's own list, so every purpose a card can carry survives a
// save; unknown purposes and reaction bands are still refused.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REACTION_BANDS } from "../dist/reaction-5e.js";
import { ROLL_PURPOSES } from "../dist/runtime-5e.js";
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

test("a session holding a reaction roll card saves and loads unchanged; unknown purposes and bands are refused", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-355-"));
  try {
    const path = join(directory, "session.json");
    const session = await FifthSession.create(
      path,
      "c".repeat(32),
      reactionSeed(),
      waryTunnels,
      TEST_FIGHTER,
    );
    await session.converse("I go into the cellar.", intoTheCellar);
    await session.persist();
    const good = JSON.parse(await readFile(path, "utf8"));
    const group = reactionGroup(good);
    assert.ok(group, "the history holds a reaction roll");
    assert.ok(REACTION_BANDS.includes(group.reaction), group.reaction);

    const resumed = await FifthSession.load(path, [waryTunnels]);
    assert.deepEqual(resumed.history, session.history);
    assert.deepEqual(reactionGroup({ history: resumed.history }), group);
    assert.deepEqual(resumed.state, session.state);

    const loads = async (change) => {
      const copy = structuredClone(good);
      change(reactionGroup(copy));
      await writeFile(path, JSON.stringify(copy));
      return FifthSession.load(path, [waryTunnels]);
    };
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
