// The test-owned adventure modules (#251). Engine, runtime, browser and
// harness tests play these instead of the shipped adventure modules,
// so content can change without touching engine tests. Each is named for the
// mechanic it serves; README.md lists them.
import { readFile } from "node:fs/promises";
import { validateModule } from "./bestiary.mjs";

const NAMES = [
  "goblin-band",
  "goblin-burrow",
  "goblin-trio",
  "graded-cellar",
  "lintel-barrow",
  "lone-goblin",
  "rat-tunnels",
  "sealed-crypt",
];

const FILES = Object.fromEntries(
  await Promise.all(
    NAMES.map(async (name) => [
      name,
      JSON.parse(await readFile(new URL(`./${name}.json`, import.meta.url))),
    ]),
  ),
);

/** A fresh copy of fixture module `name`'s JSON, to change and validate. */
export const moduleFile = (name) => structuredClone(FILES[name]);

/** The room `id` of a module or its JSON. */
export const room = (module, id) =>
  module.rooms.find((entry) => entry.id === id);

/** A one-room fight: one Goblin Warrior, level 1, hard. */
export const loneGoblin = validateModule(moduleFile("lone-goblin"));

/** A group fight: a Goblin Minion and a Goblin Warrior, level 2, medium. */
export const goblinBand = validateModule(moduleFile("goblin-band"));

/**
 * A group fight with numbered opponents of one kind: two Goblin Minions and
 * a Goblin Warrior, level 1, hard.
 */
export const goblinTrio = validateModule(moduleFile("goblin-trio"));

/**
 * Exploration: a stair, an alcove whose chest hides a potion, a Giant Rat's
 * cellar whose fight leaves the adventure going, and a goblin's den whose
 * fight ends it.
 */
export const ratTunnels = validateModule(moduleFile("rat-tunnels"));

/** The rat tunnels with the rat gone: one fight, in the den. */
export const ratlessTunnelsFile = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "quiet-tunnels";
  module.title = "The Quiet Tunnels";
  module.encounters = module.encounters.filter(({ id }) => id !== "cellar-rat");
  delete room(module, "rat-cellar").encounterId;
  // The bestiary's Goblin Warrior, with its Nimble Escape trait.
  const [goblin] = module.encounters[0].opponents;
  module.encounters[0].opponents = [
    {
      id: goblin.id,
      monster: "goblin-warrior",
      description: goblin.description,
    },
  ];
  room(module, "stair-foot").features[0].discovery =
    'Scratched into the lantern\'s base: "Rats gone. Boss in the den."';
  return module;
})();
export const ratlessTunnels = validateModule(
  structuredClone(ratlessTunnelsFile),
);

/**
 * Loot behind a fight: an exit at the mouth with a lintel to examine, and a
 * goblin in the burial hall guarding a hidden torc and carrying a pouch.
 */
export const lintelBarrow = validateModule(moduleFile("lintel-barrow"));

/**
 * Doors, a trap and talk, level 2: a stuck door, a locked door and its key, a
 * dart trap, a bound smuggler with a topic that needs a check, and a risen
 * warden in the tomb.
 */
export const sealedCrypt = validateModule(moduleFile("sealed-crypt"));

/**
 * A level-up journey, levels 2–3: two tunnel guards, then a goblin boss and
 * its hoard on the way out.
 */
export const goblinBurrow = validateModule(moduleFile("goblin-burrow"));

/**
 * A one-room fight against `opponents`, as module JSON: the lone goblin's
 * cellar and endings under the id and title given.
 */
export function fightRoomFile(id, title, opponents) {
  const module = moduleFile("lone-goblin");
  module.id = id;
  module.title = title;
  module.encounters[0].opponents = structuredClone(opponents);
  return module;
}

/** `fightRoomFile`'s module, validated. */
export const fightRoom = (id, title, opponents) =>
  validateModule(fightRoomFile(id, title, opponents));

/**
 * A copy of the validated `adventure` with `change` made to a copy of each
 * opponent's stat block, for comparing a monster with and without a rule.
 */
export function withStatBlocks(adventure, change) {
  const copy = structuredClone(adventure);
  for (const encounter of copy.encounters) {
    for (const opponent of encounter.opponents) {
      const statBlock = { ...opponent.statBlock };
      change(statBlock);
      opponent.statBlock = statBlock;
    }
  }
  return copy;
}

/** A `withStatBlocks` change: each attack loses its riders. */
export const withoutRiders = (statBlock) => {
  statBlock.attacks = statBlock.attacks.map(({ name, bonus, damage }) => ({
    name,
    bonus,
    damage,
  }));
};

/**
 * Graded checks (#281), level 1: a rubble heap whose Perception check reveals
 * a silver ring (and on a success by 5 or more its discovery) or, failing by
 * 5 or more, drops stones on the character; a cat whose topic's success by 5
 * makes the cask's discovery; and a warped hatch whose force can bruise.
 */
export const gradedCellar = validateModule(moduleFile("graded-cellar"));

/** Every fixture module above, for checks that play each one. */
export const FIXTURE_MODULES = [
  loneGoblin,
  goblinBand,
  goblinTrio,
  ratTunnels,
  ratlessTunnels,
  lintelBarrow,
  sealedCrypt,
  goblinBurrow,
  gradedCellar,
];
