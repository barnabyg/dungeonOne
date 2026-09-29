import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { loadAdventure } from "../dist/adventure-loader.js";
import { createDataRuntime } from "../dist/data-runtime.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const adventure = fileURLToPath(
  new URL("../adventures/rescue-witness.json", import.meta.url),
);
const source = readFileSync(adventure, "utf8");

function run(commands, args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    input: `${commands.join("\n")}\n`,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("the rescue scenario validates and offers a physical completion route", () => {
  const loaded = loadAdventure(source);
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-67-no-rescue-"));
  try {
    const path = join(directory, "save.json");
    const first = run(
      [
        "search route-register",
        "move square",
        "move hall",
        "talk lysa response ask",
        "talk lysa report-rescue ask",
      ],
      ["--adventure-file", adventure, "--seed", "0", "--save", path],
    );
    assert.match(first, /I have no report of Neri's fate/);
    assert.match(
      first,
      /Available conversation commands: talk lysa response ask/,
    );
    const state = JSON.parse(readFileSync(path, "utf8")).checkpoint.state;
    assert.equal(state.npcLocations.neri, "cellar");
    assert.equal(state.relationships.lysa.tier, "neutral");
    const resumed = run(
      ["talk lysa response ask", "resolve file-register"],
      ["--resume", path],
    );
    assert.match(resumed, /I have no report of Neri's fate/);
    assert.match(
      resumed,
      /Neri remains alive in the cellar and has not been rescued/,
    );
    assert.doesNotMatch(resumed, /Since you told me Neri reached the square/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rescue is private until reported, then ally response and state survive restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-67-rescue-"));
  try {
    const path = join(directory, "save.json");
    run(
      [
        "search route-register",
        "take restorative-tonic",
        "talk neri rescue ask",
        "move square",
        "move hall",
        "talk lysa response ask",
        "talk lysa report-rescue ask",
      ],
      ["--adventure-file", adventure, "--seed", "0", "--save", path],
    );
    const saved = JSON.parse(readFileSync(path, "utf8"));
    const state = saved.checkpoint.state;
    assert.equal(state.npcLocations.neri, "square");
    assert.equal(state.items["restorative-tonic"], "inventory");
    assert.equal(state.relationships.lysa.tier, "trusted");
    assert.match(
      state.relationships.lysa.reason,
      /privately reported Neri's rescue/,
    );
    assert.deepEqual(
      saved.transitions
        .flatMap(({ domainEvents }) => domainEvents)
        .filter(({ type }) => type === "relationship-changed")
        .map(({ targetId }) => targetId),
      ["lysa"],
    );
    const resumed = run(
      [
        "talk lysa response ask",
        "inventory",
        "move square",
        "look",
        "resolve file-register",
      ],
      ["--resume", path],
    );
    assert.match(resumed, /Since you told me Neri reached the square/);
    assert.match(resumed, /restorative tonic/);
    assert.match(resumed, /People: Neri/);
    assert.doesNotMatch(resumed, /privately reported/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a dead villager stays at the death location and yields a truthful alternative after restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-67-death-"));
  try {
    const path = join(directory, "save.json");
    run(
      [
        "search route-register",
        "attack neri",
        "move square",
        "move hall",
        "talk lysa report-death ask",
      ],
      ["--adventure-file", adventure, "--seed", "0", "--save", path],
    );
    const state = JSON.parse(readFileSync(path, "utf8")).checkpoint.state;
    assert.equal(state.npcHealth.neri.hp, 0);
    assert.equal(state.npcDeathLocations.neri, "cellar");
    assert.equal(state.npcLocations.neri, "cellar");
    assert.match(state.relationships.lysa.reason, /reported Neri's death/);
    const resumed = run(
      [
        "talk lysa response ask",
        "move square",
        "look",
        "move cellar",
        "talk neri rescue ask",
        "move square",
        "move hall",
        "resolve post-register",
      ],
      ["--resume", path],
    );
    assert.match(resumed, /Since you told me Neri died/);
    assert.match(resumed, /Neri dies|Neri's remains/);
    assert.match(resumed, /Action unavailable: invisible-target/);
    assert.match(resumed, /Neri died in the cellar; no rescue is claimed/);
    assert.doesNotMatch(resumed, /People: Neri\./);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("relocation wins over relationship prose, and an unavailable ally does not block completion", () => {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-67-both-dead-"));
  try {
    const path = join(directory, "save.json");
    const first = run(
      [
        "search route-register",
        "talk neri rescue ask",
        "move square",
        "attack neri",
        "move hall",
        "talk lysa report-rescue ask",
        "talk lysa report-death ask",
        "attack lysa",
      ],
      ["--adventure-file", adventure, "--seed", "0", "--save", path],
    );
    assert.match(first, /Neri dies at Square/);
    assert.match(first, /Lysa dies at Hall/);
    assert.match(
      first,
      /Available conversation commands: talk lysa report-death ask/,
    );
    const state = JSON.parse(readFileSync(path, "utf8")).checkpoint.state;
    assert.equal(state.npcDeathLocations.neri, "square");
    assert.equal(state.npcDeathLocations.lysa, "hall");
    assert.equal(state.npcLocations.neri, "square");
    assert.match(state.relationships.lysa.reason, /reported Neri's death/);
    const resumed = run(
      ["look", "talk lysa response ask", "resolve file-register"],
      ["--resume", path],
    );
    assert.match(resumed, /Action unavailable: invisible-target/);
    assert.doesNotMatch(resumed, /Lysa waits to receive/);
    assert.match(resumed, /Lysa is dead; the register is filed without her/);
    assert.match(resumed, /Neri reached the square but died there/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("public and AI projections do not expose Lysa's private reason or future reply", () => {
  const loaded = loadAdventure(source);
  assert.equal(loaded.ok, true);
  const runtime = createDataRuntime(loaded.adventure);
  let state = runtime.createSession();
  for (const command of ["talk neri rescue ask", "move square", "move hall"]) {
    const result = runtime.handleAction(state, runtime.parseCommand(command));
    assert.equal(result.rejection, undefined);
    state = result.state;
  }
  const before = JSON.stringify(runtime.projectDmScene(state));
  assert.doesNotMatch(
    before,
    /privately reported|Since you told me Neri reached/,
  );
  const backToCellar = runtime.handleAction(
    runtime.handleAction(state, runtime.parseCommand("move square")).state,
    runtime.parseCommand("move cellar"),
  );
  assert.equal(backToCellar.rejection, undefined);
  assert.doesNotMatch(
    JSON.stringify(runtime.projectDmScene(backToCellar.state)),
    /Neri waits beside/,
  );
  const unreported = runtime.dispatchGameTool(state, {
    name: "talk",
    argumentsJson: '{"speakerId":"lysa","topicId":"response","approach":"ask"}',
  });
  assert.match(JSON.stringify(unreported.modelOutput), /I have no report/);
  assert.doesNotMatch(
    JSON.stringify(unreported.modelOutput),
    /Since you told me Neri reached/,
  );
  const reported = runtime.handleAction(
    state,
    runtime.parseCommand("talk lysa report-rescue ask"),
  );
  assert.equal(reported.rejection, undefined);
  const after = JSON.stringify(runtime.projectDmScene(reported.state));
  assert.doesNotMatch(
    after,
    /privately reported|Since you told me Neri reached/,
  );
  const answer = runtime.dispatchGameTool(reported.state, {
    name: "talk",
    argumentsJson: '{"speakerId":"lysa","topicId":"response","approach":"ask"}',
  });
  assert.match(
    JSON.stringify(answer.modelOutput),
    /Since you told me Neri reached/,
  );
  assert.doesNotMatch(JSON.stringify(answer.modelOutput), /privately reported/);
});
