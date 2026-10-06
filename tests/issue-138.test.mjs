// #138: the command-line adapter's test routes run on the 5e dungeon. Command
// mode offers the action bar's choices (disabled ones with their reason); the
// scripted DM route plays typed messages; a recorded trace replays exactly,
// cards, grouped rolls and all; the live route needs --ai and OPENAI_API_KEY
// and keeps to its call budget; and the DM evaluation and live qualification
// cover interpretation, refusal and narration fidelity on the dungeon.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import {
  checkDmOffRefusal,
  FIFTH_DM_CASES,
  offeredToolsMatchActions,
  runFifthDmEvaluation,
  scriptedCaseModel,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";

const cli = fileURLToPath(new URL("../dist/cli-5e.js", import.meta.url));
const qualify = fileURLToPath(
  new URL("../scripts/qualify-delve-live.mjs", import.meta.url),
);
const adventures = await loadBuiltInFifthAdventures();
const delve = adventures.find(({ id }) => id === "abandoned-delve");

const withDirectory = async (work) => {
  const directory = await mkdtemp(join(tmpdir(), "issue-138-"));
  try {
    await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

/** Runs the CLI with `lines` on standard input. */
const run = (args, lines = [], env = {}) =>
  spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    input: lines.map((line) => `${line}\n`).join(""),
    env: {
      ...process.env,
      OPENAI_API_KEY: "",
      DUNGEON_ONE_TEST_DM_SCRIPT: "",
      ...env,
    },
    timeout: 20000,
  });

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("command mode lists the action bar, disabled actions with their reason, and refuses typing without an AI DM", () => {
  const result = run(["--seed", "0"], ["1", "Open the door", "4", "quit"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /The Abandoned Delve\. Seed 0\./);
  // The same choices as the browser's action bar, in its order.
  const session = FifthSession.begin(0, delve, TEST_FIGHTER);
  const actions = session.runtime.projectActions(session.state);
  assert.match(
    result.stdout,
    /1\. Go to Gate Hall\n {2}2\. Search Broken Gate/,
  );
  assert.equal(actions[0].target.name, "Gate Hall");
  assert.match(result.stdout, /4\. Go to Storeroom — Door shut/);
  assert.match(
    result.stdout,
    /Typing to the Dungeon Master is off\. Choose an action by its number\./,
  );
  assert.match(result.stdout, /That action is not available: Door shut\./);
});

test("a recorded command-mode trace replays exactly", () =>
  withDirectory(async (directory) => {
    const trace = join(directory, "trace.json");
    // Into the hall, to the guard post (its fight begins), attack the zombie.
    const played = run(["--seed", "0", "--trace", trace], ["1", "2", "1"]);
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /\[Result\]\n {2}You enter the Guard Post\./);
    assert.match(played.stdout, /Ada's initiative: d20 \d+ \+ 2 = \d+/);
    const recorded = await readJson(trace);
    assert.equal(recorded.kind, "dungeon-one-5e-trace");
    assert.equal(recorded.formatVersion, 6);
    assert.equal(recorded.turns.length, 3);
    // Each card keeps its lines and their rolls grouped by purpose.
    const purposes = recorded.turns[2].card.lines.flatMap(({ rolls }) =>
      rolls.map(({ purpose }) => purpose),
    );
    assert.ok(purposes.includes("attack"), JSON.stringify(purposes));

    const replayed = run(["--replay", trace]);
    assert.equal(replayed.status, 0, replayed.stderr);
    assert.match(replayed.stdout, /Trace verified: .* \(3 turns, playing\)\./);
  }));

test("replay names the first turn whose card, rolls, state or dice stream differ", () =>
  withDirectory(async (directory) => {
    const trace = join(directory, "trace.json");
    run(["--seed", "0", "--trace", trace], ["1", "2", "1"]);
    const original = await readJson(trace);
    const tampered = async (change, expected) => {
      const copy = structuredClone(original);
      change(copy);
      const path = join(directory, "tampered.json");
      await writeFile(path, JSON.stringify(copy));
      const result = run(["--replay", path]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, expected);
    };
    await tampered((copy) => {
      copy.turns[1].card.lines[1].rolls[0].dice[0].value += 1;
    }, /diverged at turn 2: the card differs/);
    await tampered((copy) => {
      copy.turns[2].card.lines[0].text += "!";
    }, /diverged at turn 3: the card differs/);
    await tampered((copy) => {
      copy.turns[2].rolls[0].value = copy.turns[2].rolls[0].value === 1 ? 2 : 1;
    }, /diverged at turn 3: the dice differs/);
    await tampered((copy) => {
      copy.turns[0].stateAfter.character.hp -= 1;
    }, /diverged at turn 1: the state differs/);
    await tampered((copy) => {
      copy.turns[1].position += 1;
    }, /diverged at turn 2: the dice-stream position differs/);
    await tampered((copy) => {
      copy.opening.entry.reply = "Somewhere else.";
    }, /diverged at the opening/);
    await tampered((copy) => {
      copy.random.seed = 1;
    }, /diverged at turn 2/);
  }));

test("a trace in another format version is refused and left unchanged", () =>
  withDirectory(async (directory) => {
    const trace = join(directory, "trace.json");
    run(["--seed", "0", "--trace", trace], ["1"]);
    const copy = await readJson(trace);
    copy.formatVersion = 2;
    const bytes = JSON.stringify(copy);
    await writeFile(trace, bytes);
    const result = run(["--replay", trace]);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /trace\.json is a trace in format version 2, not 6\. .*Move it aside; the file has not been changed\./,
    );
    assert.equal(await readFile(trace, "utf8"), bytes);
  }));

test("the scripted DM route plays typed messages, and their trace replays exactly", () =>
  withDirectory(async (directory) => {
    const script = join(directory, "dm.json");
    const call = (id, name, args) => ({
      toolCalls: [{ id, name, argumentsJson: JSON.stringify(args) }],
    });
    await writeFile(
      script,
      JSON.stringify([
        // The engine writes the reply to an action, so no narration follows.
        call("c1", "move", { destination: "gate-hall" }),
        call("c2", "attack", { target: "zombie" }),
        { text: "Which do you mean?" },
      ]),
    );
    const trace = join(directory, "trace.json");
    const played = run(
      ["--seed", "0", "--trace", trace],
      ["Go into the hall.", "2", "Hit the zombie.", "Do the thing."],
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /You enter the Gate Hall\./);
    assert.match(played.stdout, /Ada's attack/);
    const recorded = await readJson(trace);
    assert.deepEqual(
      recorded.turns.map(({ kind }) => kind),
      ["message", "click", "message", "message"],
    );
    const attack = recorded.turns[2];
    assert.equal(attack.calls[0].name, "attack");
    assert.ok(attack.calls[0].rolls.length > 0);
    assert.equal(attack.entry.cards[0].kind, "result");
    assert.equal(recorded.turns[3].calls.length, 0);
    assert.equal(recorded.turns[3].entry.reply, "Which do you mean?");

    assert.equal(run(["--replay", trace]).status, 0);
    // A different recorded response replays to a different turn.
    attack.responses[0].response.toolCalls[0].argumentsJson = JSON.stringify({
      target: "nobody",
    });
    await writeFile(trace, JSON.stringify(recorded));
    const result = run(["--replay", trace]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /diverged at turn 3/);
  }));

test("the live route needs --ai and OPENAI_API_KEY, and never plays a script instead", () =>
  withDirectory(async (directory) => {
    const noKey = run(["--ai", "--seed", "0"], ["quit"]);
    assert.equal(noKey.status, 2);
    assert.match(noKey.stderr, /OPENAI_API_KEY is required for --ai\./);
    for (const args of [
      ["--model", "gpt-test"],
      ["--max-calls", "3"],
      ["--replay", "a.json", "--seed", "0"],
      ["--ai", "--max-calls", "0"],
      ["--seed", "-1"],
    ]) {
      assert.equal(run(args).status, 2, args.join(" "));
    }
    const help = run(["--help"]);
    assert.match(
      help.stdout,
      /at most --max-calls provider calls \(default 30\)/,
    );

    // A scripted DM never stands in for the live one.
    const script = join(directory, "dm.json");
    await writeFile(script, JSON.stringify([{ text: "Hello." }]));
    const mixed = run(["--ai", "--seed", "0"], ["Hello?"], {
      OPENAI_API_KEY: "sk-test",
      DUNGEON_ONE_TEST_DM_SCRIPT: script,
    });
    assert.equal(mixed.status, 2);
    assert.match(mixed.stderr, /unset DUNGEON_ONE_TEST_DM_SCRIPT/);
  }));

test("the DM evaluation covers interpretation, refusal and narration fidelity on the dungeon", () => {
  assert.deepEqual(
    [...new Set(FIFTH_DM_CASES.map(({ kind }) => kind))].sort(),
    ["interpretation", "narration-fidelity", "refusal"],
  );
  const dimensions = new Set(FIFTH_DM_CASES.flatMap((c) => c.dimensions));
  for (const dimension of [
    "clear-accuracy",
    "synonym-accuracy",
    "navigation-accuracy",
    "target-accuracy",
    "status-accuracy",
    "compound-mutation-budget",
    "ambiguous-clarification",
    "refusal",
    "narration-fidelity",
  ]) {
    assert.ok(dimensions.has(dimension), dimension);
  }
  assert.equal(
    new Set(FIFTH_DM_CASES.map(({ id }) => id)).size,
    FIFTH_DM_CASES.length,
  );
});

test("every case's setup offers the AI DM exactly the enabled actions", () => {
  for (const sample of FIFTH_DM_CASES) {
    const session = setUpCase(sample, delve);
    const ended = [
      "after-the-ending",
      "after-a-defeat",
      "status-after-the-ending",
    ];
    assert.equal(
      session.state.status === "playing",
      !ended.includes(sample.id),
      sample.id,
    );
    assert.ok(offeredToolsMatchActions(session), sample.id);
  }
});

test("a correct scripted DM passes every automated check, and the DM-off notice is checked", async () => {
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    createModel: (sample) => scriptedCaseModel(sample),
    manualJudgments: Object.fromEntries(
      FIFTH_DM_CASES.map((sample) => [
        sample.id,
        {
          1: Object.fromEntries(sample.manualJudgments.map((id) => [id, true])),
        },
      ]),
    ),
  });
  for (const run of report.runs) {
    assert.ok(Object.values(run.checks).every(Boolean), run.caseId);
  }
  assert.deepEqual(report.dmOff, { refused: true });
  assert.equal(report.passed, true);
  assert.ok(report.providerCalls <= report.maxCalls);
});

test("a DM that acts unasked fails refusal and safety", async () => {
  // It acts on the first tool it is offered, whatever the player said.
  const reckless = () => ({
    async respond(request) {
      const tool = request.tools.find(
        ({ name }) => !["look", "get_character_status"].includes(name),
      );
      if (tool === undefined) {
        return { text: "Nothing to do." };
      }
      const [parameter] = Object.entries(tool.parameters.properties);
      return {
        toolCalls: [
          {
            id: "x",
            name: tool.name,
            argumentsJson: JSON.stringify(
              parameter === undefined
                ? {}
                : { [parameter[0]]: parameter[1].enum[0] },
            ),
          },
        ],
      };
    },
  });
  const report = await runFifthDmEvaluation({
    requestedModel: "reckless",
    repetitions: 1,
    createModel: reckless,
  });
  assert.equal(report.passed, false);
  assert.ok(report.summary.refusal.failed > 0);
  assert.equal(report.summary.safety.meetsThreshold, false);
});

test("a DM that claims outcomes it never produced fails narration fidelity", async () => {
  const boaster = () => ({
    async respond() {
      return { text: "You hit the zombie for 12 damage and find the key." };
    },
  });
  const report = await runFifthDmEvaluation({
    requestedModel: "boaster",
    repetitions: 1,
    createModel: boaster,
  });
  assert.equal(report.summary["narration-fidelity"].passed, 0);
  assert.equal(report.passed, false);
});

test("the evaluation keeps to its call budget", async () => {
  const report = await runFifthDmEvaluation({
    requestedModel: "scripted",
    repetitions: 1,
    maxCalls: 3,
    cases: FIFTH_DM_CASES.slice(0, 4),
    createModel: (sample) => scriptedCaseModel(sample),
  });
  assert.equal(report.providerCalls, 3);
  assert.ok(report.runs.some(({ failures }) => failures > 0));
  assert.equal(report.passed, false);
});

test("a server without an AI DM refuses typed messages with the player notice", async () => {
  assert.equal(await checkDmOffRefusal(), true);
});

test("the 5e DM evaluation calls the provider only with --live and a key", () => {
  const evalDm = fileURLToPath(
    new URL("../scripts/eval-dm.mjs", import.meta.url),
  );
  const evaluate = (args, key = "") =>
    spawnSync(process.execPath, [evalDm, "--model", "m", ...args], {
      encoding: "utf8",
      env: { ...process.env, OPENAI_API_KEY: key },
    });
  for (const args of [
    [],
    ["--live", "--live"],
    ["--live", "--max-calls", "0"],
    // The pre-5e campaigns, and the option that chose them, are gone (#139).
    ["--live", "--campaign", "abandoned-delve"],
  ]) {
    const result = evaluate(args, "sk-test");
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /only with --live/);
  }
  const noKey = evaluate(["--live"]);
  assert.equal(noKey.status, 2);
  assert.match(noKey.stderr, /OPENAI_API_KEY is required/);
});

test("the live qualification runs only with --live and a key, and its dry run flags overclaims", () =>
  withDirectory(async (directory) => {
    const env = { ...process.env, OPENAI_API_KEY: "" };
    for (const args of [
      ["--dry-run", "--live"],
      ["--dry-run", "--max-calls", "0"],
      ["--dry-run", "--max-calls"],
      ["--dry-run", "report.json"],
    ]) {
      const refused = spawnSync(process.execPath, [qualify, ...args], {
        encoding: "utf8",
        env,
      });
      assert.equal(refused.status, 2, args.join(" "));
    }
    const bare = spawnSync(process.execPath, [qualify], {
      encoding: "utf8",
      env,
    });
    assert.equal(bare.status, 2);
    const noKey = spawnSync(process.execPath, [qualify, "--live"], {
      encoding: "utf8",
      env,
    });
    assert.equal(noKey.status, 2);
    assert.match(noKey.stderr, /OPENAI_API_KEY is required for --live/);

    const output = join(directory, "report.json");
    const dry = spawnSync(
      process.execPath,
      [qualify, "--dry-run", "--output", output, "--max-calls", "5"],
      {
        encoding: "utf8",
        env,
        timeout: 20000,
      },
    );
    assert.equal(dry.status, 0, dry.stderr);
    const report = await readJson(output);
    assert.equal(report.adventureId, "abandoned-delve");
    assert.equal(report.maxProviderCalls, 5);
    assert.ok(report.providerCalls <= 5);
    assert.deepEqual(
      [...new Set(report.turns.map(({ kind }) => kind))].sort(),
      ["interpretation", "narration-fidelity", "refusal"],
    );
    // One call a turn: the first five overclaim and are flagged; after the
    // budget is spent, each turn gets the engine's safe fallback.
    assert.equal(report.providerCalls, 5);
    assert.deepEqual(
      report.turns.map(({ reviewClaim }) => reviewClaim),
      [true, true, true, true, true, false, false, false, false, false],
    );
  }));

test("a DM call budget stops every model it limits once spent", async () => {
  const { createDmCallBudget } = await import("../dist/dm-turn.js");
  const budget = createDmCallBudget(2);
  const asked = [];
  const model = (name) =>
    budget.limit({
      async respond() {
        asked.push(name);
        return { text: name };
      },
    });
  const first = model("a");
  const second = model("b");
  await first.respond({});
  await second.respond({});
  await assert.rejects(first.respond({}), /budget is spent/);
  assert.deepEqual(asked, ["a", "b"]);
  assert.equal(budget.calls(), 2);
  assert.equal(budget.spent(), true);
});
