// The market barrow (#210) with a blue opal, a 50 gp gem, hidden under the
// stone bier beside the silver torc (#239): found once the goblin's fight is
// won, and sold to the pedlar at the barrow's mouth for its full value. An
// ogre's den off the mouth is a fight a level-1 Fighter loses, for journeys
// that end in defeat after trading.
import { marketFile } from "./market-barrow.mjs";
import { room } from "./armoury-barrow.mjs";
import { validateModule } from "./bestiary.mjs";

export const OPAL = {
  id: "blue-opal",
  name: "Blue Opal",
  description: "A milky opal flecked with blue fire.",
  kind: "treasure",
  treasure: "gem-50gp",
  hiddenIn: "stone-bier",
};

export const gemMarketFile = structuredClone(marketFile);
room(gemMarketFile, "burial-hall").items.push(structuredClone(OPAL));
gemMarketFile.rooms.push({
  id: "ogre-den",
  name: "Ogre's Den",
  description: "A reeking hollow under the hill, strewn with gnawed bones.",
  encounterId: "den-ogre",
  features: [],
  items: [],
});
gemMarketFile.passages.push({
  id: "mouth-to-den",
  between: ["barrow-mouth", "ogre-den"],
  description: "A crawlway behind the brambles stinks of something large.",
});
gemMarketFile.encounters.push({
  id: "den-ogre",
  opponents: [{ id: "den-ogre", monster: "ogre" }],
  defeatEndingId: "fallen-in-the-barrow",
});

export const gemMarket = validateModule(gemMarketFile);
