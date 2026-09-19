import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runDmTurn } from "../dist/dm-turn.js";
import {
  resolveAdventure,
  resolveHistoricalAdventure,
} from "../dist/runtime.js";

function noRolls(message = "This action must not draw randomness") {
  return {
    roll() {
      assert.fail(message);
    },
  };
}

function clearGuardian(runtime) {
  let state = runtime.createSession();
  for (const destination of ["chapel-path", "ruined-chapel"]) {
    state = runtime.handleAction(
      state,
      { type: "move", destination },
      noRolls("Ordinary movement must not roll"),
    ).state;
  }
  state = runtime.handleAction(
    state,
    { type: "move", destination: "crypt" },
    { roll: (sides) => sides },
  ).state;
  return runtime.handleAction(
    state,
    { type: "attack", target: "skeleton" },
    { roll: (sides) => sides },
  ).state;
}

test("ledger evidence and Tavi remain hidden until the guardian is defeated", () => {
  const runtime = resolveAdventure("chapel");
  let state = runtime.createSession();
  state = runtime.handleAction(state, {
    type: "move",
    destination: "chapel-path",
  }).state;
  state = runtime.handleAction(state, {
    type: "move",
    destination: "ruined-chapel",
  }).state;

  const beforeCombat = runtime.getGameToolDefinitions(state);
  assert.doesNotMatch(JSON.stringify(beforeCombat), /ledger|rescue/i);
  assert.equal(runtime.projectDmScene(state).room.npcs.length, 0);

  const cleared = clearGuardian(runtime);
  const scene = runtime.projectDmScene(cleared);
  assert.deepEqual(
    scene.room.npcs.map(({ id, condition, subjects }) => ({
      id,
      condition,
      subjects: subjects.map(({ id: subjectId }) => subjectId),
    })),
    [{ id: "tavi", condition: "living", subjects: ["crypt", "rescue"] }],
  );
  assert.match(
    JSON.stringify(runtime.getGameToolDefinitions(cleared)),
    /ledger/,
  );
});

test("searching the ledger records conclusive sourced evidence without a roll", () => {
  const runtime = resolveAdventure("chapel");
  const cleared = clearGuardian(runtime);
  const found = runtime.handleAction(
    cleared,
    runtime.parseCommand("search diversion ledger"),
    noRolls("Searching authored ledger evidence must not roll"),
  );

  assert.equal(found.rejection, undefined);
  assert.deepEqual(
    found.state.discoveries.map(({ id }) => id),
    ["diversion-ledger"],
  );
  assert.match(found.state.discoveries[0].summary, /diverted.*medicine/is);
  assert.deepEqual(found.state.discoveries[0].source, {
    type: "feature",
    id: "diversion-ledger",
    name: "diversion ledger",
    locationId: "crypt",
  });
});

test("Tavi describes only the crypt and rescue moves them atomically to the inn", () => {
  const runtime = resolveAdventure("chapel");
  const cleared = clearGuardian(runtime);
  const account = runtime.handleAction(
    cleared,
    runtime.parseCommand("talk tavi crypt ask"),
    noRolls("Tavi's authored account must not roll"),
  );
  assert.equal(account.rejection, undefined);
  assert.match(account.events[0].conversation.authoredReply, /crypt|skeleton/i);
  assert.doesNotMatch(
    account.events[0].conversation.authoredReply,
    /Mara.*ferry|Oren.*medicine/i,
  );

  const rescued = runtime.handleAction(
    account.state,
    runtime.parseCommand("talk tavi rescue ask"),
    noRolls("The authored rescue transition must not roll"),
  );
  assert.equal(rescued.rejection, undefined);
  assert.equal(rescued.state.npcStates.tavi.condition, "living");
  assert.equal(rescued.state.npcLocations.tavi, "inn");
  assert.ok(rescued.state.quest.milestones.includes("tavi-rescued"));
  assert.equal(
    rescued.events.filter(({ type }) => type === "chapel-tavi-rescued").length,
    1,
  );
  const postRescueLook = runtime.renderResult(
    runtime.handleAction(rescued.state, { type: "look" }, noRolls()),
  );
  assert.match(postRescueLook, /diversion ledger.*accessible/i);
  assert.doesNotMatch(postRescueLook, /Tavi.*accessible beyond the arch/i);

  const repeated = runtime.handleAction(
    rescued.state,
    runtime.parseCommand("talk tavi rescue ask"),
    noRolls("A repeated rescue must not roll"),
  );
  assert.notEqual(repeated.rejection, undefined);
  assert.strictEqual(repeated.state, rescued.state);
});

test("ledger evidence bypasses a failed Oren check without resetting its lock", () => {
  const runtime = resolveAdventure("chapel");
  let state = runtime.createSession();
  state = runtime.handleAction(state, {
    type: "move",
    destination: "ferry-landing",
  }).state;
  const failed = runtime.handleAction(
    state,
    runtime.parseCommand("talk oren repairs intimidate"),
    { roll: () => 1 },
  );
  assert.equal(failed.state.socialChallenges.guardedAccount.result, "failure");

  state = runtime.handleAction(failed.state, {
    type: "move",
    destination: "inn",
  }).state;
  state = clearGuardian(runtimeFromState(runtime, state));
  state = runtime.handleAction(
    state,
    runtime.parseCommand("search diversion ledger"),
    noRolls(),
  ).state;
  for (const destination of [
    "ruined-chapel",
    "chapel-path",
    "inn",
    "ferry-landing",
  ]) {
    state = runtime.handleAction(
      state,
      { type: "move", destination },
      noRolls(),
    ).state;
  }
  const answered = runtime.handleAction(
    state,
    runtime.parseCommand("talk oren repairs ask"),
    noRolls("Conclusive evidence must bypass another social roll"),
  );

  assert.equal(answered.rejection, undefined);
  assert.match(
    answered.events.at(-1).conversation.authoredReply,
    /ledger.*conclusive/i,
  );
  assert.deepEqual(
    answered.state.socialChallenges,
    failed.state.socialChallenges,
  );
});

test("stale and ambiguous rescue requests cannot mutate state", () => {
  const runtime = resolveAdventure("chapel");
  const cleared = clearGuardian(runtime);
  const offered = runtime.getGameToolDefinitions(cleared);
  assert.match(JSON.stringify(offered), /rescue/);

  const ambiguous = runtime.handleAction(
    cleared,
    runtime.parseCommand("talk tavi rescue"),
    noRolls(),
  );
  assert.notEqual(ambiguous.rejection, undefined);
  assert.strictEqual(ambiguous.state, cleared);

  const rescued = runtime.dispatchGameTool(
    cleared,
    {
      name: "talk",
      argumentsJson: '{"speakerId":"tavi","topicId":"rescue","approach":"ask"}',
    },
    noRolls(),
  );
  assert.equal(rescued.modelOutput.ok, true);
  const stale = runtime.dispatchGameTool(
    rescued.state,
    {
      name: "talk",
      argumentsJson: '{"speakerId":"tavi","topicId":"rescue","approach":"ask"}',
    },
    noRolls(),
  );
  assert.equal(stale.modelOutput.ok, false);
  assert.equal(stale.modelOutput.error.code, "unknown-tool");
  assert.strictEqual(stale.state, rescued.state);
});

function runtimeFromState(runtime, initialState) {
  return {
    ...runtime,
    createSession() {
      return initialState;
    },
  };
}

test("provider failure after rescue preserves exactly one scoped transition", async () => {
  const runtime = resolveAdventure("chapel");
  const requests = [];
  const result = await runDmTurn({
    state: clearGuardian(runtime),
    runtime,
    playerInput: "Get Tavi safely back to the inn.",
    transcript: Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? "player" : "dungeon-master",
      text: `UNRELATED_VILLAGE_CONVERSATION_${index}`,
    })),
    random: noRolls("Rescue and reply recovery must not roll"),
    model: {
      async respond(request) {
        requests.push(structuredClone(request));
        if (requests.length === 1) {
          return {
            toolCalls: [
              {
                id: "rescue-tavi",
                name: "talk",
                argumentsJson:
                  '{"speakerId":"tavi","topicId":"rescue","approach":"ask"}',
              },
            ],
          };
        }
        throw new Error("reply provider failed");
      },
    },
  });

  assert.equal(result.state.npcLocations.tavi, "inn");
  assert.equal(result.toolAttempts.length, 1);
  assert.equal(result.diagnostics[0].code, "model-failure");
  assert.match(result.narration, /marked safe route.*village inn/i);
  assert.doesNotMatch(
    JSON.stringify(requests[1].transcript),
    /UNRELATED_VILLAGE_CONVERSATION/,
  );
  assert.deepEqual(
    requests[1].reply.approvedFacts.map(({ id }) => id),
    ["tavi-rescue-consent"],
  );
});

test("offline rescue, evidence-backed return, export, and replay are deterministic", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ledger-rescue-"));
  try {
    const tracePath = path.join(directory, "trace.json");
    const played = spawnSync(
      process.execPath,
      [
        "dist/cli.js",
        "--adventure",
        "chapel",
        "--seed",
        "0",
        "--trace",
        tracePath,
      ],
      {
        encoding: "utf8",
        input: [
          "search diversion ledger",
          "move chapel-path",
          "move ruined-chapel",
          "move crypt",
          "attack skeleton",
          "attack skeleton",
          "attack skeleton",
          "search diversion ledger",
          "talk tavi crypt ask",
          "talk tavi rescue ask",
          "move ruined-chapel",
          "move chapel-path",
          "move inn",
          "move ferry-landing",
          "talk oren repairs ask",
          "journal",
          "quit",
          "",
        ].join("\n"),
      },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /ledger is conclusive/i);
    assert.match(played.stdout, /Tavi \(living; public subjects:/i);
    assert.match(played.stdout, /tavi-rescued/i);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.adventure.version, "chapel-rescue-v7");
    const rescue = trace.actions.find(
      ({ action }) =>
        action.type === "talk" &&
        action.target === "tavi" &&
        action.topic === "rescue",
    );
    assert.equal(rescue.stateAfter.npcLocations.tavi, "inn");
    assert.equal(
      rescue.result.events.filter(({ type }) => type === "chapel-tavi-rescued")
        .length,
      1,
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

test("potion-v6 remains replayable without rescue state or references", () => {
  const runtime = resolveHistoricalAdventure(
    "chapel-potion-rules-v6",
    "chapel-potion-v6",
    "chapel",
  );
  const cleared = clearGuardian(runtime);
  assert.equal("npcLocations" in cleared, false);
  assert.doesNotMatch(
    JSON.stringify(runtime.getGameToolDefinitions(cleared)),
    /ledger|rescue|tavi/i,
  );
});

test("scripted-AI CLI keeps Tavi's account scoped and commits one rescue", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ledger-rescue-ai-"));
  try {
    const scriptPath = path.join(directory, "script.json");
    const tracePath = path.join(directory, "trace.json");
    const actionTurn = (id, name, argumentsJson, narration) => [
      { toolCalls: [{ id, name, argumentsJson }] },
      { text: narration },
    ];
    writeFileSync(
      scriptPath,
      JSON.stringify([
        ...actionTurn(
          "move-path",
          "move",
          '{"destinationId":"chapel-path"}',
          "You follow the public path.",
        ),
        ...actionTurn(
          "move-chapel",
          "move",
          '{"destinationId":"ruined-chapel"}',
          "You enter the ruined chapel.",
        ),
        ...actionTurn(
          "move-crypt",
          "move",
          '{"destinationId":"crypt"}',
          "The guardian blocks the crypt.",
        ),
        ...actionTurn(
          "attack-one",
          "attack",
          '{"combatantId":"skeleton-guardian"}',
          "Your first attack misses.",
        ),
        ...actionTurn(
          "attack-two",
          "attack",
          '{"combatantId":"skeleton-guardian"}',
          "Your second attack damages the guardian.",
        ),
        ...actionTurn(
          "attack-three",
          "attack",
          '{"combatantId":"skeleton-guardian"}',
          "The guardian falls.",
        ),
        ...actionTurn(
          "search-ledger",
          "search",
          '{"target":"diversion-ledger"}',
          "You record the ledger evidence.",
        ),
        {
          toolCalls: [
            {
              id: "talk-crypt",
              name: "talk",
              argumentsJson:
                '{"speakerId":"tavi","topicId":"crypt","approach":"ask"}',
            },
          ],
        },
        {
          text: JSON.stringify({
            delivery: "steady",
            opening: "none",
            factIds: ["tavi-crypt-testimony"],
            closing: "check-carefully",
          }),
        },
        {
          toolCalls: [
            {
              id: "rescue-tavi",
              name: "talk",
              argumentsJson:
                '{"speakerId":"tavi","topicId":"rescue","approach":"ask"}',
            },
          ],
        },
        {
          text: JSON.stringify({
            delivery: "steady",
            opening: "none",
            factIds: ["tavi-rescue-consent"],
            closing: "check-carefully",
          }),
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
        "0",
        "--trace",
        tracePath,
      ],
      {
        encoding: "utf8",
        input: [
          "Go to the chapel path.",
          "Enter the ruined chapel.",
          "Enter the crypt.",
          "Attack the skeleton.",
          "Attack the skeleton again.",
          "Finish the skeleton.",
          "Search the ledger.",
          "Ask Tavi what happened in the crypt.",
          "Get Tavi safely back to the inn.",
          "quit",
          "",
        ].join("\n"),
        env: { ...process.env, DUNGEON_ONE_TEST_DM_SCRIPT: scriptPath },
      },
    );
    assert.equal(played.status, 0, played.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(trace.turns.at(-1).stateAfter.npcLocations.tavi, "inn");
    assert.equal(
      trace.turns
        .flatMap(({ calls }) => calls)
        .flatMap(({ result }) => result?.engineResult?.events ?? [])
        .filter(({ type }) => type === "chapel-tavi-rescued").length,
      1,
    );
    assert.doesNotMatch(
      JSON.stringify(trace.turns.at(-2).request?.transcript ?? []),
      /Mara.*ferry|Oren.*medicine/i,
    );
    assert.equal(
      spawnSync(process.execPath, ["dist/cli.js", "--replay", tracePath], {
        encoding: "utf8",
      }).status,
      0,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
