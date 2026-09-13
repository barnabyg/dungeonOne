import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveAdventure } from "../dist/runtime.js";
import { runDmTurn } from "../dist/dm-turn.js";

test("chapel command exploration keeps the missing-person quest active at the crypt boundary", () => {
  const runtime = resolveAdventure("chapel");
  let state = runtime.createSession();
  assert.equal(state.locationId, "inn");
  assert.deepEqual(state.quest, { id: "find-tavi", status: "active" });
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
  assert.equal(requests[0].promptVersion, "chapel-exploration-dm-v1");
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
          "help\ninspect missing-person notice\nmove chapel-path\nmove ruined-chapel\nmove crypt\nquit\n",
      },
    );
    assert.equal(command.status, 0, command.stderr);
    assert.match(command.stdout, /inspect missing-person notice/);
    const exported = JSON.parse(readFileSync(commandTrace, "utf8"));
    assert.equal(exported.formatVersion, 3);
    assert.deepEqual(exported.adventure, {
      id: "chapel",
      version: "chapel-exploration-v1",
    });
    assert.equal(exported.rulesVersion, "chapel-exploration-rules-v1");
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

    exported.actions[1].stateAfter.locationId = "crypt";
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
      promptVersion: "chapel-exploration-dm-v1",
      toolSchemaVersion: "chapel-exploration-tools-v1",
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
