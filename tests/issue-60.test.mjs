import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { checkGenerationContinuity } from "../dist/generation-continuity.js";
import { proveGenerationRoutes } from "../dist/generation-routes.js";
import { createSeededRandom } from "../dist/random.js";

function sample(name) {
  const loaded = loadAdventure(
    readFileSync(
      new URL(
        `../docs/acceptance/issue-60-samples/${name}.json`,
        import.meta.url,
      ),
    ),
  );
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  return loaded;
}

function resolve(runtime, state, resolutionId, random = createSeededRandom(0)) {
  const label = runtime.content.snapshot.endings.choices.find(
    (choice) => choice.id === resolutionId,
  ).label;
  return runtime.dispatchGameTool(
    state,
    { name: "resolve_quest", argumentsJson: JSON.stringify({ resolutionId }) },
    random,
    `I choose ${label}`,
  );
}

test("reviewed issue 60 samples retain both ending and failed-social witnesses", () => {
  for (const name of ["investigation", "rescue", "negotiation"]) {
    const loaded = sample(name);
    const routes = proveGenerationRoutes(loaded.adventure, loaded.diagnostics);
    assert.equal(
      routes.ok,
      true,
      `${name}: ${JSON.stringify(routes.diagnostics)}`,
    );
    assert.equal(Object.keys(routes.evidence.endings).length, 2, name);
    assert.ok(routes.evidence.physicalAfterFailure, name);
    assert.deepEqual(
      checkGenerationContinuity(loaded.adventure, routes.evidence),
      [],
      name,
    );
  }
});

test("reviewed samples finish in command mode and replay after their source is removed", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-one-issue-60-"));
  try {
    for (const name of ["investigation", "rescue", "negotiation"]) {
      const source = readFileSync(
        new URL(
          `../docs/acceptance/issue-60-samples/${name}.json`,
          import.meta.url,
        ),
      );
      const loaded = loadAdventure(source);
      assert.equal(loaded.ok, true);
      const routes = proveGenerationRoutes(
        loaded.adventure,
        loaded.diagnostics,
      );
      assert.equal(routes.ok, true);
      for (const [ending, witness] of Object.entries(routes.evidence.endings)) {
        const file = join(directory, `${name}-${ending}.json`);
        const trace = join(directory, `${name}-${ending}-trace.json`);
        writeFileSync(file, source);
        const commands = witness.steps.map(({ action }) => {
          const args = JSON.parse(action.argumentsJson);
          switch (action.name) {
            case "move":
              return `move ${args.destinationId}`;
            case "search":
              return `search ${args.target}`;
            case "talk":
              return `talk ${args.speakerId} ${args.topicId} ${args.approach}`;
            case "attack":
              return `attack ${args.opponent_id}`;
            case "resolve_quest":
              return `resolve ${loaded.adventure.snapshot.endings.choices.find((choice) => choice.id === args.resolutionId).label}`;
            default:
              throw new Error(`Unsupported sample step: ${action.name}`);
          }
        });
        const run = spawnSync(
          process.execPath,
          [
            "dist/cli.js",
            "--adventure-file",
            file,
            "--seed",
            String(witness.seed),
            "--trace",
            trace,
          ],
          {
            input: `${commands.join("\n")}\n`,
            encoding: "utf8",
            env: { ...process.env, OPENAI_API_KEY: "" },
          },
        );
        assert.equal(run.status, 0, `${name}/${ending}: ${run.stderr}`);
        const choice = loaded.adventure.snapshot.endings.choices.find(
          (entry) => entry.id === ending,
        );
        assert.ok(run.stdout.includes(choice.narration[0].text), name);
        unlinkSync(file);
        const replay = spawnSync(
          process.execPath,
          ["dist/cli.js", "--replay", trace],
          { encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" } },
        );
        assert.equal(replay.status, 0, `${name}/${ending}: ${replay.stderr}`);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the bell cannot be returned before it is recovered", () => {
  const runtime = createDataRuntime(sample("negotiation").adventure);
  const state = runtime.createSession();
  const result = resolve(runtime, state, "clear-willowbank");
  assert.equal(result.modelOutput.ok, false);
  assert.deepEqual(result.state, state);
});

test("the reef chart cannot be published before the tide measurement", () => {
  const loaded = sample("investigation");
  const routes = proveGenerationRoutes(loaded.adventure, loaded.diagnostics);
  assert.equal(routes.ok, true);
  const runtime = createDataRuntime(loaded.adventure);
  const witness = routes.evidence.endings["launch-search"];
  assert.ok(witness);
  let state = runtime.createSession();
  const random = createSeededRandom(witness.seed);
  for (const step of witness.steps.slice(0, -1)) {
    const result = runtime.dispatchGameTool(state, step.action, random);
    assert.equal(result.modelOutput.ok, true);
    state = result.state;
  }
  assert.equal(state.discoveries.includes("tide-mark"), false);
  const premature = resolve(runtime, state, "publish-chart", random);
  assert.equal(premature.modelOutput.ok, false);
  assert.deepEqual(premature.state, state);
  assert.equal(
    resolve(runtime, state, "launch-search", random).modelOutput.ok,
    true,
  );
});

test("the freed courier is projected as free on later turns", () => {
  const loaded = sample("rescue");
  const routes = proveGenerationRoutes(loaded.adventure, loaded.diagnostics);
  assert.equal(routes.ok, true);
  const witness = routes.evidence.endings["send-dispatch"];
  const runtime = createDataRuntime(loaded.adventure);
  const random = createSeededRandom(witness.seed);
  let state = runtime.createSession();
  for (const step of witness.steps) {
    if (step.action.name === "resolve_quest") {
      break;
    }
    const result = runtime.dispatchGameTool(state, step.action, random);
    assert.equal(result.modelOutput.ok, true);
    state = result.state;
    if (state.milestones.includes("courier-freed")) {
      break;
    }
  }
  assert.ok(state.milestones.includes("courier-freed"));
  const scene = runtime.projectDmScene(state);
  assert.match(
    scene.room.description,
    /Tovin waits beside it, alive and free/u,
  );
  assert.match(
    scene.room.features.find(({ id }) => id === "jammed-hatch").description,
    /no longer trapped/u,
  );
  assert.match(
    scene.journal.actionableLeads.at(-1),
    /Return to the village with Tovin/u,
  );
});
