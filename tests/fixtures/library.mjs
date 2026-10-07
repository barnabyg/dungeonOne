// A character library holding one fresh Ada, and the burial hall fight the
// barrow modules' library tests win on a found browser seed.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FifthCharacterLibrary } from "../../dist/character-library-5e.js";
import { createSeededRandom } from "../../dist/random.js";
import { createFifthRuntime } from "../../dist/runtime-5e.js";
import { sessionSeed } from "../../dist/session-5e.js";
import { TEST_FIGHTER_CHOICES } from "../../dist/test-fighter-5e.js";

/**
 * Runs `run(library, sheet, revision, directory)` on a library, seeded 7, in a
 * fresh temporary directory, holding one Ada (the test fighter's choices: Str
 * 17, the mace kit) just created; removes the directory afterwards.
 */
export async function withLibrary(run) {
  const directory = await mkdtemp(join(tmpdir(), "library-"));
  try {
    const library = new FifthCharacterLibrary(
      join(directory, "characters.json"),
      7,
    );
    const started = await library.startCreation();
    const data = await library.create(
      "Ada",
      TEST_FIGHTER_CHOICES,
      started.revision,
    );
    await run(library, data.characters[0].sheet, data.revision, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** The burial hall fight's next action: attack, or end the turn once spent. */
export const barrowFightStep = (runtime, state) =>
  runtime.attackTargets(state).length > 0
    ? { type: "attack", actorId: "pc", targetId: "barrow-goblin" }
    : { type: "end-turn", actorId: "pc" };

/**
 * A browser seed whose `number`th session of `module` (a lintel barrow) wins
 * the burial hall's fight for `sheet`, moving there after `before`, actions
 * at the mouth that roll no dice.
 */
export function winBarrowSeed(module, sheet, number, before = []) {
  for (let seed = 0; seed < 500; seed++) {
    const runtime = createFifthRuntime(module, sheet);
    const random = createSeededRandom(sessionSeed(seed, number));
    let state = runtime.createSession();
    for (const action of [
      { type: "begin" },
      ...before,
      { type: "move", destinationId: "burial-hall" },
    ]) {
      state = runtime.handleAction(state, action, random).state;
    }
    while (state.encounter?.outcome === "ongoing") {
      state = runtime.handleAction(
        state,
        barrowFightStep(runtime, state),
        random,
      ).state;
    }
    if (state.status === "playing") {
      return seed;
    }
  }
  throw new Error("no seed wins the burial hall");
}
