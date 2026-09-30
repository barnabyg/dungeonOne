import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadAdventure } from "../dist/adventure-loader.js";
import { DECEPTION_SCHEMA } from "../dist/deception-schema.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { projectDmHistory } from "../dist/dm-history.js";

const fixture = fileURLToPath(
  new URL("../adventures/deceptive-crossroads.json", import.meta.url),
);
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const content = JSON.parse(readFileSync(fixture, "utf8"));
const command = "attempt deceive lysa about neri safe route";
const profileId = "lysa-neri-safe";

function runtime(source = content) {
  const loaded = loadAdventure(JSON.stringify(source));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return createDataRuntime(loaded.adventure);
}

function dice(...values) {
  return {
    calls: 0,
    roll(sides) {
      assert.equal(sides, 20);
      return values[this.calls++];
    },
  };
}

function run(input, args, script) {
  return spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      OPENAI_API_KEY: "",
      ...(script === undefined ? {} : { DUNGEON_ONE_TEST_DM_SCRIPT: script }),
    },
  });
}

test("schema v8 validates finite actor-specific tactics and preserves v7", () => {
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v8.schema.json", "utf8")),
    DECEPTION_SCHEMA,
  );
  assert.equal(
    loadAdventure(readFileSync("adventures/distracted-crossroads.json")).ok,
    true,
  );
  for (const mutate of [
    (copy) => {
      copy.deceptionProfiles[0].allyId = "missing";
    },
    (copy) => {
      copy.deceptionProfiles[0].responseTopicId = "missing";
    },
    (copy) => {
      copy.deceptionProfiles[0].playerModifier = 99;
    },
    (copy) => {
      copy.deceptionProfiles[0].when = [
        { type: "milestone-recorded", id: "missing" },
      ];
    },
    (copy) => {
      copy.deceptionProfiles[0].worldEffect = "rescue-neri";
    },
  ]) {
    const copy = structuredClone(content);
    mutate(copy);
    assert.equal(loadAdventure(JSON.stringify(copy)).ok, false);
  }
});

test("a visible peaceful ally can be the defender", () => {
  const copy = structuredClone(content);
  const scribe = structuredClone(copy.npcs.find(({ id }) => id === "lysa"));
  scribe.id = "scribe";
  scribe.name = "Scribe";
  scribe.aliases = ["scribe"];
  scribe.topics = [scribe.topics.find(({ id }) => id === "response")];
  delete scribe.combat;
  delete scribe.remains;
  copy.npcs.push(scribe);
  copy.deceptionProfiles[0].id = "scribe-neri-safe";
  copy.deceptionProfiles[0].allyId = "scribe";
  const game = runtime(copy);
  const start = game.createSession();
  assert.deepEqual(
    game.getGameToolDefinitions(start).find(({ name }) => name === "deceive")
      .parameters.properties.profileId.enum,
    ["scribe-neri-safe"],
  );
  const result = game.handleAction(
    start,
    {
      type: "deceive",
      profileId: "scribe-neri-safe",
      allyId: "scribe",
      claimId: "neri-safe-route",
    },
    dice(20, 1),
  );
  assert.equal(result.rejection, undefined);
  assert.equal(
    result.state.deceptionChecks["scribe-neri-safe"].result,
    "success",
  );
});

test("opposed check shows both dice, defender wins ties, and only Lysa holds the claim", () => {
  const game = runtime();
  const start = game.createSession();
  assert.equal(game.engineVersion, "chapel-clues-engine-v13");
  assert.equal(game.promptVersion, "chapel-clues-dm-v16");
  assert.equal(game.toolSchemaVersion, "chapel-clues-tools-v13");
  assert.deepEqual(
    game.getGameToolDefinitions(start).find(({ name }) => name === "deceive")
      .parameters.properties.profileId.enum,
    [profileId],
  );
  const action = game.parseCommand(command);
  assert.deepEqual(action, {
    type: "deceive",
    profileId,
    allyId: "lysa",
    claimId: "neri-safe-route",
  });

  const successfulDice = dice(15, 5);
  const success = game.handleAction(start, action, successfulDice);
  assert.equal(successfulDice.calls, 2);
  assert.equal(success.state.deceptionChecks[profileId].result, "success");
  assert.equal(success.state.clocks["raider-plan"], 1);
  assert.deepEqual(success.state.discoveries, start.discoveries);
  assert.deepEqual(success.state.milestones, start.milestones);
  assert.deepEqual(success.state.npcLocations, start.npcLocations);
  assert.deepEqual(success.state.npcHealth, start.npcHealth);
  assert.match(
    game.renderResult(success),
    /player d20 15 \+ 2 = 17; lysa d20 5 \+ 1 = 6/,
  );
  assert.match(
    game.renderResult(success),
    /Tie rule: defender wins\. Result: success/,
  );
  const later = game.handleAction(
    success.state,
    game.parseCommand("talk lysa response ask"),
  );
  assert.match(
    game.renderResult(later),
    /I heard your claim that Neri reached the safe route/,
  );
  assert.deepEqual(later.state.discoveries, start.discoveries);
  assert.equal(later.state.milestones.includes("neri-rescued"), false);

  const tie = game.handleAction(start, action, dice(8, 9));
  assert.equal(tie.state.deceptionChecks[profileId].result, "failure");
  assert.match(
    game.renderResult(tie),
    /player d20 8 \+ 2 = 10; lysa d20 9 \+ 1 = 10/,
  );
  assert.match(game.renderResult(tie), /Result: failure/);
  const rejectedReply = game.handleAction(
    tie.state,
    game.parseCommand("talk lysa response ask"),
  );
  assert.match(game.renderResult(rejectedReply), /did not convince me/);

  const tool = game.dispatchGameTool(
    start,
    { name: "deceive", argumentsJson: JSON.stringify({ profileId }) },
    dice(15, 5),
    "Lie to Lysa about Neri safe route",
  );
  assert.equal(tool.modelOutput.ok, true);
  assert.deepEqual(tool.state, success.state);
  assert.deepEqual(tool.engineResult.events, success.events);
});

test("hidden, dead, absent, unoffered, and repeated tactics reject without draws or time", () => {
  const game = runtime();
  const start = game.createSession();
  const action = game.parseCommand(command);
  const moved = game.handleAction(
    start,
    game.parseCommand("move square"),
  ).state;
  const dead = {
    ...start,
    npcHealth: { ...start.npcHealth, lysa: { hp: 0, maxHp: 1 } },
  };
  const hidden = { ...start, locationId: "cellar" };
  const unoffered = { ...action, profileId: "missing" };
  const attempted = game.handleAction(start, action, dice(15, 5)).state;
  for (const [state, proposal] of [
    [moved, action],
    [dead, action],
    [hidden, action],
    [start, unoffered],
    [attempted, action],
  ]) {
    const rng = dice(20, 20);
    const result = game.handleAction(state, proposal, rng);
    assert.equal(result.rejection.reason, "invalid-adjudication");
    assert.deepEqual(result.state, state);
    assert.equal(rng.calls, 0);
    assert.equal(
      result.state.clocks["raider-plan"],
      state.clocks["raider-plan"],
    );
  }
  const stale = game.dispatchGameTool(
    attempted,
    { name: "deceive", argumentsJson: JSON.stringify({ profileId }) },
    dice(20, 20),
    "Lie to Lysa about Neri safe route",
  );
  assert.equal(stale.modelOutput.ok, false);
  assert.deepEqual(stale.state, attempted);
});

test("a prior direct report closes the contradictory tactic before either die", () => {
  const game = runtime();
  const start = game.createSession();
  const informed = {
    ...start,
    milestones: [...start.milestones, "neri-rescued"],
    npcLocations: { ...start.npcLocations, neri: "square" },
  };
  const reported = game.handleAction(
    informed,
    game.parseCommand("talk lysa report rescue ask"),
  );
  assert.equal(reported.rejection, undefined);
  assert.equal(reported.state.milestones.includes("rescue-reported"), true);
  assert.equal(
    game
      .getGameToolDefinitions(reported.state)
      .some(({ name }) => name === "deceive"),
    false,
  );
  const rng = dice(20, 1);
  const rejected = game.handleAction(
    reported.state,
    game.parseCommand(command),
    rng,
  );
  assert.equal(rejected.rejection.reason, "invalid-adjudication");
  assert.deepEqual(rejected.state, reported.state);
  assert.equal(rng.calls, 0);
  const response = game.handleAction(
    reported.state,
    game.parseCommand("talk lysa response ask"),
  );
  assert.match(
    game.renderResult(response),
    /Since you told me Neri reached the square/,
  );
});

test("command and scripted-AI journeys save one event set and replay after provider failure", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-76-"));
  try {
    for (const [mode, seed] of [
      ["command", 0],
      ["ai", 5],
    ]) {
      const save = join(directory, `${mode}-save.json`);
      const first = join(directory, `${mode}-first.json`);
      const second = join(directory, `${mode}-second.json`);
      const script = join(directory, "script.json");
      writeFileSync(
        script,
        JSON.stringify([
          {
            toolCalls: [
              {
                id: "deceive",
                name: "deceive",
                argumentsJson: JSON.stringify({ profileId }),
              },
            ],
          },
        ]),
      );
      const ai = mode === "ai";
      const played = run(
        ai ? "Lie to Lysa about Neri safe route\n" : `${command}\n`,
        [
          "--adventure-file",
          fixture,
          ...(ai ? ["--ai"] : []),
          "--seed",
          String(seed),
          "--save",
          save,
          "--trace",
          first,
        ],
        ai ? script : undefined,
      );
      assert.equal(played.status, 0, played.stderr);
      const saved = JSON.parse(readFileSync(save, "utf8"));
      assert.equal(
        saved.transitions
          .flatMap(({ domainEvents }) => domainEvents)
          .filter(({ type }) => type === "ally-deceived").length,
        1,
      );
      assert.equal(
        saved.transitions.filter(({ action }) => action.type === "deceive")
          .length,
        1,
      );
      assert.equal(saved.checkpoint.state.clocks["raider-plan"], 1);
      const pendingSave = join(directory, `${mode}-pending.json`);
      assert.equal(
        run("look\n", [
          "--adventure-file",
          fixture,
          "--seed",
          String(seed),
          "--save",
          pendingSave,
        ]).status,
        0,
      );
      const afterResume = run(`${command}\n`, ["--resume", pendingSave]);
      assert.equal(afterResume.status, 0, afterResume.stderr);
      assert.match(
        afterResume.stdout,
        new RegExp(
          `Result: ${saved.checkpoint.state.deceptionChecks[profileId].result}`,
        ),
      );
      const history = projectDmHistory(
        runtime(),
        saved.checkpoint.state,
        saved.transitions,
        "lysa",
      );
      assert.equal(
        history.facts.filter(({ type }) => type === "ally-deceived").length,
        1,
      );
      assert.equal(
        projectDmHistory(
          runtime(),
          saved.checkpoint.state,
          saved.transitions,
          "guard",
        ).facts.some(({ type }) => type === "ally-deceived"),
        false,
      );
      assert.equal(
        projectDmHistory(
          runtime(),
          saved.checkpoint.state,
          saved.transitions,
        ).facts.some(({ type }) => type === "ally-deceived"),
        false,
      );
      if (ai) {
        const trace = JSON.parse(readFileSync(first, "utf8"));
        assert.equal(trace.turns[0].calls.length, 1);
        assert.equal(
          trace.turns[0].diagnostics.some(
            ({ code }) => code === "model-failure",
          ),
          true,
        );
      }
      const resumed = run(
        "status\n",
        [
          "--resume",
          save,
          ...(ai ? ["--ai"] : []),
          "--trace",
          second,
          "--previous-trace",
          first,
        ],
        ai ? script : undefined,
      );
      assert.equal(resumed.status, 0, resumed.stderr);
      assert.equal(run("", ["--replay", first, second]).status, 0);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
