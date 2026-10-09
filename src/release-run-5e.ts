/**
 * The release runs: a module played from start to an ending through a
 * browser server's API, every turn typed to the AI DM as a player would.
 * The #140 run visits every room of The Abandoned Delve, fights every
 * encounter, loots every treasure and coin and climbs out. The #211 run
 * clears The Tinker's Toll, equips the shield it finds, buys and wields a
 * shortsword with the coin it finds, sells its mace and walks out. The #311
 * run takes a Rogue through The Counting-House on Mallow Quay: a parley and a
 * toll, a sneak past a lurking goblin and an ambush, and a picked lock.
 *
 * Each route step names the action-bar action it wants and the words a
 * player would type for it. When the AI DM's turn leaves that action still
 * to do (it asked a question, refused or chose something else), the run
 * takes it with its button instead and records the fallback, so one miss
 * never strands the rest of the run. Leave has no AI tool (#156), so the
 * last step is a button press. Fights pick from the action bar each turn:
 * heal at half HP or less, otherwise attack the first opponent offered, then
 * make the extra attack with a second light weapon.
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
  /** The approach of a check with several (#283), such as "persuasion". */
  approach?: string;
  /** Another try at a check already made (#284). */
  retry?: true;
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
      coin?: string;
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
  {
    action: "examine",
    target: "overturned-table",
    say: "Look under the overturned table.",
  },
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

/**
 * The Tinker's Toll, in play order: the wolf at the ford, the shield and
 * purse in its reeds, the bandits at the tower and their purse, then back to
 * the tinker to trade before leaving by the shrine.
 */
export const TOLL_FULL_ROUTE: readonly ReleaseStep[] = Object.freeze([
  {
    action: "examine",
    target: "offering-bowl",
    say: "Look in the offering bowl.",
  },
  {
    action: "move",
    target: "tinkers-cart",
    say: "Walk down the road to the cart.",
  },
  {
    action: "talk",
    target: "the-tower",
    say: "Ask the tinker about the toll tower.",
  },
  {
    action: "talk",
    target: "the-ford",
    say: "Ask the tinker about the ford.",
  },
  { action: "move", target: "ford", say: "Head down to the ford." },
  { action: "examine", target: "reeds", say: "Search the trampled reeds." },
  {
    action: "take",
    target: "reed-shield",
    say: "Pick up the traveller's shield.",
  },
  {
    action: "take",
    target: "traveller-purse",
    say: "Take the sodden purse.",
  },
  {
    action: "equip",
    target: "shield",
    say: "Strap the shield onto my arm.",
  },
  {
    action: "move",
    target: "toll-tower",
    say: "Climb the track to the toll tower.",
  },
  {
    action: "examine",
    target: "strongbox",
    say: "Open the strongbox under the stair.",
  },
  { action: "take", target: "toll-seal", say: "Take the silver seal." },
  { action: "take", target: "bandit-purse", say: "Take the bandit's purse." },
  {
    action: "take",
    target: "travellers-carnelian",
    say: "Take the red stone.",
  },
  { action: "move", target: "ford", say: "Go back down to the ford." },
  {
    action: "move",
    target: "tinkers-cart",
    say: "Go back up to the tinker's cart.",
  },
  {
    action: "buy",
    target: "shortsword",
    say: "Buy a shortsword from the tinker.",
  },
  {
    action: "swap",
    target: "shortsword",
    say: "Draw the shortsword and put the mace away.",
  },
  { action: "sell", target: "mace", say: "Sell my mace to the tinker." },
  {
    action: "move",
    target: "wayside-shrine",
    say: "Walk back up to the shrine.",
  },
  { action: "leave", target: "wayside-shrine" },
]);

/**
 * The Silvervein Mine, in play order (#241): the kobolds in the sorting shed,
 * where the tunneller surrenders on the release seed and gives up the iron
 * key, then the drowned miners, the overseer behind the iron door and the
 * spider in the winze, and back out of the mine mouth.
 */
export const MINE_FULL_ROUTE: readonly ReleaseStep[] = Object.freeze([
  {
    action: "examine",
    target: "ore-cart",
    say: "Look over the overturned ore cart.",
  },
  {
    action: "move",
    target: "sorting-shed",
    say: "Follow the rails into the mine.",
  },
  {
    action: "talk",
    target: "the-iron-door",
    say: "Ask the kobold about the iron door.",
  },
  { action: "take", target: "iron-key", say: "Take the iron key." },
  {
    action: "talk",
    target: "the-spider",
    say: "Ask the kobold about the webs.",
  },
  {
    action: "talk",
    target: "the-overseer",
    say: "Ask the kobold about its overseer.",
  },
  { action: "examine", target: "ore-bin", say: "Dig through the ore bin." },
  { action: "take", target: "shed-potion", say: "Take the vial from the bin." },
  {
    action: "take",
    target: "kobold-takings",
    say: "Take the bag of silver.",
  },
  {
    action: "examine",
    target: "kobold-lookout",
    say: "Search the lookout's body.",
  },
  {
    action: "take",
    target: "kobold-lookout-coins",
    say: "Take the lookout's coins.",
  },
  {
    action: "move",
    target: "main-gallery",
    say: "Go on into the main gallery.",
  },
  {
    action: "examine",
    target: "notice-board",
    say: "Read the notice board.",
  },
  {
    action: "move",
    target: "flooded-drift",
    say: "Wade down into the flooded drift.",
  },
  {
    action: "examine",
    target: "burial-niche",
    say: "Search the burial niche.",
  },
  { action: "take", target: "silver-locket", say: "Take the silver locket." },
  {
    action: "move",
    target: "main-gallery",
    say: "Back up to the main gallery.",
  },
  {
    action: "unlock",
    target: "iron-door",
    say: "Unlock the iron door with the kobold's key.",
  },
  {
    action: "move",
    target: "overseers-office",
    say: "Go through into the office.",
  },
  {
    action: "examine",
    target: "bugbear-overseer",
    say: "Search the bugbear's body.",
  },
  {
    action: "take",
    target: "bugbear-overseer-coins",
    say: "Take the bugbear's coins.",
  },
  {
    action: "take",
    target: "bugbear-overseer-trinket",
    say: "Take the bugbear's gem.",
  },
  {
    action: "examine",
    target: "ledger-desk",
    say: "Read the ledger on the desk.",
  },
  {
    action: "examine",
    target: "payroll-chest",
    say: "Open the payroll chest.",
  },
  { action: "take", target: "payroll", say: "Take the payroll." },
  { action: "move", target: "main-gallery", say: "Back out to the gallery." },
  {
    action: "move",
    target: "webbed-winze",
    say: "Push into the webbed winze.",
  },
  { action: "examine", target: "cocoon", say: "Cut open the cocoon." },
  { action: "take", target: "uncut-sapphire", say: "Take the sapphire." },
  {
    action: "take",
    target: "winze-potion",
    say: "Take the prospector's vial.",
  },
  {
    action: "move",
    target: "main-gallery",
    say: "Climb back to the gallery.",
  },
  {
    action: "move",
    target: "sorting-shed",
    say: "Head back to the sorting shed.",
  },
  {
    action: "move",
    target: "mine-mouth",
    say: "Walk out to the mine mouth.",
  },
  { action: "leave", target: "mine-mouth" },
]);

/**
 * The Thornwood Lodge (#291) from the gate to the hall and out: Brann's
 * topics, the poachers' path by Persuasion, the kennel yard and the bear,
 * the trophy wall by History, the hatch by Perception (and its retry when it
 * holds), the man-trap found and disarmed. It leaves the Owlbear and Captain
 * Hesk alone, as a cautious player would. A step a check's band leaves
 * unoffered (the hide when Brann says no, the potion the wall keeps) is
 * recorded as skipped.
 */
export const LODGE_ROUTE: readonly ReleaseStep[] = Object.freeze([
  { action: "examine", target: "woodpile", say: "Search the woodpile." },
  {
    action: "take",
    target: "woodpile-potion",
    say: "Take the vial from the woodpile.",
  },
  { action: "take", target: "hooded-lantern", say: "Take the lantern." },
  {
    action: "talk",
    target: "the-lodge",
    say: "Ask Brann about the lodge.",
  },
  {
    action: "talk",
    target: "the-poachers-path",
    approach: "persuasion",
    say: "Try to persuade Brann to tell me about the poachers' path.",
  },
  {
    action: "move",
    target: "poachers-hide",
    say: "Follow the poachers' path to their hide.",
  },
  {
    action: "examine",
    target: "poachers-cache",
    say: "Look in the sack hanging from the branch.",
  },
  { action: "take", target: "hide-potion", say: "Take the vial." },
  { action: "take", target: "trap-tongs", say: "Take the iron tongs." },
  {
    action: "move",
    target: "forest-gate",
    say: "Go back to the forest gate.",
  },
  {
    action: "move",
    target: "kennel-yard",
    say: "Head round the palisade to the kennels.",
  },
  {
    action: "examine",
    target: "hounds-kennel",
    say: "Search the hound's kennel.",
  },
  { action: "take", target: "hunting-cup", say: "Take the gilt cup." },
  { action: "take", target: "kennel-gold", say: "Take the purse of gold." },
  {
    action: "move",
    target: "lodge-hall",
    say: "Go through the kennel door into the hall.",
  },
  {
    action: "examine",
    target: "trophy-wall",
    approach: "history",
    say: "Study the old hunting shields on the trophy wall for anything out of place, using what I know of history.",
  },
  { action: "take", target: "trophy-topaz", say: "Take the jewel." },
  { action: "take", target: "trophy-potion", say: "Take the vial too." },
  {
    action: "examine",
    target: "ice-house-hatch",
    approach: "perception",
    say: "Look the frozen hatch over for a release.",
  },
  {
    action: "examine",
    target: "ice-house-hatch",
    approach: "perception",
    retry: true,
    say: "Try the hatch again.",
  },
  {
    action: "search",
    target: "lodge-hall",
    say: "Check the gallery stair for traps.",
  },
  {
    action: "disarm",
    target: "gallery-man-trap",
    say: "Disarm the man-trap with the tongs.",
  },
  {
    action: "move",
    target: "kennel-yard",
    say: "That's enough. Back out to the kennel yard.",
  },
  {
    action: "move",
    target: "forest-gate",
    say: "Back to the forest gate.",
  },
  { action: "leave", target: "forest-gate" },
]);

/**
 * The Counting-House on Mallow Quay (#311) with the level-3 Rogue Vex: the
 * bollard's potion, Snikk talked round with Persuasion and paid his toll, a
 * sneak into the counting hall and out past the goblin to the gallery (and
 * the scything blade), the tally-master's desk, a sneak back and an ambush,
 * the till, the strongroom lock picked with thieves' tools, the coffer, and
 * out. It leaves the Clerk-Eater alone, as a cautious player would. A step a
 * roll leaves unoffered (the toll when the parley lets Vex pass) is recorded
 * as skipped.
 */
export const COUNTING_HOUSE_ROUTE: readonly ReleaseStep[] = Object.freeze([
  {
    action: "examine",
    target: "mooring-bollard",
    say: "Read the chalk on the bollard.",
  },
  {
    action: "take",
    target: "bollard-potion",
    say: "Take the vial from the crack.",
  },
  {
    action: "move",
    target: "toll-arch",
    say: "Climb the steps to the arch.",
  },
  {
    action: "react",
    target: "parley",
    approach: "persuasion",
    say: "Talk him round honestly: I'm only here for the guild's old ledgers and want no trouble with him.",
  },
  { action: "react", target: "toll", say: "Fine. Pay him the five gold." },
  {
    action: "sneak",
    target: "counting-hall",
    say: "Sneak into the counting hall.",
  },
  {
    action: "move",
    target: "clerks-gallery",
    say: "Slip past it, up the gallery stair.",
  },
  {
    action: "examine",
    target: "tally-desk",
    say: "Search the tally-master's desk.",
  },
  {
    action: "sneak",
    target: "counting-hall",
    say: "Creep back down into the hall.",
  },
  {
    action: "ambush",
    target: "counting-hall",
    say: "Ambush the goblin before it sees me.",
  },
  {
    action: "examine",
    target: "smashed-till",
    say: "Look in the smashed till.",
  },
  { action: "take", target: "till-silver", say: "Take the silver." },
  {
    action: "pick",
    target: "strongroom-door",
    say: "Pick the strongroom door's lock with my thieves' tools.",
  },
  {
    action: "move",
    target: "strongroom",
    say: "Go into the strongroom.",
  },
  {
    action: "examine",
    target: "iron-coffer",
    say: "Open the iron coffer.",
  },
  { action: "take", target: "coffer-garnet", say: "Take the first garnet." },
  {
    action: "take",
    target: "coffer-garnet-2",
    say: "Take the second garnet.",
  },
  {
    action: "take",
    target: "chain-of-office",
    say: "Take the chain of office.",
  },
  { action: "take", target: "guild-gold", say: "Take the bag of gold." },
  {
    action: "move",
    target: "counting-hall",
    say: "Back out into the hall.",
  },
  { action: "move", target: "toll-arch", say: "Out through the arch." },
  {
    action: "move",
    target: "quay-steps",
    say: "Down to the quay steps.",
  },
  { action: "leave", target: "quay-steps" },
]);

/** Whether the action bar is a fight's: it always offers End turn. */
const inFight = (view: ReleaseSessionView): boolean =>
  view.actions.some(({ action }) => action === "end-turn");

type FightKind =
  | "attack"
  | "light-attack"
  | "use"
  | "second-wind"
  | "action-surge"
  | "end-turn";

/** What a player types for each fight action, given its target's name. */
const FIGHT_WORDS: Readonly<Record<FightKind, (name: string) => string>> = {
  attack: (name) => `Attack the ${name}.`,
  "light-attack": (name) => `Strike the ${name} with my other blade.`,
  use: (name) => `Drink the ${name}.`,
  "second-wind": () => "Catch my breath with Second Wind.",
  "action-surge": () => "Use Action Surge.",
  "end-turn": () => "End my turn.",
};

/**
 * The fight action to take now: at half HP or less, Second Wind or else a
 * potion (each a bonus action); otherwise an attack on the first opponent
 * offered; with the action spent, the extra attack with a second light
 * weapon (#311), then Action Surge; and End turn when nothing else is left.
 */
export function chooseFightStep(view: ReleaseSessionView): ReleaseStep {
  const offered = (kind: FightKind) => {
    const found = view.actions.find(
      ({ action, available }) => action === kind && available,
    );
    return found === undefined ? undefined : { kind, target: found.target };
  };
  const { hp, maxHp } = view.room.character;
  const heal =
    hp * 2 <= maxHp ? (offered("second-wind") ?? offered("use")) : undefined;
  const chosen =
    heal ??
    offered("attack") ??
    offered("light-attack") ??
    offered("action-surge") ??
    offered("end-turn");
  if (chosen === undefined) {
    throw new Error("The fight offers no action.");
  }
  const { kind, target } = chosen;
  return {
    action: kind,
    ...(target === undefined ? {} : { target: target.id }),
    say: FIGHT_WORDS[kind](target?.name ?? ""),
  };
}

/** The engine's cards in `view`'s newest history entry. */
const newestCards = (view: ReleaseSessionView): ReleaseTurn["cards"] =>
  view.history.at(-1)!.cards.map(({ kind, text }) => ({ kind, text }));

const findAction = (view: ReleaseSessionView, step: ReleaseStep) =>
  view.actions.find(
    ({ action, target, approach, retry }) =>
      action === step.action &&
      target?.id === step.target &&
      approach?.id === step.approach &&
      (retry !== undefined) === (step.retry === true),
  );

/**
 * Whether `step` is done in `after`: a move or a sneak is done in its
 * destination; an examination (which stays offered, to read again) once the
 * room shows what it found; a trade (whose Buy stays offered while coin lasts) once the purse
 * changed; anything else once its action is no longer available in the room
 * it was taken in. A check step (an approach or a retry) is done once its
 * button is withdrawn. A fight step is done by any committed action.
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
  if (step.action === "move" || step.action === "sneak") {
    return after.room.id === step.target;
  }
  if (step.approach !== undefined || step.retry === true) {
    return (
      after.sequence > before.sequence && !findAction(after, step)?.available
    );
  }
  if (step.action === "examine") {
    return after.room.features.some(
      ({ id, discovery }) => id === step.target && discovery !== undefined,
    );
  }
  if (step.action === "buy" || step.action === "sell") {
    return after.room.purse !== before.room.purse;
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
    step.action === "attack" || step.action === "light-attack"
      ? [
          `/api/5e/session/${step.action}`,
          { ...base, actorId: PLAYER_ID, targetId: step.target },
        ]
      : step.target === undefined
        ? ["/api/5e/session/action", { ...base, action: step.action }]
        : [
            "/api/5e/session/explore",
            {
              ...base,
              action: step.action,
              target: step.target,
              ...(step.approach === undefined
                ? {}
                : { approach: step.approach }),
              ...(step.retry === true ? { retry: true } : {}),
            },
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
    const how = [step.approach, step.retry === true ? "retry" : undefined]
      .filter((part) => part !== undefined)
      .join(", ");
    const intent = `${step.action}${step.target === undefined ? "" : ` ${step.target}`}${how === "" ? "" : ` (${how})`}`;
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
      reply = typed.history.at(-1)!.reply;
      cards = newestCards(typed);
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
      cards = [...cards, ...newestCards(after)];
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
