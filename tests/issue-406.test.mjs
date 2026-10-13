// #406: the AI DM remembers the known rooms. Its scene gains a summary of
// every other room the character knows (#405's projection): each room's
// name and region, its ways on (as they stand: closed, opened by a check,
// or open now a flag is set), the discoveries made there, what its
// creatures said, its doors, the traps found and how its fight stands. The
// summary has a byte cap, and drops the oldest-visited room's detail first.
// It decides nothing: the engine still validates every tool call.
// Prompt v41.
import assert from "node:assert/strict";
import test from "node:test";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import {
  FIFTH_MEMORY_DM_CASES,
  loadFifthMemoryEvaluationAdventure,
  offeredToolsMatchActions,
  runFifthDmEvaluation,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import {
  createFifthRuntime,
  FIFTH_DM_SYSTEM_PROMPT,
  FIFTH_PROMPT_VERSION,
  KNOWN_ROOMS_SCENE_BYTES,
} from "../dist/runtime-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import {
  longTunnels,
  memoryTunnels,
  moduleFile,
  regionTunnels,
  sealedCrypt,
  winchTunnels,
} from "./fixtures/modules.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });
const EXAMINE = (targetId) => ({ type: "examine", targetId });
const LANTERN =
  'Scratched into the lantern\'s base: "Rats in the cellar. Boss in the den."';
/** The scene's whole size, as the model is handed it. */
const SCENE_BYTES = 8192;

const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");

function accepted(runtime, state, action, ...rolls) {
  const result = runtime.handleAction(state, action, uncheckedDice(...rolls));
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result.state;
}

/** The scene's known rooms entry for the room named `name`. */
const entryFor = (scene, name) =>
  scene.knownRooms.find(
    (line) => line.startsWith(`${name} (`) || line.startsWith(`${name}:`),
  );

test("the prompt changes", () => {
  assert.equal(FIFTH_PROMPT_VERSION, "5e-dm-v41");
  assert.match(FIFTH_DM_SYSTEM_PROMPT, /known rooms/u);
});

test("the scene names every other known room, with its region and ways", () => {
  const runtime = createFifthRuntime(regionTunnels, TEST_FIGHTER);
  const start = runtime.createSession();
  // The current room is the scene's room, not a known room.
  assert.deepEqual(runtime.projectDmScene(start).knownRooms, [
    "Alcove (Upper Tunnels): seen, not yet visited.",
    "Rat-Gnawed Cellar (Lower Tunnels): seen, not yet visited.",
  ]);
  const alcove = accepted(
    runtime,
    accepted(runtime, start, EXAMINE("rusted-lantern")),
    MOVE("alcove"),
  );
  assert.deepEqual(runtime.projectDmScene(alcove).knownRooms, [
    `Foot of the Stair (Upper Tunnels): visited. Ways to Alcove, Rat-Gnawed Cellar. Discovered at the Rusted Lantern: ${LANTERN}`,
    "Rat-Gnawed Cellar (Lower Tunnels): seen, not yet visited.",
  ]);
});

test("a module without regions names none", () => {
  const runtime = createFifthRuntime(sealedCrypt, TEST_FIGHTER);
  const hall = accepted(runtime, runtime.createSession(), MOVE("hall"));
  assert.match(
    entryFor(runtime.projectDmScene(hall), "Crypt Stair"),
    /^Crypt Stair: visited\. Ways to /u,
  );
});

test("a room's record gives what creatures said, its doors, the traps found and its fight", () => {
  const runtime = createFifthRuntime(sealedCrypt, TEST_FIGHTER);
  let state = accepted(runtime, runtime.createSession(), MOVE("hall"));
  state = accepted(runtime, state, { type: "talk", topicId: "warden" });
  // The dart trap is found by searching the hall: a natural 20.
  state = accepted(runtime, state, { type: "search", roomId: "hall" }, 20);
  state = accepted(runtime, state, MOVE("crypt-stair"));
  const hall = entryFor(runtime.projectDmScene(state), "Hall of Niches");
  assert.match(
    hall,
    /Bound Smuggler said of the warden: "I lifted the sarcophagus lid/u,
  );
  assert.match(hall, /Doors: Iron Door to the Strongroom, shut\./u);
  assert.match(
    hall,
    /Traps: Dart Trap on the way to the Offering Room, armed\./u,
  );

  // A fight fled from.
  const tunnels = createFifthRuntime(regionTunnels, TEST_FIGHTER);
  // Initiative: the character 20, the rat 1; the rat's parting bite misses.
  const fighting = accepted(
    tunnels,
    tunnels.createSession(),
    MOVE("rat-cellar"),
    20,
    1,
  );
  const fled = accepted(
    tunnels,
    fighting,
    { type: "flee", destinationId: "stair-foot" },
    2,
  );
  assert.match(
    entryFor(tunnels.projectDmScene(fled), "Rat-Gnawed Cellar"),
    /Fight: fled from, against Giant Rat\.$/u,
  );
});

test("a way a flag opens shows as closed, then as open now", () => {
  const runtime = createFifthRuntime(winchTunnels, TEST_FIGHTER);
  const alcove = accepted(runtime, runtime.createSession(), MOVE("alcove"));
  assert.match(
    entryFor(runtime.projectDmScene(alcove), "Foot of the Stair"),
    /Ways to Alcove, Rat-Gnawed Cellar \(closed\)\./u,
  );
  const heaved = accepted(runtime, alcove, EXAMINE("rusted-winch"));
  assert.match(
    entryFor(runtime.projectDmScene(heaved), "Foot of the Stair"),
    /Ways to Alcove, Rat-Gnawed Cellar \(open now\)\./u,
  );
});

test("the scene stays under its cap on the long module with every room visited", () => {
  const runtime = createFifthRuntime(longTunnels, TEST_FIGHTER);
  let state = runtime.createSession();
  // Initiative: the character 20, the rat 1; then the rat falls.
  for (const action of [
    EXAMINE("rusted-lantern"),
    MOVE("alcove"),
    EXAMINE("iron-chest"),
    MOVE("stair-foot"),
  ]) {
    state = accepted(runtime, state, action);
  }
  state = { ...state, clearedEncounterIds: ["cellar-rat", "den-goblin"] };
  for (const to of ["rat-cellar", "cistern", "rat-cellar", "den"]) {
    state = accepted(runtime, state, MOVE(to));
  }
  assert.deepEqual(
    [...state.visitedRoomIds].sort(),
    longTunnels.rooms.map(({ id }) => id).sort(),
  );
  const scene = runtime.projectDmScene(state);
  assert.equal(scene.knownRooms.length, longTunnels.rooms.length - 1);
  assert.ok(bytes(scene.knownRooms) <= KNOWN_ROOMS_SCENE_BYTES);
  assert.ok(bytes(scene) <= SCENE_BYTES, `${bytes(scene)} bytes`);
});

test("over the cap, the oldest-visited room's detail goes first", () => {
  assert.equal(KNOWN_ROOMS_SCENE_BYTES, 4096);
  // Every room's feature has a long discovery.
  const module = moduleFile("rat-tunnels");
  module.id = "wordy-tunnels";
  for (const each of module.rooms) {
    each.features.push({
      id: `${each.id}-mural`,
      name: "Mural",
      description: "A faded mural.",
      discovery: `${each.name}: ${"Faded figures march in a long line. ".repeat(40).trimEnd()}`,
    });
  }
  const wordy = validateModule(module);
  const runtime = createFifthRuntime(wordy, TEST_FIGHTER);
  let state = runtime.createSession();
  for (const action of [
    EXAMINE("stair-foot-mural"),
    MOVE("alcove"),
    EXAMINE("alcove-mural"),
    MOVE("stair-foot"),
  ]) {
    state = accepted(runtime, state, action);
  }
  state = { ...state, clearedEncounterIds: ["cellar-rat", "den-goblin"] };
  state = accepted(runtime, state, MOVE("rat-cellar"));
  state = accepted(runtime, state, EXAMINE("rat-cellar-mural"));
  state = accepted(runtime, state, MOVE("den"));
  const known = runtime.projectDmScene(state).knownRooms;
  assert.ok(bytes(known) <= KNOWN_ROOMS_SCENE_BYTES, `${bytes(known)} bytes`);
  // The stair foot, visited first, keeps only its ways; the cellar, visited
  // last, keeps its discovery.
  assert.equal(
    entryFor({ knownRooms: known }, "Foot of the Stair"),
    "Foot of the Stair: visited. Ways to Alcove, Rat-Gnawed Cellar.",
  );
  assert.match(
    entryFor({ knownRooms: known }, "Rat-Gnawed Cellar"),
    /Discovered at the Mural: Rat-Gnawed Cellar: Faded figures/u,
  );
});

test("the summary decides nothing: a move to a known room beyond the exits is refused", () => {
  const runtime = createFifthRuntime(memoryTunnels, TEST_FIGHTER);
  let state = runtime.createSession();
  state = accepted(runtime, state, MOVE("alcove"));
  state = accepted(runtime, state, MOVE("gallery"));
  assert.match(
    entryFor(runtime.projectDmScene(state), "Foot of the Stair"),
    /visited/u,
  );
  const result = runtime.dispatchGameTool(
    state,
    {
      id: "call-1",
      name: "move",
      argumentsJson: JSON.stringify({ destination: "stair-foot" }),
    },
    uncheckedDice(),
  );
  assert.equal(result.modelOutput.ok, false);
  assert.deepEqual(result.state, state);
  // No tool takes a known room's record.
  for (const { name, parameters } of runtime.getGameToolDefinitions(state)) {
    assert.doesNotMatch(`${name} ${JSON.stringify(parameters)}`, /known/u);
  }
});

test("the known rooms evaluation cases pass with a scripted DM", async () => {
  const adventure = await loadFifthMemoryEvaluationAdventure();
  assert.equal(adventure.formatVersion, FIFTH_ADVENTURE_FORMAT);
  assert.deepEqual(adventure, memoryTunnels);
  assert.deepEqual(
    FIFTH_MEMORY_DM_CASES.map(({ id }) => id),
    ["memory-discovery", "memory-creature", "memory-way-back"],
  );
  for (const sample of FIFTH_MEMORY_DM_CASES) {
    const session = setUpCase(sample, adventure);
    assert.ok(offeredToolsMatchActions(session), sample.id);
    // What each case recalls is in the scene's known rooms, not its room.
    const scene = session.runtime.projectDmScene(session.state);
    for (const phrase of sample.recalls ?? []) {
      assert.ok(
        scene.knownRooms.some((line) =>
          line.toLowerCase().includes(phrase.toLowerCase()),
        ),
        `${sample.id}: ${phrase}`,
      );
      assert.doesNotMatch(JSON.stringify(scene.room), new RegExp(phrase, "iu"));
    }
  }
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    cases: FIFTH_MEMORY_DM_CASES,
    adventure,
    createModel: (sample) => {
      let next = 0;
      return {
        async respond() {
          return sample.scripted[next++];
        },
      };
    },
    manualJudgments: Object.fromEntries(
      FIFTH_MEMORY_DM_CASES.map((sample) => [
        sample.id,
        {
          1: Object.fromEntries(sample.manualJudgments.map((id) => [id, true])),
        },
      ]),
    ),
  });
  for (const run of report.runs) {
    assert.ok(Object.values(run.checks).every(Boolean), run.caseId);
  }
  assert.equal(report.passed, true);
});

test("a reply that misses what a case recalls fails its narration check", async () => {
  const adventure = await loadFifthMemoryEvaluationAdventure();
  const sample = FIFTH_MEMORY_DM_CASES.find(
    ({ id }) => id === "memory-discovery",
  );
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    cases: [sample],
    adventure,
    createModel: () => ({
      async respond() {
        return { text: "I don't remember any lantern." };
      },
    }),
    manualJudgments: { [sample.id]: { 1: {} } },
  });
  assert.equal(report.runs[0].checks.narration, false);
});
