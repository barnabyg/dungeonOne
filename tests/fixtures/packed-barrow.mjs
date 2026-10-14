// The market barrow (#210) with a heavy haul lying in its mouth (#432): three
// potions of healing, eight gems and art objects, a spell scroll, twelve
// items in all (a room's most), beside the pedlar who buys and sells there. Taken, they fill
// "You carry" with every group: worn and wielded gear, consumables and
// treasure. For levels 1–3, so the haul fits the treasure budget.
import { marketFile } from "./market-barrow.mjs";
import { room } from "./armoury-barrow.mjs";
import { validateModule } from "./bestiary.mjs";

const lying = (id, name, fields) => ({
  id,
  name,
  description: `${name}, tucked behind the lintel.`,
  hiddenIn: "scratched-lintel",
  ...fields,
});

const potion = (n) =>
  lying(`healing-potion-${n}`, "Potion of Healing", {
    kind: "potion-of-healing",
  });
const gem = (n) =>
  lying(`dull-garnet-${n}`, `Dull Garnet ${n}`, {
    kind: "treasure",
    treasure: "gem-10gp",
  });

/** The haul's ids, in the order they lie: potions, gems, art, the scroll, coin. */
export const HAUL = [
  potion(1),
  potion(2),
  potion(3),
  ...[1, 2, 3, 4, 5].map(gem),
  lying("silver-cup", "Silver Cup", { kind: "treasure", treasure: "art-25gp" }),
  lying("silver-comb", "Silver Comb", {
    kind: "treasure",
    treasure: "art-25gp",
  }),
  lying("armour-scroll", "Rolled Parchment", {
    kind: "scroll",
    spell: "mage-armor",
  }),
  lying("haul-coin", "Purse of Silver", { kind: "coin", coins: { gp: 20 } }),
];

export const packedFile = structuredClone(marketFile);
packedFile.id = "packed-barrow";
packedFile.title = "The Packed Barrow";
packedFile.recommendedLevels = { min: 1, max: 3 };
room(packedFile, "barrow-mouth").restSite = true;
room(packedFile, "barrow-mouth").items.push(...structuredClone(HAUL));

export const packedBarrow = validateModule(packedFile);
