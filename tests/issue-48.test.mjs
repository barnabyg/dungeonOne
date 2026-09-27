import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = "adventures/chapel-clues.json";
const run = (input, args, env = {}) =>
  spawnSync(process.execPath, ["dist/cli.js", ...args], {
    input,
    encoding: "utf8",
    timeout: 15000,
    env: { ...process.env, OPENAI_API_KEY: "", ...env },
  });
const temporary = (work) => {
  const directory = mkdtempSync(join(tmpdir(), "issue-48-"));
  try {
    return work(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const baseline = readFileSync(
  "docs/acceptance/inputs/chapel-confidential.txt",
  "utf8",
)
  .trim()
  .split(/\r?\n/u);

test("external file completes both endings atomically and replays exact format-4 state", () =>
  temporary((directory) => {
    for (const [choice, expected] of [
      ["public disclosure", "evidence-published"],
      ["confidential referral", "restitution-repair-requested"],
    ]) {
      const tracePath = join(directory, `${expected}.json`);
      const commands = baseline.map((line) =>
        line === "resolve confidential referral" ? `resolve ${choice}` : line,
      );
      commands.splice(
        commands.indexOf(`resolve ${choice}`) + 1,
        0,
        "resolve public disclosure",
        "move chapel path",
        "take healing potion",
        "help",
        "inventory",
        "look",
      );
      const played = run(`${commands.join("\n")}\n`, [
        "--adventure-file",
        source,
        "--seed",
        "0",
        "--trace",
        tracePath,
      ]);
      assert.equal(played.status, 0, played.stderr);
      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      assert.equal(trace.formatVersion, 4);
      assert.equal(trace.engineVersion, "chapel-clues-engine-v7");
      const committed = trace.actions.find(
        ({ stateAfter }) =>
          stateAfter?.ending?.id === choice.replaceAll(" ", "-"),
      );
      assert.ok(committed);
      assert.equal(committed.stateAfter.status, "victory");
      assert.equal(committed.stateAfter.ending.fate, "rescued-to-inn");
      assert.ok(committed.stateAfter.ending.consequences.includes(expected));
      assert.ok(
        trace.actions
          .slice(trace.actions.indexOf(committed) + 1)
          .every(
            ({ stateAfter }) =>
              stateAfter === undefined ||
              JSON.stringify(stateAfter) ===
                JSON.stringify(committed.stateAfter),
          ),
      );
      assert.match(played.stdout, /Quest: Find Tavi \(resolved\)/u);
      assert.match(played.stdout, /Action unavailable: invisible-target/u);
      assert.equal(run("", ["--replay", tracePath]).status, 0);
    }
  }));

test("failed social approach retains the physical route to public resolution", () =>
  temporary((directory) => {
    const tracePath = join(directory, "social-fallback.json");
    const input = readFileSync(
      "docs/acceptance/inputs/chapel-public-social-fallback.txt",
      "utf8",
    );
    const played = run(input, [
      "--adventure-file",
      source,
      "--seed",
      "7",
      "--trace",
      tracePath,
    ]);
    assert.equal(played.status, 0, played.stderr);
    const trace = JSON.parse(readFileSync(tracePath, "utf8"));
    assert.equal(
      trace.actions.find(
        ({ stateAfter }) => stateAfter?.socialChallenges?.["guarded-account"],
      )?.stateAfter.socialChallenges["guarded-account"].result,
      "failure",
    );
    assert.equal(
      trace.actions.find(({ stateAfter }) => stateAfter?.ending)?.stateAfter
        .ending.id,
      "public-disclosure",
    );
    assert.equal(run("", ["--replay", tracePath]).status, 0);
  }));

test("casualty records and future commitments reflect actual deaths", () =>
  temporary((directory) => {
    const cases = [
      [
        "mara",
        [
          "attack mara",
          "attack mara",
          "attack mara",
          "attack mara",
          ...baseline,
        ],
        "mara",
      ],
      [
        "oren",
        readFileSync("docs/acceptance/inputs/chapel-oren-casualty.txt", "utf8")
          .trim()
          .split(/\r?\n/u),
        "oren",
      ],
      [
        "tavi-crypt",
        baseline.flatMap((line) =>
          line === "talk tavi rescue ask"
            ? [
                "attack tavi",
                "attack tavi",
                "attack tavi",
                "attack tavi",
                "search tavi",
                line,
              ]
            : [line],
        ),
        "tavi",
      ],
      [
        "tavi-inn",
        baseline.flatMap((line) =>
          line === "resolve confidential referral"
            ? [
                "attack tavi",
                "attack tavi",
                "attack tavi",
                "attack tavi",
                "search tavi",
                line,
              ]
            : [line],
        ),
        "tavi",
      ],
    ];
    for (const [name, commands, casualty] of cases) {
      const tracePath = join(directory, `${name}.json`);
      const played = run(`${commands.join("\n")}\n`, [
        "--adventure-file",
        source,
        "--seed",
        "0",
        "--trace",
        tracePath,
      ]);
      assert.equal(played.status, 0, `${name}: ${played.stderr}`);
      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      const ending = trace.actions.find(({ stateAfter }) => stateAfter?.ending)
        ?.stateAfter?.ending;
      assert.ok(ending, `${name}: no ending`);
      assert.ok(ending.casualties.includes(casualty));
      if (name === "oren") {
        assert.ok(
          !ending.consequences.includes("oren-committed-future-restitution"),
        );
        assert.match(ending.narration, /no personal promise/u);
      }
      if (name === "tavi-crypt") {
        assert.equal(ending.fate, "dead-in-crypt");
      }
      if (name === "tavi-inn") {
        assert.equal(ending.fate, "dead-at-inn");
      }
      assert.equal(run("", ["--replay", tracePath]).status, 0, name);
    }
  }));

test("generic AI intent requires one affirmative choice and supports renamed endings", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const { createChapelCluesRuntime } =
    await import("../dist/chapel-clues-runtime.js");
  const { createSeededRandom } = await import("../dist/random.js");
  const document = JSON.parse(readFileSync(source, "utf8"));
  document.endings.choices[0].id = "broadcast-record";
  document.endings.choices[0].label = "Broadcast the record";
  document.endings.choices[0].aliases = ["broadcast the ledger"];
  document.endings.choices[1].id = "sealed-report";
  document.endings.choices[1].label = "Seal the report";
  document.endings.choices[1].aliases = ["seal the ledger"];
  const loaded = loadAdventure(JSON.stringify(document));
  assert.equal(loaded.ok, true, JSON.stringify(loaded.diagnostics));
  const runtime = createChapelCluesRuntime(loaded.adventure);
  const random = createSeededRandom(0);
  let state = runtime.createSession();
  for (const command of baseline.slice(
    0,
    baseline.indexOf("resolve confidential referral"),
  )) {
    const result = runtime.handleAction(
      state,
      runtime.parseCommand(command),
      random,
    );
    state = result.state;
  }
  assert.deepEqual(
    runtime
      .getGameToolDefinitions(state)
      .find(({ name }) => name === "resolve_quest")?.parameters.properties
      .resolutionId.enum,
    ["broadcast-record", "sealed-report"],
  );
  assert.match(
    runtime.renderResult(runtime.handleAction(state, { type: "look" })),
    /Broadcast the record: The ledger evidence is published/u,
  );
  assert.match(
    runtime.projectDmScene(state).room.description,
    /Seal the report: The ledger is delivered privately/u,
  );
  assert.match(
    runtime
      .getGameToolDefinitions(state)
      .find(({ name }) => name === "resolve_quest").description,
    /Restitution and chapel repair are requested/u,
  );
  for (const input of [
    "maybe broadcast the ledger",
    "do not broadcast the ledger",
    "I refuse to broadcast the ledger",
    "I decline broadcast the ledger",
    "I reject broadcast the ledger",
    "Should we broadcast the ledger?",
    "broadcast the ledger or seal the ledger",
    "Continue",
  ]) {
    const result = runtime.dispatchGameTool(
      state,
      {
        name: "resolve_quest",
        argumentsJson: JSON.stringify({ resolutionId: "broadcast-record" }),
      },
      undefined,
      input,
    );
    assert.equal(result.modelOutput.error.code, "unavailable-reference", input);
    assert.strictEqual(result.state, state);
  }
  const committed = runtime.dispatchGameTool(
    state,
    {
      name: "resolve_quest",
      argumentsJson: JSON.stringify({ resolutionId: "sealed-report" }),
    },
    undefined,
    "Please seal the ledger",
  );
  assert.equal(committed.state.status, "victory");
  assert.equal(committed.state.ending.id, "sealed-report");
  assert.equal(
    runtime
      .getGameToolDefinitions(committed.state)
      .some(({ name }) => name === "resolve_quest"),
    false,
  );
});

test("ending data rejects duplicate choices, ambiguous aliases and invalid references", async () => {
  const { loadAdventure } = await import("../dist/adventure-loader.js");
  const original = JSON.parse(readFileSync(source, "utf8"));
  const check = (change, code) => {
    const variant = structuredClone(original);
    change(variant);
    assert.ok(
      loadAdventure(JSON.stringify(variant)).diagnostics.some(
        (entry) => entry.code === code,
      ),
      code,
    );
  };
  check((doc) => {
    doc.endings.choices[1].id = doc.endings.choices[0].id;
  }, "duplicate-id");
  check((doc) => {
    doc.endings.choices[1].aliases.push("public disclosure");
  }, "ambiguous-alias");
  check((doc) => {
    doc.endings.when[0].id = "missing-discovery";
  }, "unknown-reference");
  check((doc) => {
    doc.endings.fates[0].when[0].locationId = "missing-location";
  }, "unknown-reference");
  check((doc) => {
    doc.rulesVersion = "chapel-clues-rules-v3";
  }, "unsupported-rules");
});

test("scripted AI completes both explicit endings, recovers after a committed resolution, and replays", () =>
  temporary((directory) => {
    const route = [
      ["move", { destinationId: "chapel-path" }],
      ["move", { destinationId: "ruined-chapel" }],
      ["move", { destinationId: "crypt" }],
      ...Array.from({ length: 3 }, () => [
        "attack",
        { opponent_id: "skeleton-guardian" },
      ]),
      ["search", { target: "diversion-ledger" }],
      ["talk", { speakerId: "tavi", topicId: "crypt", approach: "ask" }],
      ["talk", { speakerId: "tavi", topicId: "rescue", approach: "ask" }],
      ["move", { destinationId: "ruined-chapel" }],
      ["move", { destinationId: "chapel-path" }],
      ["move", { destinationId: "inn" }],
    ];
    for (const [choice, phrase] of [
      ["public-disclosure", "public disclosure"],
      ["confidential-referral", "confidential referral"],
    ]) {
      const calls = [...route, ["resolve_quest", { resolutionId: choice }]];
      const script = join(directory, `${choice}-script.json`);
      writeFileSync(
        script,
        JSON.stringify(
          calls.flatMap(([name, args], index) => [
            {
              toolCalls: [
                {
                  id: `call-${index}`,
                  name,
                  argumentsJson: JSON.stringify(args),
                },
              ],
            },
            ...(choice === "confidential-referral" && index === calls.length - 1
              ? []
              : [{ text: "Continue." }]),
          ]),
        ),
      );
      const tracePath = join(directory, `${choice}.json`);
      const input = `${[...route.map(() => "Continue"), phrase, "status", "journal", "quit"].join("\n")}\n`;
      const played = run(
        input,
        [
          "--adventure-file",
          source,
          "--ai",
          "--seed",
          "0",
          "--trace",
          tracePath,
        ],
        { DUNGEON_ONE_TEST_DM_SCRIPT: script },
      );
      assert.equal(played.status, 0, played.stderr);
      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      const committed = trace.turns.find(
        ({ stateAfter }) => stateAfter?.ending?.id === choice,
      );
      assert.ok(committed, choice);
      assert.equal(committed.stateAfter.ending.fate, "rescued-to-inn");
      if (choice === "confidential-referral") {
        assert.ok(
          committed.diagnostics.some(({ code }) => code === "model-failure"),
        );
      }
      assert.match(played.stdout, /Session: victory/u);
      assert.equal(run("", ["--replay", tracePath]).status, 0, choice);
    }
  }));
