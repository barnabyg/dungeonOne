// #485: spells sound by family when cast. Every spell has a family; a cast
// line carries its family's sound, which plays before the attack and damage
// sounds of its card; a cantrip's is quieter; a scroll or wand cast sounds
// as the spell does.
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCharacter,
  CLASSES,
  defaultPlacement,
} from "../dist/character-5e.js";
import { TEST_CASTER_CLASS } from "../dist/test-caster-class-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import {
  castSound,
  resultSounds,
  SOUNDS,
  SPELL_FAMILIES,
  SPELL_FAMILY,
  soundGains,
} from "../dist/sounds-5e.js";
import { SPELLS } from "../dist/spells-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import { scrollBarrow } from "./fixtures/scroll-barrow.mjs";

const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const vela = buildCharacter(
  "e".repeat(32),
  "Vela",
  DICE,
  { ...WIZARD.defaults, placement: defaultPlacement(DICE, WIZARD) },
  "wizard",
);

test("every spell, and every spell on a class list, has a family and a bundled cast sound", () => {
  const listed = [...Object.values(CLASSES), TEST_CASTER_CLASS].flatMap(
    ({ spellcasting }) => spellcasting?.list ?? [],
  );
  assert.ok(listed.length > 0);
  for (const spell of new Set([...Object.keys(SPELLS), ...listed])) {
    assert.ok(SPELL_FAMILIES.includes(SPELL_FAMILY[spell]), spell);
    assert.ok(Object.hasOwn(SOUNDS, castSound(spell)), spell);
  }
  // Each family is used, and each sound file is bundled once per family.
  assert.deepEqual(
    [...new Set(Object.values(SPELL_FAMILY))].sort(),
    [...SPELL_FAMILIES].sort(),
  );
});

test("a cantrip's cast sound is its family's, quieter than a levelled spell's", () => {
  assert.equal(castSound("fire-bolt"), "spell-fire-cantrip");
  assert.equal(castSound("fireball"), "spell-fire");
  assert.equal(castSound("sacred-flame"), "spell-radiant-cantrip");
  assert.equal(castSound("cure-wounds"), "spell-healing");
  assert.equal(castSound("hold-person"), "spell-control");
  const gains = soundGains();
  for (const [spell, { level }] of Object.entries(SPELLS)) {
    const sound = castSound(spell);
    const gain = gains[sound] ?? 1;
    if (level === 0) {
      assert.ok(gain < 1, spell);
      // The same file as its family's levelled spells.
      assert.equal(
        SOUNDS[sound].file,
        SOUNDS[sound.replace(/-cantrip$/u, "")].file,
      );
    } else {
      assert.equal(gain, 1, spell);
    }
  }
});

/** Each action's card, as the browser server records it. */
function play(session, ...actions) {
  return actions.map((action) => {
    const { result, rolls } = session.act(action, "click");
    assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
    const card = session.card(result, rolls);
    session.history.push({ reply: "", cards: [card] });
    return card;
  });
}

const cast = (spellId, targetIds, item) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetIds,
  ...item,
});

const answer = (card) => resultSounds({ character: "Vela", cards: [card] });

test("a cast line sounds its spell's family, before its card's attack and damage sounds, from a slot, scroll or wand", () => {
  const session = FifthSession.begin(0, scrollBarrow, vela);
  play(
    session,
    { type: "examine", targetId: "scratched-lintel" },
    { type: "take", itemId: "armour-scroll" },
    { type: "take", itemId: "lintel-wand" },
  );
  // Mage Armor from its scroll, outside a fight.
  const [scroll] = play(
    session,
    cast("mage-armor", ["pc"], { itemId: "lintel-barrow/armour-scroll" }),
  );
  assert.match(scroll.lines[0].text, /^You cast Mage Armor .* from the Spell/u);
  assert.equal(scroll.lines[0].sound, "spell-buff");
  assert.deepEqual(answer(scroll), ["spell-buff"]);

  // Seed 0: Vela goes first; Fire Bolt misses, and so does the goblin.
  play(session, { type: "move", destinationId: "burial-hall" });
  const [bolt] = play(session, cast("fire-bolt", ["barrow-goblin"]));
  assert.deepEqual(
    bolt.lines.map(({ sound }) => sound),
    ["spell-fire-cantrip", undefined, undefined, undefined],
  );
  assert.deepEqual(answer(bolt), ["spell-fire-cantrip", "miss", "miss"]);

  // Magic Missile from the wand: the cast's sound comes first.
  const [wand] = play(
    session,
    cast("magic-missile", ["barrow-goblin"], {
      itemId: "lintel-barrow/lintel-wand",
      slotLevel: 1,
    }),
  );
  assert.match(
    wand.lines[0].text,
    /^You cast Magic Missile .* from the Wand of Magic Missiles/u,
  );
  assert.equal(wand.lines[0].sound, "spell-arcane");
  assert.equal(answer(wand)[0], "spell-arcane");
  assert.equal(wand.lines.filter(({ sound }) => sound !== undefined).length, 1);
});
