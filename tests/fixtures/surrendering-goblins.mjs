// The lintel barrow with three Goblin Minions in the burial hall that
// surrender instead of fleeing, for the surrender tests (#238). Each carries a
// stolen ring; one that surrenders hands it over when asked for mercy, and
// one cut down leaves it on its body.
import { createSeededRandom } from "../../dist/random.js";
import { createFifthRuntime } from "../../dist/runtime-5e.js";
import { sessionSeed } from "../../dist/session-5e.js";
import { inlineMonster, validateModule } from "./bestiary.mjs";
import { fightThrough } from "./fleeing-goblins.mjs";
import { moduleFile } from "./modules.mjs";
import { firstFighter } from "./session-layout.mjs";

const barrow = moduleFile("lintel-barrow");

export const GOBLINS = ["goblin-1", "goblin-2", "goblin-3"];

/** The ring each goblin carries, by goblin id. */
export const ringOf = (goblinId) => `${goblinId}-ring`;
/** The topic that makes a goblin hand over its ring. */
export const mercyOf = (goblinId) => `${goblinId}-mercy`;
/** The topic that only tells. */
export const lairOf = (goblinId) => `${goblinId}-lair`;

/** The XP the module awards for sparing each goblin. */
export const SPARED_XP = 10;

/** The module's JSON, before validation, for tests that change it. */
export const surrenderingGoblinsJson = {
  ...barrow,
  id: "surrendering-goblins",
  title: "The Surrendering Goblins",
  rooms: barrow.rooms.map((room) =>
    room.id === "burial-hall"
      ? {
          ...room,
          features: [],
          items: GOBLINS.map((goblinId, index) => ({
            id: ringOf(goblinId),
            name: `Stolen Ring ${index + 1}`,
            description: "A thin silver ring, robbed from the barrow's dead.",
            kind: "treasure",
            treasure: "art-25gp",
            hiddenIn: goblinId,
          })),
        }
      : room,
  ),
  encounters: [
    {
      id: "barrow-goblin",
      // Inline Goblin Minions: no treasure type (#240) limits their rings.
      opponents: GOBLINS.map((goblinId, index) =>
        inlineMonster("goblin-minion", {
          id: goblinId,
          name: `Goblin ${index + 1}`,
          surrender: {
            description: `Goblin ${index + 1} kneels in the dirt, its dagger thrown down.`,
            topics: [
              {
                id: mercyOf(goblinId),
                name: "Mercy",
                reply: "Spare me! Take it, take the ring!",
                gives: [ringOf(goblinId)],
              },
              {
                id: lairOf(goblinId),
                name: "The barrow",
                reply: "Only us three. The rest ran off with the good silver.",
              },
            ],
            xp: SPARED_XP,
          },
        }),
      ),
      defeatEndingId: "fallen-in-the-barrow",
    },
  ],
};

export const surrenderingGoblins = validateModule(surrenderingGoblinsJson);

/**
 * The first browser seed from `from` on which the burial hall's fight, played
 * by `fightThrough` with the character a fresh browser creates, is won with
 * at least one goblin surrendered; with the runtime and the state and events
 * up to the win.
 */
export function surrenderSeed(from = 0) {
  for (let seed = from; seed < from + 500; seed++) {
    const runtime = createFifthRuntime(surrenderingGoblins, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    let state = runtime.createSession();
    const events = [];
    for (const action of [
      { type: "begin" },
      { type: "move", destinationId: "burial-hall" },
    ]) {
      const result = runtime.handleAction(state, action, random);
      events.push(...result.events);
      state = result.state;
    }
    const fought = fightThrough(runtime, state, random);
    events.push(...fought.events);
    if (
      fought.state.status === "playing" &&
      fought.state.surrenderedOpponents.length > 0
    ) {
      return { seed, runtime, random, state: fought.state, events };
    }
  }
  throw new Error("No seed in 500 has a goblin surrender in a won fight.");
}
