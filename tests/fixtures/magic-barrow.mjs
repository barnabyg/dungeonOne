// The lintel barrow for levels 1–3 with a +1 Shortsword behind the lintel at
// its mouth (#345): the one magic item a module may hide, and only in a
// module for level 3 and up (D10).
import { barrowFile, room } from "./armoury-barrow.mjs";
import { validateModule } from "./bestiary.mjs";

export const PLUS_ONE_SHORTSWORD = {
  id: "lintel-blade",
  name: "+1 Shortsword",
  description: "A short blade whose edge still gleams under the grime.",
  kind: "gear",
  gear: "shortsword-plus-1",
  hiddenIn: "scratched-lintel",
};

/** A fresh copy of the magic barrow's JSON, to change and validate. */
export const magicBarrowFile = () => {
  const copy = structuredClone(barrowFile);
  copy.recommendedLevels = { min: 1, max: 3 };
  room(copy, "barrow-mouth").items.push(structuredClone(PLUS_ONE_SHORTSWORD));
  return copy;
};

export const magicBarrow = validateModule(magicBarrowFile());
