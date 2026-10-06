// The Robbers' Barrow with gear hidden behind the lintel at its mouth (#209),
// found by examining the lintel before any fight: a longsword, a shield, a
// greatsword and chain mail, or the longsword alone.
import { readFile } from "node:fs/promises";
import { validateModule } from "./bestiary.mjs";

export const barrowFile = JSON.parse(
  await readFile(
    new URL("../../adventures/5e/robbers-barrow.json", import.meta.url),
  ),
);

export const room = (module, id) =>
  module.rooms.find((entry) => entry.id === id);

const placed = (id, name, gear) => ({
  id,
  name,
  description: `An old ${name.toLowerCase()}, still serviceable.`,
  kind: "gear",
  gear,
  hiddenIn: "scratched-lintel",
});

const LONGSWORD = placed("lintel-longsword", "Longsword", "longsword");

export const armoury = structuredClone(barrowFile);
room(armoury, "barrow-mouth").items.push(
  LONGSWORD,
  placed("lintel-shield", "Shield", "shield"),
  placed("lintel-greatsword", "Greatsword", "greatsword"),
  placed("lintel-mail", "Chain Mail", "chain-mail"),
);

export const armouryBarrow = validateModule(armoury);

/**
 * The barrow with only the longsword behind the lintel: four revealed items
 * at once would overflow the phone action bar (#198).
 */
const swordOnly = structuredClone(barrowFile);
room(swordOnly, "barrow-mouth").items.push(LONGSWORD);
export const longswordBarrow = validateModule(swordOnly);
