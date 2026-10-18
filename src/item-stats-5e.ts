// An item's stats as the page shows them when the player opens it (#504):
// what a weapon or armour is, and for a character what equipping it would
// do, worked out with the same rules as a real change of gear.
import {
  characterProfile,
  classOf,
  trainingOf,
  type CharacterProfile,
  type CharacterSheet,
} from "./character-5e.js";
import {
  ARMOUR,
  DONNING_MINUTES,
  MASTERIES,
  WEAPONS,
  equipItem,
  isArmourId,
  isBodyArmourId,
  isShieldId,
  isToolId,
  isWeaponId,
  itemWeight,
  magicItemText,
  proficientWith,
  swapWeapon,
  weaponKind,
  type ArmourData,
  type AttackProfile,
  type CatalogueId,
  type ItemId,
  type WeaponData,
  type WeaponId,
  type WeaponProperty,
} from "./equipment-5e.js";

export type ItemStats = Readonly<{
  /** What the item is, a fact a line. */
  facts: readonly string[];
  /**
   * What equipping it would do, set against what the character uses now,
   * or why it can't be equipped; absent for gear equipped, tools, and
   * without a character.
   */
  compare?: readonly string[];
}>;

const PROPERTY_NAMES: Readonly<Record<WeaponProperty, string>> = {
  ammunition: "Ammunition",
  finesse: "Finesse",
  heavy: "Heavy",
  light: "Light",
  loading: "Loading",
  "two-handed": "Two-Handed",
  versatile: "Versatile",
};

const CATEGORY_NAMES: Readonly<Record<ArmourData["category"], string>> = {
  light: "Light armour",
  medium: "Medium armour",
  heavy: "Heavy armour",
  shield: "Shield",
};

const signedText = (value: number) => (value < 0 ? "−" : "+") + Math.abs(value);

const pounds = (id: CatalogueId) => `Weight ${itemWeight(id)} lb`;

function weaponFacts(
  id: WeaponId,
  character: CharacterSheet | undefined,
): string[] {
  const weapon: WeaponData = WEAPONS[id];
  const ranged = weapon.ammunition !== undefined;
  const category = weapon.category === "simple" ? "Simple" : "Martial";
  const versatile =
    weapon.versatile === undefined
      ? ""
      : `; ${weapon.versatile.dice}d${weapon.versatile.sides} in two hands`;
  const properties = weapon.properties.map((property) =>
    property === "ammunition"
      ? `Ammunition (${weapon.ammunition})`
      : property === "heavy"
        ? `Heavy (${ranged ? "Dexterity" : "Strength"} 13, or disadvantage)`
        : PROPERTY_NAMES[property],
  );
  const mastery = MASTERIES[weapon.mastery];
  const mastered = character?.weaponMasteries.includes(weaponKind(id));
  const magic = magicItemText(id);
  const facts = [
    `${category} ${ranged ? "ranged" : "melee"} weapon`,
    ...(magic === undefined ? [] : [magic]),
    `Damage ${weapon.damage.dice}d${weapon.damage.sides} ${weapon.damageType}${versatile}`,
    `Attacks with ${ranged ? "Dexterity" : weapon.properties.includes("finesse") ? "Strength or Dexterity, whichever is higher" : "Strength"}`,
    ...(properties.length === 0
      ? []
      : [`Properties: ${properties.join(", ")}`]),
    // Only a mastery the character can use is explained.
    mastered === false
      ? `Mastery: ${weapon.mastery} (you haven't mastered it)`
      : `Mastery: ${weapon.mastery}${mastered === true ? " (you have mastered it)" : ""}. ${mastery.text}`,
  ];
  if (character !== undefined) {
    const { weaponProficiencies } = trainingOf(
      classOf(character),
      character.divineOrder,
    );
    facts.push(
      proficientWith(weaponProficiencies, id)
        ? "You are proficient with it."
        : "You are not proficient with it: no proficiency bonus to hit.",
    );
  }
  facts.push(pounds(id));
  return facts;
}

function armourFacts(
  id: ItemId & keyof typeof ARMOUR,
  character: CharacterSheet | undefined,
): string[] {
  const armour: ArmourData = ARMOUR[id];
  const base = armour.armorClass + (armour.magic?.bonus ?? 0);
  const magic = magicItemText(id);
  const facts = [
    CATEGORY_NAMES[armour.category],
    ...(magic === undefined ? [] : [magic]),
    armour.category === "shield"
      ? `+${base} AC`
      : armour.category === "heavy"
        ? `AC ${base} (no Dexterity)`
        : `AC ${base} + Dexterity modifier${armour.dexterityCap === undefined ? "" : ` (max ${armour.dexterityCap})`}`,
  ];
  if (armour.strength !== undefined) {
    const short =
      character !== undefined && character.abilities.strength < armour.strength;
    facts.push(
      `Needs Strength ${armour.strength}, or your speed drops by 10 ft${short ? ` (yours is ${character.abilities.strength})` : ""}`,
    );
  }
  if (armour.stealthDisadvantage) {
    facts.push("Disadvantage on Dexterity (Stealth) checks");
  }
  if (character !== undefined) {
    const { armourTraining } = trainingOf(
      classOf(character),
      character.divineOrder,
    );
    const kind =
      armour.category === "shield" ? "shields" : `${armour.category} armour`;
    facts.push(
      armourTraining.includes(armour.category)
        ? `You are trained with ${kind}.`
        : armour.category === "shield"
          ? "You are not trained with shields: it adds no AC."
          : `You are not trained with ${kind}: disadvantage on Strength and Dexterity rolls, attacks among them.`,
    );
  }
  if (armour.category !== "shield") {
    const { don, doff } = DONNING_MINUTES[armour.category];
    facts.push(
      `Takes ${don} minute${don === 1 ? "" : "s"} to don and ${doff} to doff, never in a fight`,
    );
  }
  facts.push(pounds(id));
  return facts;
}

/** "Mace +5 to hit, 1d6 + 3 bludgeoning, Sap". */
function attackLine(attack: AttackProfile): string {
  const { dice, sides, modifier, type } = attack.damage;
  return `${attack.weapon} ${signedText(attack.bonus)} to hit, ${dice}d${sides}${modifier === 0 ? "" : ` ${modifier < 0 ? "−" : "+"} ${Math.abs(modifier)}`} ${type}${attack.grip === "two-handed" ? ", two-handed" : ""}${attack.mastery === undefined ? "" : `, ${attack.mastery}`}${attack.disadvantage.map((source) => `, disadvantage (${source})`).join("")}${attack.criticalRange === 19 ? ", critical on 19–20" : ""}`;
}

/** The attacks a profile makes, the Light extra attack after the first. */
const attacksLine = (profile: CharacterProfile) =>
  attackLine(profile.attack) +
  (profile.lightAttack === undefined
    ? ""
    : `; ${attackLine(profile.lightAttack)} as an extra attack`);

/** What wearing what `profile` has on costs beyond its AC. */
function armourCosts(
  profile: CharacterProfile,
  equipment: readonly ItemId[],
): string {
  const body = equipment.find(isBodyArmourId);
  return [
    ...(profile.strengthShortfall === undefined
      ? []
      : [
          `speed −10 ft (Strength below ${profile.strengthShortfall.strength})`,
        ]),
    ...(body !== undefined && ARMOUR[body].stealthDisadvantage
      ? ["Stealth disadvantage"]
      : []),
    ...(profile.untrainedArmour === undefined
      ? []
      : ["disadvantage on Strength and Dexterity rolls (untrained)"]),
    ...(profile.untrainedShield === true
      ? ["the shield adds no AC (untrained)"]
      : []),
  ]
    .map((cost) => `, ${cost}`)
    .join("");
}

function compareWith(
  id: ItemId,
  character: CharacterSheet,
): readonly string[] | undefined {
  if (character.equipment.includes(id) || isToolId(id)) {
    return undefined;
  }
  // Loot and wares are compared as if carried already.
  const gear = {
    equipment: character.equipment,
    stowed: character.stowed.includes(id)
      ? character.stowed
      : [...character.stowed, id],
  };
  const weapon = isWeaponId(id);
  const verb = weapon ? "wielded" : isShieldId(id) ? "carried" : "worn";
  const change = weapon ? swapWeapon(gear, id) : equipItem(gear, id);
  if (change.refusal !== undefined) {
    return [
      `Can't be ${verb} with what you have now: ${change.refusal.reason}`,
    ];
  }
  const now = characterProfile(character);
  const then = characterProfile({
    ...character,
    equipment: change.gear.equipment,
  });
  if (weapon) {
    const { weaponProficiencies } = trainingOf(
      classOf(character),
      character.divineOrder,
    );
    return [
      `If wielded: ${attacksLine(then)}${proficientWith(weaponProficiencies, id) ? "" : ", not proficient"}`,
      `Now: ${attacksLine(now)}`,
    ];
  }
  // A shield takes the second hand from a versatile weapon.
  const attacks = (profile: CharacterProfile) =>
    attacksLine(then) === attacksLine(now) ? "" : `; ${attacksLine(profile)}`;
  return [
    `If ${verb}: AC ${then.armorClass}${armourCosts(then, change.gear.equipment)}${attacks(then)}`,
    `Now: AC ${now.armorClass}${armourCosts(now, character.equipment)}${attacks(now)}`,
  ];
}

/**
 * The stats of catalogue gear: a weapon's damage, properties and mastery,
 * armour's AC, Strength and Stealth, a tool's use, and weight. For a
 * character, whether it is proficient or trained and, with `compare`, what
 * equipping it would do. Undefined for ammunition, whose entry says enough.
 */
export function itemStats(
  id: CatalogueId,
  character?: CharacterSheet,
  options: Readonly<{ compare?: boolean }> = {},
): ItemStats | undefined {
  if (isWeaponId(id) || isArmourId(id)) {
    const facts = isWeaponId(id)
      ? weaponFacts(id, character)
      : armourFacts(id, character);
    const compare =
      character === undefined || options.compare === false
        ? undefined
        : compareWith(id, character);
    return { facts, ...(compare === undefined ? {} : { compare }) };
  }
  if (isToolId(id)) {
    return { facts: ["Tool: used from your pack, never equipped", pounds(id)] };
  }
  return undefined;
}
