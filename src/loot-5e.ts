/**
 * The authoring-time loot roll (#240): turns the treasure types of a
 * module's bestiary opponents into ordinary items they carry, so the balance
 * gate and the validator see exactly what a player finds on their bodies.
 * `npm run loot -- <module.json> --seed <n>` runs it on a module file.
 *
 * It works on the module's JSON, not the validated module, so what it writes
 * back is the author's file with items added. It rolls only for an opponent
 * that names a bestiary monster, carries no loot yet (a key is not loot) and
 * has a fight that doesn't end the adventure, so its body can be searched.
 * An author may then lower or remove what it rolled; rolling again leaves an
 * opponent that already carries loot alone.
 */
import { validateFifthAdventure } from "./adventure-5e.js";
import type { FifthBestiary } from "./bestiary-5e.js";
import type { Coin } from "./equipment-5e.js";
import { isRecord } from "./json-shape.js";
import { createSeededRandom } from "./random.js";
import {
  rollTreasure,
  type TradeGoodId,
  type TreasureTypeId,
} from "./treasure-5e.js";

/** What a rolled pouch of each coin is described as. */
const POUCHES: Readonly<Record<Coin, string>> = {
  cp: "A greasy pouch of copper pieces.",
  sp: "A small pouch of silver pieces.",
  gp: "A heavy pouch of gold pieces.",
};

/** What a rolled gem or art object is called and described as. */
const TRINKETS: Readonly<
  Record<TradeGoodId, Readonly<{ name: string; description: string }>>
> = {
  "gem-10gp": {
    name: "Rough Gem",
    description: "A cloudy, roughly cut stone that a jeweller would buy.",
  },
  "gem-50gp": {
    name: "Clear Gem",
    description: "A clear, well-cut stone that catches the light.",
  },
  "gem-100gp": {
    name: "Fine Gem",
    description: "A deep-coloured, flawless stone.",
  },
  "art-25gp": {
    name: "Silver Trinket",
    description: "A small silver ornament, dented but valuable.",
  },
  "art-250gp": {
    name: "Gilded Idol",
    description: "A small idol of gilded bronze, finely made.",
  },
};

/** What the roll gave one opponent. */
export type RolledLoot = Readonly<{
  opponentId: string;
  treasureType: TreasureTypeId;
  /** The names of the items it now carries. */
  items: readonly string[];
}>;

type Json = Record<string, unknown>;

/**
 * Rolls loot for a module file's bestiary opponents with `seed`, and
 * returns the file with the rolled items added to each fight's room, and
 * what was rolled. The same file and seed always give the same loot. The
 * file it is given is not changed. A module that is invalid before or after
 * the roll (over its treasure budget, say) is refused, naming the problem.
 */
export function rollModuleLoot(
  file: unknown,
  bestiary: FifthBestiary,
  seed: number,
): { module: unknown; rolled: readonly RolledLoot[] } {
  const adventure = validateFifthAdventure(file, bestiary);
  const module = structuredClone(file) as Json;
  const rooms = module.rooms as Json[];
  const encounters = module.encounters as Json[];
  const random = createSeededRandom(seed);
  const ids = new Set(
    rooms.flatMap((room) => (room.items as Json[]).map(({ id }) => id)),
  );
  const rolled: RolledLoot[] = [];
  adventure.encounters.forEach((encounter, index) => {
    const room = rooms.find(({ encounterId }) => encounterId === encounter.id);
    if (room === undefined || encounter.victoryEndingId !== undefined) {
      return;
    }
    const items = room.items as Json[];
    encounter.opponents.forEach((opponent, number) => {
      const raw = (encounters[index]!.opponents as unknown[])[number];
      const monster = bestiary.monsters.find(
        ({ id }) => isRecord(raw) && id === raw.monster,
      );
      const carriesLoot = items.some(
        ({ hiddenIn, kind }) => hiddenIn === opponent.id && kind !== "key",
      );
      if (monster === undefined || carriesLoot) {
        return;
      }
      const { coins, trinket } = rollTreasure(monster.treasureType, random);
      const added: Json[] = [];
      if (coins !== undefined) {
        const [coin] = Object.keys(coins) as Coin[];
        added.push({
          id: `${opponent.id}-coins`,
          name: `${opponent.name}'s Coins`,
          description: POUCHES[coin!],
          kind: "coin",
          coins,
          hiddenIn: opponent.id,
        });
      }
      if (trinket !== undefined) {
        added.push({
          id: `${opponent.id}-trinket`,
          name: `${opponent.name}'s ${TRINKETS[trinket].name}`,
          description: TRINKETS[trinket].description,
          kind: "treasure",
          treasure: trinket,
          hiddenIn: opponent.id,
        });
      }
      if (added.length === 0) {
        return;
      }
      for (const { id } of added) {
        if (ids.has(id)) {
          throw new Error(
            `The roll would add item ${String(id)}, but the module already has one.`,
          );
        }
        ids.add(id);
      }
      items.push(...added);
      rolled.push({
        opponentId: opponent.id,
        treasureType: monster.treasureType,
        items: added.map(({ name }) => name as string),
      });
    });
  });
  validateFifthAdventure(module, bestiary);
  return { module, rolled };
}
