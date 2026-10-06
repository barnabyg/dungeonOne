/**
 * The #140 release run: The Abandoned Delve played from start to an ending
 * through a browser server's API, every turn typed to the AI DM as a player
 * would. It visits every room, fights every encounter, loots every treasure
 * and climbs out.
 *
 * Each route step names the action-bar action it wants and the words a
 * player would type for it. When the AI DM's turn leaves that action still
 * to do (it asked a question, refused or chose something else), the run
 * takes it with its button instead and records the fallback, so one miss
 * never strands the rest of the run. Leave has no AI tool (#156), so the
 * last step is a button press. Fights pick from the action bar each turn:
 * heal at half HP or less, otherwise attack the first opponent offered.
 */
import { postToServer } from "./dm-evaluation-5e.js";
import {
  PLAYER_ID,
  type ActionKind,
  type ActionView,
  type RoomView,
} from "./runtime-5e.js";

/** One planned action, and what a player would type for it. */
export type ReleaseStep = Readonly<{
  action: ActionKind;
  target?: string;
  /** Undefined for a button-only action (Leave). */
  say?: string;
}>;

/** The parts of the browser server's session view the run reads. */
export type ReleaseSessionView = Readonly<{
  id: string;
  sequence: number;
  status: string;
  room: RoomView;
  actions: readonly ActionView[];
  ending?: Readonly<{
    kind: string;
    title: string;
    rewards?: Readonly<{
      totalXp: number;
      level: number;
      treasure: readonly Readonly<{ name: string }>[];
    }>;
  }>;
  history: readonly Readonly<{
    player?: string;
    reply: string;
    cards: readonly Readonly<{ kind: string; text: string }>[];
  }>[];
}>;

/** What one step did. */
export type ReleaseTurn = Readonly<{
  phase: "explore" | "fight";
  room: string;
  intent: string;
  message?: string;
  /** Present when the step was not offered, with the action bar's reason. */
  skipped?: string;
  /** The AI DM's turn committed an action. */
  committed: boolean;
  /** The AI DM's turn did what the step wanted. */
  matched: boolean;
  /** The step's button was pressed after the AI DM's turn. */
  fallback: boolean;
  reply?: string;
  cards: readonly Readonly<{ kind: string; text: string }>[];
  hp: number;
}>;

/** The whole dungeon, in play order; fights run between steps. */
export const DELVE_FULL_ROUTE: readonly ReleaseStep[] = Object.freeze([
  {
    action: "examine",
    target: "chalk-marks",
    say: "Read the chalk marks on the gatepost.",
  },
  {
    action: "move",
    target: "gate-hall",
    say: "Head through the gate into the hall.",
  },
  {
    action: "force",
    target: "swollen-door",
    say: "Put my shoulder to the swollen door and force it.",
  },
  { action: "move", target: "storeroom", say: "Go into the storeroom." },
  {
    action: "examine",
    target: "old-barrel",
    say: "Open the sealed barrel and look inside.",
  },
  {
    action: "take",
    target: "barrel-potion",
    say: "Take the potion out of the barrel.",
  },
  { action: "move", target: "gate-hall", say: "Back out to the gate hall." },
  { action: "move", target: "guard-post", say: "Go to the guard post." },
  {
    action: "examine",
    target: "weapon-rack",
    say: "Search the weapon rack.",
  },
  {
    action: "take",
    target: "rack-potion",
    say: "Grab the vial from behind the spears.",
  },
  { action: "examine", target: "zombie", say: "Search the zombie's body." },
  { action: "take", target: "guard-purse", say: "Take the guard's purse." },
  { action: "move", target: "gate-hall", say: "Return to the gate hall." },
  {
    action: "move",
    target: "barracks",
    say: "Go through the arch into the barracks.",
  },
  {
    action: "examine",
    target: "footlocker",
    say: "Rummage through the footlocker.",
  },
  { action: "take", target: "dagger-hilt", say: "Take the dagger hilt." },
  { action: "move", target: "gate-hall", say: "Head back to the gate hall." },
  { action: "move", target: "guard-post", say: "Go to the guard post." },
  {
    action: "move",
    target: "dry-well",
    say: "Squeeze through the narrow way to the well.",
  },
  {
    action: "talk",
    target: "the-vault",
    say: "Ask the goblin what it knows about the vault.",
  },
  {
    action: "talk",
    target: "the-stair",
    say: "Talk the goblin into telling me about the stair.",
  },
  {
    action: "search",
    target: "dry-well",
    say: "Check the stair down for traps before I use it.",
  },
  { action: "disarm", target: "loose-step", say: "Disarm the loose step." },
  {
    action: "move",
    target: "shrine",
    say: "Go down the stair to the shrine.",
  },
  { action: "examine", target: "altar", say: "Look over the altar." },
  { action: "take", target: "bronze-key", say: "Take the bronze key." },
  {
    action: "take",
    target: "candlesticks",
    say: "Take the silver candlesticks too.",
  },
  {
    action: "move",
    target: "shaft-bottom",
    say: "Follow the passage toward daylight.",
  },
  {
    action: "examine",
    target: "knotted-rope",
    say: "Test the knotted rope.",
  },
  {
    action: "move",
    target: "web-crypt",
    say: "Push through the webs into the crypt.",
  },
  {
    action: "examine",
    target: "cocoon",
    say: "Cut open the hanging cocoon.",
  },
  { action: "take", target: "gold-ring", say: "Take the gold ring." },
  {
    action: "move",
    target: "shaft-bottom",
    say: "Go back to the bottom of the shaft.",
  },
  {
    action: "unlock",
    target: "vault-door",
    say: "Unlock the vault door with the bronze key.",
  },
  { action: "move", target: "vault", say: "Go into the vault." },
  {
    action: "examine",
    target: "iron-chest",
    say: "Look in the iron chest.",
  },
  { action: "take", target: "coin-chest", say: "Scoop up the gold coins." },
  { action: "examine", target: "ghoul", say: "Search the ghoul's body." },
  {
    action: "take",
    target: "jewelled-goblet",
    say: "Take the jewelled goblet.",
  },
  {
    action: "move",
    target: "shaft-bottom",
    say: "Back to the shaft and the rope.",
  },
  { action: "leave", target: "shaft-bottom" },
]);

/** Whether the action bar is a fight's: it always offers End turn. */
export const inFight = (view: ReleaseSessionView): boolean =>
  view.actions.some(({ action }) => action === "end-turn");

/**
 * The fight action to take now: at half HP or less, Second Wind or else a
 * potion (each a bonus action); otherwise an attack on the first opponent
 * offered; with the action spent, Action Surge; and End turn when nothing
 * else is left.
 */
export function chooseFightStep(view: ReleaseSessionView): ReleaseStep {
  const offered = (kind: ActionKind) =>
    view.actions.find(({ action, available }) => action === kind && available);
  const { hp, maxHp } = view.room.character;
  const heal =
    hp * 2 <= maxHp ? (offered("second-wind") ?? offered("use")) : undefined;
  const chosen =
    heal ?? offered("attack") ?? offered("action-surge") ?? offered("end-turn");
  if (chosen === undefined) {
    throw new Error("The fight offers no action.");
  }
  const target = chosen.target;
  const say: Partial<Record<ActionKind, string>> = {
    attack: `Attack the ${target?.name}.`,
    use: `Drink the ${target?.name}.`,
    "second-wind": "Catch my breath with Second Wind.",
    "action-surge": "Use Action Surge.",
    "end-turn": "End my turn.",
  };
  return {
    action: chosen.action,
    ...(target === undefined ? {} : { target: target.id }),
    say: say[chosen.action]!,
  };
}

const findAction = (view: ReleaseSessionView, step: ReleaseStep) =>
  view.actions.find(
    ({ action, target }) =>
      action === step.action && target?.id === step.target,
  );

/**
 * Whether `step` is done in `after`: a move is done in its destination; an
 * examination (which stays offered, to read again) once the room shows what
 * it found; anything else once its action is no longer available in the
 * room it was taken in. A fight step is done by any committed action.
 */
function stepDone(
  before: ReleaseSessionView,
  after: ReleaseSessionView,
  step: ReleaseStep,
  phase: ReleaseTurn["phase"],
): boolean {
  if (phase === "fight") {
    return after.sequence > before.sequence;
  }
  if (step.action === "move") {
    return after.room.id === step.target;
  }
  if (step.action === "examine") {
    return after.room.features.some(
      ({ id, discovery }) => id === step.target && discovery !== undefined,
    );
  }
  return (
    after.status !== "playing" ||
    (after.room.id === before.room.id && !findAction(after, step)?.available)
  );
}

/** Presses `step`'s button, as the browser page does. */
async function click(
  url: string,
  view: ReleaseSessionView,
  step: ReleaseStep,
): Promise<ReleaseSessionView> {
  const base = { sessionId: view.id, sequence: view.sequence };
  const [path, body] =
    step.action === "attack"
      ? [
          "/api/5e/session/attack",
          { ...base, actorId: PLAYER_ID, targetId: step.target },
        ]
      : step.target === undefined
        ? ["/api/5e/session/action", { ...base, action: step.action }]
        : [
            "/api/5e/session/explore",
            { ...base, action: step.action, target: step.target },
          ];
  return post(url, path, body);
}

async function post(
  url: string,
  path: string,
  body: unknown,
): Promise<ReleaseSessionView> {
  const result = await postToServer<{
    session?: ReleaseSessionView;
    error?: string;
  }>(url, path, body);
  if (result.status !== 200 || result.body.session === undefined) {
    throw new Error(`${path} failed: ${JSON.stringify(result.body)}`);
  }
  return result.body.session;
}

/**
 * Plays `route` from `session` through the browser server at `url`, typing
 * each step to its AI DM and fighting each fight, until the adventure ends,
 * the route runs out or `maxTurns` steps have been taken. `onTurn` sees
 * each step's record as it is made.
 */
export async function playReleaseRun(options: {
  url: string;
  session: ReleaseSessionView;
  route?: readonly ReleaseStep[];
  maxTurns?: number;
  onTurn?: (turn: ReleaseTurn) => void;
}): Promise<
  Readonly<{ session: ReleaseSessionView; turns: readonly ReleaseTurn[] }>
> {
  const { url, route = DELVE_FULL_ROUTE, maxTurns = 400 } = options;
  let view = options.session;
  const turns: ReleaseTurn[] = [];
  const record = (turn: ReleaseTurn) => {
    turns.push(turn);
    options.onTurn?.(turn);
  };
  const takeStep = async (
    current: ReleaseSessionView,
    step: ReleaseStep,
    phase: ReleaseTurn["phase"],
  ): Promise<ReleaseSessionView> => {
    const intent = `${step.action}${step.target === undefined ? "" : ` ${step.target}`}`;
    const room = current.room.id;
    const offered = findAction(current, step);
    if (!offered?.available) {
      record({
        phase,
        room,
        intent,
        skipped: offered?.reason ?? "Not offered",
        committed: false,
        matched: false,
        fallback: false,
        cards: [],
        hp: current.room.character.hp,
      });
      return current;
    }
    let reply: string | undefined;
    let cards: ReleaseTurn["cards"] = [];
    const typed =
      step.say === undefined
        ? current
        : await post(url, "/api/5e/session/message", {
            sessionId: current.id,
            sequence: current.sequence,
            message: step.say,
          });
    if (typed !== current) {
      const entry = typed.history.at(-1)!;
      reply = entry.reply;
      cards = entry.cards.map(({ kind, text }) => ({ kind, text }));
    }
    const committed = typed.sequence > current.sequence;
    const matched =
      step.say !== undefined && stepDone(current, typed, step, phase);
    const fallback =
      !matched &&
      typed.status === "playing" &&
      findAction(typed, step)?.available === true;
    const after = fallback ? await click(url, typed, step) : typed;
    if (fallback) {
      cards = [
        ...cards,
        ...after.history
          .at(-1)!
          .cards.map(({ kind, text }) => ({ kind, text })),
      ];
    }
    record({
      phase,
      room,
      intent,
      ...(step.say === undefined ? {} : { message: step.say }),
      committed,
      matched,
      fallback,
      ...(reply === undefined ? {} : { reply }),
      cards,
      hp: after.room.character.hp,
    });
    return after;
  };
  for (const step of route) {
    if (view.status !== "playing" || turns.length >= maxTurns) {
      break;
    }
    view = await takeStep(view, step, "explore");
    while (
      view.status === "playing" &&
      inFight(view) &&
      turns.length < maxTurns
    ) {
      view = await takeStep(view, chooseFightStep(view), "fight");
    }
  }
  return { session: view, turns };
}
