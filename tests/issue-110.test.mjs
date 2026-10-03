import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadAdventure } from "../dist/adventure-loader.js";
import { browserActions } from "../dist/browser-actions.js";
import { startBrowserServer } from "../dist/browser-server.js";
import { CharacterCareer } from "../dist/character-career.js";
import {
  BROWSER_RELEASES,
  browserReleasePolicy,
  startableCharacterAdventures,
} from "../dist/browser-releases.js";
import { createCharacter } from "../dist/character-rules.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { createSeededRandom } from "../dist/random.js";
import { verifyTraceFile } from "../dist/replay.js";
import { SaveSession } from "../dist/save.js";
import {
  completeSessionTrace,
  createDmSessionTrace,
  createSessionTrace,
  recordDmTraceTurn,
  recordTraceAction,
} from "../dist/trace.js";
import { beaconExamine } from "./fixtures/character-journeys.mjs";

const load = async (file) =>
  loadAdventure(
    await readFile(
      fileURLToPath(new URL(`../adventures/${file}`, import.meta.url)),
    ),
  ).adventure;
const runtimeFor = async (file) =>
  createDataRuntime(await load(file), createCharacter("Ada", "balanced"));
const v13 = () => runtimeFor("hollow-beacon-examine.json");
const v12 = () => runtimeFor("hollow-beacon-characters.json");
const toolNames = (runtime, state) =>
  runtime.getGameToolDefinitions(state).map(({ name }) => name);
const examine = (runtime, state, target, playerInput = "Examine it.") =>
  runtime.dispatchGameTool(
    state,
    { name: "examine", argumentsJson: JSON.stringify({ target }) },
    createSeededRandom(0),
    playerInput,
  );
const inRecords = (state) => ({ ...state, locationId: "signal-records" });

test("Hollow Beacon v13 is the v12 module under character rules v2", async () => {
  const content = await load("hollow-beacon-examine.json");
  assert.equal(content.snapshot.contentVersion, "13");
  assert.equal(content.snapshot.rulesVersion, "character-adventure-rules-v2");
  assert.equal(content.snapshot.schemaVersion, 17);
  assert.equal((await v13()).rulesVersion, "character-adventure-rules-v2");
  assert.equal((await v12()).rulesVersion, "character-adventure-rules-v1");
});

test("v13 offers one examine tool in place of inspect and search; v12 keeps both", async () => {
  const runtime = await v13();
  const state = inRecords(runtime.createSession());
  const names = toolNames(runtime, state);
  assert.ok(names.includes("examine"));
  assert.ok(!names.includes("inspect"));
  assert.ok(!names.includes("search"));
  assert.ok(runtime.mutationToolNames.includes("examine"));
  assert.ok(!runtime.mutationToolNames.includes("search"));
  assert.ok(!runtime.readToolNames.includes("inspect"));
  const tool = runtime
    .getGameToolDefinitions(state)
    .find(({ name }) => name === "examine");
  assert.ok(tool.parameters.properties.target.enum.includes("setting-plate"));
  assert.match(runtime.systemPrompt, /examine/);
  assert.doesNotMatch(runtime.systemPrompt, /inspect\/search/);

  const old = await v12();
  const oldNames = toolNames(old, inRecords(old.createSession()));
  assert.ok(oldNames.includes("inspect") && oldNames.includes("search"));
  assert.ok(!oldNames.includes("examine"));
});

test("examining a feature with an available search records its discovery in one call", async () => {
  const runtime = await v13();
  const before = inRecords(runtime.createSession());
  const result = examine(runtime, before, "setting-plate");
  assert.equal(result.modelOutput.ok, true);
  assert.deepEqual(result.action, { type: "search", target: "setting-plate" });
  assert.ok(result.state.discoveries.includes("altered-setting"));

  // Searched once, the plate only describes; nothing else changes.
  const again = examine(runtime, result.state, "setting-plate");
  assert.equal(again.modelOutput.ok, true);
  assert.equal(again.state, result.state);
  assert.equal(again.action.type, "inspect");
  assert.match(again.modelOutput.events[0].text, /^beacon setting plate: /i);
});

test("examining anything without an available search only describes it", async () => {
  const runtime = await v13();
  const state = runtime.createSession();
  const exit = examine(runtime, state, "watch-loft");
  assert.equal(exit.modelOutput.ok, true);
  assert.equal(exit.state, state);
  assert.match(exit.modelOutput.events[0].text, /An available exit\./);
  const hidden = examine(runtime, state, "setting-plate");
  assert.equal(hidden.modelOutput.ok, false);
  assert.equal(hidden.state, state);
});

test("the plate, work order and warning board each commit their discovery through examine in the peaceful journey", async () => {
  const runtime = await v13();
  const random = createSeededRandom(0);
  let state = runtime.createSession();
  const examined = [];
  for (const command of beaconExamine) {
    const [verb, target] = command.split(" ");
    if (verb === "examine") {
      const result = runtime.dispatchGameTool(
        state,
        { name: "examine", argumentsJson: JSON.stringify({ target }) },
        random,
        `Examine ${target}.`,
      );
      assert.equal(result.modelOutput.ok, true, command);
      assert.equal(result.action.type, "search", command);
      assert.ok(
        result.state.discoveries.length > state.discoveries.length ||
          result.state.milestones.length > state.milestones.length,
        command,
      );
      examined.push(target);
      state = result.state;
      continue;
    }
    const result = runtime.handleAction(
      state,
      runtime.parseCommand(command),
      random,
    );
    assert.equal(result.rejection, undefined, command);
    state = result.state;
  }
  assert.deepEqual(examined, [
    "setting-plate",
    "wagon-ruts",
    "tower-work-order",
    "final-warning-board",
  ]);
  assert.equal(state.status, "victory");
});

test("typed commands: examine, inspect and search are one action in v13 only", async () => {
  const runtime = await v13();
  const state = inRecords(runtime.createSession());
  for (const verb of ["examine", "inspect", "search"]) {
    const action = runtime.parseCommand(`${verb} setting-plate`);
    assert.equal(action.type, "examine", verb);
    const result = runtime.handleAction(state, action, createSeededRandom(0));
    assert.ok(result.state.discoveries.includes("altered-setting"), verb);
  }
  const old = await v12();
  assert.equal(old.parseCommand("search setting-plate").type, "search");
  assert.equal(old.parseCommand("inspect setting-plate").type, "inspect");
  assert.equal(old.parseCommand("examine setting-plate").type, "unknown");
});

test("v13 shows one Examine option per target; v12 keeps Inspect and Search", async () => {
  for (const [runtime, labels] of [
    [await v13(), ["Examine"]],
    [await v12(), ["Inspect", "Search"]],
  ]) {
    const actions = browserActions(
      { runtime, state: inRecords(runtime.createSession()) },
      "issue-110",
    ).filter(({ contextId }) => contextId === "target:setting-plate");
    assert.deepEqual(
      actions
        .map(({ label }) => label)
        .filter((label) => !label.startsWith("Try ")),
      labels,
    );
  }
  const runtime = await v13();
  const [plate] = browserActions(
    { runtime, state: inRecords(runtime.createSession()) },
    "issue-110",
  ).filter(({ label }) => label === "Examine");
  assert.equal(plate.message, "Examine beacon setting plate");
  assert.deepEqual(plate.call, {
    name: "examine",
    argumentsJson: JSON.stringify({ target: "setting-plate" }),
  });
});

test("new character adventures start v13 while v12 saves continue", async () => {
  const v13Row = BROWSER_RELEASES.find(
    ({ mode, version }) => mode === "character" && version === "13",
  );
  const v12Row = BROWSER_RELEASES.find(
    ({ mode, version }) => mode === "character" && version === "12",
  );
  assert.deepEqual(
    { ...v13Row },
    {
      id: "hollow-beacon",
      version: "13",
      rulesVersion: "character-adventure-rules-v2",
      schemaVersion: 17,
      file: "hollow-beacon-examine.json",
      mode: "character",
      starts: true,
    },
  );
  assert.equal(v12Row.starts, false);
  const startable = await startableCharacterAdventures();
  assert.deepEqual(
    startable
      .filter(({ snapshot }) => snapshot.id === "hollow-beacon")
      .map(({ snapshot }) => snapshot.contentVersion),
    ["13"],
  );
  const policy = await browserReleasePolicy("11");
  policy.assertContinuable(await v12());
  policy.assertContinuable(await v13());
});

test("saves reload AI and typed examine commits, and v12 search commits unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-110-"));
  try {
    for (const [file, mode] of [
      ["hollow-beacon-examine.json", "ai-examine"],
      ["hollow-beacon-examine.json", "typed-examine"],
      ["hollow-beacon-characters.json", "ai-search"],
    ]) {
      const runtime = await runtimeFor(file);
      const path = join(directory, `${mode}.json`);
      const session = await SaveSession.start(path, runtime, 0);
      for (const command of ["move watch-loft", "move signal-records"]) {
        await session.commit(command, runtime.parseCommand(command));
      }
      if (mode === "typed-examine") {
        await session.commit(
          "examine setting-plate",
          runtime.parseCommand("examine setting-plate"),
        );
      } else {
        await session.executeTool(
          session.state,
          {
            name: mode === "ai-search" ? "search" : "examine",
            argumentsJson: JSON.stringify({ target: "setting-plate" }),
          },
          "Look the setting plate over carefully.",
        );
      }
      assert.ok(session.state.discoveries.includes("altered-setting"), mode);
      const loaded = await SaveSession.load(path);
      assert.deepEqual(loaded.state, session.state, mode);
      const saved = JSON.parse(await readFile(path, "utf8"));
      assert.ok(
        saved.transitions
          .at(-1)
          .domainEvents.some(
            ({ type, targetId }) =>
              type === "search-performed" && targetId === "setting-plate",
          ),
        mode,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a typed look-over request commits the plate discovery in one turn and its trace replays", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-110-"));
  try {
    const runtime = await v13();
    const identity = { provider: "scripted", model: "issue-110" };
    const initial = inRecords(runtime.createSession());
    const requests = [];
    const responses = [
      {
        toolCalls: [
          {
            id: "a",
            name: "examine",
            argumentsJson: JSON.stringify({ target: "setting-plate" }),
          },
        ],
      },
      { text: "You compare the two scores on the plate." },
    ];
    const input = "Look the setting plate over carefully.";
    const turn = await runDmTurn({
      state: initial,
      playerInput: input,
      transcript: [],
      random: createSeededRandom(0),
      runtime,
      model: {
        identity,
        respond: async (request) => {
          requests.push(request);
          return responses.shift();
        },
      },
    });
    assert.ok(turn.state.discoveries.includes("altered-setting"));
    const names = requests[0].tools.map(({ name }) => name);
    assert.ok(names.includes("examine"));
    assert.ok(!names.includes("inspect") && !names.includes("search"));
    assert.match(
      requests[0].tools.find(({ name }) => name === "examine").description,
      /look at, look over, read, study/,
    );

    // The trace starts from a fresh session, so it plays the moves first.
    const fresh = runtime.createSession();
    const trace = createDmSessionTrace(0, fresh, identity, runtime);
    assert.equal(trace.dm.toolSchemaVersion, runtime.toolSchemaVersion);
    let state = fresh;
    const random = createSeededRandom(0);
    for (const [say, call] of [
      ["Climb to the loft.", ["move", { destinationId: "watch-loft" }]],
      ["Go to the records.", ["move", { destinationId: "signal-records" }]],
      [input, ["examine", { target: "setting-plate" }]],
    ]) {
      const replies = [
        {
          toolCalls: [
            { id: "a", name: call[0], argumentsJson: JSON.stringify(call[1]) },
          ],
        },
        { text: "Done." },
      ];
      const step = await runDmTurn({
        state,
        playerInput: say,
        transcript: [],
        random,
        runtime,
        model: { identity, respond: async () => replies.shift() },
      });
      recordDmTraceTurn(trace, say, step);
      state = step.state;
    }
    assert.ok(state.discoveries.includes("altered-setting"));
    completeSessionTrace(trace, "eof", state);
    const path = join(directory, "trace.json");
    await writeFile(path, JSON.stringify(trace));
    await verifyTraceFile(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

/**
 * Puts a v12 adventure in the library the way a pre-#110 start did, so the
 * browser continues it as an existing save.
 */
async function startV12(career) {
  let data = await career.library.create(
    "Ada",
    "balanced",
    (await career.library.read()).revision,
  );
  const content = await load("hollow-beacon-characters.json");
  const id = "0123456789abcdef0123456789abcdef";
  await career.library.update(data.revision, (current) => {
    const record = current.characters[0];
    record.activeSessionId = id;
    record.availability = "active";
    current.sessions.push({
      id,
      characterId: record.sheet.id,
      characterRevision: record.revision,
      startingCharacter: record.sheet,
      seed: 0,
      content: content.snapshot,
      status: "starting",
    });
    current.selectedSessionId = id;
  });
  await career.recoverStarts();
  data = await career.library.read();
  return career.sessionPath(data.selectedSessionId);
}

test("the browser continues a v12 save with Inspect and Search exactly as before", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-110-"));
  const career = new CharacterCareer(join(directory, "characters.json"));
  let server;
  try {
    const path = await startV12(career);
    let session;
    server = await startBrowserServer({
      contentVersion: "11",
      libraryPath: career.library.path,
      savePath: join(directory, "legacy.json"),
      seed: 0,
      apiKey: "offline",
      dmModel: {
        async respond(request) {
          if (request.toolResults.length) {
            return { text: "Recorded." };
          }
          session = await SaveSession.load(path);
          const action = browserActions(session, "v12").find(
            ({ message }) => message === request.playerInput,
          );
          return { toolCalls: [{ id: "v12", ...action.call }] };
        },
      },
    });
    const view = async () => (await fetch(server.url + "/api/state")).json();
    const click = async (message) => {
      const before = await view();
      const option = before.actions.find(
        (action) => action.message === message,
      );
      assert.ok(option, message);
      const response = await fetch(server.url + "/api/turn", {
        method: "POST",
        headers: { Origin: server.url, "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: before.revision,
          optionId: option.id,
        }),
      });
      assert.equal(response.status, 200);
      return response.json();
    };
    assert.equal((await SaveSession.load(path)).runtime.version, "12");
    await click("Travel to Watch Loft (0 days)");
    await click("Travel to Signal Records Room (0 days)");
    const offered = (await view()).actions
      .filter(({ contextId }) => contextId === "target:setting-plate")
      .map(({ label }) => label);
    assert.ok(offered.includes("Inspect") && offered.includes("Search"));
    assert.ok(!offered.includes("Examine"));
    const inspected = await click("Inspect beacon setting plate");
    assert.ok(
      !(await SaveSession.load(path)).state.discoveries.includes(
        "altered-setting",
      ),
    );
    assert.equal(inspected.committed, false);
    const searched = await click("Search beacon setting plate");
    assert.equal(searched.committed, true);
    const saved = await SaveSession.load(path);
    assert.equal(saved.runtime.version, "12");
    assert.ok(saved.state.discoveries.includes("altered-setting"));
  } finally {
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("a v13 command trace with typed examine replays", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-110-"));
  try {
    const runtime = await v13();
    let state = runtime.createSession();
    const trace = createSessionTrace(0, state, runtime);
    const random = createSeededRandom(0);
    for (const command of [
      "move watch-loft",
      "move signal-records",
      "examine setting-plate",
      "examine setting-plate",
    ]) {
      const action = runtime.parseCommand(command);
      const rolls = [];
      const result = runtime.handleAction(state, action, {
        roll(sides) {
          const value = random.roll(sides);
          rolls.push({ sides, value });
          return value;
        },
      });
      recordTraceAction(trace, command, action, rolls, result);
      state = result.state;
    }
    assert.ok(state.discoveries.includes("altered-setting"));
    completeSessionTrace(trace, "eof", state);
    const path = join(directory, "command.json");
    await writeFile(path, JSON.stringify(trace));
    await verifyTraceFile(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
