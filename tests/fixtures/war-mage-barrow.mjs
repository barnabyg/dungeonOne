// The lintel barrow with a Wand of the War Mage +1 behind the lintel at its
// mouth (#537): a caster item, in the module's caster slot, for levels 1–3.
// A Pearl of Power (#538) may lie there instead, the mouth a rest site.
import { barrowFile, room } from "./armoury-barrow.mjs";
import { validateModule } from "./bestiary.mjs";

export { room };

export const WAR_WAND = {
  id: "war-wand",
  name: "Ashwood Wand",
  description: "A wand of dark ashwood, its grip worn smooth by a hand.",
  kind: "caster-item",
  casterItem: "wand-of-the-war-mage-plus-1",
  hiddenIn: "scratched-lintel",
};

/** A Pearl of Power (#538), behind the lintel too. */
export const PEARL = {
  id: "pale-pearl",
  name: "Pale Pearl",
  description: "A pearl the size of a thumbnail, faintly warm.",
  kind: "caster-item",
  casterItem: "pearl-of-power",
  hiddenIn: "scratched-lintel",
};

/** A fresh copy of the barrow's JSON for levels 1–`max`, `items` behind the lintel. */
export const warMageBarrowFile = (items = [WAR_WAND], max = 3) => {
  const copy = structuredClone(barrowFile);
  copy.recommendedLevels = { min: 1, max };
  room(copy, "barrow-mouth").items.push(...structuredClone(items));
  return copy;
};

export const warMageBarrow = validateModule(warMageBarrowFile());

/** The barrow with the Pearl of Power behind the lintel, its mouth a rest site. */
export const pearlBarrow = validateModule(
  (() => {
    const file = warMageBarrowFile([PEARL]);
    room(file, "barrow-mouth").restSite = true;
    return file;
  })(),
);
