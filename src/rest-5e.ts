/**
 * Rests: a short rest (#334) and a long rest (#335), what each restores, what
 * refuses one, the views of what is left and the AI DM's two tools.
 *
 * `createRests` closes over one adventure and character, and takes the few
 * helpers of the runtime it needs as `RestDeps`. `createFifthRuntime` calls it
 * and dispatches to `restAction`. The import from `runtime-5e.ts` is of types
 * only, so at run time this module doesn't depend on the runtime.
 */
import type {
  FifthAdventure,
  FifthEncounter,
  FifthRoom,
} from "./adventure-5e.js";
import {
  abilityModifier,
  ARCANE_RECOVERY,
  arcaneRecovery,
  characterProfile,
  featureUsesName,
  type CharacterSheet,
} from "./character-5e.js";
import { effectEnded, PLAYER_ID, type ActiveEffect } from "./encounter-5e.js";
import { WANDS, wandsSpent, type HeldMagicItem } from "./magic-items-5e.js";
import { need, type RandomSource } from "./random.js";
import type {
  ActionView,
  FifthAction,
  FifthEvent,
  FifthRefusalCode,
  FifthResult,
  FifthState,
} from "./runtime-5e.js";
import type { GameToolDefinition } from "./runtime-contract.js";
import type { GameSettings } from "./settings-5e.js";
import { isSpellId, SPELLS, type SpellId } from "./spells-5e.js";
import { listed } from "./text-5e.js";

/**
 * How many long rests the character may take in one adventure (#335, D1),
 * or in each region of a long module (#404), each only at a rest site.
 */
export const LONG_RESTS_PER_ADVENTURE = 1;

/** The character's hit-dice pool (#333): left of the total, and their size. */
export type HitDiceView = Readonly<{
  available: number;
  total: number;
  sides: number;
}>;

/** A short rest (#334) or a long rest (#335). */
export type RestKind = "short" | "long";

/** Memorize Spell's swap on a short rest (#344). */
export type Memorize = Readonly<{ forget: SpellId; learn: SpellId }>;

/** A spell Memorize Spell may swap out or in (#344). */
export type MemorizeSpell = Readonly<{
  id: SpellId;
  name: string;
  level: number;
}>;

/**
 * The rests of one kind left in the adventure, and the most; in a long
 * module (#404), `per: "region"`: those left in the character's region.
 * Short rests are `unlimited` when the adventure's settings have no limit
 * (#508).
 */
export type RestsView = Readonly<
  { per?: "region" } & (
    | { left: number; max: number; unlimited?: never }
    | { unlimited: true; left?: never; max?: never }
  )
>;

/**
 * "Short rests: 1 of 2 left" (#334) or "Long rests: 1 of 1 left" (#335),
 * with "in this region" in a long module (#404); "Short rests: unlimited"
 * when the settings set no limit (#508).
 */
export function restsText(kind: RestKind, rests: RestsView): string {
  const name = kind === "short" ? "Short" : "Long";
  return rests.unlimited === true
    ? `${name} rests: unlimited`
    : `${name} rests: ${rests.left} of ${rests.max} left${rests.per === "region" ? ` ${restsScope(rests)}` : ""}`;
}

/**
 * "Short rests: 1 of 2 left in this adventure." as the rest events end, or
 * "Short rests: unlimited." (#508).
 */
export function restsLeftText(kind: RestKind, rests: RestsView): string {
  return rests.unlimited === true
    ? `${restsText(kind, rests)}.`
    : `${restsText(kind, { left: rests.left, max: rests.max })} ${restsScope(rests)}.`;
}

/** "in this adventure", or "in this region" in a long module (#404). */
export function restsScope({ per }: RestsView): string {
  return `in this ${per ?? "adventure"}`;
}

/** "Hit dice: 2 of 3 d10 left". */
export function hitDiceText({ available, total, sides }: HitDiceView): string {
  return `Hit dice: ${available} of ${total} d${sides} left`;
}

/** Counts in words, for the AI DM prompt's rest rules (#508). */
export const COUNT_WORDS = ["no", "one", "two", "three", "four"] as const;

/** What rests need from the runtime that made them. */
export type RestDeps = Readonly<{
  adventure: FifthAdventure;
  sheet: CharacterSheet;
  settings: GameSettings;
  baseMaxHp: number;
  maxHpOf: (state: FifthState) => number;
  room: (state: FifthState) => FifthRoom;
  encounterOf: (state: FifthState) => FifthEncounter | undefined;
  settled: (state: FifthState, id: string) => boolean;
  fighting: (state: FifthState) => boolean;
  /** Rolls the watch for a rest, which runs `rest` unless a fight comes. */
  watchedRest: (
    state: FifthState,
    kind: RestKind,
    random: Pick<RandomSource, "roll"> | undefined,
    rest: () => FifthResult,
  ) => FifthResult;
}>;

export function createRests({
  adventure,
  sheet,
  settings,
  baseMaxHp,
  maxHpOf,
  room,
  encounterOf,
  settled,
  fighting,
  watchedRest,
}: RestDeps) {
  /**
   * Whether `place` is a rest site where a long rest may be taken: none is
   * with the long rest setting off (#508).
   */
  const isRestSite = (place: Readonly<{ restSite?: true }>) =>
    settings.longRest === "on" && place.restSite === true;

  /**
   * The feature uses a rest of kind `rest` would restore now: a short rest
   * (#334) or a long rest (#335). Each feature below its most regains what
   * its class data gives for that rest, up to the most.
   */
  const restRecovery = (state: FifthState, rest: RestKind = "short") => {
    const profile = characterProfile(sheet);
    return Object.entries(profile.featureUses).flatMap(
      ([featureId, { max, recovery }]) => {
        const uses = state.character.featureUses[featureId] ?? 0;
        const regains = recovery[rest === "short" ? "shortRest" : "longRest"];
        const restored = Math.min(
          max,
          uses + (regains === "all" ? max : regains),
        );
        return restored > uses
          ? [
              {
                featureId,
                name: featureUsesName(profile, featureId),
                regained: restored - uses,
                uses: restored,
                max,
              },
            ]
          : [];
      },
    );
  };

  /**
   * `state` with each recovered feature's uses (#334, #335) set, and
   * Arcane Recovery's (#340).
   */
  const recover = (
    state: FifthState,
    recovered: readonly Readonly<{ featureId: string; uses: number }>[],
  ): FifthState => ({
    ...state,
    character: {
      ...state.character,
      featureUses: {
        ...state.character.featureUses,
        ...Object.fromEntries(
          recovered.map(({ featureId, uses }) => [featureId, uses]),
        ),
      },
    },
  });

  /** The `uses-regained` event for what a rest recovered, if anything. */
  const regainedEvents = (
    recovered: ReturnType<typeof restRecovery>,
  ): readonly FifthEvent[] =>
    recovered.length === 0
      ? []
      : [{ type: "uses-regained", features: recovered }];

  /**
   * Why no rest of `kind` may be taken here, whatever is left to restore:
   * in a fight, away from a rest site (a long rest, #335), or with foes in
   * the room (#334). Undefined when the place allows it.
   */
  const restBlocked = (
    state: FifthState,
    kind: RestKind,
  ): readonly [FifthRefusalCode, string] | undefined => {
    if (fighting(state)) {
      return ["fighting", "Not while you are fighting."];
    }
    if (kind === "long" && settings.longRest === "off") {
      return ["not-rest-site", "This adventure's settings allow no long rest."];
    }
    if (kind === "long" && !isRestSite(room(state))) {
      return [
        "not-rest-site",
        "You can take a long rest only at a safe place to rest that the adventure marks; this is not one.",
      ];
    }
    const foes = encounterOf(state);
    return foes !== undefined && !settled(state, foes.id)
      ? [
          "hostile-here",
          `Not with ${listed(
            foes.opponents.map(({ name }) => name),
            "and",
          )} here: you can rest only where no foes are left.`,
        ]
      : undefined;
  };

  /**
   * The spells the character has prepared now: the sheet's, or those
   * Memorize Spell (#344) left it with for this adventure.
   */
  const preparedOf = (state: FifthState): readonly SpellId[] =>
    state.character.prepared ??
    characterProfile(sheet).spellcasting?.prepared ??
    [];

  /**
   * What Memorize Spell (#344) may swap on a short rest now: the prepared
   * levelled spells to forget and the spellbook's other levelled spells to
   * prepare instead. Undefined without the feature or a swap to make.
   */
  const memorizeOptions = (
    state: FifthState,
  ):
    | Readonly<{
        forget: readonly MemorizeSpell[];
        learn: readonly MemorizeSpell[];
      }>
    | undefined => {
    const casting = characterProfile(sheet).spellcasting;
    if (casting?.memorizeSpell !== true || casting.spellbook === undefined) {
      return undefined;
    }
    const prepared = preparedOf(state);
    const option = (id: SpellId): MemorizeSpell => ({
      id,
      name: SPELLS[id].name,
      level: SPELLS[id].level,
    });
    const forget = prepared.filter((id) => SPELLS[id].level > 0).map(option);
    const learn = casting.spellbook
      .filter((id) => SPELLS[id].level > 0 && !prepared.includes(id))
      .map(option);
    return forget.length === 0 || learn.length === 0
      ? undefined
      : { forget, learn };
  };

  /**
   * Why Memorize Spell (#344) can't make `memorize`'s swap: the character
   * lacks it, hasn't prepared the spell to forget, or can't prepare the
   * other (a cantrip, one not in its spellbook, or one prepared already).
   */
  const memorizeRefusal = (
    state: FifthState,
    { forget, learn }: Memorize,
  ): readonly [FifthRefusalCode, string] | undefined => {
    const casting = characterProfile(sheet).spellcasting;
    if (casting?.memorizeSpell !== true) {
      return [
        "no-memorize-spell",
        "Memorize Spell comes with a Wizard's 5th level.",
      ];
    }
    const prepared = preparedOf(state);
    if (
      !isSpellId(forget) ||
      SPELLS[forget].level === 0 ||
      !prepared.includes(forget)
    ) {
      return [
        "memorize-forget",
        isSpellId(forget)
          ? `You haven't prepared ${SPELLS[forget].name}, so there is nothing to swap out.`
          : "There is no such spell to swap out.",
      ];
    }
    if (!isSpellId(learn)) {
      return ["memorize-learn", "There is no such spell to prepare."];
    }
    const { name, level } = SPELLS[learn];
    if (level === 0) {
      return [
        "memorize-learn",
        `${name} is a cantrip: Memorize Spell swaps only 1st-level or higher spells.`,
      ];
    }
    if (casting.spellbook?.includes(learn) !== true) {
      return ["memorize-learn", `${name} isn't in your spellbook.`];
    }
    return prepared.includes(learn)
      ? ["memorize-learn", `${name} is prepared already.`]
      : undefined;
  };

  /**
   * The numbers of hit dice a short rest may spend now (#334), fewest
   * first: none only when a feature would regain a use or Memorize Spell
   * (#344) would swap a spell (`memorizing`), and some (up to those left)
   * only while hurt. Empty when a rest would restore nothing.
   */
  const restCounts = (
    state: FifthState,
    memorizing = false,
  ): readonly number[] => {
    const left = state.character.hitDice;
    const recovers =
      memorizing ||
      restRecovery(state).length > 0 ||
      arcaneRecovered(state) !== undefined;
    const hurt = state.character.hp < maxHpOf(state) && left > 0;
    if (!hurt) {
      // At full HP no die is spent: only a rest that spends none.
      return recovers ? [0] : [];
    }
    return [...Array(left + 1).keys()].filter((count) => count > 0 || recovers);
  };

  /**
   * What Arcane Recovery (#340) would regain on a short rest now, after the
   * rest's own recovery, or undefined when it would regain nothing.
   */
  const arcaneRecovered = (state: FifthState) => {
    const recovered = arcaneRecovery(
      characterProfile(sheet),
      recover(state, restRecovery(state)).character.featureUses,
      "short",
    );
    return "regained" in recovered ? recovered.regained : undefined;
  };

  /**
   * The counts after a rest of `kind`: the adventure's and, in a long
   * module (#404), the character's region's.
   */
  const restTaken = (
    state: FifthState,
    kind: RestKind,
  ): Pick<FifthState, "shortRests" | "longRests" | "regionRests"> => {
    const counts =
      kind === "short"
        ? { shortRests: state.shortRests + 1, longRests: state.longRests }
        : { shortRests: state.shortRests, longRests: state.longRests + 1 };
    if (adventure.long !== true) {
      return counts;
    }
    // A long module has regions in every room (the validator's rule).
    const regionId = room(state).region!;
    const taken = state.regionRests?.[regionId] ?? { short: 0, long: 0 };
    return {
      ...counts,
      regionRests: {
        ...state.regionRests,
        [regionId]: { ...taken, [kind]: taken[kind] + 1 },
      },
    };
  };

  /**
   * A short rest (#334), once the engine has accepted it: up to `count` hit
   * dice are spent one at a time, each healing its roll plus the
   * Constitution modifier (at least 0), until HP is full; then each feature
   * regains its short-rest uses.
   */
  const shortRest = (
    state: FifthState,
    count: number,
    random: Pick<RandomSource, "roll"> | undefined,
    memorize?: Memorize,
  ): FifthResult => {
    const dice = need(random, "A short rest");
    const { sides } = characterProfile(sheet).hitDice;
    const modifier = abilityModifier(sheet.abilities.constitution);
    const recovered = restRecovery(state);
    const spent: Extract<FifthEvent, Readonly<{ type: "hit-die" }>>[] = [];
    let { hp } = state.character;
    while (spent.length < count && hp < maxHpOf(state)) {
      const value = dice.roll(sides);
      const healing = Math.min(
        maxHpOf(state) - hp,
        Math.max(0, value + modifier),
      );
      hp += healing;
      spent.push({
        type: "hit-die",
        sides,
        value,
        modifier,
        healing,
        hpAfter: hp,
        maxHp: maxHpOf(state),
      });
    }
    // Arcane Recovery (#340) regains slots once per long rest.
    const arcane = arcaneRecovered(state);
    const arcaneUses =
      (state.character.featureUses[ARCANE_RECOVERY] ?? 0) -
      (arcane === undefined ? 0 : 1);
    // Memorize Spell (#344): the swap, for the rest of the adventure.
    const prepared =
      memorize === undefined
        ? undefined
        : preparedOf(state).map((id) =>
            id === memorize.forget ? memorize.learn : id,
          );
    const next = recover(
      {
        ...state,
        ...restTaken(state, "short"),
        character: {
          ...state.character,
          hp,
          hitDice: state.character.hitDice - spent.length,
          ...(prepared === undefined ? {} : { prepared }),
        },
      },
      [
        ...recovered,
        ...(arcane ?? []).map(({ featureId, uses }) => ({ featureId, uses })),
        ...(arcane === undefined
          ? []
          : [{ featureId: ARCANE_RECOVERY, uses: arcaneUses }]),
      ],
    );
    const ended = restEndsEffects(next, "short");
    return {
      state: ended.state,
      events: [
        {
          type: "short-rest",
          spent: spent.length,
          hitDice: projectHitDice(next),
          shortRests: projectRests(next, "short"),
        },
        ...spent,
        ...regainedEvents(recovered),
        ...(arcane === undefined
          ? []
          : [
              {
                type: "arcane-recovery" as const,
                slots: arcane.map(({ level, count, uses, max }) => ({
                  level,
                  count,
                  uses,
                  max,
                })),
                usesLeft: arcaneUses,
              },
            ]),
        ...(memorize === undefined
          ? []
          : [
              {
                type: "memorized" as const,
                forgot: memorize.forget,
                learned: memorize.learn,
              },
            ]),
        ...ended.events,
      ],
    };
  };

  /**
   * The character's ongoing effects a rest of `kind` ends (#337, D9): a
   * short rest those lasting to the next rest; a long rest those and those
   * lasting to a long rest. An interrupted rest is no rest, and ends none.
   */
  const restEndsEffects = (
    state: FifthState,
    kind: RestKind,
  ): Readonly<{ state: FifthState; events: readonly FifthEvent[] }> => {
    const effects = state.character.effects ?? [];
    // A rest outlasts a fight's minute too: Guidance cast outside a fight
    // (#339) ends with it.
    const ending = ({ ends }: ActiveEffect) =>
      ends === "fight" ||
      ends === "rest" ||
      (kind === "long" && ends === "long-rest");
    if (!effects.some(ending)) {
      return { state, events: [] };
    }
    const { effects: _before, ...character } = state.character;
    void _before;
    const kept = effects.filter((effect) => !ending(effect));
    return {
      state: {
        ...state,
        character:
          kept.length === 0 ? character : { ...character, effects: kept },
      },
      events: effects
        .filter(ending)
        .map((effect) =>
          effectEnded(
            PLAYER_ID,
            effect,
            kind === "short" ? "rest" : "long-rest",
          ),
        ),
    };
  };

  /**
   * Whether a long rest (#335) would restore anything now: hit points, hit
   * dice or a feature use.
   */
  const longRestRestores = (state: FifthState) =>
    state.character.hp < maxHpOf(state) ||
    state.character.hitDice < characterProfile(sheet).hitDice.count ||
    restRecovery(state, "long").length > 0 ||
    // A wand's spent charges (#346), or a used Pearl of Power (#538).
    wandsSpent(state.possessions.magicItems) ||
    (state.pearlsUsed?.length ?? 0) > 0;

  /**
   * Each wand's charges after a long rest (#346, D9's "dawn"): its regain
   * dice, up to its most, with an event for each wand that gained some.
   */
  const rechargeWands = (
    held: readonly HeldMagicItem[],
    random: Pick<RandomSource, "roll"> | undefined,
  ): Readonly<{ held: readonly HeldMagicItem[]; events: FifthEvent[] }> => {
    const events: FifthEvent[] = [];
    const after = held.map((item): HeldMagicItem => {
      if (item.wand === undefined) {
        return item;
      }
      const { charges: most, regain } = WANDS[item.wand];
      if (item.charges >= most) {
        return item;
      }
      const rolls = Array.from({ length: regain.dice }, () =>
        need(random, "Recharging a wand").roll(regain.sides),
      );
      const rolled = rolls.reduce((sum, roll) => sum + roll, regain.modifier);
      const charges = Math.min(most, item.charges + rolled);
      events.push({
        type: "wand-recharged",
        name: WANDS[item.wand].name,
        rolls,
        modifier: regain.modifier,
        regained: charges - item.charges,
        charges,
        max: most,
      });
      return { id: item.id, wand: item.wand, charges };
    });
    return { held: after, events };
  };

  /**
   * A long rest (#335), once the engine has accepted it: every hit point,
   * every hit die and each feature's long-rest uses come back, and each
   * wand regains charges (#346).
   */
  const longRest = (
    state: FifthState,
    random: Pick<RandomSource, "roll"> | undefined,
  ): FifthResult => {
    const recovered = restRecovery(state, "long");
    const total = characterProfile(sheet).hitDice.count;
    const wands = rechargeWands(state.possessions.magicItems, random);
    const next = recover(
      {
        ...state,
        ...restTaken(state, "long"),
        character: { ...state.character, hp: baseMaxHp, hitDice: total },
        possessions: { ...state.possessions, magicItems: wands.held },
        // A Pearl of Power works again (#538).
        ...(state.pearlsUsed === undefined ? {} : { pearlsUsed: [] }),
      },
      recovered,
    );
    const ended = restEndsEffects(next, "long");
    return {
      state: ended.state,
      events: [
        {
          type: "long-rest",
          healing: baseMaxHp - state.character.hp,
          hpAfter: baseMaxHp,
          maxHp: baseMaxHp,
          regainedHitDice: total - state.character.hitDice,
          hitDice: projectHitDice(next),
          longRests: projectRests(next, "long"),
        },
        ...regainedEvents(recovered),
        ...wands.events,
        ...ended.events,
      ],
    };
  };

  const projectHitDice = (state: FifthState): HitDiceView => {
    const { count, sides } = characterProfile(sheet).hitDice;
    return { available: state.character.hitDice, total: count, sides };
  };

  /**
   * The rests of `kind` left: in the adventure, or in the character's
   * region of a long module (#404).
   */
  const projectRests = (state: FifthState, kind: RestKind): RestsView => {
    // The short rests are the adventure's setting (#508).
    const max =
      kind === "short" ? settings.shortRests : LONG_RESTS_PER_ADVENTURE;
    if (max === "unlimited") {
      return {
        unlimited: true,
        ...(adventure.long === true ? { per: "region" as const } : {}),
      };
    }
    if (adventure.long !== true) {
      return {
        left: max - (kind === "short" ? state.shortRests : state.longRests),
        max,
      };
    }
    const taken = state.regionRests?.[room(state).region!]?.[kind] ?? 0;
    return { left: max - taken, max, per: "region" };
  };
  /**
   * The refusal of a short rest with none left: those the adventure's
   * settings allow (#508), in the adventure or the character's region.
   */
  const noShortRestsLeft = (): string => {
    const allowed = settings.shortRests;
    if (allowed === 0) {
      return "This adventure's settings allow no short rests.";
    }
    const taken = `the ${COUNT_WORDS[allowed as 1 | 2 | 3 | 4]} short ${allowed === 1 ? "rest" : "rests"}`;
    return adventure.long === true
      ? `You have taken ${taken} each region allows: rest again in another region.`
      : `You have taken ${taken} an adventure allows.`;
  };
  /** Whether the module has a rest site (#335), where a long rest may be taken. */
  const hasRestSite = adventure.rooms.some(isRestSite);

  /** The long_rest tool (#335), offered while the engine accepts a long rest. */
  const longRestTool = (
    state: FifthState,
    actions: readonly ActionView[],
  ): readonly GameToolDefinition[] =>
    actions.some(({ action, available }) => action === "long-rest" && available)
      ? [
          {
            type: "function",
            name: "long_rest",
            description: `Only when the player asks for a long rest, to sleep, make camp or rest for the night here: take ${adventure.long === true ? "this region's" : "the adventure's"} one long rest (${restsText("long", projectRests(state, "long")).toLowerCase()}). The engine restores every hit point, every hit die and the feature uses a long rest brings back.`,
            strict: true,
            parameters: {
              type: "object",
              properties: {},
              required: [],
              additionalProperties: false,
            },
          },
        ]
      : [];

  /** The rest tool (#334), with the numbers of hit dice the engine accepts. */
  const restTool = (
    state: FifthState,
    actions: readonly ActionView[],
  ): readonly GameToolDefinition[] => {
    const offer = actions.find(
      ({ action, available }) => action === "rest" && available,
    );
    if (offer?.rest === undefined) {
      return [];
    }
    const rests = projectRests(state, "short");
    // Memorize Spell (#344), for a level-5 Wizard.
    const { memorize } = offer.rest;
    const spellIds = (spells: readonly MemorizeSpell[]) => [
      ...spells.map(({ id }) => id),
      null,
    ];
    return [
      {
        type: "function",
        name: "rest",
        description: `Only when the player asks to rest, take a breather, bind their wounds or recover: take a short rest (${rests.unlimited === true ? "short rests are unlimited" : `${rests.left} of ${rests.max} short rests left ${restsScope(rests)}`}). The engine spends up to hit_dice of the character's hit dice one at a time (${hitDiceText(projectHitDice(state)).toLowerCase()}), each healing its roll + the Constitution modifier, and stops once HP is full; then it restores the feature uses a short rest brings back.${memorize === undefined ? "" : " With the rest, Memorize Spell may swap one prepared spell (forget_spell) for another in the spellbook (learn_spell) until the adventure ends: only when the player asks for it, both from those listed; otherwise null for both."}`,
        strict: true,
        parameters: {
          type: "object",
          properties: {
            hit_dice: {
              type: "integer",
              enum: offer.rest.hitDice,
              description:
                "How many hit dice the player asks to spend; the most listed when they name no number.",
            },
            ...(memorize === undefined
              ? {}
              : {
                  forget_spell: {
                    type: ["string", "null"],
                    enum: spellIds(memorize.forget),
                    description: `The prepared spell Memorize Spell swaps out, or null for no swap: ${memorize.forget.map(({ id, name }) => `${id} (${name})`).join(", ")}.`,
                  },
                  learn_spell: {
                    type: ["string", "null"],
                    enum: spellIds(memorize.learn),
                    description: `The spellbook's spell Memorize Spell prepares in its place, or null for no swap: ${memorize.learn.map(({ id, name }) => `${id} (${name})`).join(", ")}.`,
                  },
                }),
          },
          required: [
            "hit_dice",
            ...(memorize === undefined ? [] : ["forget_spell", "learn_spell"]),
          ],
          additionalProperties: false,
        },
      },
    ];
  };

  /** A `rest` or `long-rest` action, refused through `reject` or taken. */
  const restAction = (
    state: FifthState,
    action: Extract<FifthAction, Readonly<{ type: "rest" | "long-rest" }>>,
    random: Pick<RandomSource, "roll"> | undefined,
    reject: (code: FifthRefusalCode, reason: string) => FifthResult,
  ): FifthResult => {
    switch (action.type) {
      case "rest": {
        const blocked = restBlocked(state, "short");
        if (blocked !== undefined) {
          return reject(...blocked);
        }
        if (projectRests(state, "short").left === 0) {
          return reject("no-rests-left", noShortRestsLeft());
        }
        // Memorize Spell's swap (#344) is checked before any die.
        const unswappable =
          action.memorize === undefined
            ? undefined
            : memorizeRefusal(state, action.memorize);
        if (unswappable !== undefined) {
          return reject(...unswappable);
        }
        const left = state.character.hitDice;
        if (action.hitDice > left) {
          return reject(
            "too-many-hit-dice",
            left === 0
              ? "You have no hit dice left to spend."
              : `You have only ${left} ${left === 1 ? "hit die" : "hit dice"} left to spend.`,
          );
        }
        if (
          !restCounts(state, action.memorize !== undefined).includes(
            action.hitDice,
          )
        ) {
          return reject(
            "nothing-to-recover",
            state.character.hp === maxHpOf(state)
              ? restRecovery(state).length > 0
                ? "You are at full health: a rest spends no hit dice."
                : "You are at full health with every feature use: a rest would restore nothing."
              : left === 0
                ? "You have no hit dice left and every feature use: a rest would restore nothing."
                : "A rest that spends no hit dice would restore nothing: you have every feature use.",
          );
        }
        return watchedRest(state, "short", random, () =>
          shortRest(state, action.hitDice, random, action.memorize),
        );
      }
      case "long-rest": {
        const blocked = restBlocked(state, "long");
        if (blocked !== undefined) {
          return reject(...blocked);
        }
        if (projectRests(state, "long").left === 0) {
          return reject(
            "no-long-rests-left",
            adventure.long === true
              ? "You have taken the one long rest each region allows: rest again in another region."
              : "You have taken the one long rest an adventure allows.",
          );
        }
        if (!longRestRestores(state)) {
          return reject(
            "nothing-to-recover",
            "You are at full health with every hit die and feature use: a long rest would restore nothing.",
          );
        }
        return watchedRest(state, "long", random, () =>
          longRest(state, random),
        );
      }
    }
  };

  return {
    isRestSite,
    hasRestSite,
    restRecovery,
    recover,
    regainedEvents,
    preparedOf,
    memorizeOptions,
    restCounts,
    longRestRestores,
    projectHitDice,
    projectRests,
    longRestTool,
    restTool,
    restAction,
  };
}
