// The goblin yard with loot of every kind to find and take, and a pedlar
// to trade with (#484's loot sounds).
import { validateModule } from "./bestiary.mjs";
import { PEDLAR } from "./market-barrow.mjs";
import { goblinYardFile, room } from "./modules.mjs";

/**
 * The goblin yard with more to find: a spell scroll under the woodpile
 * beside the dagger, a gem and a ring in the handcart, a +1 shortsword in
 * the trough, a potion in plain sight, and a pedlar who trades in daggers.
 */
export const lootYard = (() => {
  const module = structuredClone(goblinYardFile);
  module.id = "loot-yard";
  // Uncommon treasure, such as a +1 weapon, is found from level 3.
  module.recommendedLevels = { min: 3, max: 3 };
  const yard = room(module, "yard");
  yard.features.push({
    id: "handcart",
    name: "Handcart",
    description: "A broken handcart by the gate.",
    discovery: "A gem is wedged between its boards.",
  });
  yard.features.push({
    id: "trough",
    name: "Trough",
    description: "A stone horse trough, half full.",
    discovery: "A blade lies at the bottom.",
  });
  yard.items.push(
    {
      id: "yard-scroll",
      name: "Sealed Parchment",
      description: "A roll of parchment sealed with wax.",
      kind: "scroll",
      spell: "bless",
      hiddenIn: "woodpile",
    },
    {
      id: "cart-gem",
      name: "Azurite",
      description: "A blue stone.",
      kind: "treasure",
      treasure: "gem-10gp",
      hiddenIn: "handcart",
    },
    {
      id: "yard-potion",
      name: "Potion of Healing",
      description: "A stoppered vial of red liquid.",
      kind: "potion-of-healing",
    },
    {
      id: "yard-sword",
      name: "Gleaming Shortsword",
      description: "A shortsword that never rusts.",
      kind: "gear",
      gear: "shortsword-plus-1",
      hiddenIn: "trough",
    },
    {
      id: "yard-ring",
      name: "Silver Ring",
      description: "A plain silver ring.",
      kind: "treasure",
      treasure: "gem-10gp",
      hiddenIn: "handcart",
    },
  );
  yard.creatures = [
    {
      ...structuredClone(PEDLAR),
      merchant: { stock: ["dagger"], minutes: 10 },
    },
  ];
  return validateModule(module);
})();
