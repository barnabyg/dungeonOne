// The Robbers' Barrow with a pedlar at its mouth (#210), who sells a
// shortsword, a shield and a dagger and takes ten minutes over each trade.
// The goblin's pouch holds 10 gp, the shortsword's price, so coin looted
// from its body buys it.
import { barrowFile, room } from "./armoury-barrow.mjs";
import { validateModule } from "./bestiary.mjs";

export const PEDLAR = {
  id: "pedlar",
  name: "Pedlar",
  description:
    "A weathered pedlar sits on a pack by the doorway, waiting out the rain.",
  topics: [
    {
      id: "the-barrow",
      name: "the barrow",
      reply: '"A goblin went in yesterday. It hasn\'t come out."',
    },
  ],
  merchant: { stock: ["shortsword", "shield", "dagger"], minutes: 10 },
};

export const marketFile = structuredClone(barrowFile);
room(marketFile, "barrow-mouth").creatures = [structuredClone(PEDLAR)];
room(marketFile, "burial-hall").items.find(
  ({ id }) => id === "coin-pouch",
).coins = { gp: 10 };

export const marketBarrow = validateModule(marketFile);
