// #559: each class has its own crest for the character column, and no
// monster or item shows the same silhouette.
import assert from "node:assert/strict";
import test from "node:test";
import { CLASSES } from "../dist/character-5e.js";
import {
  AMMUNITION,
  ARMOUR,
  TOOL_ITEMS,
  WEAPONS,
} from "../dist/equipment-5e.js";
import {
  catalogueIcon,
  CLASS_ICONS,
  GAME_ICONS,
  itemIcon,
  MONSTER_ICONS,
  OPPONENT_ICON,
  TREASURE_ICON,
} from "../dist/icons-5e.js";

test("every class has a crest, and no monster or item shares one", () => {
  assert.deepEqual(Object.keys(CLASS_ICONS).sort(), Object.keys(CLASSES).sort());
  for (const icon of Object.values(CLASS_ICONS)) {
    assert.ok(Object.hasOwn(GAME_ICONS, icon), icon);
  }
  const elsewhere = new Set([
    ...Object.values(MONSTER_ICONS),
    ...[
      ...Object.keys(WEAPONS),
      ...Object.keys(ARMOUR),
      ...Object.keys(TOOL_ITEMS),
      ...Object.keys(AMMUNITION),
    ].map(catalogueIcon),
    OPPONENT_ICON,
    TREASURE_ICON,
    ...[
      { kind: "coin" },
      { kind: "treasure", treasure: "gem-10" },
      { kind: "treasure", treasure: "art-25" },
      { kind: "scroll" },
      { kind: "wand" },
      { kind: "caster-item" },
      { kind: "key" },
      { kind: "tool" },
      { kind: "potion" },
    ].map(itemIcon),
  ]);
  for (const [id, icon] of Object.entries(CLASS_ICONS)) {
    assert.ok(!elsewhere.has(icon), `${id}'s crest ${icon} is also a monster's or an item's`);
  }
  // Each offered class has its own; the test-only caster wears the Wizard's.
  const offered = ["fighter", "rogue", "cleric", "wizard"].map((id) => CLASS_ICONS[id]);
  assert.equal(new Set(offered).size, offered.length);
  assert.equal(CLASS_ICONS["test-caster"], CLASS_ICONS.wizard);
});
