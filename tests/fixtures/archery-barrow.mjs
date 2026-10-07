// The lintel barrow for archers (#230): a bowyer at its mouth sells the
// shortbow, the light crossbow and bundles of arrows and bolts, ten minutes a
// trade, and a quiver of 20 arrows lies behind the lintel, found by examining
// it. Wren, an archer with a shortbow, two arrows and a stowed mace, plays it.
import { validateFighter } from "../../dist/fighter-5e.js";
import { TEST_FIGHTER } from "../../dist/test-fighter-5e.js";
import { barrowFile, room } from "./armoury-barrow.mjs";
import { validateModule } from "./bestiary.mjs";

export const BOWYER = {
  id: "bowyer",
  name: "Bowyer",
  description:
    "A bowyer sits on the barrow's step, waxing a bowstring, a bundle of shafts at her feet.",
  topics: [
    {
      id: "the-hall",
      name: "the hall",
      reply: '"Something with a scimitar moved in down there."',
    },
  ],
  merchant: {
    stock: ["shortbow", "light-crossbow", "arrows", "bolts"],
    minutes: 10,
  },
};

export const QUIVER = {
  id: "lintel-quiver",
  name: "Quiver of Arrows",
  description: "A hide quiver of twenty arrows, stuffed behind the lintel.",
  kind: "gear",
  gear: "arrows",
  hiddenIn: "scratched-lintel",
};

export const archeryFile = structuredClone(barrowFile);
archeryFile.id = "archery-barrow";
archeryFile.title = "The Archers' Barrow";
room(archeryFile, "barrow-mouth").creatures = [structuredClone(BOWYER)];
room(archeryFile, "barrow-mouth").items.push(structuredClone(QUIVER));

export const archeryBarrow = validateModule(archeryFile);

/**
 * Wren: Ada's scores (Str 17, Dex 14) with leather and a shortbow
 * (+4 to hit, 1d6 + 2 piercing), a mace stowed and `arrows` arrows.
 */
export const archer = (arrows = 2, bolts = 0) =>
  validateFighter({
    ...TEST_FIGHTER,
    id: "c".repeat(32),
    name: "Wren",
    equipment: ["leather", "shortbow"],
    stowed: ["mace"],
    ammunition: { arrows, bolts },
  });
