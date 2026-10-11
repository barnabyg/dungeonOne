/**
 * Spell scrolls and wands (#346): magic items that cast a spell.
 *
 * A Spell Scroll (SRD 5.2) holds one levelled spell. A character whose
 * class has the spell on its list reads it and casts the spell in its normal
 * casting time with no slot, at the scroll's own save DC and attack bonus;
 * the scroll is used up. A spell above the highest level of slot the reader has
 * needs a check first (d20 + its spellcasting modifier against 10 + the
 * spell's level): on a failure the scroll is used up with no effect. A
 * Wizard may copy a scroll's spell into its spellbook between adventures,
 * for 50 gp a spell level, using up the scroll (`copyScroll` in
 * `character-5e.ts`). Scrolls are priced at fixed values inside a module's
 * treasure budget (D10): a 1st-level scroll is common, a 2nd- or 3rd-level
 * one uncommon, and each is worth half its rarity's value, as potions are.
 *
 * A Wand of Magic Missiles (SRD 5.2) is an uncommon permanent magic item
 * anyone may use, needing no attunement: it holds 7 charges, and spending
 * 1 casts Magic Missile at 1st level, each more raising the spell's level by
 * one (to 3rd, the highest level of spell in the game). Spending its last
 * charge rolls a d20: on a 1 it crumbles to ash. It regains 1d6 + 1 charges
 * on a long rest (D9's "dawn"), and every charge between adventures. It
 * follows D10: a module hides at most one magic item, from level 3, outside
 * its budget.
 *
 * A character keeps the scrolls and wands it holds at the end of a
 * surviving adventure; each is a `HeldMagicItem`, named by the find it came
 * from (`adventure/item`), so it is found once.
 */
import type { Tier } from "./equipment-5e.js";
import { isSpellId, ordinal, SPELLS, type SpellId } from "./spells-5e.js";

/** What a spell scroll is worth, in copper, by its spell's level (D10). */
export const SCROLL_VALUES: Readonly<Record<1 | 2 | 3, number>> = {
  1: 5000,
  2: 20000,
  3: 20000,
};

/** A spell scroll's availability tier, by its spell's level (SRD 5.2 rarity). */
export const SCROLL_TIERS: Readonly<Record<1 | 2 | 3, Tier>> = {
  1: "common",
  2: "uncommon",
  3: "uncommon",
};

/**
 * The save DC and attack bonus a spell scroll's spell uses, by its level
 * (SRD 5.2): the scroll's, not its reader's.
 */
export const SCROLL_CASTING: Readonly<
  Record<1 | 2 | 3, Readonly<{ saveDc: number; attackBonus: number }>>
> = {
  1: { saveDc: 13, attackBonus: 5 },
  2: { saveDc: 13, attackBonus: 5 },
  3: { saveDc: 15, attackBonus: 7 },
};

/** What copying a spell into a spellbook costs, in copper, per spell level (SRD 5.2). */
export const COPY_COST_PER_LEVEL = 5000;

/** The highest spell level a wand's charges can raise its spell to. */
export const WAND_MAX_LEVEL = 3;

export type WandData = Readonly<{
  name: string;
  spell: SpellId;
  charges: number;
  /** The charges a long rest gives back: dice + modifier. */
  regain: Readonly<{ dice: number; sides: number; modifier: number }>;
  rarity: "uncommon";
  attunement: false;
}>;

/** SRD 5.2 wands. */
export const WANDS = {
  "wand-of-magic-missiles": {
    name: "Wand of Magic Missiles",
    spell: "magic-missile",
    charges: 7,
    regain: { dice: 1, sides: 6, modifier: 1 },
    rarity: "uncommon",
    attunement: false,
  },
} as const satisfies Record<string, WandData>;
export type WandId = keyof typeof WANDS;

export function isWandId(value: unknown): value is WandId {
  return typeof value === "string" && Object.hasOwn(WANDS, value);
}

/**
 * Why `spell` can't be written on a scroll, or undefined when it can: only
 * a levelled spell that is cast on the reader's own turn. A cantrip's scroll
 * is never worth finding (and the one flavour spell is a cantrip), and a
 * reaction spell is left out (D3's curated reading, owner-approved).
 */
export function scrollSpellProblem(spell: string): string | undefined {
  if (!isSpellId(spell)) {
    return `${spell} is not a spell the game knows.`;
  }
  const { name, level, castingTime } = SPELLS[spell];
  if (level === 0) {
    return `${name} is a cantrip: scrolls hold levelled spells only.`;
  }
  return castingTime === "reaction"
    ? `${name} is cast as a reaction, which reading a scroll can't be.`
    : undefined;
}

/** "Spell Scroll (Cure Wounds)". */
export function scrollName(spell: SpellId): string {
  return `Spell Scroll (${SPELLS[spell].name})`;
}

/** A scroll's spell level, which sets its value and tier. */
function scrollLevel(spell: SpellId): 1 | 2 | 3 {
  return SPELLS[spell].level as 1 | 2 | 3;
}

export function scrollValue(spell: SpellId): number {
  return SCROLL_VALUES[scrollLevel(spell)];
}

export function scrollTier(spell: SpellId): Tier {
  return SCROLL_TIERS[scrollLevel(spell)];
}

/** The save DC and attack bonus a scroll of `spell` casts with. */
export function scrollCasting(
  spell: SpellId,
): Readonly<{ saveDc: number; attackBonus: number }> {
  return SCROLL_CASTING[scrollLevel(spell)];
}

/** What copying `spell` into a spellbook costs, in copper. */
export function copyCost(spell: SpellId): number {
  return COPY_COST_PER_LEVEL * SPELLS[spell].level;
}

/**
 * A scroll or wand a character holds (#346), under the id of the find it
 * came from (`adventure/item`): a scroll's spell, or a wand with the charges
 * it has left.
 */
export type HeldMagicItem = Readonly<
  | { id: string; scroll: SpellId; wand?: never; charges?: never }
  | { id: string; wand: WandId; charges: number; scroll?: never }
>;

/** What a held magic item is called. */
export function heldItemName(item: HeldMagicItem): string {
  return item.scroll !== undefined
    ? scrollName(item.scroll)
    : WANDS[item.wand].name;
}

/** The spell a held magic item casts. */
export function heldItemSpell(item: HeldMagicItem): SpellId {
  return item.scroll ?? WANDS[item.wand].spell;
}

/** "5 of 7 charges", for a wand. */
export function chargesText(item: HeldMagicItem): string | undefined {
  return item.wand === undefined
    ? undefined
    : `${item.charges} of ${WANDS[item.wand].charges} charges`;
}

/** What "You carry" and the sheet say about a held magic item. */
export function heldItemText(item: HeldMagicItem): string {
  if (item.scroll !== undefined) {
    const { name, level } = SPELLS[item.scroll];
    const { saveDc, attackBonus } = scrollCasting(item.scroll);
    return `A spell scroll of ${name} (${ordinal(level)} level): a character with ${name} on its class's spell list reads it to cast the spell with no slot, in its normal casting time, at the scroll's save DC ${saveDc} and attack bonus +${attackBonus}, and the scroll is used up.`;
  }
  const wand = WANDS[item.wand];
  return `An uncommon wand: spend 1 charge to cast ${SPELLS[wand.spell].name} at 1st level, each charge more raising its level by one (up to ${ordinal(WAND_MAX_LEVEL)}); anyone may use it. Spending its last charge rolls a d20: on a 1 it crumbles to ash. It regains ${wand.regain.dice}d${wand.regain.sides} + ${wand.regain.modifier} charges on a long rest, and every charge between adventures. ${chargesText(item)!}.`;
}

/**
 * Every wand back to its full charges, as the rest between adventures
 * gives them.
 */
export function rechargedBetweenAdventures(
  items: readonly HeldMagicItem[],
): HeldMagicItem[] {
  return items.map((item) =>
    item.wand === undefined
      ? item
      : { id: item.id, wand: item.wand, charges: WANDS[item.wand].charges },
  );
}

/** Whether a long rest would give a wand any charges back. */
export function wandsSpent(items: readonly HeldMagicItem[]): boolean {
  return items.some(
    (item) =>
      item.wand !== undefined && item.charges < WANDS[item.wand].charges,
  );
}

/**
 * Validates a sheet's or a save's held magic items: each a scroll of a
 * spell a scroll may hold or a catalogue wand with whole charges up to its
 * most, each id unique and matching `idPattern`. Throws on anything else.
 */
export function readHeldMagicItems(
  value: unknown,
  idPattern: RegExp,
): HeldMagicItem[] {
  if (!Array.isArray(value)) {
    throw new Error("Unsupported magic items.");
  }
  const items = value.map((entry: unknown): HeldMagicItem => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Unsupported magic item.");
    }
    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record).sort().join(",");
    const { id } = record;
    if (typeof id !== "string" || !idPattern.test(id)) {
      throw new Error("Unsupported magic item id.");
    }
    if (keys === "id,scroll") {
      if (scrollSpellProblem(String(record.scroll)) !== undefined) {
        throw new Error("Unsupported spell scroll.");
      }
      return { id, scroll: record.scroll as SpellId };
    }
    const { wand, charges } = record;
    if (
      keys !== "charges,id,wand" ||
      !isWandId(wand) ||
      !Number.isInteger(charges) ||
      (charges as number) < 0 ||
      (charges as number) > WANDS[wand].charges
    ) {
      throw new Error("Unsupported wand.");
    }
    return { id, wand, charges: charges as number };
  });
  if (new Set(items.map(({ id }) => id)).size !== items.length) {
    throw new Error("Duplicate magic item.");
  }
  return items;
}
