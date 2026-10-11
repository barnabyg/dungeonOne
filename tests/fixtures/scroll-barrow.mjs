// The lintel barrow with spell scrolls and a wand behind the lintel at its
// mouth (#346). Scrolls are priced inside the treasure budget; the wand is
// the one magic item a module may hide, only for level 3 and up (D10). The
// mouth is a rest site, so a long rest recharges the wand.
import { barrowFile, room } from "./armoury-barrow.mjs";
import { validateModule } from "./bestiary.mjs";

export { room };

/** A spell scroll of `spell` hidden behind the lintel. */
export const scroll = (id, spell, name = "Rolled Parchment") => ({
  id,
  name,
  description: "A tight roll of parchment, its seal long broken.",
  kind: "scroll",
  spell,
  hiddenIn: "scratched-lintel",
});

export const WAND = {
  id: "lintel-wand",
  name: "Slender Wand",
  description: "A wand of pale wood, warm to the touch.",
  kind: "wand",
  wand: "wand-of-magic-missiles",
  hiddenIn: "scratched-lintel",
};

/**
 * A fresh copy of the barrow's JSON for levels 1–`max`, with `items` behind
 * the lintel, its mouth a rest site.
 */
export const scrollBarrowFile = (items, max = 3) => {
  const copy = structuredClone(barrowFile);
  copy.recommendedLevels = { min: 1, max };
  room(copy, "barrow-mouth").restSite = true;
  room(copy, "barrow-mouth").items.push(...structuredClone(items));
  return copy;
};

/** Mage Armor and Thunderwave (Wizard), Cure Wounds (Cleric), and the wand. */
export const scrollBarrow = validateModule(
  scrollBarrowFile([
    scroll("armour-scroll", "mage-armor"),
    scroll("thunder-scroll", "thunderwave"),
    scroll("healing-scroll", "cure-wounds"),
    WAND,
  ]),
);
