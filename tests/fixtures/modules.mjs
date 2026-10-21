// The test-owned adventure modules (#251). Engine, runtime, browser and
// harness tests play these instead of the shipped adventure modules,
// so content can change without touching engine tests. Each is named for the
// mechanic it serves, and its doc comment below says what it holds.
import { readFile } from "node:fs/promises";
import { validateModule } from "./bestiary.mjs";

const NAMES = [
  "goblin-band",
  "goblin-burrow",
  "goblin-trio",
  "graded-cellar",
  "lintel-barrow",
  "lone-goblin",
  "long-workings",
  "obstacle-yard",
  "picklock-cellar",
  "quay-strongroom",
  "rat-tunnels",
  "rope-cove",
  "sealed-crypt",
  "shifting-ossuary",
  "sunken-chantry",
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

/**
 * Last Stand (#499): the lone goblin's cellar below a stair where a Potion
 * of Healing lies in plain sight: take it, go down, and fight.
 */
export const potionCellarFile = (() => {
  const module = moduleFile("lone-goblin");
  module.id = "potion-cellar";
  module.title = "The Potion Cellar";
  module.startRoomId = "stair";
  module.rooms.unshift({
    id: "stair",
    name: "Cellar Stair",
    at: [0, -1],
    description: "Worn steps lead down into the dark.",
    features: [],
    items: [
      {
        id: "healing-potion",
        name: "Potion of Healing",
        description: "A stoppered vial of red liquid.",
        kind: "potion-of-healing",
      },
    ],
  });
  module.passages.push({
    id: "stair-to-cellar",
    between: ["stair", "cellar"],
    description: "The steps down.",
  });
  return module;
})();
export const potionCellar = validateModule(structuredClone(potionCellarFile));

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
    at: [0, 1],
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

/**
 * A retired release module's mechanics together, kept for #311's handoff
 * journeys since it retired (#438, #446): levels 3–4, medium. A toll-taker at the
 * arch who reacts, parleys and charges a toll; a goblin lurking in the
 * counting hall, past which the character may sneak (springing a scything
 * blade) and sneak back to ambush it; and a strongroom door to pick or break,
 * each try costing 1d4 bludgeoning damage.
 */
export const quayStrongroom = validateModule(moduleFile("quay-strongroom"));

/**
 * A retired release module's mechanics together, kept for #350's handoff
 * journeys since it retired (#438, #446): level 3, medium. A sexton's key to a
 * locked grille, a ward read with Arcana, undead to turn, a +1 Mace, spell
 * scrolls, and a vestry whose long rests the restless dead may interrupt.
 */
export const sunkenChantry = validateModule(moduleFile("sunken-chantry"));

/**
 * Long rests and interrupted rests (#335): the rat tunnels as _The Resting
 * Tunnels_, level 1, hard, whose alcove is a rest site, and whose wandering
 * encounter, a Prowling Rat (a Giant Rat, 25 XP), interrupts a rest when a
 * d100 rolls `chance` or less. With no chance given there is no wandering
 * encounter, so no rest can be interrupted.
 */
export function restingTunnelsFile(chance) {
  const module = moduleFile("rat-tunnels");
  module.id = "resting-tunnels";
  module.title = "The Resting Tunnels";
  room(module, "alcove").restSite = true;
  if (chance !== undefined) {
    const rat = module.encounters[0].opponents[0];
    module.encounters.push({
      id: "prowling-rat",
      opponents: [
        {
          ...structuredClone(rat),
          id: "prowler",
          name: "Prowling Rat",
          description:
            "A rat the size of a dog noses out of the dark, drawn by your stillness.",
        },
      ],
      defeatEndingId: "fallen-in-the-cellar",
    });
    module.wanderingEncounter = { encounterId: "prowling-rat", chance };
  }
  return module;
}
export const restingTunnels = validateModule(restingTunnelsFile(25));

/** Every fixture module above, for checks that play each one. */
/**
 * The Lone Goblin with an inn yard before its cellar: a purse behind the
 * yard's water butt and a dagger under its woodpile (#377's icons).
 */
export const goblinYardFile = (() => {
  const module = moduleFile("lone-goblin");
  module.id = "goblin-yard";
  module.startRoomId = "yard";
  module.rooms.unshift({
    id: "yard",
    name: "Inn Yard",
    at: [0, -1],
    description: "A muddy yard behind the inn. Steps lead down to the cellar.",
    features: [
      {
        id: "woodpile",
        name: "Woodpile",
        description: "A stack of split logs against the wall.",
        discovery: "Something glints under the bottom log.",
      },
      {
        id: "water-butt",
        name: "Water Butt",
        description: "A barrel of rainwater by the door.",
        discovery: "A purse lies in the mud behind it.",
      },
    ],
    items: [
      {
        id: "lost-purse",
        name: "Lost Purse",
        description: "A purse a drinker dropped in the mud.",
        kind: "coin",
        coins: { sp: 5 },
        hiddenIn: "water-butt",
      },
      {
        id: "yard-dagger",
        name: "Dagger",
        description: "A dagger tucked under the logs.",
        kind: "gear",
        gear: "dagger",
        hiddenIn: "woodpile",
      },
    ],
  });
  module.passages.push({
    id: "yard-to-cellar",
    between: ["yard", "cellar"],
    description: "Steps down to the cellar.",
  });
  return module;
})();
export const goblinYard = validateModule(structuredClone(goblinYardFile));

/**
 * Regions (#395): the rat tunnels as _The Two-Level Tunnels_, whose stair
 * foot and alcove are the Upper Tunnels and whose cellar and den are the
 * Lower Tunnels.
 */
export const regionTunnelsFile = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "region-tunnels";
  module.title = "The Two-Level Tunnels";
  module.regions = [
    { id: "upper", name: "Upper Tunnels" },
    { id: "lower", name: "Lower Tunnels" },
  ];
  room(module, "stair-foot").region = "upper";
  room(module, "alcove").region = "upper";
  room(module, "rat-cellar").region = "lower";
  room(module, "den").region = "lower";
  return module;
})();
export const regionTunnels = validateModule(structuredClone(regionTunnelsFile));

/**
 * Backdrops (#517): the two-level tunnels as _The Drawn Tunnels_, whose
 * upper tunnels are drawn as a cellar and lower ones as a crypt, except the
 * alcove, which is drawn as a forest.
 */
export const backdropTunnelsFile = (() => {
  const module = structuredClone(regionTunnelsFile);
  module.id = "backdrop-tunnels";
  module.title = "The Drawn Tunnels";
  module.regions[0].backdrop = "cellar";
  module.regions[1].backdrop = "crypt";
  room(module, "alcove").backdrop = "forest";
  return module;
})();
export const backdropTunnels = validateModule(
  structuredClone(backdropTunnelsFile),
);

/**
 * The map (#457): the two-level tunnels as _The Mapped Tunnels_, with a
 * Long Gallery two cells east of the stair foot (the cell between empty),
 * a Belfry up a stair from the stair foot on another cell, and a Sump down
 * a ladder from the gallery on the gallery's own cell. No fight on the way.
 * A Cupboard north of the stair foot is behind a hidden passage that the
 * Draughty Wall's Investigation check (DC 5) opens.
 */
export const mapTunnelsFile = (() => {
  const module = structuredClone(regionTunnelsFile);
  module.id = "map-tunnels";
  module.title = "The Mapped Tunnels";
  room(module, "stair-foot").features.push({
    id: "draughty-wall",
    name: "Draughty Wall",
    description: "Cold air seeps between the stones of one wall.",
    check: {
      skill: "investigation",
      dc: 5,
      bands: {
        failure: { text: "The stones give nothing away." },
        success: {
          text: "One stone swings in on a pivot: a cupboard lies behind it.",
          effects: [{ type: "open", passage: "foot-to-cupboard" }],
        },
      },
    },
  });
  module.rooms.push(
    {
      id: "cupboard",
      name: "Cupboard",
      at: [1, -1],
      description: "A dusty cupboard behind the wall.",
      region: "upper",
      features: [],
      items: [],
    },
    {
      id: "gallery",
      name: "Long Gallery",
      at: [3, 0],
      description: "A gallery of empty niches, its far end lost in the dark.",
      region: "upper",
      features: [],
      items: [],
    },
    {
      id: "belfry",
      name: "Belfry",
      at: [2, -1],
      floor: 1,
      description: "A cracked bell hangs over a hole in the floor.",
      region: "upper",
      features: [],
      items: [],
    },
    {
      id: "sump",
      name: "Sump",
      at: [3, 0],
      floor: -1,
      description: "Black water laps at the foot of the ladder.",
      region: "lower",
      features: [],
      items: [],
    },
  );
  module.passages.push(
    {
      id: "foot-to-gallery",
      between: ["stair-foot", "gallery"],
      description: "A long passage east.",
    },
    {
      id: "foot-to-belfry",
      between: ["stair-foot", "belfry"],
      vertical: "stairs",
      description: "A spiral stair up.",
    },
    {
      id: "gallery-to-sump",
      between: ["gallery", "sump"],
      vertical: "ladder",
      description: "A ladder down a shaft.",
    },
    {
      id: "foot-to-cupboard",
      between: ["stair-foot", "cupboard"],
      hidden: true,
      description: "The gap behind the pivoting stone.",
    },
  );
  return module;
})();
export const mapTunnels = validateModule(structuredClone(mapTunnelsFile));

/**
 * A long module (#404): the two-level tunnels as _The Long Tunnels_, level
 * 3, hard, declared `long`. The upper alcove is a rest site, and so is a
 * Cistern in the Lower Tunnels off the cellar, so each region has one. The
 * stair foot is an exit, so every region has one to reach (D9, #408).
 */
export const longTunnelsFile = (() => {
  const module = structuredClone(regionTunnelsFile);
  module.id = "long-tunnels";
  module.title = "The Long Tunnels";
  module.long = true;
  module.recommendedLevels = { min: 3, max: 3 };
  room(module, "stair-foot").exit = true;
  module.endings.push({
    id: "climbed-out",
    kind: "escape-without-loot",
    title: "Back up the stair",
    text: "You climb out into the daylight with nothing to show for it.",
  });
  room(module, "alcove").restSite = true;
  module.rooms.push({
    id: "cistern",
    name: "Cistern",
    at: [1, 1],
    floor: -1,
    description: "A dry cistern with a ledge above the old waterline.",
    region: "lower",
    restSite: true,
    features: [],
    items: [],
  });
  module.passages.push({
    id: "cellar-to-cistern",
    between: ["rat-cellar", "cistern"],
    vertical: "ladder",
    description: "A ladder down into the dark.",
  });
  return module;
})();
export const longTunnels = validateModule(structuredClone(longTunnelsFile));

/**
 * Region sweeps (#408): the long tunnels as _The Lair Tunnels_, with a Lair
 * off the upper alcove where a Lair Guardian waits whose bite always kills.
 * The Lair is optional: the fewest-fights route never goes there, but the
 * Upper Tunnels' sweep does, unless `avoidable` marks it so. `routes`, when
 * given, are declared as they are.
 */
export const lairTunnelsFile = ({ avoidable = false, routes } = {}) => {
  const module = structuredClone(longTunnelsFile);
  module.id = "lair-tunnels";
  module.title = "The Lair Tunnels";
  if (routes !== undefined) {
    module.routes = routes;
  }
  const rat = module.encounters.find(({ id }) => id === "cellar-rat")
    .opponents[0];
  module.encounters.push({
    id: "lair-guardian",
    opponents: [
      {
        ...structuredClone(rat),
        id: "guardian",
        name: "Lair Guardian",
        statBlock: {
          ...structuredClone(rat.statBlock),
          hitPoints: { average: 60, formula: "11d8+11" },
          attacks: [
            {
              name: "Bite",
              bonus: 20,
              damage: { dice: 4, sides: 12, modifier: 20, type: "piercing" },
            },
          ],
        },
      },
    ],
    defeatEndingId: "fallen-in-the-cellar",
  });
  module.rooms.push({
    id: "lair",
    name: "Lair",
    at: [-1, 0],
    description: "Gnawed bones carpet a low den.",
    region: "upper",
    encounterId: "lair-guardian",
    ...(avoidable ? { avoidable: true } : {}),
    features: [],
    items: [],
  });
  module.passages.push({
    id: "alcove-to-lair",
    between: ["alcove", "lair"],
    description: "A crawl that stinks of old meat.",
  });
  return module;
};
export const lairTunnels = validateModule(lairTunnelsFile());

/**
 * A generated release run (#409): the long tunnels as _The Winding
 * Tunnels_, eight rooms. A Collapsed Store off the stair foot hides a pouch
 * of coins, a Well Shaft off the alcove a tarnished locket, and a Drain
 * Tunnel off the cistern an old grate to look at.
 */
export const windingTunnelsFile = (() => {
  const module = structuredClone(longTunnelsFile);
  module.id = "winding-tunnels";
  module.title = "The Winding Tunnels";
  // The stair foot is an exit (#408): coin may be carried out by it.
  module.endings.push({
    id: "climbed-out-rich",
    kind: "escape-with-loot",
    title: "Up the stair with your finds",
    text: "You climb out into the daylight with what you found below.",
  });
  module.rooms.push(
    {
      id: "collapsed-store",
      name: "Collapsed Store",
      at: [2, 0],
      description: "Half the roof lies on the floor among split crates.",
      region: "upper",
      features: [
        {
          id: "split-crates",
          name: "Split Crates",
          description: "Crates crushed under the fallen roof.",
          discovery: "Wedged between two crates is a greasy leather pouch.",
        },
      ],
      items: [
        {
          id: "store-pouch",
          name: "Pouch of Old Coins",
          description: "A greasy leather pouch of tarnished coins.",
          kind: "coin",
          coins: { gp: 4, sp: 5 },
          hiddenIn: "split-crates",
        },
      ],
    },
    {
      id: "well-shaft",
      name: "Well Shaft",
      at: [0, -1],
      description: "A round shaft drops away beside a crumbling well-head.",
      region: "upper",
      features: [
        {
          id: "well-head",
          name: "Crumbling Well-Head",
          description: "Loose stones ring the mouth of the shaft.",
          discovery: "A locket on a broken chain hangs from a loose stone.",
        },
      ],
      items: [
        {
          id: "well-locket",
          name: "Tarnished Locket",
          description: "A silver locket, black with tarnish.",
          kind: "treasure",
          treasure: "art-25gp",
          hiddenIn: "well-head",
        },
      ],
    },
    {
      id: "drain-tunnel",
      name: "Drain Tunnel",
      at: [2, 1],
      floor: -1,
      description:
        "A low brick tunnel that once carried water from the cistern.",
      region: "lower",
      features: [
        {
          id: "rusted-grate",
          name: "Rusted Grate",
          description: "A grate rusted solid across the far end.",
          discovery: "Beyond the grate the tunnel is choked with silt.",
        },
      ],
      items: [],
    },
  );
  module.passages.push(
    {
      id: "stair-to-store",
      between: ["stair-foot", "collapsed-store"],
      description: "A doorway half blocked by rubble.",
    },
    {
      id: "alcove-to-well",
      between: ["alcove", "well-shaft"],
      description: "A narrow cleft in the alcove's back wall.",
    },
    {
      id: "cistern-to-drain",
      between: ["cistern", "drain-tunnel"],
      description: "A brick arch at the cistern's floor.",
    },
  );
  return module;
})();
export const windingTunnels = validateModule(
  structuredClone(windingTunnelsFile),
);

/**
 * Fleeing a fight (#396): the rat tunnels as _The Bolt-Hole Cellar_. The
 * cellar's fight is a Giant Rat and a Zombie; the stair foot is an exit
 * room. Out of the cellar run the passage back to the stair foot, the way
 * to the den, a stuck Sagging Door to a grain store, a way to a flooded sump over a Loose Stone trap
 * (Dexterity DC 12, 1d6 bludgeoning), and a crawl to the alcove that is
 * hidden until the Rotten Beam's check (Athletics DC 10) opens it; failing
 * that check by 5 or more brings the beam down across the way to the sump.
 */
export const fleeingCellarFile = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "fleeing-cellar";
  module.title = "The Bolt-Hole Cellar";
  room(module, "stair-foot").exit = true;
  module.endings.push({
    id: "slipped-away",
    kind: "escape-without-loot",
    title: "Back up the stair",
    text: "You climb out into the daylight with nothing to show for it.",
  });
  module.encounters
    .find(({ id }) => id === "cellar-rat")
    .opponents.push({
      id: "zombie",
      monster: "zombie",
      description: "A shambling zombie lurches out of the dark.",
    });
  module.rooms.push({
    id: "sump",
    name: "Flooded Sump",
    at: [2, 2],
    description: "Black water stands knee-deep under a low vault.",
    features: [],
    items: [],
  });
  room(module, "rat-cellar").features.push({
    id: "rotten-beam",
    name: "Rotten Beam",
    description: "A beam props up the ceiling over the way to the sump.",
    check: {
      skill: "athletics",
      dc: 10,
      bands: {
        "failure-by-5": {
          text: "The beam gives, and the ceiling comes down across the way to the sump.",
          effects: [{ type: "close", passage: "cellar-to-sump" }],
        },
        success: {
          text: "Behind the beam a crawl leads off toward the alcove.",
          effects: [{ type: "open", passage: "cellar-to-alcove" }],
        },
      },
    },
  });
  module.rooms.push({
    id: "store",
    name: "Grain Store",
    at: [2, 1],
    description: "Empty bins line a narrow room.",
    features: [],
    items: [],
  });
  module.passages.push(
    {
      id: "cellar-to-store",
      between: ["rat-cellar", "store"],
      description: "A sagging wooden door, swollen shut.",
      door: {
        id: "sagging-door",
        name: "Sagging Door",
        description: "The wood has swollen tight in its frame.",
        state: "stuck",
        force: { skill: "athletics", dc: 12 },
      },
    },
    {
      id: "cellar-to-sump",
      between: ["rat-cellar", "sump"],
      description: "A slick stone ramp down to the water.",
      trap: {
        id: "loose-stone",
        name: "Loose Stone",
        description: "One stone on the ramp rocks underfoot.",
        find: { dc: 12 },
        disarm: { ability: "dexterity", dc: 12 },
        trigger: "The stone tips and you go down hard on the ramp.",
        save: { ability: "dexterity", dc: 12 },
        damage: { dice: 1, sides: 6, modifier: 0, type: "bludgeoning" },
        defeatEndingId: "fallen-in-the-cellar",
      },
    },
    {
      id: "cellar-to-alcove",
      between: ["rat-cellar", "alcove"],
      description: "A crawl behind the beam.",
      hidden: true,
    },
  );
  return module;
})();
export const fleeingCellar = validateModule(structuredClone(fleeingCellarFile));

/**
 * Flags (#397): the rat tunnels as _The Winch Tunnels_. The passage from the
 * stair foot down to the rat's cellar is shut behind an iron portcullis,
 * open only once the flag `portcullis-raised` is set; examining the Rusted
 * Winch in the alcove sets it.
 */
export const winchTunnelsFile = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "winch-tunnels";
  module.title = "The Winch Tunnels";
  module.flags = ["portcullis-raised"];
  room(module, "alcove").features.push({
    id: "rusted-winch",
    name: "Rusted Winch",
    description:
      "A rusted winch is bolted to the wall, its chain running off through a hole toward the stair. You heave it round, and somewhere a portcullis grinds upward.",
    sets: "portcullis-raised",
  });
  const down = module.passages.find(({ id }) => id === "stair-to-cellar");
  down.description = "The passage, sloping down to an iron portcullis.";
  down.openWhen = "portcullis-raised";
  return module;
})();
export const winchTunnels = validateModule(structuredClone(winchTunnelsFile));

/**
 * Flags that change features and topics (#399): the winch tunnels with a
 * hermit at the foot of the stair. Until the portcullis rises he will talk
 * about the winch; once it has, about the cellar instead. The rusted lantern
 * by the stair, and the winch itself, read differently once it has risen.
 */
export const hermitTunnelsFile = (() => {
  const module = structuredClone(winchTunnelsFile);
  module.id = "hermit-tunnels";
  module.title = "The Hermit's Tunnels";
  const foot = room(module, "stair-foot");
  foot.features[0].changed = {
    when: "portcullis-raised",
    description:
      "The rusted lantern swings on its hook, still shaking from the portcullis.",
  };
  room(module, "alcove").features.at(-1).changed = {
    when: "portcullis-raised",
    description: "The rusted winch is wound tight, its chain taut.",
  };
  foot.creatures = [
    {
      id: "hermit",
      name: "Hermit",
      description: "A ragged hermit squats by the stair, warming his hands.",
      topics: [
        {
          id: "hermit-winch",
          name: "The winch",
          reply:
            "The winch in the alcove lifts the portcullis. Put your back into it.",
          offeredUntil: "portcullis-raised",
        },
        {
          id: "hermit-cellar",
          name: "The cellar",
          reply: "Now it's open, mind the rat. It bites.",
          offeredWhile: "portcullis-raised",
        },
        {
          id: "hermit-weather",
          name: "The weather",
          reply: "Damp. Always damp.",
        },
      ],
    },
  ];
  return module;
})();
export const hermitTunnels = validateModule(structuredClone(hermitTunnelsFile));

/**
 * A fight a flag moves (#398): the rat tunnels as _The Roused Tunnels_,
 * level 1, hard. The Giant Rat sleeps in a nest off the foot of the stair,
 * out of the way, until knocking the rusted lantern down rouses it
 * (`rat-roused`): then it waits in the cellar, on the way to the den. With
 * `moving` false it never leaves its nest, and the lantern sets nothing.
 */
export function rousedTunnelsFile(moving = true) {
  const module = moduleFile("rat-tunnels");
  module.id = moving ? "roused-tunnels" : "sleeping-tunnels";
  module.title = moving ? "The Roused Tunnels" : "The Sleeping Tunnels";
  module.rooms.push({
    id: "nest",
    name: "Rat's Nest",
    at: [2, 0],
    description: "A low burrow of shredded sacking, warm and rank.",
    encounterId: "cellar-rat",
    features: [],
    items: [],
  });
  delete room(module, "rat-cellar").encounterId;
  module.passages.push({
    id: "stair-to-nest",
    between: ["stair-foot", "nest"],
    description: "A burrow under the bottom step.",
  });
  if (moving) {
    module.flags = ["rat-roused"];
    room(module, "stair-foot").features[0].sets = "rat-roused";
    module.encounters[0].movesTo = { roomId: "rat-cellar", when: "rat-roused" };
  }
  return module;
}
export const rousedTunnels = validateModule(rousedTunnelsFile());

/**
 * Using an item on a feature (#400): the rat tunnels as _The Snake Door_. A
 * Stone Snake lies in the alcove, and a Stone Door at the foot of the stair
 * has a snake-shaped hollow: fitting the snake into it uses it up and opens
 * the hidden way to the Snake Vault.
 */
export const snakeDoorFile = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "snake-door";
  module.title = "The Snake Door";
  room(module, "alcove").items.push({
    id: "stone-snake",
    name: "Stone Snake",
    description: "A coiled snake carved from grey stone, the length of a hand.",
    kind: "tool",
  });
  room(module, "stair-foot").features.push({
    id: "stone-door",
    name: "Stone Door",
    description:
      "A stone door carved with coiled snakes. One carving is missing, leaving a snake-shaped hollow.",
    uses: [
      {
        item: "stone-snake",
        text: "The carving fits the hollow. With a grinding of stone, the door swings inward.",
        consumes: true,
        effects: [{ type: "open", passage: "stair-to-vault" }],
      },
    ],
  });
  module.rooms.push({
    id: "vault",
    name: "Snake Vault",
    at: [2, 0],
    description: "A dry vault, its walls painted with snakes.",
    features: [
      {
        id: "snake-mural",
        name: "Snake Mural",
        description: "Painted snakes coil round the walls.",
        discovery: "The snakes all point toward the den.",
      },
    ],
    items: [],
  });
  module.passages.push({
    id: "stair-to-vault",
    between: ["stair-foot", "vault"],
    description: "The stone door, and a passage beyond it.",
    hidden: true,
  });
  return module;
})();
export const snakeDoor = validateModule(structuredClone(snakeDoorFile));

/**
 * A fight action (#402): the rat tunnels as _The Statue Cellar_. The
 * cellar's fight is two Giant Rats, the second, the Scarred Rat, carrying a
 * Silver Chain. A Leaning Statue there may be used once in the adventure
 * against one of them, by Athletics (DC 12) to topple it or Dexterity (DC
 * 14) to cut the rope that holds it: a failure only rocks it; a success
 * deals 2d6 bludgeoning damage and knocks the rat prone; a success by 5 or
 * more buries it, out of the fight.
 */
export const statueCellarFile = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "statue-cellar";
  module.title = "The Statue Cellar";
  const fight = module.encounters.find(({ id }) => id === "cellar-rat");
  fight.opponents.push({
    ...structuredClone(fight.opponents[0]),
    id: "scarred-rat",
    name: "Scarred Rat",
    description: "A second rat, its hide criss-crossed with old scars.",
  });
  room(module, "rat-cellar").items.push({
    id: "silver-chain",
    name: "Silver Chain",
    description: "A tarnished silver chain caught round the rat's neck.",
    kind: "treasure",
    treasure: "art-25gp",
    hiddenIn: "scarred-rat",
  });
  room(module, "rat-cellar").features.push({
    id: "leaning-statue",
    name: "Leaning Statue",
    description:
      "A stone statue of a smuggler leans out from the wall, held up by a frayed rope.",
    fightAction: {
      once: "adventure",
      check: {
        approaches: [
          { skill: "athletics", dc: 12 },
          { ability: "dexterity", dc: 14 },
        ],
      },
      bands: {
        failure: { text: "The statue rocks, but stays up." },
        success: {
          text: "The statue topples onto the rat.",
          effects: [
            {
              type: "damage",
              dice: 2,
              sides: 6,
              modifier: 0,
              damageType: "bludgeoning",
            },
            { type: "condition", condition: "prone", turns: 1 },
          ],
        },
        "success-by-5": {
          text: "The statue crashes down and buries the rat.",
          effects: [{ type: "remove" }],
        },
      },
    },
  });
  return module;
})();
export const statueCellar = validateModule(structuredClone(statueCellarFile));

/**
 * An alarm (#401): the two-level tunnels as _The Alarmed Tunnels_, level 1,
 * hard. Stacked Crates at the foot of the stair crash down on a Dexterity
 * check (DC 15) failed by 5 or more, and a fight in the Lower Tunnels going
 * on past round 2 makes noise too, as do a sneak failed by 5 or more and a
 * rat or goblin that flees and lives: any of them raises the alarm. Then an
 * iron grate drops across the passage down from the stair (the crawl from
 * the alcove still goes down), and the goblin lookout leaves its guard
 * post for the landing between the cellar and the den.
 */
export const alarmTunnelsFile = (() => {
  const module = structuredClone(regionTunnelsFile);
  module.id = "alarm-tunnels";
  module.title = "The Alarmed Tunnels";
  module.flags = ["alarm"];
  module.alarm = {
    flag: "alarm",
    text: "A gong booms below, and goblin voices shout. The tunnels are roused.",
    fights: [{ region: "lower", round: 2 }],
  };
  room(module, "stair-foot").features.push({
    id: "stacked-crates",
    name: "Stacked Crates",
    description: "Empty crates are stacked high and crooked against the wall.",
    check: {
      ability: "dexterity",
      dc: 15,
      bands: {
        "failure-by-5": {
          text: "The stack topples with a crash that rings down the passage.",
          noisy: true,
        },
        success: { text: "You ease the crates apart. They hold only straw." },
      },
    },
  });
  module.rooms.push(
    {
      id: "landing",
      name: "Landing",
      at: [2, 2],
      description: "A wide step in the tunnel, worn smooth by many feet.",
      region: "lower",
      features: [],
      items: [],
    },
    {
      id: "guard-post",
      name: "Guard Post",
      at: [3, 2],
      description: "A niche with a stool, a gong and a view of the landing.",
      region: "lower",
      encounterId: "lookout",
      features: [],
      items: [],
    },
  );
  const down = module.passages.find(({ id }) => id === "stair-to-cellar");
  down.description = "The passage, sloping down under an iron grate.";
  down.closeWhen = "alarm";
  module.passages = module.passages.filter(({ id }) => id !== "cellar-to-den");
  module.passages.push(
    {
      id: "alcove-to-cellar",
      between: ["alcove", "rat-cellar"],
      description: "A tight crawl down through the rock.",
    },
    {
      id: "cellar-to-landing",
      between: ["rat-cellar", "landing"],
      description: "A sagging wooden door, ajar.",
    },
    {
      id: "landing-to-den",
      between: ["landing", "den"],
      description: "An archway hung with a ragged curtain.",
    },
    {
      id: "landing-to-guard-post",
      between: ["landing", "guard-post"],
      description: "A step up into a niche.",
    },
  );
  const goblin = module.encounters.find(({ id }) => id === "den-goblin");
  module.encounters.push({
    id: "lookout",
    opponents: [
      {
        ...structuredClone(goblin.opponents[0]),
        id: "lookout-goblin",
        name: "Goblin Lookout",
        description: "A goblin lookout snatches up a spear.",
      },
    ],
    defeatEndingId: "fallen-in-the-cellar",
    movesTo: { roomId: "landing", when: "alarm" },
  });
  return module;
})();
export const alarmTunnels = validateModule(structuredClone(alarmTunnelsFile));

/**
 * Wandering encounter tables by region (#403): the two-level tunnels as
 * _The Wandering Tunnels_, level 1, hard, with a quiet Landing between the
 * cellar and the den. The Upper Tunnels' table rolls on every move there
 * (chance 100), and its one entry is an omen, a chain clinking far above;
 * the alcove is a rest site, where rests roll it too. The Lower Tunnels'
 * table rolls on every move there (chance 100): 1–50 a Prowling Rat (a
 * Giant Rat, 25 XP), which comes once and is then claws skittering in the
 * dark, and 51–100 water dripping. A move that meets the cellar's or the
 * den's fight loses its roll, so the rat comes, if at all, on the Landing.
 */
export const wanderingTunnelsFile = (() => {
  const module = structuredClone(regionTunnelsFile);
  module.id = "wandering-tunnels";
  module.title = "The Wandering Tunnels";
  module.regions[0].wandering = {
    chance: 100,
    every: 1,
    entries: [
      { omen: "Far above, a chain clinks against stone, then is still." },
    ],
  };
  module.regions[1].wandering = {
    chance: 100,
    every: 1,
    entries: [
      {
        encounterId: "prowling-rat",
        omen: "Claws skitter somewhere in the dark, then fade.",
      },
      { omen: "Water drips steadily from the vaulted ceiling." },
    ],
  };
  room(module, "alcove").restSite = true;
  module.rooms.push({
    id: "landing",
    name: "Landing",
    at: [2, 2],
    description: "A wide step in the tunnel, worn smooth by many feet.",
    region: "lower",
    features: [],
    items: [],
  });
  module.passages = module.passages.filter(({ id }) => id !== "cellar-to-den");
  module.passages.push(
    {
      id: "cellar-to-landing",
      between: ["rat-cellar", "landing"],
      description: "A sagging wooden door, ajar.",
    },
    {
      id: "landing-to-den",
      between: ["landing", "den"],
      description: "An archway hung with a ragged curtain.",
    },
  );
  const rat = module.encounters[0].opponents[0];
  module.encounters.push({
    id: "prowling-rat",
    opponents: [
      {
        ...structuredClone(rat),
        id: "prowler",
        name: "Prowling Rat",
        description: "A rat the size of a dog noses out of the dark.",
      },
    ],
    defeatEndingId: "fallen-in-the-cellar",
  });
  return module;
})();
export const wanderingTunnels = validateModule(
  structuredClone(wanderingTunnelsFile),
);

/**
 * The known rooms in the AI DM's scene (#406): the two-level tunnels as
 * _The Remembered Tunnels_. An Old Hermit in the alcove talks about the
 * den, and a Gallery off the alcove has a chute down to the cellar, so from
 * the gallery the way back to the stair foot is through the alcove, which
 * only the known rooms tell.
 */
export const memoryTunnelsFile = (() => {
  const module = structuredClone(regionTunnelsFile);
  module.id = "memory-tunnels";
  module.title = "The Remembered Tunnels";
  room(module, "alcove").creatures = [
    {
      id: "hermit",
      name: "Old Hermit",
      description: "A wiry old hermit squats by the chest, picking at a crust.",
      topics: [
        {
          id: "the-den",
          name: "the den",
          reply:
            '"The smugglers sleep in the den past the cellar. Their goblin keeps the key on a cord round its neck."',
        },
      ],
    },
  ];
  module.rooms.push({
    id: "gallery",
    name: "Gallery",
    at: [0, 1],
    description:
      "A narrow gallery cut into the rock, open to the cellar below.",
    region: "upper",
    features: [],
    items: [],
  });
  module.passages.push(
    {
      id: "alcove-to-gallery",
      between: ["alcove", "gallery"],
      description: "A crawl through the back of the alcove.",
    },
    {
      id: "gallery-to-cellar",
      between: ["gallery", "rat-cellar"],
      description: "A chute down to the cellar.",
    },
  );
  return module;
})();
export const memoryTunnels = validateModule(structuredClone(memoryTunnelsFile));

/**
 * Declared routes (#407): the rat tunnels as _The Forked Tunnels_, with two
 * ways from the stair foot to the den: through the cellar and its Giant
 * Rat, the fewest-fights route, or through a Guard Hall and its Hall
 * Guardian, a rat whose bite always kills, then a quiet Hall Stair. A Cache
 * off the stair foot opens only by talking to the Old Keeper there, and a
 * Sluice Room off the alcove only once a flag only a check's success sets.
 * `forkedTunnelsFile(routes)` declares `routes`; `forkedTunnels` declares
 * both ways.
 */
export const forkedTunnelsFile = (routes) => {
  const module = moduleFile("rat-tunnels");
  module.id = "forked-tunnels";
  module.title = "The Forked Tunnels";
  if (routes !== undefined) {
    module.routes = routes;
  }
  module.flags = ["sluice-open"];
  room(module, "stair-foot").creatures = [
    {
      id: "keeper",
      name: "Old Keeper",
      description: "An old keeper dozes on a crate by the stair.",
      topics: [
        {
          id: "cache",
          name: "the cache",
          check: {
            skill: "persuasion",
            dc: 10,
            bands: {
              success: {
                effects: [{ type: "open", passage: "stair-to-cache" }],
              },
            },
          },
          reply: '"Behind the loose board, if you must." He pulls it aside.',
          failure: '"What cache?" He goes back to sleep.',
        },
      ],
    },
  ];
  room(module, "alcove").features.push({
    id: "sluice-wheel",
    name: "Sluice Wheel",
    description: "A rusted wheel works a sluice gate in the wall.",
    check: {
      skill: "athletics",
      dc: 10,
      bands: {
        success: { effects: [{ type: "set", flag: "sluice-open" }] },
      },
    },
  });
  const guardian = module.encounters.find(({ id }) => id === "cellar-rat")
    .opponents[0];
  module.encounters.push({
    id: "hall-guardian",
    opponents: [
      {
        ...structuredClone(guardian),
        id: "guardian",
        name: "Hall Guardian",
        statBlock: {
          ...structuredClone(guardian.statBlock),
          hitPoints: { average: 60, formula: "11d8+11" },
          attacks: [
            {
              name: "Bite",
              bonus: 20,
              damage: { dice: 4, sides: 12, modifier: 20, type: "piercing" },
            },
          ],
        },
      },
    ],
    defeatEndingId: "fallen-in-the-cellar",
  });
  for (const [id, name, at, description, encounterId] of [
    [
      "guard-hall",
      "Guard Hall",
      [2, 0],
      "A long hall lined with empty racks.",
      "hall-guardian",
    ],
    ["hall-stair", "Hall Stair", [2, 1], "Steps down from the guard hall."],
    ["cache", "Cache", [1, -1], "A cramped hole behind the boards."],
    [
      "sluice-room",
      "Sluice Room",
      [-1, 0],
      "A dripping chamber behind the sluice.",
    ],
  ]) {
    module.rooms.push({
      id,
      name,
      at,
      description,
      ...(encounterId === undefined ? {} : { encounterId }),
      features: [],
      items: [],
    });
  }
  module.passages.push(
    {
      id: "stair-to-hall",
      between: ["stair-foot", "guard-hall"],
      description: "An archway into a long hall.",
    },
    {
      id: "hall-to-stair",
      between: ["guard-hall", "hall-stair"],
      description: "Steps at the hall's far end.",
    },
    {
      id: "hall-stair-to-den",
      between: ["hall-stair", "den"],
      description: "A low door at the foot of the steps.",
    },
    {
      id: "stair-to-cache",
      between: ["stair-foot", "cache"],
      description: "A gap behind a loose board.",
      hidden: true,
    },
    {
      id: "alcove-to-sluice",
      between: ["alcove", "sluice-room"],
      description: "The sluice gate.",
      openWhen: "sluice-open",
    },
  );
  return module;
};
export const forkedTunnels = validateModule(
  forkedTunnelsFile([
    { id: "cellar", name: "through the cellar", rooms: ["rat-cellar"] },
    { id: "guard-hall", name: "through the guard hall", rooms: ["guard-hall"] },
  ]),
);

/**
 * _The Long Workings_ (#410), a long module of twenty rooms in two regions,
 * level 3, medium, with two declared routes, an avoidable room in each
 * region and a wandering table in the lower, on which the projection tests
 * check the harness's narrowed projection.
 */
export const longWorkings = validateModule(moduleFile("long-workings"));

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
  restingTunnels,
];
