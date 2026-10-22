// #526: what each way to attack a foe does, as the fight view projects it
// for the attack chooser: the to-hit or save DC and damage a foe's button
// shows, and the sheet's words with the caster's numbers in. A spell's
// summary without numbers (the sheet's, the AI DM's) is unchanged.
import assert from "node:assert/strict";
import test from "node:test";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime, spellSummary } from "../dist/runtime-5e.js";
import { SPELLS } from "../dist/spells-5e.js";
import {
  ARMED_SCROLL,
  ARMED_WAND,
  armedVela,
} from "./fixtures/level-5-wizard.mjs";
import { goblinTrio } from "./fixtures/modules.mjs";
import { lifeCleric } from "./fixtures/playthroughs.mjs";

/** The fight view of `sheet`'s first turn against the goblin trio. */
function fightOf(sheet) {
  const runtime = createFifthRuntime(goblinTrio, sheet);
  const { state } = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    createSeededRandom(0),
  );
  return runtime.projectFight(state);
}

/** The one entry of `stats` with every field of `match`. */
const entry = (stats, match) => {
  const found = stats.filter((each) =>
    Object.entries(match).every(([key, value]) => each[key] === value),
  );
  assert.equal(found.length, 1, JSON.stringify(match));
  return found[0];
};

test("a level-5 Wizard's spells carry her +7 and DC 15, grown for her level and slot", () => {
  const { attackStats, spellSlots } = fightOf(armedVela());
  assert.deepEqual(spellSlots, [
    { uses: 4, max: 4 },
    { uses: 3, max: 3 },
    { uses: 2, max: 2 },
  ]);
  // A cantrip grown at level 5.
  assert.deepEqual(entry(attackStats, { spellId: "fire-bolt" }), {
    action: "cast",
    spellId: "fire-bolt",
    hit: "+7",
    damage: "2d10",
    text: "ranged spell attack +7, 2d10 fire",
  });
  // An area spell, at each slot it may spend.
  assert.deepEqual(entry(attackStats, { spellId: "fireball", slotLevel: 3 }), {
    action: "cast",
    spellId: "fireball",
    slotLevel: 3,
    hit: "DC 15",
    damage: "8d6",
    area: true,
    text: "Dexterity save DC 15, 8d6 fire, half on a success",
  });
  // A dart more for each slot level above its own.
  assert.equal(
    entry(attackStats, {
      spellId: "magic-missile",
      slotLevel: 2,
      itemId: undefined,
    }).damage,
    "4 × 1d4 + 1",
  );
  // Scorching Ray's rays are no area.
  const rays = entry(attackStats, { spellId: "scorching-ray", slotLevel: 3 });
  assert.equal(rays.area, undefined);
  assert.equal(
    rays.text,
    "4 rays, each a ranged spell attack +7, 2d6 fire; split among up to 4 targets, the first taking any more",
  );
  // Chromatic Orb deals the damage type chosen.
  assert.equal(
    entry(attackStats, {
      spellId: "chromatic-orb",
      slotLevel: 1,
      damageType: "cold",
    }).text,
    "ranged spell attack +7, 3d8 cold",
  );
  // The wand casts with hers; the scroll with its own DC 13.
  assert.equal(
    entry(attackStats, {
      spellId: "magic-missile",
      slotLevel: 3,
      itemId: ARMED_WAND,
    }).damage,
    "5 × 1d4 + 1",
  );
  assert.deepEqual(
    entry(attackStats, { spellId: "shatter", itemId: ARMED_SCROLL }),
    {
      action: "cast",
      spellId: "shatter",
      itemId: ARMED_SCROLL,
      hit: "DC 13",
      damage: "3d8",
      area: true,
      text: "Constitution save DC 13, 3d8 thunder, half on a success",
    },
  );
  // Mage Armor is cast on her: no foe's button shows it.
  assert.equal(
    attackStats.some(({ spellId }) => spellId === "mage-armor"),
    false,
  );
});

test("a Life Cleric's Divine Spark, Spiritual Weapon and Hold Person carry her numbers", () => {
  const sheet = lifeCleric();
  const { attackStats } = fightOf({
    ...sheet,
    spells: {
      ...sheet.spells,
      prepared: sheet.spells.prepared.map((id) =>
        id === "protection-from-poison" ? "hold-person" : id,
      ),
    },
  });
  const spark = entry(attackStats, {
    action: "divine-spark",
    mode: "radiant",
  });
  assert.match(spark.hit, /^DC \d+$/u);
  assert.match(spark.damage, /^1d8 \+ \d$/u);
  assert.equal(
    spark.text,
    `Constitution save ${spark.hit}, ${spark.damage} radiant, half on a success`,
  );
  const weapon = entry(attackStats, {
    spellId: "spiritual-weapon",
    slotLevel: 2,
  });
  assert.match(weapon.hit, /^\+\d$/u);
  assert.match(weapon.damage, /^1d8 \+ \d$/u);
  assert.match(weapon.text, /^a melee spell attack \+\d, 1d8 \+ \d force, /u);
  const hold = entry(attackStats, { spellId: "hold-person", slotLevel: 2 });
  assert.equal(hold.damage, undefined);
  assert.match(hold.text, /^humanoid only: Wisdom save DC \d+ or paralysed, /u);
});

test("a spell's summary without numbers is the sheet's, as before", () => {
  assert.equal(
    spellSummary(SPELLS["fire-bolt"]),
    "ranged spell attack, 1d10 fire",
  );
  assert.equal(
    spellSummary(SPELLS["spiritual-weapon"]),
    "a melee spell attack, 1d8 + your spellcasting modifier force, then again with a bonus action each turn, concentration",
  );
  assert.equal(
    spellSummary(SPELLS.fireball),
    "Dexterity save, 8d6 fire, half on a success",
  );
});
