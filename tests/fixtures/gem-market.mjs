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
// The torc and the opal are two gems or art objects, and the pouch's 10 gp
// with them is over level 1's budget, so the barrow is for levels 1 to 2.
gemMarketFile.recommendedLevels = { min: 1, max: 2 };
room(gemMarketFile, "burial-hall").items.push(structuredClone(OPAL));
gemMarketFile.rooms.push({
  id: "ogre-den",
  name: "Ogre's Den",
  at: [-1, 0],
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
