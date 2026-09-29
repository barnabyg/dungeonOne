import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { RELATIONSHIP_SCHEMA } from "../dist/relationship-schema.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const adventure = fileURLToPath(
  new URL("../adventures/remembering-guard.json", import.meta.url),
);
const source = JSON.parse(readFileSync(adventure, "utf8"));

function run(commands, args) {
  return spawnSync(process.execPath, [cli, ...args], {
    input: `${commands.join("\n")}\n`,
    encoding: "utf8",
    timeout: 10000,
  });
}

test("insult and help lead to distinct guard replies after a process restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-66-"));
  try {
    for (const [choice, tier, expected, excluded] of [
      ["insult", "hostile", /I will not help you/, /I can help you/],
      ["help", "trusted", /I can help you/, /I will not help you/],
    ]) {
      const path = join(directory, `${choice}.json`);
      const first = run(
        [
          `talk guard ${choice} ask`,
          `talk guard ${choice} ask`,
          "move orchard",
        ],
        ["--adventure-file", adventure, "--seed", "0", "--save", path],
      );
      assert.equal(first.status, 0, first.stderr);
      const saved = JSON.parse(readFileSync(path, "utf8"));
      assert.equal(saved.checkpoint.state.relationships.guard.tier, tier);
      assert.equal(
        typeof saved.checkpoint.state.relationships.guard.reason,
        "string",
      );
      assert.equal(
        saved.transitions
          .flatMap(({ domainEvents }) => domainEvents)
          .filter(({ type }) => type === "relationship-changed").length,
        1,
      );
      const resumed = run(
        ["move yard", "talk guard return ask"],
        ["--resume", path],
      );
      assert.equal(resumed.status, 0, resumed.stderr);
      assert.match(resumed.stdout, expected);
      assert.doesNotMatch(resumed.stdout, excluded);
      assert.doesNotMatch(resumed.stdout, /privately/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("schema 4 rejects unknown tiers, targets, effects, and impossible references", () => {
  const invalid = (mutate, path) => {
    const copy = structuredClone(source);
    mutate(copy);
    const result = loadAdventure(JSON.stringify(copy));
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((entry) => entry.path === path));
  };
  invalid((copy) => {
    copy.relationships[0].tier = "adoring";
  }, "/relationships/0/tier");
  invalid((copy) => {
    copy.relationships[0].targetId = "nobody";
  }, "/relationships/0/targetId");
  invalid((copy) => {
    copy.npcs[0].topics[0].replies[0].effects[0].type = "multiply-relationship";
  }, "/npcs/0/topics/0/replies/0/effects/0/type");
  invalid((copy) => {
    copy.npcs[0].topics[2].replies[0].when[0].id = "nobody";
  }, "/npcs/0/topics/2/replies/0/when/0/id");
  invalid((copy) => {
    copy.npcs[0].topics[0].replies[0].effects[0].reason = undefined;
  }, "/npcs/0/topics/0/replies/0/effects/0");
  assert.deepEqual(
    JSON.parse(readFileSync("schema/adventure-v4.schema.json", "utf8")),
    RELATIONSHIP_SCHEMA,
  );
  const old = readFileSync("adventures/tide-observatory.json", "utf8");
  assert.equal(loadAdventure(old).ok, true);
});

test("scene and tool projections reveal only the current reply; a dead guard cannot answer", () => {
  const loaded = loadAdventure(JSON.stringify(source));
  assert.equal(loaded.ok, true);
  const runtime = createDataRuntime(loaded.adventure);
  let state = runtime.createSession();
  const helped = runtime.handleAction(state, {
    type: "talk",
    target: "guard",
    topic: "help",
    approach: "ask",
  });
  assert.equal(helped.rejection, undefined);
  state = helped.state;
  const scene = JSON.stringify(runtime.projectDmScene(state));
  assert.doesNotMatch(scene, /privately|I will not help you|I can help you/);
  const response = runtime.dispatchGameTool(state, {
    name: "talk",
    argumentsJson: JSON.stringify({
      speakerId: "guard",
      topicId: "return",
      approach: "ask",
    }),
  });
  assert.equal(response.modelOutput.ok, true);
  assert.match(JSON.stringify(response.modelOutput), /I can help you/);
  assert.doesNotMatch(
    JSON.stringify(response.modelOutput),
    /privately|I will not help you/,
  );

  const killed = run(
    ["talk guard help ask", "attack guard", "talk guard return ask"],
    ["--adventure-file", adventure, "--seed", "0"],
  );
  assert.equal(killed.status, 0, killed.stderr);
  assert.match(killed.stdout, /Gate Guard dies/);
  assert.match(killed.stdout, /Action unavailable: invisible-target/);
  assert.doesNotMatch(killed.stdout, /Welcome back/);
});
