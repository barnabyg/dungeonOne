// #537: SRD 5.2's Wand of the War Mage +1, the first caster item. From
// level 3 a module may hide a second magic item in its caster slot, which
// only a spellcaster may attune (D1); attunement is allowed only for an
// item restricted to spellcasters or named classes, automatic on pickup, at
// most 3 at once (D2); each magic item has its own minimum level (D3). An
// attuned wand adds 1 to its holder's spell attack rolls.
import assert from "node:assert/strict";
import test from "node:test";

import {
  attunedItems,
  attunement,
  buildCharacter,
  casterOnly,
  characterProfile,
  defaultPlacement,
  mayAttune,
  settleCharacter,
  validateCharacter,
} from "../dist/character-5e.js";
import { CLERIC } from "../dist/cleric-5e.js";
import {
  ATTUNEMENT_LIMIT,
  CASTER_ITEMS,
  heldItemText,
  readHeldMagicItems,
} from "../dist/magic-items-5e.js";
import { ROGUE } from "../dist/rogue-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import {
  MAGIC_ITEM_LIMITS,
  MAGIC_ITEM_MIN_LEVEL,
  magicItemProblems,
} from "../dist/treasure-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import { FIGHTER } from "../dist/fighter-5e.js";
import { dice } from "./fixtures/engine-dice.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import { PLUS_ONE_SHORTSWORD } from "./fixtures/magic-barrow.mjs";
import { loneGoblin } from "./fixtures/modules.mjs";
import {
  room,
  WAR_WAND,
  warMageBarrow,
  warMageBarrowFile,
} from "./fixtures/war-mage-barrow.mjs";

// Kept totals 15, 14, 13, 12, 10, 8 in roll order.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const build = (id, name, definition, className) =>
  buildCharacter(
    id.repeat(32),
    name,
    DICE,
    {
      ...definition.defaults,
      placement: defaultPlacement(DICE, definition),
    },
    className,
  );
const vela = build("e", "Vela", WIZARD, "wizard");
const mira = build("c", "Mira", CLERIC, "cleric");
const vex = build("b", "Vex", ROGUE, "rogue");
const ada = build("a", "Ada", FIGHTER, "fighter");

const WAND = { id: "a/war", casterItem: "wand-of-the-war-mage-plus-1" };
/** `sheet` holding `magicItems`. */
const holding = (sheet, magicItems) =>
  validateCharacter({ ...sheet, magicItems });

function accepted(runtime, state, action, random = dice()) {
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  assert.equal(random.remaining(), 0, "every queued die is drawn");
  return result;
}

/** A hidden magic item as `magicItemProblems` takes it. */
const hidden = (id, catalogue, attunementRule, name = catalogue) => ({
  id,
  catalogue,
  name,
  attunement: attunementRule,
  casterOnly: casterOnly(attunementRule),
});
const sword = hidden("sword", "shortsword-plus-1", false, "+1 Shortsword");
const shield = hidden("shield", "shield-plus-1", false, "+1 Shield");
const wand = hidden(
  "wand",
  "wand-of-the-war-mage-plus-1",
  CASTER_ITEMS["wand-of-the-war-mage-plus-1"].attunement,
  "Wand of the War Mage +1",
);

test("the catalogue: the Wand of the War Mage +1 is uncommon, needs a spellcaster's attunement and adds 1 to spell attacks", () => {
  assert.deepEqual(CASTER_ITEMS["wand-of-the-war-mage-plus-1"], {
    name: "Wand of the War Mage +1",
    category: "wand",
    rarity: "uncommon",
    attunement: { by: "spellcaster" },
    spellAttack: 1,
  });
  assert.equal(ATTUNEMENT_LIMIT, 3);
  assert.deepEqual(MAGIC_ITEM_LIMITS, {
    perModule: 1,
    casterSlot: 1,
    minLevel: 3,
  });
});

test("caster-only: attunement by a spellcaster, or by named classes that all cast", () => {
  assert.equal(casterOnly({ by: "spellcaster" }), true);
  assert.equal(
    casterOnly({ by: "classes", classes: ["cleric"], text: "a Cleric" }),
    true,
  );
  assert.equal(
    casterOnly({
      by: "classes",
      classes: ["fighter", "cleric"],
      text: "a Fighter or a Cleric",
    }),
    false,
  );
  assert.equal(casterOnly({ by: "anyone" }), false);
  assert.equal(casterOnly(false), false);
  assert.equal(mayAttune("wizard", { by: "spellcaster" }), true);
  assert.equal(mayAttune("cleric", { by: "spellcaster" }), true);
  assert.equal(mayAttune("fighter", { by: "spellcaster" }), false);
  assert.equal(mayAttune("rogue", { by: "spellcaster" }), false);
  assert.equal(
    mayAttune("wizard", {
      by: "classes",
      classes: ["cleric"],
      text: "a Cleric",
    }),
    false,
  );
});

test("the validator's rules: a caster slot beside the open one, each item from its own level, no attunement by anyone", () => {
  // The open slot and the caster slot, in either order.
  assert.deepEqual(magicItemProblems([sword, wand], 3), []);
  assert.deepEqual(magicItemProblems([wand, sword], 3), []);
  // Two caster-only items fill both slots.
  assert.deepEqual(magicItemProblems([wand, { ...wand, id: "wand-2" }], 3), []);
  assert.deepEqual(magicItemProblems([sword, shield], 5), [
    "shield is a second magic item that isn't caster-only: the caster slot takes only an item that requires attunement by a spellcaster or a caster class.",
  ]);
  assert.deepEqual(magicItemProblems([sword, wand, shield], 5), [
    "shield is one magic item too many: a module hides at most 2, one of them caster-only.",
  ]);
  assert.deepEqual(magicItemProblems([wand], 2), [
    "wand is a magic item, but magic items are found only in modules for level 3 and up.",
  ]);
  assert.deepEqual(
    magicItemProblems(
      [hidden("cloak", "cloak-of-protection", { by: "anyone" })],
      3,
    ),
    [
      "cloak needs attunement by anyone, but only an item restricted to a spellcaster or named classes may need attunement.",
    ],
  );
  // Each item in the minimum-level table is refused below its level.
  for (const [catalogue, level] of Object.entries(MAGIC_ITEM_MIN_LEVEL)) {
    assert.notDeepEqual(
      magicItemProblems([{ ...wand, catalogue }], level - 1),
      [],
      catalogue,
    );
    assert.deepEqual(magicItemProblems([{ ...wand, catalogue }], level), []);
  }
});

test("the validator: the wand in a module's caster slot beside a +1 shortsword; a third magic item refused", () => {
  assert.deepEqual(
    warMageBarrow.rooms
      .find(({ id }) => id === "barrow-mouth")
      .items.map(({ id, kind, casterItem }) => [id, kind, casterItem]),
    [["war-wand", "caster-item", "wand-of-the-war-mage-plus-1"]],
  );
  validateModule(warMageBarrowFile([WAR_WAND, PLUS_ONE_SHORTSWORD]));
  assert.throws(
    () =>
      validateModule(
        warMageBarrowFile([
          WAR_WAND,
          PLUS_ONE_SHORTSWORD,
          {
            ...PLUS_ONE_SHORTSWORD,
            id: "lintel-dagger",
            gear: "dagger-plus-1",
          },
        ]),
      ),
    /module lintel-barrow: lintel-dagger is one magic item too many: a module hides at most 2, one of them caster-only\./u,
  );
  assert.throws(
    () => validateModule(warMageBarrowFile([WAR_WAND], 2)),
    /\(war-wand\) is the uncommon Wand of the War Mage \+1, but uncommon treasure is found only in modules for level 3 and up\./u,
  );
  assert.throws(
    () =>
      validateModule(
        warMageBarrowFile([{ ...WAR_WAND, casterItem: "wand-of-wishes" }]),
      ),
    /is a caster item, so it needs casterItem: one of wand-of-the-war-mage-plus-1\./u,
  );
  assert.throws(
    () =>
      validateModule(
        warMageBarrowFile([
          { ...PLUS_ONE_SHORTSWORD, casterItem: "wand-of-the-war-mage-plus-1" },
        ]),
      ),
    /has casterItem, but only a caster item has one\./u,
  );
  const lying = warMageBarrowFile();
  delete room(lying, "barrow-mouth").items[0].hiddenIn;
  assert.throws(
    () => validateModule(lying),
    /is caster-item, so it must be hidden in a feature or carried by an opponent\./u,
  );
});

test("a Wizard or Cleric holding the wand is attuned and adds 1 to spell attacks; a Fighter or Rogue gains nothing", () => {
  for (const sheet of [vela, mira]) {
    const plain = characterProfile(sheet).spellcasting;
    const armed = characterProfile(holding(sheet, [WAND])).spellcasting;
    assert.equal(armed.attackBonus, plain.attackBonus + 1, sheet.name);
    assert.equal(armed.saveDc, plain.saveDc, sheet.name);
    assert.deepEqual(attunedItems(holding(sheet, [WAND])), [
      "wand-of-the-war-mage-plus-1",
    ]);
  }
  for (const sheet of [ada, vex]) {
    const plain = characterProfile(sheet);
    const armed = characterProfile(holding(sheet, [WAND]));
    assert.equal(armed.spellcasting, undefined);
    assert.deepEqual(armed.attack, plain.attack);
    assert.deepEqual(attunedItems(holding(sheet, [WAND])), []);
  }
  assert.deepEqual(attunement(holding(ada, [WAND])).get("a/war"), {
    attuned: false,
    reason:
      "a Fighter can't attune to it, as it requires attunement by a spellcaster.",
  });
});

test("attunement is worked out from what is held: the first three only", () => {
  const four = ["a/one", "a/two", "a/three", "a/four"].map((id) => ({
    ...WAND,
    id,
  }));
  const sheet = holding(vela, four);
  assert.deepEqual(
    [...attunement(sheet)].map(([id, state]) => [id, state.attuned]),
    [
      ["a/one", true],
      ["a/two", true],
      ["a/three", true],
      ["a/four", false],
    ],
  );
  assert.equal(
    attunement(sheet).get("a/four").reason,
    "a character may be attuned to at most 3 items at once.",
  );
  // Each attuned wand adds its bonus.
  assert.equal(
    characterProfile(sheet).spellcasting.attackBonus,
    characterProfile(vela).spellcasting.attackBonus + 3,
  );
  // Nothing about attunement is stored on the sheet.
  assert.deepEqual(sheet.magicItems, four);
});

test("the wand's text says what it does and whether its holder is attuned", () => {
  assert.equal(
    heldItemText(WAND),
    "An uncommon wand that requires attunement by a spellcaster: while attuned, +1 to your spell attack rolls (a scroll keeps its own bonus).",
  );
  assert.match(heldItemText(WAND, { attuned: true }), / Attuned\.$/u);
  assert.match(
    heldItemText(WAND, { attuned: false, reason: "no reason." }),
    / Not attuned: no reason\.$/u,
  );
});

/** `sheet` in the lone goblin's fight, its turn first, the goblin at AC 15. */
function inFight(sheet) {
  const runtime = createFifthRuntime(loneGoblin, sheet);
  const { state } = accepted(
    runtime,
    runtime.createSession(),
    { type: "begin" },
    dice([20, 18], [20, 2]),
  );
  return { runtime, state };
}

const fireBolt = {
  type: "cast",
  actorId: "pc",
  spellId: "fire-bolt",
  targetIds: ["goblin"],
};

test("in a seeded fight a Wizard's Fire Bolt one short of the goblin's AC hits only with the wand", () => {
  const bonus = characterProfile(vela).spellcasting.attackBonus;
  const d20 = 15 - bonus - 1;
  // Without the wand it misses; then the goblin misses with a 1.
  const plain = inFight(vela);
  const missed = accepted(
    plain.runtime,
    plain.state,
    fireBolt,
    dice([20, d20], [20, 1]),
  ).events[1];
  assert.deepEqual([missed.total, missed.hit], [14, false]);
  // With it the same roll hits for 1d10.
  const armed = inFight(holding(vela, [WAND]));
  const hit = accepted(
    armed.runtime,
    armed.state,
    fireBolt,
    dice([20, d20], [10, 3], [20, 1]),
  ).events[1];
  assert.deepEqual([hit.total, hit.bonus, hit.hit], [15, bonus + 1, true]);
  // The fight panel names the raised bonus.
  const stats = armed.runtime
    .projectFight(armed.state)
    .attackStats.find(({ spellId }) => spellId === "fire-bolt");
  assert.equal(stats.hit, `+${bonus + 1}`);
});

test("found behind the lintel, the wand is carried, attuned for a Wizard and not for a Fighter, and kept on leaving", () => {
  for (const [sheet, attuned] of [
    [vela, /Attuned\.$/u],
    [ada, /Not attuned: a Fighter can't attune to it/u],
  ]) {
    const runtime = createFifthRuntime(warMageBarrow, sheet);
    let { state } = accepted(runtime, runtime.createSession(), {
      type: "begin",
    });
    state = accepted(runtime, state, {
      type: "examine",
      targetId: "scratched-lintel",
    }).state;
    state = accepted(runtime, state, {
      type: "take",
      itemId: "war-wand",
    }).state;
    assert.deepEqual(state.possessions.magicItems, [
      {
        id: "lintel-barrow/war-wand",
        casterItem: "wand-of-the-war-mage-plus-1",
      },
    ]);
    const carried = runtime
      .projectRoom(state)
      .inventory.find(({ id }) => id === "lintel-barrow/war-wand");
    assert.equal(carried.name, "Wand of the War Mage +1");
    assert.equal(carried.group, "other");
    assert.equal(carried.icon, "fairy-wand");
    assert.match(carried.description, attuned);
    // The AI DM sees it as it sees any item carried.
    const status = runtime.projectCharacterStatus(state);
    assert.match(
      status.collectedItems.find(({ id }) => id === "lintel-barrow/war-wand")
        .description,
      attuned,
    );
  }
  // Kept on leaving, like any find, and attuned in the next adventure.
  const runtime = createFifthRuntime(warMageBarrow, vela);
  let { state } = accepted(runtime, runtime.createSession(), {
    type: "begin",
  });
  for (const action of [
    { type: "examine", targetId: "scratched-lintel" },
    { type: "take", itemId: "war-wand" },
    { type: "leave", roomId: "barrow-mouth" },
  ]) {
    state = accepted(runtime, state, action).state;
  }
  const after = settleCharacter(vela, runtime.projectSettlement(state));
  assert.deepEqual(after.magicItems, [
    { id: "lintel-barrow/war-wand", casterItem: "wand-of-the-war-mage-plus-1" },
  ]);
  assert.equal(
    characterProfile(after).spellcasting.attackBonus,
    characterProfile(vela).spellcasting.attackBonus + 1,
  );
});

test("a sheet's caster items are validated", () => {
  const pattern = /^[a-z0-9-]+\/[a-z0-9-]+$/u;
  assert.deepEqual(readHeldMagicItems([WAND], pattern), [WAND]);
  assert.throws(
    () =>
      readHeldMagicItems(
        [{ id: "a/war", casterItem: "wand-of-wishes" }],
        pattern,
      ),
    /Unsupported caster item\./u,
  );
  assert.throws(
    () => readHeldMagicItems([{ ...WAND, charges: 3 }], pattern),
    /Unsupported wand\./u,
  );
});
