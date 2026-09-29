import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const fixture = fileURLToPath(
  new URL("../adventures/raider-crossroads.json", import.meta.url),
);
const baseline = fileURLToPath(
  new URL("../adventures/consequence-journey.json", import.meta.url),
);
const inputs = fileURLToPath(
  new URL("../docs/acceptance/inputs/", import.meta.url),
);

function run(input, args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: { ...process.env, OPENAI_API_KEY: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function witness(name) {
  return readFileSync(join(inputs, `issue-72-${name}.txt`), "utf8");
}

function withDirectory(body) {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-issue-72-"));
  try {
    body(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const routes = [
  {
    name: "on-time",
    ending: "file-register",
    clock: 6,
    consequences: ["register-filed", "deadline-met"],
    public: [
      /Safe route \[observation; route register, Cellar\]/,
      /before the raiders close the safe passage/,
    ],
  },
  {
    name: "post",
    ending: "post-register",
    clock: 5,
    consequences: ["register-posted", "deadline-met"],
    public: [
      /route register is posted publicly/,
      /before the raiders close the safe passage/,
    ],
  },
  {
    name: "refuse",
    ending: "refuse-errand",
    clock: 2,
    consequences: ["register-undelivered"],
    public: [/No discoveries yet/, /route register was not delivered/],
  },
  {
    name: "leave",
    ending: "leave-town",
    clock: 0,
    consequences: ["departed-without-report"],
    public: [
      /road beyond the hall and leave town/,
      /without filing or posting/,
    ],
  },
  {
    name: "late",
    ending: "file-register",
    clock: 8,
    consequences: ["register-filed", "deadline-missed"],
    public: [
      /Guard: No\. You can read the register/,
      /Exits: Cellar, Back Lane/,
      /report arrives after the deadline/,
    ],
  },
  {
    name: "unavailable",
    ending: "file-register",
    clock: 6,
    consequences: ["register-filed", "deadline-met"],
    public: [
      /Neri dies at Cellar/,
      /Neri died in the cellar; no rescue is claimed/,
    ],
  },
  {
    name: "quest-giver-unavailable",
    ending: "file-register",
    clock: 6,
    consequences: ["register-filed", "lysa-unavailable", "deadline-met"],
    public: [/Lysa dies at Hall/, /register is filed without her/],
  },
  {
    name: "attack-refuse",
    ending: "refuse-errand",
    clock: 1,
    consequences: ["register-undelivered"],
    public: [
      /Lysa dies at Hall/,
      /With Lysa dead, you leave the report desk/,
      /Casualties: lysa/,
    ],
  },
];

for (const route of routes) {
  test(`raider crossroads ${route.name} route has a public ending and replayable witness`, () =>
    withDirectory((directory) => {
      const save = join(directory, "save.json");
      const trace = join(directory, "trace.json");
      const output = run(witness(route.name), [
        "--adventure-file",
        fixture,
        "--seed",
        "0",
        "--save",
        save,
        "--trace",
        trace,
      ]);
      for (const pattern of route.public) {
        assert.match(output, pattern);
      }
      assert.match(output, new RegExp(`Resolution: ${route.ending}`));
      const saved = JSON.parse(readFileSync(save, "utf8"));
      const state = saved.checkpoint.state;
      assert.equal(
        saved.content.digest,
        "sha256:0cbbb34657074e466dd45fb307d7b3b62f59e28fcaa910e6c51185cd692256f2",
      );
      assert.equal(state.clocks["raider-plan"], route.clock);
      assert.equal(state.ending.id, route.ending);
      assert.deepEqual(state.ending.consequences, route.consequences);
      if (route.name === "late") {
        assert.equal(
          state.socialChallenges["guard-guidance"].result,
          "failure",
        );
        assert.equal(state.items["restorative-tonic"], "inventory");
      }
      run(witness(route.name), [
        "--adventure-file",
        fixture,
        "--seed",
        "0",
        "--trace",
        trace,
      ]);
      assert.match(run("", ["--replay", trace]), /Trace verified successfully/);
    }));
}

test("late route resumes with the same state and RNG and replays linked segments", () =>
  withDirectory((directory) => {
    const commands = witness("late").trim().split(/\r?\n/u);
    const first = join(directory, "first.json");
    const second = join(directory, "second.json");
    const splitSave = join(directory, "split-save.json");
    const wholeSave = join(directory, "whole-save.json");
    run(`${commands.slice(0, 5).join("\n")}\n`, [
      "--adventure-file",
      fixture,
      "--seed",
      "0",
      "--save",
      splitSave,
      "--trace",
      first,
    ]);
    const checkpoint = JSON.parse(readFileSync(splitSave, "utf8")).checkpoint;
    assert.equal(checkpoint.state.clocks["raider-plan"], 7);
    assert.equal(
      checkpoint.state.socialChallenges["guard-guidance"].result,
      "failure",
    );
    const resumed = run(`${commands.slice(5).join("\n")}\n`, [
      "--resume",
      splitSave,
      "--trace",
      second,
      "--previous-trace",
      first,
    ]);
    assert.match(resumed, /report arrives after the deadline/);
    run(witness("late"), [
      "--adventure-file",
      fixture,
      "--seed",
      "0",
      "--save",
      wholeSave,
    ]);
    const split = JSON.parse(readFileSync(splitSave, "utf8")).checkpoint;
    const whole = JSON.parse(readFileSync(wholeSave, "utf8")).checkpoint;
    assert.deepEqual(split.state, whole.state);
    assert.equal(split.randomPosition, whole.randomPosition);
    assert.equal(split.randomState, whole.randomState);
    assert.match(
      run("", ["--replay", first, second]),
      /Trace verified successfully/,
    );
  }));

test("released schema-5 consequence journey keeps its content and replay baseline", () =>
  withDirectory((directory) => {
    const save = join(directory, "save.json");
    const trace = join(directory, "trace.json");
    const input = readFileSync(join(inputs, "issue-71-on-time.txt"), "utf8");
    const output = run(input, [
      "--adventure-file",
      baseline,
      "--seed",
      "0",
      "--save",
      save,
      "--trace",
      trace,
    ]);
    assert.match(output, /before the raiders close the safe passage/);
    const saved = JSON.parse(readFileSync(save, "utf8"));
    const recorded = JSON.parse(readFileSync(trace, "utf8"));
    assert.equal(
      saved.content.digest,
      "sha256:0bb560a9e34656ff02c93a2711c3b49e3f7353a03e52e02abbb3d595203cef9d",
    );
    assert.equal(saved.checkpoint.state.clocks["raider-plan"], 4);
    assert.equal(recorded.formatVersion, 5);
    assert.deepEqual(saved.checkpoint.state.ending.consequences, [
      "register-filed",
      "deadline-met",
    ]);
    assert.equal(
      recorded.content.digest,
      "sha256:0bb560a9e34656ff02c93a2711c3b49e3f7353a03e52e02abbb3d595203cef9d",
    );
    run(input, ["--adventure-file", baseline, "--seed", "0", "--trace", trace]);
    assert.match(run("", ["--replay", trace]), /Trace verified successfully/);
  }));
