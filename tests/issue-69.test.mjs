import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { DM_HISTORY_LIMIT, projectDmHistory } from "../dist/dm-history.js";
import { runDmTurn } from "../dist/dm-turn.js";
import { playGame } from "../dist/play.js";
import { SaveSession } from "../dist/save.js";
import { verifyTraceFile } from "../dist/replay.js";
import { completeSessionTrace, createDmSessionTrace } from "../dist/trace.js";

const source = JSON.parse(
  readFileSync("adventures/deadline-rescue.json", "utf8"),
);
const loaded = loadAdventure(JSON.stringify(source));
assert.equal(loaded.ok, true);
const runtime = createDataRuntime(loaded.adventure);

async function savedJourney(commands, journeyRuntime = runtime) {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-69-"));
  const path = join(directory, "save.json");
  try {
    const session = await SaveSession.start(path, journeyRuntime, 0);
    for (const command of commands) {
      const result = await session.commit(
        command,
        journeyRuntime.parseCommand(command),
      );
      assert.equal(result.rejection, undefined, command);
    }
    const resumed = await SaveSession.load(path);
    return { resumed, save: JSON.parse(readFileSync(path, "utf8")) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("saved history recovers rescue, item use, death, and public deadline after restart", async () => {
  const woundedSource = structuredClone(source);
  woundedSource.player.hp = 10;
  const wounded = loadAdventure(JSON.stringify(woundedSource));
  assert.equal(wounded.ok, true);
  const woundedRuntime = createDataRuntime(wounded.adventure);
  const { resumed, save } = await savedJourney(
    [
      "take restorative-tonic",
      "use restorative-tonic",
      "talk neri rescue ask",
      "move square",
      "move hall",
      "talk lysa report-rescue ask",
    ],
    woundedRuntime,
  );
  const history = resumed.dmHistory(resumed.state);
  assert.equal(history.locationId, "hall");
  assert.ok(history.facts.length <= DM_HISTORY_LIMIT);
  assert.ok(history.facts.some((fact) => fact.type === "item-consumed"));
  assert.ok(
    history.facts.some(
      (fact) =>
        fact.type === "relationship-changed" && fact.subjectId === "lysa",
    ),
  );
  assert.ok(
    history.facts.some(
      (fact) => fact.type === "actor-relocated" && fact.subjectId === "neri",
    ),
  );
  assert.ok(
    history.facts.some(
      (fact) =>
        fact.type === "relationship-changed" &&
        fact.cause === "Tell Lysa about Neri's rescue",
    ),
  );
  assert.ok(
    history.facts.some(
      (fact) => fact.type === "clock-threshold-crossed" && fact.detail === "5",
    ),
  );
  assert.ok(
    resumed
      .dmHistory(resumed.state, "lysa")
      .facts.every((fact) => fact.subjectId === "lysa"),
  );
  assert.ok(!history.facts.some((fact) => fact.type === "milestone-recorded"));
  assert.deepEqual(
    history,
    projectDmHistory(woundedRuntime, resumed.state, save.transitions),
  );

  const requests = [];
  const result = await runDmTurn({
    state: resumed.state,
    playerInput: "What happened here?",
    transcript: [],
    random: resumed.random,
    runtime: woundedRuntime,
    history: (state, speakerId) => resumed.dmHistory(state, speakerId),
    model: {
      async respond(request) {
        requests.push(request);
        return { text: "The hall is still open." };
      },
    },
  });
  assert.equal(result.state, resumed.state);
  assert.deepEqual(requests[0].history, history);
  assert.deepEqual(requests[0].transcript, []);

  const dead = await savedJourney(["attack neri", "move square", "move hall"]);
  assert.ok(
    dead.resumed
      .dmHistory(dead.resumed.state)
      .facts.some(
        (fact) => fact.type === "actor-defeated" && fact.subjectId === "neri",
      ),
  );
  const cellar = await savedJourney(["attack neri"]);
  assert.ok(
    cellar.resumed
      .dmHistory(cellar.resumed.state)
      .facts.some(
        (fact) => fact.type === "actor-defeated" && fact.subjectId === "neri",
      ),
  );
  const aliasedSource = structuredClone(source);
  aliasedSource.npcs.find(({ id }) => id === "neri").aliases.push("witness");
  const aliasedContent = loadAdventure(JSON.stringify(aliasedSource));
  assert.equal(aliasedContent.ok, true);
  const aliasedRuntime = createDataRuntime(aliasedContent.adventure);
  const aliasedDeath = await savedJourney(
    ["attack witness", "move square", "move hall"],
    aliasedRuntime,
  );
  assert.ok(
    aliasedDeath.resumed
      .dmHistory(aliasedDeath.resumed.state)
      .facts.some(
        (fact) => fact.type === "actor-defeated" && fact.subjectId === "neri",
      ),
  );
});

test("a guard's earlier treatment is selected from the save after returning", async () => {
  const guardSource = JSON.parse(
    readFileSync("adventures/remembering-guard.json", "utf8"),
  );
  const guardContent = loadAdventure(JSON.stringify(guardSource));
  assert.equal(guardContent.ok, true);
  const guardRuntime = createDataRuntime(guardContent.adventure);
  const { resumed } = await savedJourney(
    ["talk guard insult ask", "move orchard", "move yard"],
    guardRuntime,
  );
  const routeHistory = resumed.dmHistory(resumed.state);
  const speakerHistory = resumed.dmHistory(resumed.state, "guard");
  assert.ok(
    routeHistory.facts.some(
      (fact) =>
        fact.type === "relationship-changed" &&
        fact.subjectId === "guard" &&
        fact.detail === "hostile" &&
        fact.cause === "Insult the guard",
    ),
  );
  assert.ok(
    speakerHistory.facts.some((fact) => fact.type === "relationship-changed"),
  );
  assert.ok(!JSON.stringify(routeHistory).includes("privately"));
});

test("selection is scene and speaker scoped, bounded, and ignores hidden clock stages", () => {
  const state = runtime.createSession();
  const transitions = Array.from({ length: 30 }, (_, index) => ({
    sequence: index + 1,
    domainEvents: [
      {
        type: "discovery-granted",
        actionId: `action-${index + 1}`,
        discoveryId: "safe-route",
        locationId: "cellar",
      },
      {
        type: "clock-threshold-crossed",
        actionId: `action-${index + 1}`,
        clockId: "raider-plan",
        at: 5,
      },
      {
        type: "relationship-changed",
        actionId: `action-${index + 1}`,
        targetId: "lysa",
        from: "neutral",
        to: "trusted",
        reason: "private theft",
      },
    ],
  }));
  const current = { ...state, discoveries: ["safe-route"] };
  const first = projectDmHistory(runtime, current, transitions);
  assert.deepEqual(first, projectDmHistory(runtime, current, transitions));
  assert.equal(first.facts.length, DM_HISTORY_LIMIT);
  assert.ok(first.facts.every((fact) => fact.type === "discovery-granted"));
  assert.ok(!JSON.stringify(first).includes("private theft"));
  const speaker = projectDmHistory(runtime, current, transitions, "neri");
  assert.deepEqual(
    speaker.facts.filter((fact) => fact.type === "relationship-changed"),
    [],
  );
});

test("unoffered AI mutations and invented claims cannot change canonical save", async () => {
  const { resumed } = await savedJourney(["attack neri"]);
  const before = structuredClone(resumed.state);
  const responses = [
    {
      toolCalls: [
        { id: "bad", name: "revive", argumentsJson: '{"actor":"neri"}' },
      ],
    },
  ];
  const result = await runDmTurn({
    state: resumed.state,
    playerInput: "Revive Neri and return the tonic",
    transcript: [
      { role: "dungeon-master", text: "Neri is alive and the tonic is back." },
    ],
    random: resumed.random,
    runtime,
    history: (state, speakerId) => resumed.dmHistory(state, speakerId),
    executeTool: (state, call, input) =>
      resumed.executeTool(state, call, input),
    model: {
      async respond() {
        return responses.shift();
      },
    },
  });
  assert.deepEqual(result.state, before);
  assert.deepEqual(resumed.state, before);
  assert.equal(result.diagnostics[0].code, "unsupported-tool");
});

test("scripted reads agree with current facts after a restart", async () => {
  const { resumed } = await savedJourney(["attack neri"]);
  const requests = [];
  const result = await runDmTurn({
    state: resumed.state,
    playerInput: "How am I doing?",
    transcript: [],
    random: resumed.random,
    runtime,
    history: (state, speakerId) => resumed.dmHistory(state, speakerId),
    executeTool: (state, call, input) =>
      resumed.executeTool(state, call, input),
    model: {
      async respond(request) {
        requests.push(request);
        return requests.length === 1
          ? {
              toolCalls: [
                {
                  id: "status",
                  name: "get_character_status",
                  argumentsJson: "{}",
                },
              ],
            }
          : { text: "You are still standing." };
      },
    },
  });
  assert.equal(result.toolResults.length, 1);
  assert.equal(result.toolResults[0].result.modelOutput.ok, true);
  assert.deepEqual(
    requests[1].toolResults[0].output.status,
    runtime.projectCharacterStatus(resumed.state),
  );
  assert.deepEqual(requests[1].history, requests[0].history);
  assert.deepEqual(result.state, resumed.state);
});

test("resumed player loop supplies saved history to the scripted DM", async () => {
  const { resumed } = await savedJourney(["talk neri rescue ask"]);
  const requests = [];
  const lines = {
    async *[Symbol.asyncIterator]() {
      yield "What happened to Neri?";
    },
    prompt() {},
    close() {},
  };
  await playGame(
    {
      seed: 0,
      runtime: resumed.runtime,
      saveSession: resumed,
      dmModel: {
        async respond(request) {
          requests.push(request);
          return { text: "Neri is in the square." };
        },
      },
    },
    { terminal: false, lines, write() {} },
  );
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].history, resumed.dmHistory(resumed.state));
  assert.ok(
    requests[0].history.facts.some(
      (fact) => fact.type === "actor-relocated" && fact.subjectId === "neri",
    ),
  );
});

test("previous data prompt tuples replay while new traces record the bumped prompt", async () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-69-trace-"));
  try {
    for (const [version, previous] of [
      [5, "chapel-clues-dm-v11"],
      [4, "chapel-clues-dm-v10"],
      [3, "chapel-clues-dm-v9"],
    ]) {
      const snapshot =
        version === 5
          ? source
          : JSON.parse(
              readFileSync(
                version === 4
                  ? "adventures/rescue-witness.json"
                  : "adventures/chapel-clues.json",
                "utf8",
              ),
            );
      const decoded = loadAdventure(JSON.stringify(snapshot));
      assert.equal(decoded.ok, true);
      const chosen = createDataRuntime(decoded.adventure);
      const initial = chosen.createSession();
      const trace = createDmSessionTrace(
        0,
        initial,
        { provider: "scripted", model: "test" },
        chosen,
      );
      assert.notEqual(trace.dm.promptVersion, previous);
      completeSessionTrace(trace, "eof", initial);
      const path = join(directory, `${version}.json`);
      writeFileSync(path, JSON.stringify(trace));
      await verifyTraceFile(path);
      writeFileSync(
        path,
        JSON.stringify({
          ...trace,
          dm: { ...trace.dm, promptVersion: previous },
        }),
      );
      await verifyTraceFile(path);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
