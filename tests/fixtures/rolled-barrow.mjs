// The lintel barrow (#240) with its goblin as the bestiary's Goblin Warrior
// and the coin the goblin carried replaced by loot the authoring-time roll
// gave it from its treasure type (copper), with seed 240.
import { rollModuleLoot } from "../../dist/loot-5e.js";
import { bestiary, validateModule } from "./bestiary.mjs";
import { moduleFile, room } from "./modules.mjs";

export const ROLL_SEED = 240;

const unrolled = moduleFile("lintel-barrow");
const [goblin] = unrolled.encounters[0].opponents;
unrolled.encounters[0].opponents = [
  { id: goblin.id, monster: "goblin-warrior", description: goblin.description },
];
const hall = room(unrolled, "burial-hall");
hall.items = hall.items.filter(({ hiddenIn }) => hiddenIn !== goblin.id);

export const rolledBarrowFile = rollModuleLoot(
  unrolled,
  bestiary,
  ROLL_SEED,
).module;

export const rolledBarrow = validateModule(structuredClone(rolledBarrowFile));
