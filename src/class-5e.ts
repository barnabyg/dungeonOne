/**
 * What every 5e class shares (SRD 5.2): abilities, levels, skills, the
 * Fighting Style feats, the Ability Score Improvement, and the shape of a
 * class definition (#300).
 *
 * A class is data: its hit die, saving throws, skill choices, armour and
 * weapon training, weapon mastery count by level, features by level (with
 * their uses, recovery and the effect the engine applies), subclass, the
 * order a fresh creation fills its abilities in, its default choices and its
 * starting kits. `character-5e.ts` derives every number on a sheet from its
 * class's definition and never asks which class it is; each class's
 * definition lives in its own module (`fighter-5e.ts`, `rogue-5e.ts`,
 * `cleric-5e.ts`, `wizard-5e.ts`).
 */
import {
  MASTERIES,
  WEAPONS,
  type ArmourCategory,
  type EquipmentProfile,
  type FightingStyleId,
  type KitId,
  type ToolId,
  type WeaponId,
  type WeaponProficiency,
} from "./equipment-5e.js";
import type { SpellId } from "./spells-5e.js";

export const ABILITIES = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const;
export type Ability = (typeof ABILITIES)[number];
export type Abilities = Readonly<Record<Ability, number>>;
export type Level = 1 | 2 | 3 | 4 | 5;

/** No ability score can exceed this (4d6 keeps at most 18, +2 reaches 20). */
export const ABILITY_SCORE_CAP = 20;

/**
 * The skills the game uses, each with its ability. Anyone can roll any of
 * them; a class's skill choices say which it can become proficient in.
 */
export const SKILLS = {
  acrobatics: { name: "Acrobatics", ability: "dexterity" },
  "animal-handling": { name: "Animal Handling", ability: "wisdom" },
  arcana: { name: "Arcana", ability: "intelligence" },
  athletics: { name: "Athletics", ability: "strength" },
  deception: { name: "Deception", ability: "charisma" },
  history: { name: "History", ability: "intelligence" },
  insight: { name: "Insight", ability: "wisdom" },
  intimidation: { name: "Intimidation", ability: "charisma" },
  investigation: { name: "Investigation", ability: "intelligence" },
  medicine: { name: "Medicine", ability: "wisdom" },
  nature: { name: "Nature", ability: "intelligence" },
  perception: { name: "Perception", ability: "wisdom" },
  persuasion: { name: "Persuasion", ability: "charisma" },
  religion: { name: "Religion", ability: "intelligence" },
  "sleight-of-hand": { name: "Sleight of Hand", ability: "dexterity" },
  stealth: { name: "Stealth", ability: "dexterity" },
  survival: { name: "Survival", ability: "wisdom" },
} as const satisfies Record<string, { name: string; ability: Ability }>;
export type SkillId = keyof typeof SKILLS;

/**
 * One Ability Score Improvement (#286): +2 to one ability, or +1 to two. No
 * score can rise above ABILITY_SCORE_CAP. Other feats are not used.
 */
export type AbilityScoreImprovement = Readonly<Partial<Record<Ability, 1 | 2>>>;

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "+2 Strength" or "+1 Strength, +1 Constitution", in ABILITIES order. */
function improvementText(increase: AbilityScoreImprovement): string {
  return ABILITIES.filter((ability) => increase[ability] !== undefined)
    .map((ability) => `+${increase[ability]} ${titleCase(ability)}`)
    .join(", ");
}

/**
 * The Ability Score Improvement feature's text (#286, #308): the improvement
 * chosen, or that it is still to choose, with `alsoChoose` (the Fighter's
 * fourth weapon mastery) when the level brings another choice with it.
 */
export function abilityScoreImprovementText(
  chosen: AbilityScoreImprovement | undefined,
  alsoChoose?: string,
): string {
  return chosen === undefined
    ? `Not chosen yet: +2 to one ability score or +1 to two, to a maximum of ${ABILITY_SCORE_CAP}. Choose it${alsoChoose === undefined ? "" : `, with ${alsoChoose},`} before the next adventure.`
    : `${improvementText(chosen)}, to a maximum of ${ABILITY_SCORE_CAP}.`;
}

/** The SRD 5.2 Fighting Style feats. */
export const FIGHTING_STYLES = {
  archery: {
    name: "Archery",
    text: "+2 to attack rolls with ranged weapons.",
  },
  defense: {
    name: "Defense",
    text: "+1 AC while wearing armour.",
  },
  "great-weapon-fighting": {
    name: "Great Weapon Fighting",
    text: "Treat 1s and 2s on damage dice as 3s with a two-handed weapon, or a versatile one held in two hands.",
  },
  "two-weapon-fighting": {
    name: "Two-Weapon Fighting",
    text: "Add your ability modifier to the damage of the extra attack from two light weapons.",
  },
} as const satisfies Record<FightingStyleId, { name: string; text: string }>;
export type FightingStyle = keyof typeof FIGHTING_STYLES;

/** Whether a Fighting Style does anything with the gear held, and why. */
export type FightingStyleUse = Readonly<{
  id: FightingStyle;
  name: string;
  applies: boolean;
  /** Such as "Applies: you wear armour." */
  note: string;
}>;

/** Whether `style` applies with the equipment `gear` was derived from. */
export function fightingStyleUse(
  style: FightingStyle,
  gear: EquipmentProfile,
): FightingStyleUse {
  const weapon = gear.attack.weapon.toLowerCase();
  const use = (applies: boolean, note: string): FightingStyleUse => ({
    id: style,
    name: FIGHTING_STYLES[style].name,
    applies,
    note,
  });
  switch (style) {
    case "archery":
      return gear.attack.ammunition === undefined
        ? use(false, `No effect with the ${weapon}: it needs a ranged weapon.`)
        : use(true, `Applies: the ${weapon} is a ranged weapon.`);
    case "defense":
      return gear.loadout.armour === undefined
        ? use(false, "No effect without armour.")
        : use(true, "Applies: you wear armour.");
    case "great-weapon-fighting": {
      if (gear.attack.greatWeaponFighting === true) {
        return use(true, `Applies: the ${weapon} is held in two hands.`);
      }
      const versatile = (
        WEAPONS[gear.loadout.mainHand].properties as readonly string[]
      ).includes("versatile");
      return use(
        false,
        `No effect with the ${weapon}${versatile ? " in one hand" : ""}: it needs a two-handed weapon, or a versatile one held in two hands.`,
      );
    }
    case "two-weapon-fighting":
      return gear.lightAttack === undefined
        ? use(
            false,
            `No effect with the ${weapon}: it needs two light weapons.`,
          )
        : use(
            true,
            `Applies: the extra attack with the second ${gear.lightAttack.weapon.toLowerCase()} adds your ability modifier.`,
          );
  }
}

/**
 * How limited feature uses recover: a short rest (#334) or a long rest
 * (#335) restores what each feature's recovery gives. The sheet, the creation preview and the fight
 * all show these words.
 */
export const FEATURE_USES_RULE =
  "A short rest restores some spent uses, at most twice an adventure, and a long rest at a rest site restores them all; a rest between adventures restores them all and every hit point.";

/** What a rest restores of a feature's spent uses: a number of them, or all. */
export type RestRecovery = number | "all";

/**
 * How a feature's spent uses come back (#333), as SRD 5.2 gives it: what a
 * short rest (#334) and a long rest (#335) each restore. Every use also comes back
 * between adventures (FEATURE_USES_RULE).
 */
export type FeatureRecovery = Readonly<{
  shortRest: RestRecovery;
  longRest: RestRecovery;
}>;

/** A number for each level, such as a feature's uses. */
export type LevelTable = Readonly<Record<Level, number>>;

/**
 * The tools a class can be proficient with (#306) are the catalogue's tools
 * (#309, `TOOL_ITEMS`), named as the item is: proficiency adds the
 * proficiency bonus to a check made with the tool.
 */
export type { ToolId };

/** What a feature's name and text are written from. */
export type FeatureContext = Readonly<{
  level: Level;
  /** The feature's uses at this level, for a feature with limited uses. */
  uses: number;
  weaponMasteries: readonly WeaponId[];
  /** The Fighting Style, for a class that chooses one. */
  fightingStyle?: FightingStyle;
  /** Whether the Fighting Style applies with the gear held, and why. */
  fightingStyleUse?: FightingStyleUse;
  /** The skills chosen for Expertise, for a class that has it (#306). */
  expertise: readonly SkillId[];
  /** The Divine Order chosen, for a class with one (#339). */
  divineOrder?: DivineOrderId;
  abilityScoreImprovements: readonly AbilityScoreImprovement[];
  /**
   * 8 + the Dexterity modifier + the proficiency bonus: the DC of Cunning
   * Strike's saving throws (#308).
   */
  dexterityDc: number;
  /** The ability modifiers (#341: Divine Spark adds Wisdom's). */
  modifiers: Readonly<Record<Ability, number>>;
}>;

type Words = string | ((context: FeatureContext) => string);

/**
 * What a feature does that the engine applies. A feature without one is
 * described on the sheet only; one may have several (#315).
 */
export type FeatureEffect = Readonly<
  | {
      /** A bonus action to regain `dice`d`sides` + the class level in HP. */
      kind: "second-wind";
      healing: Readonly<{ dice: number; sides: number }>;
    }
  /** One additional action on the turn. */
  | { kind: "action-surge" }
  /**
   * Tactical Mind (#315): right after a failed ability check, a use of
   * Second Wind adds 1d`sides` to it; the use is spent only if the check
   * then succeeds.
   */
  | { kind: "tactical-mind"; sides: number }
  /** Critical hits from `range` up. */
  | { kind: "critical-range"; range: 19 | 20 }
  /** `attacks` attacks per Attack action. */
  | { kind: "extra-attack"; attacks: number }
  /** Advantage on checks with these skills. */
  | { kind: "check-advantage"; skills: readonly SkillId[] }
  /** Advantage on initiative rolls (#315). */
  | { kind: "initiative-advantage" }
  /** The Fighting Style chosen at creation. */
  | { kind: "fighting-style" }
  /** The kinds of weapon mastered (`ClassDefinition.weaponMasteries`). */
  | { kind: "weapon-mastery" }
  /**
   * Sneak Attack (#306): once per turn, `dice`d`sides` extra damage on a hit
   * with a Finesse or ranged weapon made with advantage. Dice by level.
   */
  | { kind: "sneak-attack"; dice: LevelTable; sides: number }
  /**
   * Expertise (#306): `count` of the character's proficient skills double
   * their proficiency bonus, chosen at creation for a level-1 feature and
   * on the sheet for a later one (#343), from `skills` only when it names
   * them (the Wizard's Scholar).
   */
  | { kind: "expertise"; count: number; skills?: readonly SkillId[] }
  /**
   * Cunning Action (#307): Hide as a bonus action, a Stealth check against
   * the opponents' best passive Perception; success gives advantage on the
   * next attack roll. Dash and Disengage need positions and are omitted.
   */
  | { kind: "cunning-action" }
  /** Steady Aim (#307): a bonus action for advantage on the next attack this turn. */
  | { kind: "steady-aim" }
  /**
   * Fast Hands (#307): the bonus action can use an object, so a second weapon
   * draw, stow or swap in a turn takes it.
   */
  | { kind: "fast-hands" }
  /**
   * Second-Story Work (#307): Dexterity in place of Strength on a check a
   * module marks as climbing or jumping.
   */
  | { kind: "second-story-work" }
  /**
   * Cunning Strike (#308): when it deals Sneak Attack, the combatant may
   * forgo Sneak Attack dice for an effect (`CUNNING_STRIKES` in
   * `encounter-5e.ts`), against a DC of 8 + its Dexterity modifier + its
   * proficiency bonus.
   */
  | { kind: "cunning-strike" }
  /**
   * Uncanny Dodge (#308): its reaction, when an attacker it can see hits it,
   * halves the attack's damage.
   */
  | { kind: "uncanny-dodge" }
  /** An Ability Score Improvement, chosen with the level's new mastery. */
  | { kind: "ability-score-improvement" }
  /**
   * Arcane Recovery (#340): on a short rest, a use regains spent spell
   * slots totalling up to half the class level (rounded up), none of 6th
   * level or higher.
   */
  | { kind: "arcane-recovery" }
  /**
   * Channel Divinity (#341): its uses power Divine Spark (`dice`d`sides`
   * by level + the spellcasting modifier) and Turn Undead, against the
   * spell save DC.
   */
  | {
      kind: "channel-divinity";
      divineSpark: Readonly<{ dice: LevelTable; sides: number }>;
    }
  /**
   * Preserve Life (#341): a use of Channel Divinity heals up to
   * `perLevel` × the class level, the Bloodied only, to half their maximum.
   */
  | { kind: "preserve-life"; perLevel: number }
  /**
   * Disciple of Life (#341): a spell cast with a slot that restores hit
   * points restores 2 + the slot's level more.
   */
  | { kind: "disciple-of-life" }
  /**
   * Spells always prepared (#341, the Life Domain's): they don't count
   * against the spells prepared.
   */
  | { kind: "always-prepared"; spells: readonly SpellId[] }
  /**
   * Sear Undead (#342): Turn Undead also deals d`sides` radiant damage, as
   * many as the spellcasting modifier (at least one), to each undead that
   * fails its save.
   */
  | { kind: "sear-undead"; sides: number }
  /**
   * Potent Cantrip (#343): a damaging cantrip that misses, or whose target
   * succeeds on its save, deals half its damage.
   */
  | { kind: "potent-cantrip" }
>;

/** One class or subclass feature, gained at `level`. */
export type FeatureDefinition = Readonly<{
  id: string;
  level: Level;
  name: Words;
  text: Words;
  /** What the engine applies: one effect, or several (#315). */
  effect?: FeatureEffect | readonly FeatureEffect[];
}> &
  (
    | Readonly<{ uses?: undefined; recovery?: undefined }>
    | Readonly<{
        /** Its uses by level, for a feature with limited uses. */
        uses: LevelTable;
        /** How its spent uses come back on a rest (#333). */
        recovery: FeatureRecovery;
      }>
  );

/**
 * Weapon Mastery at level 1, as the Fighter and the Rogue (#306) both have
 * it: the kinds of weapon mastered and what each mastery does.
 */
export const WEAPON_MASTERY_FEATURE: FeatureDefinition = {
  id: "weapon-mastery",
  level: 1,
  name: ({ weaponMasteries }) =>
    `Weapon Mastery: ${weaponMasteries
      .map((id) => WEAPONS[id].name)
      .join(", ")}`,
  text: ({ weaponMasteries }) =>
    `${weaponMasteries
      .map((id) => {
        const mastery = WEAPONS[id].mastery;
        return `${WEAPONS[id].name} (${mastery}): ${MASTERIES[mastery].text}`;
      })
      .join(" ")} A mastery applies only while you wield that weapon.`,
  effect: { kind: "weapon-mastery" },
};

export type SubclassDefinition = Readonly<{
  id: string;
  name: string;
  /** Its features; their names are shown after the subclass's, "Champion: …". */
  features: readonly FeatureDefinition[];
}>;

/**
 * The test-only caster (#336) exercises the casting engine until a playable
 * class casts: creation never offers it, and the gate never plays it.
 */
export type ClassId = "fighter" | "rogue" | "cleric" | "wizard" | "test-caster";

/** How many spell slots of each level a caster has: `[1st, 2nd, 3rd]`. */
export type SlotTable = Readonly<Record<Level, readonly number[]>>;

/**
 * A class's spellcasting (#336): the ability its spell attack bonus and save
 * DC use, how many cantrips it knows and spells it prepares by level, its
 * spell slots by level, and the spells it may choose from. Spell slots come
 * back on a long rest, and between adventures. A class with a spellbook
 * (#340, the Wizard) writes `spellbook` levelled spells from its list into
 * it at creation, and `spellbookPerLevel` more at each level after 1st
 * (#343), and prepares only spells in it.
 */
export type SpellcastingDefinition = Readonly<{
  ability: Ability;
  cantrips: LevelTable;
  prepared: LevelTable;
  slots: SlotTable;
  list: readonly SpellId[];
  /** The levelled spells its spellbook holds at creation (#340). */
  spellbook?: number;
  /** The spells each level after 1st adds to its spellbook (#343). */
  spellbookPerLevel?: number;
}>;

/** What a short and a long rest restore of spent spell slots (SRD 5.2). */
export const SPELL_SLOT_RECOVERY: FeatureRecovery = {
  shortRest: 0,
  longRest: "all",
};

/**
 * The Cleric's Divine Order (#339, SRD 5.2), chosen at creation: what
 * training it adds, how many more cantrips it knows, and a bonus it adds
 * to checks with some skills.
 */
export type DivineOrderId = "protector" | "thaumaturge";

export type DivineOrderDefinition = Readonly<{
  name: string;
  text: string;
  /** Armour training it adds to the class's. */
  armourTraining?: readonly ArmourCategory[];
  /** Weapon proficiencies it adds to the class's. */
  weaponProficiencies?: readonly WeaponProficiency[];
  /** Cantrips it knows beyond the class's count. */
  extraCantrips?: number;
  /**
   * A bonus to checks with `skills`: the `ability` modifier, at least
   * `minimum`.
   */
  checkBonus?: Readonly<{
    ability: Ability;
    minimum: number;
    skills: readonly SkillId[];
  }>;
}>;

/** A caster's cantrips known and spells prepared (#336), by id. */
export type SpellChoices = Readonly<{
  cantrips: readonly SpellId[];
  prepared: readonly SpellId[];
}>;

/** The choices a creation makes besides placing the rolls. */
export type DefaultChoices = Readonly<{
  increase: Readonly<Partial<Record<Ability, 1 | 2>>>;
  skills: readonly SkillId[];
  /** For a class with a Fighting Style. */
  fightingStyle?: FightingStyle;
  /** For a class with Expertise (#306). */
  expertise?: readonly SkillId[];
  /** For a class with spellcasting (#336). */
  spells?: SpellChoices;
  /** For a class with a Divine Order (#339). */
  divineOrder?: DivineOrderId;
  /** For a class with a spellbook (#340). */
  spellbook?: readonly SpellId[];
  kit: KitId;
  masteries: readonly WeaponId[];
}>;

export type ClassDefinition = Readonly<{
  id: ClassId;
  name: string;
  /**
   * Hit points: the die's maximum + the Constitution modifier at level 1,
   * then half the die + 1 + the Constitution modifier for each level after.
   */
  hitDie: number;
  /** The abilities its attacks and features lean on. */
  primaryAbilities: readonly Ability[];
  /**
   * The order a fresh creation fills the abilities, highest roll first, and
   * the order the balance harness spends an Ability Score Improvement in.
   */
  abilityPriority: readonly Ability[];
  savingThrows: readonly Ability[];
  skillChoices: Readonly<{ options: readonly SkillId[]; count: number }>;
  /** The armour it is trained with. */
  armourTraining: readonly ArmourCategory[];
  /** The weapons it adds its proficiency bonus to attacks with. */
  weaponProficiencies: readonly WeaponProficiency[];
  /** The tools it is proficient with (#306). */
  toolProficiencies: readonly ToolId[];
  /** How many kinds of weapon it masters, by level. */
  weaponMasteries: LevelTable;
  /** Its features, in the order the sheet lists those of the same level. */
  features: readonly FeatureDefinition[];
  /** The subclasses offered; the first is taken until there is a choice. */
  subclasses: readonly SubclassDefinition[];
  /** The choices a fresh creation, and the balance harness, start from. */
  defaults: DefaultChoices;
  /** The starting kits it is offered, in order. */
  kits: readonly KitId[];
  /** Its spellcasting (#336), for a class that casts spells. */
  spellcasting?: SpellcastingDefinition;
  /** The Divine Orders it chooses from at creation (#339), for the Cleric. */
  divineOrders?: Readonly<Record<DivineOrderId, DivineOrderDefinition>>;
  /**
   * The highest level it reaches yet (#339), below `MAX_LEVEL` while its
   * later features are still to come; XP above that level's is kept.
   */
  maxLevel?: Level;
  /** Never offered at creation nor played by the gate: a test-only class. */
  testOnly?: true;
}>;
