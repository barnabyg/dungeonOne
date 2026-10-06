// The Robbers' Barrow with gear hidden behind the lintel at its mouth (#209):
// a longsword, a shield, a greatsword and chain mail, found by examining the
// lintel before any fight.
import { readFile } from "node:fs/promises";
import { validateFifthAdventure } from "../../dist/adventure-5e.js";

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

export const armoury = structuredClone(barrowFile);
room(armoury, "barrow-mouth").items.push(
  placed("lintel-longsword", "Longsword", "longsword"),
  placed("lintel-shield", "Shield", "shield"),
  placed("lintel-greatsword", "Greatsword", "greatsword"),
  placed("lintel-mail", "Chain Mail", "chain-mail"),
);

export const armouryBarrow = validateFifthAdventure(armoury);
