import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveAdventure } from "../dist/runtime.js";
import { DM_TURN_LIMITS, runDmTurn } from "../dist/dm-turn.js";

test("searching authored evidence records one attributed discovery and milestone", () => {
  const runtime = resolveAdventure("chapel");
  const initial = runtime.createSession();
  const first = runtime.handleAction(
    initial,
    runtime.parseCommand("search missing-person notice"),
    {
      roll() {
        assert.fail("Searching authored evidence must not roll");
      },
    },
  );

  assert.equal(first.rejection, undefined);
  assert.deepEqual(first.state.discoveries, [
    {
      id: "chapel-route",
      title: "The chapel route",
      source: {
        type: "feature",
        id: "missing-person-notice",
        name: "missing-person notice",
        locationId: "inn",
      },
      classification: "observation",
      summary:
        "The public notice says Tavi is missing and directs searchers along the chapel path to the ruined chapel.",
      actionableLead: "Follow the chapel path to the ruined chapel.",
    },
  ]);
  assert.deepEqual(first.state.quest.milestones, ["chapel-route-known"]);
  assert.deepEqual(first.events, [
    {
      type: "chapel-discovered",
      discoveryId: "chapel-route",
      milestoneId: "chapel-route-known",
    },
  ]);

  const repeated = runtime.handleAction(
    first.state,
    runtime.parseCommand("search missing-person notice"),
  );
  assert.equal(repeated.rejection, undefined);
  assert.equal(repeated.state, first.state);
  assert.deepEqual(repeated.events, []);
});

test("chapel repair evidence is local, order-independent, and links unsafe work to Oren", () => {
  const runtime = resolveAdventure("chapel");
  const initial = runtime.createSession();
  const remote = runtime.handleAction(initial, {
    type: "search",
    target: "damaged repair record",
  });
  assert.deepEqual(remote.rejection, { reason: "chapel-unavailable" });
  assert.equal(remote.state, initial);

  let state = runtime.handleAction(initial, {
    type: "move",
    destination: "chapel path",
  }).state;
  state = runtime.handleAction(state, {
    type: "move",
    destination: "ruined chapel",
  }).state;
  const inspected = runtime.handleAction(state, {
    type: "inspect",
    target: "damaged repair record",
  });
  assert.equal(inspected.rejection, undefined);
  assert.equal(inspected.state, state);
  assert.deepEqual(state.discoveries, []);

  const found = runtime.handleAction(state, {
    type: "search",
    target: "damaged repair record",
  });
  assert.equal(found.rejection, undefined);
  assert.deepEqual(found.state.quest.milestones, [
    "unsafe-repairs-linked-to-oren",
  ]);
  assert.deepEqual(found.state.discoveries, [
    {
      id: "unsafe-repairs",
      title: "Unsafe chapel repairs",
      source: {
        type: "feature",
        id: "damaged-repair-record",
        name: "damaged repair record",
        locationId: "ruined-chapel",
      },
      classification: "observation",
      summary:
        "The damaged record assigns the chapel repairs to Oren and shows that the roof supports were left unfinished and unsafe.",
      actionableLead: "Ask Oren about the unfinished chapel repairs.",
    },
  ]);

  const forged = runtime.handleAction(found.state, {
    type: "search",
    target: "Oren's confession",
  });
  assert.deepEqual(forged.rejection, { reason: "chapel-unavailable" });
  assert.equal(forged.state, found.state);
});

test("journal projects only discovered facts, attribution, progress, and known leads", () => {
  const runtime = resolveAdventure("chapel");
  const initial = runtime.createSession();
  const emptyJournal = runtime.renderResult(
    runtime.handleAction(initial, runtime.parseCommand("journal")),
  );
  assert.match(emptyJournal, /Active quest: Find Tavi/i);
  assert.match(emptyJournal, /Discoveries: none/i);
  assert.match(emptyJournal, /Known leads: none/i);
  assert.doesNotMatch(
    emptyJournal,
    /Oren|medicine|ledger|diverted|trapped|restitution/i,
  );

  let state = runtime.handleAction(initial, {
    type: "move",
    destination: "chapel path",
  }).state;
  state = runtime.handleAction(state, {
    type: "move",
    destination: "ruined chapel",
  }).state;
  state = runtime.handleAction(state, {
    type: "search",
    target: "damaged repair record",
  }).state;
  const journal = runtime.renderResult(
    runtime.handleAction(state, runtime.parseCommand("journal")),
  );
  assert.match(journal, /Unsafe chapel repairs/);
  assert.match(journal, /observation/i);
  assert.match(journal, /damaged repair record.*Ruined Chapel/i);
  assert.match(journal, /unsafe-repairs-linked-to-oren/);
  assert.match(journal, /Ask Oren about the unfinished chapel repairs/);
  assert.doesNotMatch(journal, /medicine|ledger|diverted|trapped|restitution/i);
});

test("chapel search and journal tools validate visible authored references", () => {
  const runtime = resolveAdventure("chapel");
  const initial = runtime.createSession();
  const tools = runtime.getGameToolDefinitions(initial);
  assert.deepEqual(
    tools.map(({ name }) => name),
    [
      "look",
      "get_character_status",
      "get_journal",
      "inspect",
      "search",
      "talk",
      "move",
    ],
  );
  assert.deepEqual(tools.find(({ name }) => name === "search").parameters, {
    type: "object",
    properties: {
      target: { type: "string", enum: ["missing-person-notice"] },
    },
    required: ["target"],
    additionalProperties: false,
  });

  for (const call of [
    { name: "search", argumentsJson: '{"target":"ledger"}' },
    {
      name: "search",
      argumentsJson: '{"target":"missing-person-notice","outcome":"found"}',
    },
  ]) {
    const rejected = runtime.dispatchGameTool(initial, call);
    assert.equal(rejected.modelOutput.ok, false);
    assert.deepEqual(rejected.state, initial);
  }

  const found = runtime.dispatchGameTool(initial, {
    name: "search",
    argumentsJson: '{"target":"missing-person-notice"}',
  });
  assert.equal(found.modelOutput.ok, true);
  assert.equal(found.state.discoveries.length, 1);
  const journal = runtime.dispatchGameTool(found.state, {
    name: "get_journal",
    argumentsJson: "{}",
  });
  assert.equal(journal.modelOutput.ok, true);
  assert.deepEqual(
    journal.modelOutput.journal.discoveries,
    found.state.discoveries,
  );
  assert.equal(journal.state, found.state);
});

test("search consumes the mutation budget and provider recovery preserves its first commit", async () => {
  const runtime = resolveAdventure("chapel");
  const requests = [];
  let response = 0;
  const result = await runDmTurn({
    state: runtime.createSession(),
    runtime,
    playerInput: "Search the missing-person notice, then search it again",
    transcript: [],
    random: {
      roll() {
        assert.fail("Evidence discovery must not draw randomness");
      },
    },
    model: {
      async respond(request) {
        requests.push(structuredClone(request));
        response += 1;
        if (response === 1) {
          return {
            toolCalls: [
              {
                id: "search-notice",
                name: "search",
                argumentsJson: '{"target":"missing-person-notice"}',
              },
            ],
          };
        }
        throw new Error("provider failed after discovery");
      },
    },
  });

  assert.equal(result.state.discoveries.length, 1);
  assert.equal(result.toolResults.length, 1);
  assert.deepEqual(result.toolResults[0].rolls, []);
  assert.match(result.mechanics[0], /Discovery recorded.*chapel route/i);
  assert.equal(result.diagnostics.at(-1).code, "model-failure");
  assert.match(result.narration, /authoritative result.*Mechanics/i);
  assert.ok(!requests[1].tools.some(({ name }) => name === "search"));
  assert.ok(!requests[1].tools.some(({ name }) => name === "move"));
  assert.ok(requests[1].tools.some(({ name }) => name === "get_journal"));
  assert.equal(requests[1].scene.journal.discoveries.length, 1);
});

test("a forged search target consumes the one mutation-attempt budget", async () => {
  const runtime = resolveAdventure("chapel");
  let response = 0;
  const initial = runtime.createSession();
  const result = await runDmTurn({
    state: initial,
    runtime,
    playerInput: "Search a forged ledger and then leave",
    transcript: [],
    random: {
      roll() {
        assert.fail("Rejected searches must not draw randomness");
      },
    },
    model: {
      async respond() {
        response += 1;
        return response === 1
          ? {
              toolCalls: [
                {
                  id: "forged-search",
                  name: "search",
                  argumentsJson: '{"target":"ledger"}',
                },
              ],
            }
          : {
              toolCalls: [
                {
                  id: "move-after-search",
                  name: "move",
                  argumentsJson: '{"destinationId":"chapel-path"}',
                },
              ],
            };
      },
    },
  });

  assert.equal(result.state, initial);
  assert.equal(
    result.toolResults[0].result.modelOutput.error.code,
    "unavailable-reference",
  );
  assert.deepEqual(result.toolAttempts[1].disposition, {
    attempted: true,
    validated: false,
    executed: false,
  });
  assert.equal(result.diagnostics.at(-1).code, "mutation-call-limit");
});

test("structured discoveries survive bounded transcript eviction", async () => {
  const runtime = resolveAdventure("chapel");
  const state = runtime.dispatchGameTool(runtime.createSession(), {
    name: "search",
    argumentsJson: '{"target":"missing-person-notice"}',
  }).state;
  const transcript = [
    { role: "dungeon-master", text: "OLD DISCOVERY NARRATION" },
    ...Array.from(
      { length: DM_TURN_LIMITS.maxTranscriptEntries + 3 },
      (_, index) => ({
        role: index % 2 === 0 ? "player" : "dungeon-master",
        text: `later-${index}`,
      }),
    ),
  ];
  const requests = [];
  const result = await runDmTurn({
    state,
    runtime,
    playerInput: "What did I discover and where should I go?",
    transcript,
    random: {
      roll() {
        assert.fail("Journal reads must not roll");
      },
    },
    model: {
      async respond(request) {
        requests.push(structuredClone(request));
        return request.toolResults.length === 0
          ? {
              toolCalls: [
                {
                  id: "journal-read",
                  name: "get_journal",
                  argumentsJson: "{}",
                },
              ],
            }
          : { text: "Your journal points along the chapel path." };
      },
    },
  });

  assert.equal(result.diagnostics.length, 0);
  assert.equal(
    requests[0].transcript.length,
    DM_TURN_LIMITS.maxTranscriptEntries,
  );
  assert.doesNotMatch(JSON.stringify(requests[0].transcript), /OLD DISCOVERY/);
  assert.equal(requests[0].scene.journal.discoveries[0].id, "chapel-route");
  assert.equal(
    result.toolResults[0].result.modelOutput.journal.actionableLeads[0],
    "Follow the chapel path to the ruined chapel.",
  );
});

test("exact AI-mode journal is provider-free, traced, and replay-validated", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chapel-journal-trace-"));
  try {
    const tracePath = path.join(directory, "dm.json");
    const scriptPath = path.join(directory, "script.json");
    writeFileSync(
      scriptPath,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "search-notice",
              name: "search",
              argumentsJson: '{"target":"missing-person-notice"}',
            },
          ],
        },
        { text: "You record the public route." },
        {
          toolCalls: [
            {
              id: "search-notice-again",
              name: "search",
              argumentsJson: '{"target":"missing-person-notice"}',
            },
          ],
        },
        { text: "The journal already contains everything on the notice." },
      ]),
    );
    const played = spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "--adventure",
        "chapel",
        "--seed",
        "8",
        "--trace",
        tracePath,
      ],
      {
        encoding: "utf8",
        input:
          "Search the missing-person notice.\nSearch the notice again.\njournal\nquit\n",
        env: { ...process.env, DUNGEON_ONE_TEST_DM_SCRIPT: scriptPath },
      },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /Journal\nActive quest: Find Tavi/i);
    assert.match(played.stdout, /The chapel route/);
    const exported = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.deepEqual(
      exported.turns.map(({ kind }) => kind),
      ["dm", "dm", "local-journal", "local-quit"],
    );
    assert.deepEqual(exported.turns[1].calls[0].result.engineResult.events, []);
    assert.equal(exported.turns[1].stateAfter.discoveries.length, 1);
    assert.equal(exported.turns[2].result.type, "accepted");
    assert.equal(
      exported.turns[2].result.events[0].journal.discoveries[0].id,
      "chapel-route",
    );

    const replayed = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", tracePath],
      {
        encoding: "utf8",
        env: { ...process.env, DUNGEON_ONE_TEST_DM_SCRIPT: "" },
      },
    );
    assert.equal(replayed.status, 0, replayed.stderr);

    const resultTampered = structuredClone(exported);
    resultTampered.turns[2].result.events[0].journal.discoveries = [];
    const resultTamperedPath = path.join(directory, "tampered-result.json");
    writeFileSync(resultTamperedPath, JSON.stringify(resultTampered));
    const rejectedResult = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", resultTamperedPath],
      { encoding: "utf8" },
    );
    assert.notEqual(rejectedResult.status, 0);
    assert.match(rejectedResult.stderr, /local-journal result/i);

    exported.turns[2].rawPlayerInput = "journals";
    const tamperedPath = path.join(directory, "tampered.json");
    writeFileSync(tamperedPath, JSON.stringify(exported));
    const tampered = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", tamperedPath],
      { encoding: "utf8" },
    );
    assert.notEqual(tampered.status, 0);
    assert.match(tampered.stderr, /local-journal.*input/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI provider failure after discovery keeps the journal usable without repeating it", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chapel-recovery-trace-"));
  try {
    const tracePath = path.join(directory, "dm.json");
    const scriptPath = path.join(directory, "script.json");
    writeFileSync(
      scriptPath,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "search-notice",
              name: "search",
              argumentsJson: '{"target":"missing-person-notice"}',
            },
          ],
        },
      ]),
    );
    const played = spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "--adventure",
        "chapel",
        "--seed",
        "12",
        "--trace",
        tracePath,
      ],
      {
        encoding: "utf8",
        input: "Search the missing-person notice.\njournal\nquit\n",
        env: { ...process.env, DUNGEON_ONE_TEST_DM_SCRIPT: scriptPath },
      },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /authoritative result.*Mechanics/i);
    assert.match(played.stdout, /Journal[\s\S]*The chapel route/i);
    const exported = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(exported.turns[0].diagnostics[0].code, "model-failure");
    assert.equal(exported.turns[0].stateAfter.discoveries.length, 1);
    assert.equal(exported.turns[1].kind, "local-journal");
    const replayed = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", tracePath],
      {
        encoding: "utf8",
        env: { ...process.env, DUNGEON_ONE_TEST_DM_SCRIPT: "" },
      },
    );
    assert.equal(replayed.status, 0, replayed.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("pre-discovery chapel format-3 traces remain replayable", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chapel-v1-trace-"));
  try {
    const tracePath = path.join(directory, "legacy.json");
    const initialState = {
      adventureId: "chapel",
      locationId: "inn",
      status: "playing",
      fighter: { hp: 20, maxHp: 20, equipmentIds: ["longsword"] },
      quest: { id: "find-tavi", status: "active" },
    };
    const pathState = { ...initialState, locationId: "chapel-path" };
    const chapelState = { ...initialState, locationId: "ruined-chapel" };
    writeFileSync(
      tracePath,
      JSON.stringify({
        formatVersion: 3,
        rulesVersion: "chapel-exploration-rules-v1",
        adventure: { id: "chapel", version: "chapel-exploration-v1" },
        random: { algorithm: "mulberry32-v1", initialSeed: 0 },
        initialState,
        actions: [
          {
            sequence: 1,
            rawInput: "move chapel-path",
            action: { type: "move", destination: "chapel-path" },
            rolls: [],
            result: {
              type: "accepted",
              events: [
                {
                  type: "chapel-moved",
                  fromRoomId: "inn",
                  roomId: "chapel-path",
                },
                { type: "chapel-scene", roomId: "chapel-path" },
              ],
            },
            stateAfter: pathState,
          },
          {
            sequence: 2,
            rawInput: "move ruined-chapel",
            action: { type: "move", destination: "ruined-chapel" },
            rolls: [],
            result: {
              type: "accepted",
              events: [
                {
                  type: "chapel-moved",
                  fromRoomId: "chapel-path",
                  roomId: "ruined-chapel",
                },
                { type: "chapel-scene", roomId: "ruined-chapel" },
              ],
            },
            stateAfter: chapelState,
          },
          {
            sequence: 3,
            rawInput: "inspect damaged repair record",
            action: { type: "inspect", target: "damaged repair record" },
            rolls: [],
            result: {
              type: "rejected",
              rejection: { reason: "chapel-unavailable" },
            },
            stateAfter: chapelState,
          },
          {
            sequence: 4,
            rawInput: "quit",
            action: { type: "quit" },
            rolls: [],
            result: {
              type: "accepted",
              events: [{ type: "session-quit" }],
            },
            stateAfter: { ...chapelState, status: "quit" },
          },
        ],
        completion: { reason: "quit", outcome: "incomplete" },
      }),
    );
    const replayed = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", tracePath],
      { encoding: "utf8" },
    );
    assert.equal(replayed.status, 0, replayed.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("chapel command exploration keeps the missing-person quest active at the crypt boundary", () => {
  const runtime = resolveAdventure("chapel");
  let state = runtime.createSession();
  assert.equal(state.locationId, "inn");
  assert.deepEqual(state.quest, {
    id: "find-tavi",
    status: "active",
    milestones: [],
  });
  assert.match(runtime.renderIntroduction(), /Tavi.*missing/i);
  for (const destination of [
    "ferry landing",
    "inn",
    "chapel path",
    "ruined chapel",
    "crypt",
  ]) {
    const result = runtime.handleAction(
      state,
      runtime.parseCommand(`move ${destination}`),
    );
    assert.equal(result.rejection, undefined);
    state = result.state;
  }
  assert.equal(state.locationId, "crypt");
  assert.match(
    runtime.renderResult(runtime.handleAction(state, { type: "look" })),
    /not yet playable/i,
  );
  for (const command of [
    "take ledger",
    "rescue Tavi",
    "leave",
    "attack skeleton",
  ]) {
    const result = runtime.handleAction(state, runtime.parseCommand(command));
    assert.ok(result.rejection);
    assert.deepEqual(result.state, state);
  }
  const quit = runtime.handleAction(state, { type: "quit" });
  assert.equal(quit.state.status, "quit");
  assert.equal(quit.state.quest.status, "active");
});

test("chapel AI receives only public content and its own versioned prompt", async () => {
  const runtime = resolveAdventure("chapel");
  let state = runtime.createSession();
  const requests = [];
  for (const destinationId of [
    "ferry-landing",
    "inn",
    "chapel-path",
    "ruined-chapel",
    "crypt",
  ]) {
    const result = await runDmTurn({
      state,
      runtime,
      playerInput: `Go to ${destinationId}`,
      transcript: [],
      random: {
        roll() {
          assert.fail("Navigation must not roll");
        },
      },
      model: {
        async respond(request) {
          requests.push(request);
          return request.toolResults.length === 0
            ? {
                toolCalls: [
                  {
                    id: "move",
                    name: "move",
                    argumentsJson: JSON.stringify({ destinationId }),
                  },
                ],
              }
            : { text: "You follow the public route." };
        },
      },
    });
    assert.deepEqual(result.diagnostics, []);
    state = result.state;
    for (const [name, args] of [
      ["inspect", { target: "ledger" }],
      ["rescue", { target: "tavi" }],
      ["move", { destinationId: "inn", hp: 100 }],
    ]) {
      const rejected = runtime.dispatchGameTool(state, {
        name,
        argumentsJson: JSON.stringify(args),
      });
      assert.equal(rejected.modelOutput.ok, false);
      assert.deepEqual(rejected.state, state);
    }
  }
  assert.equal(state.locationId, "crypt");
  assert.equal(requests[0].promptVersion, "chapel-dialogue-dm-v3");
  assert.match(requests[0].systemPrompt, /Bell Beneath the Chapel/);
  assert.doesNotMatch(
    JSON.stringify(requests),
    /signet|ledger|medicine|diverted|trapped|restitution/i,
  );
  const publicRead = runtime.dispatchGameTool(runtime.createSession(), {
    name: "inspect",
    argumentsJson: '{"target":"missing-person-notice"}',
  });
  assert.equal(publicRead.modelOutput.ok, true);
  assert.match(publicRead.modelOutput.inspection.description, /ruined chapel/);
  assert.deepEqual(publicRead.state, runtime.createSession());
});

test("chapel command and scripted-AI journeys export format 3 and replay without a model", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chapel-trace-"));
  try {
    const commandTrace = path.join(directory, "command.json");
    const command = spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "--adventure",
        "chapel",
        "--seed",
        "4",
        "--trace",
        commandTrace,
      ],
      {
        encoding: "utf8",
        input:
          "help\nsearch damaged repair record\nsearch ledger\ninspect missing-person notice\nsearch missing-person notice\nsearch missing-person notice\njournal\nmove chapel-path\nmove ruined-chapel\nsearch damaged repair record\njournal\nmove crypt\nquit\n",
      },
    );
    assert.equal(command.status, 0, command.stderr);
    assert.match(command.stdout, /The chapel route/);
    assert.match(command.stdout, /already recorded in your journal/);
    assert.match(command.stdout, /Unsafe chapel repairs/);
    const exported = JSON.parse(readFileSync(commandTrace, "utf8"));
    assert.equal(exported.formatVersion, 3);
    assert.deepEqual(exported.adventure, {
      id: "chapel",
      version: "chapel-dialogue-v3",
    });
    assert.equal(exported.rulesVersion, "chapel-dialogue-rules-v3");
    assert.equal(exported.random.algorithm, "mulberry32-v1");
    assert.ok(
      exported.actions.every(
        (action) =>
          action.action &&
          action.result &&
          action.stateAfter &&
          Array.isArray(action.rolls),
      ),
    );
    assert.deepEqual(
      exported.actions.slice(1, 3).map(({ result }) => result),
      [
        {
          type: "rejected",
          rejection: { reason: "chapel-unavailable" },
        },
        {
          type: "rejected",
          rejection: { reason: "chapel-unavailable" },
        },
      ],
    );
    const replay = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", commandTrace],
      { encoding: "utf8" },
    );
    assert.equal(replay.status, 0, replay.stderr);

    const unknownVersion = structuredClone(exported);
    unknownVersion.rulesVersion = "chapel-future-rules";
    const unknownPath = path.join(directory, "unknown.json");
    writeFileSync(unknownPath, JSON.stringify(unknownVersion));
    const unknown = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", unknownPath],
      { encoding: "utf8" },
    );
    assert.notEqual(unknown.status, 0);
    assert.match(unknown.stderr, /unsupported rules version/i);

    exported.actions.find(
      ({ action }) => action.type === "move",
    ).stateAfter.locationId = "crypt";
    const tamperedPath = path.join(directory, "tampered.json");
    writeFileSync(tamperedPath, JSON.stringify(exported));
    const tampered = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", tamperedPath],
      { encoding: "utf8" },
    );
    assert.notEqual(tampered.status, 0);
    assert.match(tampered.stderr, /replay divergence/i);

    const dmTrace = path.join(directory, "dm.json");
    const scriptPath = path.join(directory, "script.json");
    writeFileSync(
      scriptPath,
      JSON.stringify([
        {
          toolCalls: [
            {
              id: "m1",
              name: "move",
              argumentsJson: '{"destinationId":"chapel-path"}',
            },
          ],
        },
        { text: "You take the public path." },
      ]),
    );
    const scripted = spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "--adventure",
        "chapel",
        "--seed",
        "4",
        "--trace",
        dmTrace,
      ],
      {
        encoding: "utf8",
        input: "Go to the chapel path.\nquit\n",
        env: { ...process.env, DUNGEON_ONE_TEST_DM_SCRIPT: scriptPath },
      },
    );
    assert.equal(scripted.status, 0, scripted.stderr);
    const dmExport = JSON.parse(readFileSync(dmTrace, "utf8"));
    assert.equal(dmExport.formatVersion, 3);
    assert.deepEqual(dmExport.dm, {
      promptVersion: "chapel-dialogue-dm-v3",
      toolSchemaVersion: "chapel-dialogue-tools-v3",
      provider: "scripted",
      model: "scripted-dm-v1",
    });
    const dmReplay = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", dmTrace],
      {
        encoding: "utf8",
        env: { ...process.env, DUNGEON_ONE_TEST_DM_SCRIPT: "" },
      },
    );
    assert.equal(dmReplay.status, 0, dmReplay.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
