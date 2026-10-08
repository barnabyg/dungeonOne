// Engine journeys through a shipped module for its content test (#275): a
// fighter follows a fixed route of engine actions and fights each fight as
// the release handoffs tell the owner to.
import { fighterProfile } from "../../dist/fighter-5e.js";
import { createSeededRandom } from "../../dist/random.js";
import { createFifthRuntime } from "../../dist/runtime-5e.js";

const PLAYER = "pc";

/** The route's shorthand as engine actions: `["move", "bothy"]` and the rest. */
export function routeAction([type, target]) {
  switch (type) {
    case "move":
      return { type, destinationId: target };
    case "examine":
      return { type, targetId: target };
    case "take":
      return { type, itemId: target };
    case "leave":
      return { type, roomId: target };
    default:
      throw new Error(`no route action ${type}`);
  }
}

/**
 * One fight turn: at half HP or less, Second Wind, or else drink a potion;
 * otherwise attack the first opponent offered, and end the turn once the
 * action is spent. The first of these the runtime accepts.
 */
function fightTurn(runtime, state, random, maxHp, potions) {
  const [target] = runtime.attackTargets(state);
  const potion = state.inventory.find((id) => potions.has(id));
  const choices = [
    ...(state.character.hp * 2 <= maxHp
      ? [
          { type: "second-wind", actorId: PLAYER },
          ...(potion === undefined
            ? []
            : [{ type: "use-item", itemId: potion }]),
        ]
      : []),
    ...(target === undefined
      ? []
      : [{ type: "attack", actorId: PLAYER, targetId: target.id }]),
    { type: "end-turn", actorId: PLAYER },
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
 * ends; throws if the runtime refuses a route step.
 */
export function journey(adventure, sheet, seed, route) {
  const runtime = createFifthRuntime(adventure, sheet);
  const random = createSeededRandom(seed);
  const { maxHp } = fighterProfile(sheet);
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
      state = fightTurn(runtime, state, random, maxHp, potions);
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
export function firstJourney(adventure, sheet, route, wanted, limit = 100) {
  for (let seed = 0; seed < limit; seed += 1) {
    let played;
    try {
      played = journey(adventure, sheet, seed, route);
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
