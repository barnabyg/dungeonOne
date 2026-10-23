// #507: on Scarce items found, every shipped module can still be finished.
// The proof has two parts. Structurally, only a potion, gear, a scroll or a
// wand that no rule of the module names may go missing, so no key, tool or
// item a way on needs ever does. Then the worst case: for each module the
// first session seed on which every one of those items is missing, played by
// the balance harness for every class the gate judges on many dice seeds. No
// run is stranded, every run ends in the objective or in defeat, and every
// class reaches the objective. Any other session seed misses fewer items,
// and an item there only adds to what the character can do; a sample of
// ordinary session seeds is played as well.
import assert from "node:assert/strict";
import test from "node:test";
import {
  loadBuiltInFifthAdventures,
  objectiveEnding,
} from "../dist/adventure-5e.js";
import {
  characterAtLevel,
  GATE_CLASSES,
  GATE_STYLE,
  percentileCharacters,
  playAdventure,
} from "../dist/balance-5e.js";
import {
  createFifthRuntime,
  scarceCandidateIds,
  scarceItemIds,
} from "../dist/runtime-5e.js";
import { DEFAULT_SETTINGS } from "../dist/settings-5e.js";

const adventures = await loadBuiltInFifthAdventures();
const SCARCE = { ...DEFAULT_SETTINGS, itemsFound: "scarce" };
const DICE_SEEDS = 50;

/** Each item a module places. */
const placed = (adventure) => adventure.rooms.flatMap(({ items }) => items);

/** The items a door or a feature's use names: what a way on may need. */
const ruleItems = (adventure) =>
  new Set([
    ...adventure.passages.flatMap(({ door }) => door?.keyItemIds ?? []),
    ...adventure.rooms.flatMap(({ features }) =>
      features.flatMap(({ uses }) => (uses ?? []).map(({ item }) => item)),
    ),
  ]);

for (const adventure of adventures) {
  test(`${adventure.id}: only potions, gear, scrolls and wands no rule names may go missing`, () => {
    const candidates = scarceCandidateIds(adventure);
    const named = ruleItems(adventure);
    const kinds = new Map(placed(adventure).map(({ id, kind }) => [id, kind]));
    assert.ok(candidates.length > 0);
    for (const id of candidates) {
      assert.ok(
        /^potion-of-|^gear$|^scroll$|^wand$/u.test(kinds.get(id)),
        `${id} is ${kinds.get(id)}`,
      );
      assert.equal(named.has(id), false, `${id} is named by a rule`);
    }
    // Every other potion, gear, scroll or wand is named by a rule.
    for (const { id, kind } of placed(adventure)) {
      if (
        /^potion-of-|^gear$|^scroll$|^wand$/u.test(kind) &&
        !candidates.includes(id)
      ) {
        assert.ok(named.has(id), `${id} is never missing but no rule names it`);
      }
    }
    // Over many sessions, what goes missing is always among them.
    for (let seed = 0; seed < 500; seed++) {
      for (const id of scarceItemIds(adventure, seed)) {
        assert.ok(candidates.includes(id));
      }
    }
  });

  test(`${adventure.id}: with every item that may go missing missing, every class can still finish it`, () => {
    const candidates = scarceCandidateIds(adventure);
    let worst = 0;
    while (scarceItemIds(adventure, worst).size < candidates.length) {
      worst += 1;
    }
    const objective = objectiveEnding(adventure).kind;
    const [{ dice }] = percentileCharacters({ percentiles: [50] });
    for (const classId of GATE_CLASSES) {
      const sheet = characterAtLevel(
        dice,
        adventure.recommendedLevels.max,
        undefined,
        false,
        undefined,
        classId,
      );
      const runtime = createFifthRuntime(adventure, sheet, {}, SCARCE, worst);
      let finished = 0;
      for (let seed = 0; seed < DICE_SEEDS; seed++) {
        // playAdventure throws when a run is stranded: alive, with no
        // action left that leads on or out.
        const { outcome } = playAdventure(runtime, GATE_STYLE, seed);
        assert.ok(
          outcome === objective || outcome === "defeat",
          `${classId} on dice seed ${seed} ended in ${outcome}`,
        );
        finished += outcome === objective ? 1 : 0;
      }
      assert.ok(finished > 0, `${classId} never reached the ${objective}`);
    }
  });

  test(`${adventure.id}: sessions on Scarce play to an ending, never stranded`, () => {
    const objective = objectiveEnding(adventure).kind;
    const [{ dice }] = percentileCharacters({ percentiles: [50] });
    const sheet = characterAtLevel(dice, adventure.recommendedLevels.max);
    for (let seed = 0; seed < DICE_SEEDS; seed++) {
      const runtime = createFifthRuntime(adventure, sheet, {}, SCARCE, seed);
      const { outcome } = playAdventure(runtime, GATE_STYLE, seed);
      assert.ok(
        outcome === objective || outcome === "defeat",
        `session seed ${seed} ended in ${outcome}`,
      );
    }
  });
}
