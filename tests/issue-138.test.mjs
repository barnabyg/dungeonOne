// #138: the command-line adapter's test routes. Command mode offers the
// action bar's choices (disabled ones with their reason); the scripted DM
// route plays typed messages; a recorded trace replays exactly, cards,
// grouped rolls and all; the live route needs --ai and OPENAI_API_KEY and
// keeps to its call budget; and the DM evaluation scores interpretation,
// refusal and narration fidelity within its call budget. Since #255 these
// play fixture modules: the CLI through --adventure-file, the evaluation
// through its `adventure` option with cases written for the fixture. The
// shipped evaluation cases and the live qualification are content, tested
// with the module they are written for.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkDmOffRefusal,
  offeredToolsMatchActions,
  runFifthDmEvaluation,
  scriptedCaseModel,
  setUpCase,
} from "../dist/dm-evaluation-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { ratTunnels, sealedCrypt } from "./fixtures/modules.mjs";

const cli = fileURLToPath(new URL("../dist/cli-5e.js", import.meta.url));
/** Doors (one stuck shut) and a zombie in the tomb, for the CLI's runs. */
const cryptFile = fileURLToPath(
  new URL("./fixtures/sealed-crypt.json", import.meta.url),
);

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

/** Runs the CLI on the sealed crypt fixture. */
const runCrypt = (args, lines, env) =>
  run(["--adventure-file", cryptFile, ...args], lines, env);

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("command mode lists the action bar, disabled actions with their reason, and refuses typing without an AI DM", () => {
  const result = runCrypt(["--seed", "0"], ["2", "Open the door", "4", "quit"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /The Sealed Crypt\. Seed 0\./);
  // The same choices as the browser's action bar, in its order.
  const session = FifthSession.begin(0, sealedCrypt, TEST_FIGHTER);
  const actions = session.runtime.projectActions(session.state);
  assert.match(
    result.stdout,
    /1\. Go to Flooded Cell — Door shut\n {2}2\. Go to Hall of Niches/,
  );
  assert.equal(actions[1].target.name, "Hall of Niches");
  assert.match(result.stdout, /4\. Go to Strongroom — Door shut/);
  assert.match(
    result.stdout,
    /Typing to the Dungeon Master is off\. Choose an action by its number\./,
  );
  assert.match(result.stdout, /That action is not available: Door shut\./);
});

test("--adventure-file plays only the module it names, and names a file it cannot read", () =>
  withDirectory(async (directory) => {
    const both = run(["--adventure", "x", "--adventure-file", cryptFile]);
    assert.equal(both.status, 2);
    assert.match(
      both.stderr,
      /Choose --adventure or --adventure-file, not both\./,
    );
    const missing = join(directory, "missing.json");
    const unread = run(["--adventure-file", missing, "--seed", "0"]);
    assert.equal(unread.status, 1);
    assert.match(unread.stderr, /missing\.json is not a readable adventure/);
    const help = run(["--help"]);
    assert.match(help.stdout, /--adventure-file <module\.json>/);
  }));

test("a recorded command-mode trace replays exactly", () =>
  withDirectory(async (directory) => {
    const trace = join(directory, "trace.json");
    // Into the hall, to the tomb (its fight begins), attack the zombie.
    const played = runCrypt(["--seed", "0", "--trace", trace], ["2", "2", "1"]);
    assert.equal(played.status, 0, played.stderr);
    assert.match(
      played.stdout,
      /\[Result\]\n {2}You enter the Warden's Tomb\./,
    );
    assert.match(played.stdout, /Ada's initiative: d20 \d+ \+ 2 = \d+/);
    const recorded = await readJson(trace);
    assert.equal(recorded.kind, "dungeon-one-5e-trace");
    assert.equal(recorded.formatVersion, 15);
    assert.equal(recorded.adventure.id, "sealed-crypt");
    assert.equal(recorded.turns.length, 3);
    // Each card keeps its lines and their rolls grouped by purpose.
    const purposes = recorded.turns[2].card.lines.flatMap(({ rolls }) =>
      rolls.map(({ purpose }) => purpose),
    );
    assert.ok(purposes.includes("attack"), JSON.stringify(purposes));

    const replayed = runCrypt(["--replay", trace]);
    assert.equal(replayed.status, 0, replayed.stderr);
    assert.match(replayed.stdout, /Trace verified: .* \(3 turns, playing\)\./);
    // Replay finds the module only in the file it is given.
    const elsewhere = run([
      "--replay",
      trace,
      "--adventure-file",
      fileURLToPath(new URL("./fixtures/rat-tunnels.json", import.meta.url)),
    ]);
    assert.equal(elsewhere.status, 1);
    assert.match(elsewhere.stderr, /recorded in sealed-crypt/);
  }));

test("replay names the first turn whose card, rolls, state or dice stream differ", () =>
  withDirectory(async (directory) => {
    const trace = join(directory, "trace.json");
    runCrypt(["--seed", "0", "--trace", trace], ["2", "2", "1"]);
    const original = await readJson(trace);
    const tampered = async (change, expected) => {
      const copy = structuredClone(original);
      change(copy);
      const path = join(directory, "tampered.json");
      await writeFile(path, JSON.stringify(copy));
      const result = runCrypt(["--replay", path]);
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
    runCrypt(["--seed", "0", "--trace", trace], ["2"]);
    const copy = await readJson(trace);
    copy.formatVersion = 2;
    const bytes = JSON.stringify(copy);
    await writeFile(trace, bytes);
    const result = runCrypt(["--replay", trace]);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /trace\.json is a trace in format version 2, not 15\. .*Move it aside; the file has not been changed\./,
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
        call("c1", "move", { destination: "hall" }),
        call("c2", "attack", { target: "risen-warden" }),
        { text: "Which do you mean?" },
      ]),
    );
    const trace = join(directory, "trace.json");
    const played = runCrypt(
      ["--seed", "0", "--trace", trace],
      ["Go into the hall.", "2", "Hit the zombie.", "Do the thing."],
      { DUNGEON_ONE_TEST_DM_SCRIPT: script },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /You enter the Hall of Niches\./);
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

    assert.equal(runCrypt(["--replay", trace]).status, 0);
    // A different recorded response replays to a different turn.
    attack.responses[0].response.toolCalls[0].argumentsJson = JSON.stringify({
      target: "nobody",
    });
    await writeFile(trace, JSON.stringify(recorded));
    const result = runCrypt(["--replay", trace]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /diverged at turn 3/);
  }));

test("the live route needs --ai and OPENAI_API_KEY, and never plays a script instead", () =>
  withDirectory(async (directory) => {
    const noKey = runCrypt(["--ai", "--seed", "0"], ["quit"]);
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
    const mixed = runCrypt(["--ai", "--seed", "0"], ["Hello?"], {
      OPENAI_API_KEY: "sk-test",
      DUNGEON_ONE_TEST_DM_SCRIPT: script,
    });
    assert.equal(mixed.status, 2);
    assert.match(mixed.stderr, /unset DUNGEON_ONE_TEST_DM_SCRIPT/);
  }));

// DM evaluation cases written for the rat tunnels, a level-1 module the test
// Fighter can win a fight in, so the evaluation's plumbing is tested apart
// from the shipped cases.
const toolCall = (id, name, args = {}) => ({
  toolCalls: [{ id: `${id}-call`, name, argumentsJson: JSON.stringify(args) }],
});
const actionCase = ({ id, name, arguments: args, ...rest }) => ({
  id,
  kind: "interpretation",
  manualJudgments: [],
  ...rest,
  expectation: { kind: "action", name, arguments: args },
  scripted: [toolCall(id, name, args), { text: "So it is done." }],
});
const toCellar = [{ type: "move", destinationId: "rat-cellar" }];
const TUNNEL_CASES = [
  actionCase({
    id: "clear-move",
    seed: 0,
    setup: [],
    playerInput: "Go down to the cellar.",
    name: "move",
    arguments: { destination: "rat-cellar" },
    dimensions: ["clear-accuracy"],
  }),
  actionCase({
    id: "clear-attack",
    seed: 0,
    setup: toCellar,
    playerInput: "Attack the rat.",
    name: "attack",
    arguments: { target: "giant-rat" },
    dimensions: ["clear-accuracy"],
  }),
  actionCase({
    id: "synonym-search-body",
    seed: 0,
    setup: [...toCellar, { type: "win-fight" }],
    playerInput: "Poke at the dead rat.",
    name: "examine",
    arguments: { target: "giant-rat" },
    dimensions: ["synonym-accuracy"],
  }),
  {
    id: "impossible-request",
    kind: "refusal",
    seed: 0,
    setup: [],
    playerInput: "I fly back up the stair and out into the sun.",
    expectation: { kind: "no-action" },
    dimensions: ["refusal", "narration-fidelity"],
    manualJudgments: ["no-fabricated-outcomes"],
    scripted: [{ text: "You can't do that here." }],
  },
  {
    id: "status-health",
    kind: "interpretation",
    seed: 0,
    setup: [],
    playerInput: "How am I holding up?",
    expectation: { kind: "read", name: "get_character_status" },
    dimensions: ["status-accuracy", "narration-fidelity"],
    manualJudgments: [],
    scripted: [
      toolCall("status-health", "get_character_status"),
      { text: "You are unhurt." },
    ],
  },
];

/** The evaluation over the tunnel cases. */
const evaluate = (options) =>
  runFifthDmEvaluation({
    repetitions: 1,
    adventure: ratTunnels,
    cases: TUNNEL_CASES,
    ...options,
  });

test("every case's setup, a won fight included, offers the AI DM exactly the enabled actions", () => {
  for (const sample of TUNNEL_CASES) {
    const session = setUpCase(sample, ratTunnels);
    assert.equal(session.state.status, "playing", sample.id);
    assert.ok(offeredToolsMatchActions(session), sample.id);
  }
});

test("a correct scripted DM passes every automated check, and the DM-off notice is checked", async () => {
  const report = await evaluate({
    requestedModel: "scripted",
    createModel: (sample) => scriptedCaseModel(sample),
    manualJudgments: Object.fromEntries(
      TUNNEL_CASES.map((sample) => [
        sample.id,
        {
          1: Object.fromEntries(sample.manualJudgments.map((id) => [id, true])),
        },
      ]),
    ),
  });
  assert.equal(report.adventureId, "rat-tunnels");
  assert.equal(report.runs.length, TUNNEL_CASES.length);
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
  const report = await evaluate({
    requestedModel: "reckless",
    createModel: reckless,
  });
  assert.equal(report.passed, false);
  assert.ok(report.summary.refusal.failed > 0);
  assert.equal(report.summary.safety.meetsThreshold, false);
});

test("a DM that claims outcomes it never produced fails narration fidelity", async () => {
  const boaster = () => ({
    async respond() {
      return { text: "You hit the rat for 12 damage and find the key." };
    },
  });
  const report = await evaluate({
    requestedModel: "boaster",
    createModel: boaster,
  });
  assert.equal(report.summary["narration-fidelity"].passed, 0);
  assert.equal(report.passed, false);
});

test("the evaluation keeps to its call budget", async () => {
  const report = await evaluate({
    requestedModel: "scripted",
    maxCalls: 3,
    cases: TUNNEL_CASES.slice(0, 4),
    createModel: (sample) => scriptedCaseModel(sample),
  });
  assert.equal(report.providerCalls, 3);
  assert.ok(report.runs.some(({ failures }) => failures > 0));
  assert.equal(report.passed, false);
});

test("a server without an AI DM refuses typed messages with the player notice", async () => {
  assert.equal(await checkDmOffRefusal(ratTunnels), true);
});

test("the 5e DM evaluation calls the provider only with --live and a key", () => {
  const evalDm = fileURLToPath(
    new URL("../scripts/eval-dm.mjs", import.meta.url),
  );
  const evaluateScript = (args, key = "") =>
    spawnSync(process.execPath, [evalDm, "--model", "m", ...args], {
      encoding: "utf8",
      env: { ...process.env, OPENAI_API_KEY: key },
    });
  for (const args of [
    [],
    ["--live", "--live"],
    ["--live", "--max-calls", "0"],
    // The pre-5e campaigns, and the option that chose them, are gone (#139).
    ["--live", "--campaign", "any-campaign"],
  ]) {
    const result = evaluateScript(args, "sk-test");
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /only with --live/);
  }
  const noKey = evaluateScript(["--live"]);
  assert.equal(noKey.status, 2);
  assert.match(noKey.stderr, /OPENAI_API_KEY is required/);
});

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
