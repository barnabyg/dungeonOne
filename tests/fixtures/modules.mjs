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
  "obstacle-yard",
  "picklock-cellar",
  "rat-tunnels",
  "rope-cove",
  "sealed-crypt",
  "shifting-ossuary",
  "toll-yard",
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

/**
 * Routes opened and closed (#282), level 1: a skull wall whose Perception
 * success opens a hidden passage to a reliquary, and a rotten door whose
 * failed force brings the ceiling down and closes its passage for good. The
 * tomb, the module's essential room, is reached freely.
 */
export const shiftingOssuary = validateModule(moduleFile("shifting-ossuary"));

/**
 * Alternative approaches (#283), level 1: a crumbling wall to get over with
 * Athletics (DC 12) or Acrobatics (DC 14), whose success opens a hidden way
 * to a garden, and a guard to get past with Persuasion or Intimidation (DC
 * 13 each), whose success opens the guardhouse. A copy of the AI DM
 * evaluation's own yard, owned by the tests.
 */
export const obstacleYard = validateModule(moduleFile("obstacle-yard"));

/**
 * A check that fails into a dead end (#285): the shifting ossuary as _The
 * Collapsing Ossuary_, its side crypt open (no rotten door), and the urn
 * shelf's Athletics check (DC 5) bringing the ceiling down across the way
 * back on a failure by 5 or more. A Fighter, proficient in Athletics, never
 * fails it by 5, but the validator counts the band reachable and always-fail lands there, so a
 * cautious run that looks into the side crypt is shut in.
 */
export const collapsingOssuary = (() => {
  const module = moduleFile("shifting-ossuary");
  module.id = "collapsing-ossuary";
  module.title = "The Collapsing Ossuary";
  const side = module.passages.find(({ id }) => id === "hall-to-side");
  delete side.door;
  side.description = "A low doorway.";
  room(module, "side-crypt").features[0].check = {
    skill: "athletics",
    dc: 5,
    bands: {
      "failure-by-5": {
        text: "The shelf tips as you heave at it, and the ceiling comes down across the doorway behind you.",
        effects: [{ type: "close", passage: "hall-to-side" }],
      },
      success: { effects: [{ type: "item", item: "urn-potion" }] },
    },
  };
  return validateModule(module);
})();

/**
 * A completable but deadly failure (#285): the shifting ossuary as _The
 * Falling Arch_, with a cracked arch at the gate whose Athletics check (DC
 * 5) drops it on the character for 4d6 on a failure by 5 or more, and its
 * rat a boss. Seeded checks never fail by 5, so it qualifies as hard on
 * them; always-fail lands every examination of the arch there.
 */
export const fallingArch = (() => {
  const module = moduleFile("shifting-ossuary");
  module.id = "falling-arch";
  module.title = "The Falling Arch";
  // A boss, so only survival judges it: the rat is no one-hit-kill question.
  module.encounters[0].opponents[0].boss = true;
  room(module, "ossuary-gate").features.push({
    id: "cracked-arch",
    name: "Cracked Arch",
    description: "The arch over the stair is cracked from side to side.",
    check: {
      skill: "athletics",
      dc: 5,
      bands: {
        "failure-by-5": {
          text: "You put your shoulder to the wrong stone, and the arch comes down on you.",
          effects: [
            {
              type: "damage",
              dice: 4,
              sides: 6,
              modifier: 0,
              damageType: "bludgeoning",
              defeatEndingId: "lost-in-the-ossuary",
            },
          ],
        },
        success: { text: "The crack is old; the arch will hold." },
      },
    },
  });
  return validateModule(module);
})();

/**
 * Loot a failed check loses (#285): the graded cellar with its rubble heap
 * and silver ring moved to a coal store off the steps, which is no exit, so
 * a run whose heap check fails must give the ring up and head out.
 */
export const coalStore = (() => {
  const module = moduleFile("graded-cellar");
  module.id = "coal-store";
  module.title = "The Coal Store";
  const steps = room(module, "cellar-steps");
  const heap = steps.features.find(({ id }) => id === "rubble-heap");
  const ring = steps.items.find(({ id }) => id === "silver-ring");
  steps.features = steps.features.filter((feature) => feature !== heap);
  steps.items = steps.items.filter((item) => item !== ring);
  module.rooms.push({
    id: "coal-store",
    name: "Coal Store",
    description: "A low bay heaped with coal dust and fallen stone.",
    features: [heap],
    items: [ring],
  });
  module.passages.push({
    id: "steps-to-store",
    between: ["cellar-steps", "coal-store"],
    description: "A low bay beside the steps.",
  });
  return validateModule(module);
})();

/**
 * Retries and circumstances (#284), level 1: a sheer cliff (Athletics DC 15)
 * that holding the knotted rope, hidden in the old crate, gives advantage
 * and another try; a swollen door whose force can be retried for 1d4
 * bludgeoning damage; a trip wire whose disarm can be retried by using up
 * the iron spike; a hermit's topic retried once the tide notice is read;
 * and a burrow to listen at, at disadvantage while its rat lives and again
 * once it is beaten.
 */
export const ropeCove = validateModule(moduleFile("rope-cove"));

/**
 * Loot behind talk (#297), level 1: a keeper whose Persuasion topic (DC 13)
 * opens a hidden way to a strongroom's purse, the only loot with no fight
 * on the way, and a rat cellar whose nest holds a few coins.
 */
export const tollYard = validateModule(moduleFile("toll-yard"));

/**
 * Sneaking past (#302): the rat tunnels as _The Rat Run_, level 1, hard,
 * whose rat awards 20 XP for slipping past it, and whose den, its goblin
 * gone, is a way out. No other XP is on offer: the rat's own 25 only for
 * beating it.
 */
export const ratRunFile = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "rat-run";
  module.title = "The Rat Run";
  module.objective = "Get through the rat cellar to the den and out.";
  module.encounters = module.encounters.filter(({ id }) => id !== "den-goblin");
  module.encounters[0].bypassXp = 20;
  const den = room(module, "den");
  delete den.encounterId;
  den.exit = true;
  module.endings = [
    {
      id: "out-through-the-den",
      kind: "escape-without-loot",
      title: "Out through the den",
      text: "You climb the den's back stair into the open air.",
    },
    module.endings.find(({ kind }) => kind === "defeat"),
  ];
  return module;
})();
export const ratRun = validateModule(structuredClone(ratRunFile));

/**
 * Lurking monsters (#303): the rat tunnels as _The Lurking Tunnels_, level
 * 1, hard, whose Giant Rat lies in wait in the cellar with Stealth +4. The
 * gate's required path, to the den's goblin, goes through it.
 */
export const lurkingTunnelsFile = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "lurking-tunnels";
  module.title = "The Lurking Tunnels";
  module.encounters[0].lurking = true;
  module.encounters[0].opponents[0].statBlock.stealth = 4;
  return module;
})();
export const lurkingTunnels = validateModule(
  structuredClone(lurkingTunnelsFile),
);

/**
 * Reaction rolls (#304): the rat tunnels as _The Wary Tunnels_, level 1,
 * hard, whose Giant Rat reacts to the character: unfriendly it only fights,
 * uncertain and indifferent it may fight or let the character pass, and
 * friendly it lets the character pass, for 15 XP. As in _The Rat Run_, the
 * den, its goblin gone, is the way out, so the gate's required path goes
 * through the cellar.
 */
export const waryTunnelsFile = (() => {
  const module = structuredClone(ratRunFile);
  module.id = "wary-tunnels";
  module.title = "The Wary Tunnels";
  delete module.encounters[0].bypassXp;
  module.encounters[0].reaction = {
    peacefulXp: 15,
    bands: {
      unfriendly: {
        options: ["attack"],
        text: "The rat hisses and bares its yellow teeth.",
      },
      uncertain: {
        options: ["attack", "let-pass"],
        text: "The rat freezes, whiskers twitching.",
      },
      indifferent: {
        options: ["let-pass", "attack"],
        text: "The rat goes back to gnawing at a sack.",
      },
      friendly: {
        options: ["let-pass"],
        text: "The rat sniffs at your boots and wanders off.",
      },
    },
  };
  return module;
})();
export const waryTunnels = validateModule(structuredClone(waryTunnelsFile));

/**
 * Parley, tolls and trade (#305): the rat tunnels as _The Bandit's Toll_,
 * level 1, hard, whose cellar holds a Bandit in the rat's place, reacting
 * to the character. Unfriendly or uncertain, she fights, parleys
 * (Persuasion DC 12, Deception DC 14, Intimidation DC 13) or takes a toll
 * of 5 sp; indifferent, she lets the character pass, trades (a dagger, and
 * arrows) or fights; friendly, she lets the character pass or trades. A
 * parley's success moves her a band up and a success by 5 lets the
 * character pass; a failure moves her a band down, and a failure by 5 she
 * attacks with the character surprised. Ending it peacefully is worth 25
 * XP, as beating her is. As in _The Rat Run_, the den is the way out.
 */
export const banditTollFile = (() => {
  const module = structuredClone(ratRunFile);
  module.id = "bandit-toll";
  module.title = "The Bandit's Toll";
  module.objective = "Get past the bandit in the cellar to the den and out.";
  const [fight] = module.encounters;
  delete fight.bypassXp;
  fight.id = "cellar-bandit";
  room(module, "rat-cellar").encounterId = "cellar-bandit";
  fight.opponents = [
    {
      id: "bandit",
      monster: "bandit",
      description:
        "A bandit in a patched cloak blocks the way to the den, scimitar drawn.",
    },
  ];
  fight.reaction = {
    peacefulXp: 25,
    parley: {
      approaches: [
        { skill: "persuasion", dc: 12 },
        { skill: "deception", dc: 14 },
        { skill: "intimidation", dc: 13 },
      ],
      bands: {
        "failure-by-5": {
          text: "She laughs, and lunges before you finish.",
          outcome: "surprise-attack",
        },
        failure: { text: "Her eyes narrow.", shift: -1 },
        success: { text: "She lowers the blade a little.", shift: 1 },
        "success-by-5": {
          text: "She shrugs and steps aside.",
          outcome: "let-pass",
        },
      },
    },
    toll: {
      coins: { sp: 5 },
      text: "She bites a coin and waves you on.",
    },
    trade: { stock: ["dagger", "arrows"], minutes: 10 },
    bands: {
      unfriendly: {
        options: ["attack", "parley", "toll"],
        text: '"Five silver, or blood."',
      },
      uncertain: {
        options: ["attack", "parley", "toll"],
        text: "She watches you, blade half raised.",
      },
      indifferent: {
        options: ["let-pass", "trade", "attack"],
        text: 'She shrugs: "Buying or passing?"',
      },
      friendly: {
        options: ["let-pass", "trade"],
        text: "She grins and sheathes her scimitar.",
      },
    },
  };
  return module;
})();
export const banditToll = validateModule(structuredClone(banditTollFile));

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
  shiftingOssuary,
  obstacleYard,
  ropeCove,
  tollYard,
  ratRun,
  lurkingTunnels,
  waryTunnels,
  banditToll,
];
