// Engine journeys through a shipped module for its content test (#275): a
// fighter follows a fixed route of engine actions and fights each fight as
// the release handoffs tell the owner to, or, for a browser test's seed, as
// the browser tests click.
import { characterProfile } from "../../dist/character-5e.js";
import { createSeededRandom } from "../../dist/random.js";
import { createFifthRuntime } from "../../dist/runtime-5e.js";
import { sessionSeed } from "../../dist/session-5e.js";
import { engineAction } from "./playthroughs.mjs";

const PLAYER = "pc";

/**
 * The route's shorthand as engine actions: `["move", roomId]` (or
 * `["sneak", roomId]`, #301) and the rest,
 * with `["ambush", roomId]` (#302) springing an ambush from unseen,
 * `["force", doorId]` (#289) forcing a stuck door, `["pick", doorId]`,
 * `["break", doorId]` and `["unlock", doorId]` (#311) opening a locked one
 * (with `undefined, true` after the door, another try at it),
 * `["talk", topicId, approach]` (#291) asking about a topic with a check,
 * `["react", option, approach]` (#311) answering a reaction,
 * `["examine", featureId, approach]` (#350) choosing a check's approach
 * (with `true` after the approach, another try at it, #445),
 * `["long-rest"]` and `["rest", hitDice]` (#350) resting, and
 * `["equip", itemId]` or `["swap", itemId]` (#350) wielding found gear and
 * `["read", itemId, spellId]` (#350) reading a held scroll on oneself, and
 * `["use", featureId, itemId]` (#412) using a carried item on a feature,
 * and `["search", roomId]` and `["disarm", trapId]` (#445) finding and
 * disarming a trap, and `["buy", itemId]` and `["sell-treasure", itemId]`
 * (#512) trading with the merchant here.
 */
export function routeAction([type, target, approach, retry]) {
  switch (type) {
    case "move":
    case "sneak":
      return { type, destinationId: target };
    case "examine":
      return {
        type,
        targetId: target,
        ...(approach === undefined ? {} : { approach }),
        ...(retry ? { retry: true } : {}),
      };
    case "long-rest":
      return { type };
    case "rest":
      return { type, hitDice: target };
    case "equip":
    case "swap":
      return { type, itemId: target };
    case "read":
      return {
        type: "cast",
        actorId: PLAYER,
        spellId: approach,
        targetIds: [PLAYER],
        itemId: target,
      };
    case "take":
    case "buy":
    case "sell-treasure":
      return { type, itemId: target };
    case "search":
      return { type, roomId: target };
    case "disarm":
      return { type, trapId: target };
    case "use":
      return { type: "use-on", featureId: target, itemId: approach };
    case "leave":
    case "ambush":
      return { type, roomId: target };
    case "force":
    case "pick":
    case "break":
    case "unlock":
      return { type, doorId: target, ...(retry ? { retry: true } : {}) };
    case "talk":
      return { type, topicId: target, approach };
    case "react":
      return {
        type,
        option: target,
        ...(approach === undefined ? {} : { approach }),
      };
    default:
      throw new Error(`no route action ${type}`);
  }
}

/** The engine action for a projected cast, from a scroll or wand too (#346). */
const castAction = (view) => ({
  ...engineAction(view),
  ...(view.spell?.item === undefined ? {} : { itemId: view.spell.item.id }),
});

/**
 * One fight turn: a hit a reaction could answer is taken (#350); at half HP
 * or less, Second Wind, or else drink a potion;
 * otherwise, with `cast`, cast the first spell offered, or with a `cast`
 * function the offered action it picks from the views (#350), or attack the
 * first opponent offered, then make the extra attack
 * with a second light weapon (#311, as the browser's first attack button
 * does), and end the turn once both are spent. The first of these the
 * runtime accepts.
 */
function fightTurn(runtime, state, random, maxHp, potions, heal, cast) {
  const [target] = runtime.attackTargets(state);
  // A caster (#350) casts the first spell offered, as the Cast panel starts,
  // or what its chooser picks.
  const views = runtime.projectActions(state);
  const spell =
    typeof cast === "function"
      ? cast(views, state)
      : cast
        ? views.find(({ action, available }) => action === "cast" && available)
        : undefined;
  // The extra attack's target, offered once the attack is spent.
  const light = views.find(
    ({ action, available }) => action === "light-attack" && available,
  );
  const potion = state.inventory.find((id) => potions.has(id));
  const choices = [
    // A hit a reaction could answer (a Wizard's Shield, #340) is taken.
    { type: "take-hit", actorId: PLAYER },
    ...(heal && state.character.hp * 2 <= maxHp
      ? [
          { type: "second-wind", actorId: PLAYER },
          ...(potion === undefined
            ? []
            : [{ type: "use-item", itemId: potion }]),
        ]
      : []),
    ...(spell === undefined ? [] : [castAction(spell)]),
    ...(target === undefined
      ? []
      : [{ type: "attack", actorId: PLAYER, targetId: target.id }]),
    ...(light === undefined
      ? []
      : [{ type: "light-attack", actorId: PLAYER, targetId: light.target.id }]),
    { type: "end-turn", actorId: PLAYER },
    // Last Stand (#499) refuses everything else: a journey that heals has
    // drunk its potion above; one that doesn't falls, as before.
    { type: "fall", actorId: PLAYER },
  ];
  for (const action of choices) {
    const result = runtime.handleAction(state, action, random);
    if (result.rejection === undefined) {
      return result.state;
    }
  }
  throw new Error("no fight action was accepted");
}

/**
 * Plays `route` on `seed` from a new session of `adventure` with `sheet`,
 * fighting each fight to its end as it starts. Stops once the adventure
 * ends; throws if the runtime refuses a route step. With `browser`, `seed`
 * is the browser server's: the dice are its first session's, and each fight
 * is clicked as `fight` in browser-journey.mjs clicks it, attacking the
 * first target or ending the turn, never healing. With `cast`, each fight
 * turn first casts the first spell offered, or what a `cast` function picks
 * (#350).
 */
export function journey(
  adventure,
  sheet,
  seed,
  route,
  { browser = false, cast = false } = {},
) {
  const runtime = createFifthRuntime(adventure, sheet);
  const random = createSeededRandom(browser ? sessionSeed(seed, 1) : seed);
  const { maxHp } = characterProfile(sheet);
  const potions = new Set(
    adventure.rooms.flatMap(({ items }) =>
      items.flatMap(({ id, kind }) => (kind.startsWith("potion") ? [id] : [])),
    ),
  );
  const fight = (start) => {
    let state = start;
    while (
      state.status === "playing" &&
      state.encounter?.outcome === "ongoing"
    ) {
      state = fightTurn(runtime, state, random, maxHp, potions, !browser, cast);
    }
    return state;
  };
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  for (const step of route) {
    if (state.status !== "playing") {
      break;
    }
    const result = runtime.handleAction(state, routeAction(step), random);
    if (result.rejection !== undefined) {
      throw new Error(`${step.join(" ")}: ${result.rejection.reason}`);
    }
    state = fight(result.state);
  }
  return { state, runtime };
}

/**
 * The first seed from 0 whose journey ends as `wanted` says, searched up to
 * `limit`: the journey, with its seed. Searching keeps a content test from
 * pinning a seed that any change to the dice order would move. A seed whose
 * journey the runtime refuses partway (a foe that fled leaves no body to
 * examine) is passed over.
 */
export function firstJourney(
  adventure,
  sheet,
  route,
  wanted,
  { limit = 100, browser = false, cast = false } = {},
) {
  for (let seed = 0; seed < limit; seed += 1) {
    let played;
    try {
      played = journey(adventure, sheet, seed, route, { browser, cast });
    } catch {
      continue;
    }
    if (wanted(played.state)) {
      return { ...played, seed };
    }
  }
  throw new Error(`no seed below ${limit} ends as wanted`);
}

/** The XP awards a surviving ending credits, as [name, xp] pairs. */
export const xpOf = (runtime, state) =>
  runtime.projectSettlement(state).xp.map(({ name, xp }) => [name, xp]);
