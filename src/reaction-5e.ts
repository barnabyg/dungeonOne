/**
 * Reaction rolls (#304), a house rule on top of 5e.
 *
 * When a reaction-eligible fight would begin with no one surprised, the
 * engine rolls 2d6 + the character's Charisma modifier and looks the total
 * up in `REACTION_TABLE`, the one editable table of bands: hostile,
 * unfriendly, uncertain, indifferent or friendly. A hostile band always
 * fights; every other band offers only the options its module authors, from
 * `REACTION_OPTIONS`. A parley (#305) may move the band up or down
 * (`shiftedBand`).
 */
import type { RandomSource } from "./random.js";

export const REACTION_BANDS = [
  "hostile",
  "unfriendly",
  "uncertain",
  "indifferent",
  "friendly",
] as const;
export type ReactionBand = (typeof REACTION_BANDS)[number];

/** The bands a module authors options for: every band but hostile. */
export type AuthoredReactionBand = Exclude<ReactionBand, "hostile">;
export const AUTHORED_REACTION_BANDS: readonly AuthoredReactionBand[] =
  REACTION_BANDS.filter(
    (band): band is AuthoredReactionBand => band !== "hostile",
  );

/**
 * The reaction table: each band and the highest total that lands in it; the
 * last band takes every higher total. Change the numbers here to retune it.
 */
export const REACTION_TABLE: readonly Readonly<{
  band: ReactionBand;
  upTo?: number;
}>[] = [
  { band: "hostile", upTo: 2 },
  { band: "unfriendly", upTo: 5 },
  { band: "uncertain", upTo: 8 },
  { band: "indifferent", upTo: 11 },
  { band: "friendly" },
];

/**
 * What a band may offer: attack (the fight begins), let pass (the encounter
 * ends peacefully), and (#305) parley (a Persuasion, Deception or
 * Intimidation check whose band may move the reaction), toll (pay to pass,
 * ending the encounter peacefully) and trade (the opponents act as a
 * merchant while the band holds). Trade is open, not chosen: it ends
 * nothing.
 */
export const REACTION_OPTIONS = [
  "attack",
  "let-pass",
  "parley",
  "toll",
  "trade",
] as const;
export type ReactionOption = (typeof REACTION_OPTIONS)[number];

/** Each option as the player sees it. */
export const REACTION_OPTION_NAMES: Readonly<Record<ReactionOption, string>> = {
  attack: "Attack",
  "let-pass": "Pass peacefully",
  parley: "Parley",
  toll: "Pay the toll",
  trade: "Trade",
};

/** The options that end the encounter without a fight. */
export const PEACEFUL_OPTIONS: readonly ReactionOption[] = ["let-pass", "toll"];

/** The skills a parley is made with (#305). */
export const PARLEY_SKILLS = [
  "persuasion",
  "deception",
  "intimidation",
] as const;
export type ParleySkill = (typeof PARLEY_SKILLS)[number];

/**
 * What a parley's band may do besides its words (#305): end the encounter
 * peacefully, begin the fight, or (on a failure by 5 or more only) begin it
 * with the character surprised.
 */
export const PARLEY_OUTCOMES = [
  "let-pass",
  "fight",
  "surprise-attack",
] as const;
export type ParleyOutcome = (typeof PARLEY_OUTCOMES)[number];

/**
 * The band `by` steps from `band` (#305): up toward friendly, down toward
 * hostile, stopping at either end.
 */
export function shiftedBand(band: ReactionBand, by: number): ReactionBand {
  const index = REACTION_BANDS.indexOf(band) + by;
  return REACTION_BANDS[
    Math.min(REACTION_BANDS.length - 1, Math.max(0, index))
  ]!;
}

export type ReactionRoll = Readonly<{
  /** The two d6s. */
  dice: readonly [number, number];
  /** The character's Charisma modifier. */
  charisma: number;
  total: number;
  band: ReactionBand;
}>;

/** The band a reaction total lands in. */
export function reactionBand(total: number): ReactionBand {
  return REACTION_TABLE.find(({ upTo }) => upTo === undefined || total <= upTo)!
    .band;
}

/** Rolls 2d6 + `charisma` and finds its band. */
export function rollReaction(
  charisma: number,
  random: Pick<RandomSource, "roll">,
): ReactionRoll {
  const dice = [random.roll(6), random.roll(6)] as const;
  const total = dice[0] + dice[1] + charisma;
  return { dice, charisma, total, band: reactionBand(total) };
}
