// #539: the balance gate plays the caster items a career is sure to hold
// (D5). An item counts at a level when it lies on the required path of a
// module played earlier, hidden in a feature with no check, never missing
// on Scarce, and the class may attune it. The too-easy checks and the
// class-parity line play with those items; the survival check plays
// without them.
import assert from "node:assert/strict";
import test from "node:test";

import {
  earlierModules,
  gateAdventure,
  renderModuleGateResult,
  moduleGateResult,
  sureHeldItems,
} from "../dist/balance-5e.js";
import { scarceCandidateIds } from "../dist/runtime-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { moduleFile } from "./fixtures/modules.mjs";
import {
  room,
  WAR_WAND,
  warMageBarrow,
  warMageBarrowFile,
} from "./fixtures/war-mage-barrow.mjs";

const WAND_HELD = {
  adventureId: "lintel-barrow",
  item: {
    id: "lintel-barrow/war-wand",
    casterItem: "wand-of-the-war-mage-plus-1",
  },
  name: "Wand of the War Mage +1",
};

/** The barrow with a side niche off its mouth, off the required path. */
function withNiche(file) {
  file.rooms.push({
    id: "side-niche",
    name: "Side Niche",
    at: [0, 1],
    description: "A cramped niche cut into the barrow's flank.",
    features: [
      {
        id: "niche-shelf",
        name: "Niche Shelf",
        description: "A narrow stone shelf.",
        discovery: "Something lies along the back of the shelf.",
      },
    ],
    items: [],
  });
  file.passages.push({
    id: "mouth-to-niche",
    between: ["barrow-mouth", "side-niche"],
    description: "A gap in the stones leads to a niche.",
  });
  return file;
}

test("an item on an earlier module's required path, in a feature with no check, is sure-held by a caster", () => {
  for (const classId of ["wizard", "cleric"]) {
    assert.deepEqual(sureHeldItems([warMageBarrow], classId, 4), [WAND_HELD]);
  }
  // A Fighter or Rogue can't attune it, so holds nothing that counts.
  assert.deepEqual(sureHeldItems([warMageBarrow], "fighter", 4), []);
  assert.deepEqual(sureHeldItems([warMageBarrow], "rogue", 4), []);
  // A module whose lowest level is above the level isn't sure to be played.
  const later = warMageBarrowFile();
  later.recommendedLevels = { min: 3, max: 3 };
  assert.deepEqual(sureHeldItems([validateModule(later)], "wizard", 2), []);
  assert.deepEqual(sureHeldItems([validateModule(later)], "wizard", 3), [
    WAND_HELD,
  ]);
});

test("an item behind a failable check, in an optional room or carried by an opponent isn't sure-held", () => {
  const checked = warMageBarrowFile();
  room(checked, "barrow-mouth").features[0].check = {
    skill: "investigation",
    dc: 12,
    bands: {
      failure: { text: "You find only scratches." },
      success: { effects: [{ type: "item", item: "war-wand" }] },
    },
  };
  assert.deepEqual(
    sureHeldItems([validateModule(checked)], "wizard", 4),
    [],
    "behind a check",
  );

  const optional = withNiche(
    warMageBarrowFile([{ ...WAR_WAND, hiddenIn: "niche-shelf" }]),
  );
  room(optional, "side-niche").items.push(
    ...room(optional, "barrow-mouth").items.splice(0),
  );
  assert.deepEqual(
    sureHeldItems([validateModule(optional)], "wizard", 4),
    [],
    "in an optional room",
  );

  const carried = warMageBarrowFile([]);
  room(carried, "burial-hall").items.push({
    ...WAR_WAND,
    hiddenIn: "barrow-goblin",
  });
  assert.deepEqual(
    sureHeldItems([validateModule(carried)], "wizard", 4),
    [],
    "carried by an opponent",
  );
});

test("a caster item is never missing on Scarce, so Scarce never takes one off the list", () => {
  assert.equal(scarceCandidateIds(warMageBarrow).includes("war-wand"), false);
});

test("earlier modules are those ahead in the browser's order", () => {
  const target = validateModule(moduleFile("lone-goblin"));
  const later = { ...target, recommendedLevels: { min: 4, max: 4 } };
  assert.deepEqual(
    earlierModules(later, [later, warMageBarrow]).map(({ id }) => id),
    ["lintel-barrow"],
  );
  assert.deepEqual(earlierModules(warMageBarrow, [later, warMageBarrow]), []);
});

/** The lone goblin's cellar for level 4, gated after the barrow. */
const cellar = (() => {
  const file = moduleFile("lone-goblin");
  file.recommendedLevels = { min: 4, max: 4 };
  return validateModule(file);
})();
const SEEDS = Array.from({ length: 20 }, (_, seed) => seed);
const QUICK = {
  seeds: SEEDS,
  reportStealth: false,
  reportRetreat: false,
  reportUseRoom: false,
  reportReactions: false,
};

test("a carried +1 to spell attacks raises a Wizard's one-hit-kill chance in the too-easy check, and leaves survival alone", () => {
  const bare = gateAdventure(cellar, { ...QUICK, classId: "wizard" });
  const armed = gateAdventure(cellar, {
    ...QUICK,
    classId: "wizard",
    earlier: [warMageBarrow],
  });
  assert.ok(bare.ok && armed.ok);
  const [plain] = bare.verdict.oneHitKill.enemies;
  const [raised] = armed.verdict.oneHitKill.enemies;
  assert.equal(raised.spell, "fire-bolt");
  assert.ok(raised.chance > plain.chance, `${raised.chance} > ${plain.chance}`);
  assert.equal(bare.verdict.oneHitKill.carried, undefined);
  assert.deepEqual(armed.verdict.oneHitKill.carried, [
    "Wand of the War Mage +1",
  ]);
  // The survival check plays without it: a lower bound.
  assert.deepEqual(armed.verdict.survival, bare.verdict.survival);
  assert.deepEqual(armed.verdict.alwaysFail, bare.verdict.alwaysFail);
  // A Fighter can't attune it: its verdict is the same either way.
  assert.deepEqual(
    gateAdventure(cellar, {
      ...QUICK,
      classId: "fighter",
      earlier: [warMageBarrow],
    }),
    gateAdventure(cellar, { ...QUICK, classId: "fighter" }),
  );
});

test("the parity line plays with sure-held items, and says so", () => {
  const classes = ["fighter", "cleric", "wizard"].map((classId) => ({
    classId,
    result: gateAdventure(cellar, {
      ...QUICK,
      classId,
      earlier: [warMageBarrow],
    }),
  }));
  const wizard = classes[2].result.verdict;
  assert.deepEqual(wizard.parity[0].carried, ["Wand of the War Mage +1"]);
  assert.equal(classes[0].result.verdict.parity[0].carried, undefined);
  // The carried runs are the parity line's own, apart from the survival
  // check's.
  assert.equal(wizard.parity[0].level, 4);
  const module = moduleGateResult(cellar.id, classes);
  const line = module.parity.find(({ classId }) => classId === "wizard");
  assert.deepEqual(line.carried, ["Wand of the War Mage +1"]);
  assert.match(
    renderModuleGateResult(cellar, module),
    /Class parity, (pass|FAIL): the Wizard at level 4, playing cautious as the 5th percentile carrying the Wand of the War Mage \+1, /u,
  );
});
