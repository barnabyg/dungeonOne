import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function play(sample, input, extraArgs = []) {
  const result = spawnSync(
    process.execPath,
    [
      "dist/cli.js",
      "--adventure-file",
      `docs/acceptance/issue-60-samples/${sample}.json`,
      "--seed",
      "0",
      ...extraArgs,
    ],
    { input, encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" } },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("a first look offers copyable actions, including conversation", () => {
  const output = play("rescue", "look\n");
  assert.match(output, /Type talk <person> to see conversation commands/iu);
  assert.match(output, /Try:.*talk mira-vale missing-courier ask/isu);
});

test("the suggested conversation and evidence commands work", () => {
  const conversation = play(
    "rescue",
    "look\ntalk mira-vale missing-courier ask\n",
  );
  assert.doesNotMatch(conversation, /Action unavailable:/u);
  assert.match(conversation, /Mira/iu);

  const evidence = play(
    "negotiation",
    "move reed ferry\nlook\nsearch ferry-mud\n",
  );
  assert.match(evidence, /Try:.*search ferry-mud/isu);
  assert.doesNotMatch(evidence, /Action unavailable:/u);
});

test("an unsupported phrase points to the current conversation command", () => {
  const output = play("rescue", "talk to Mira about the missing courier\n");
  assert.match(
    output,
    /Action unavailable: invisible-target.*talk mira-vale missing-courier ask/isu,
  );
});

test("talking to a person without a topic lists that person's options", () => {
  const mira = play("rescue", "talk Mira\nquit\n");
  assert.match(
    mira,
    /No action was taken with Mira Vale\. Available conversation commands: talk mira-vale missing-courier ask/iu,
  );

  const search = play("rescue", "search Mira\nquit\n");
  assert.match(search, /No action was taken with Mira Vale/iu);
});

test("every person presented in the player samples has a conversation topic", () => {
  for (const sample of ["investigation", "rescue", "negotiation"]) {
    const adventure = JSON.parse(
      readFileSync(`docs/acceptance/issue-60-samples/${sample}.json`, "utf8"),
    );
    for (const npc of adventure.npcs) {
      assert.ok(npc.topics.length > 0, `${sample}: ${npc.name}`);
    }
  }
});

test("a short talk request leads to an authored Orin conversation", () => {
  const directory = mkdtempSync(join(tmpdir(), "issue-60-talk-"));
  try {
    const trace = join(directory, "orin.json");
    const output = play(
      "negotiation",
      "move reed ferry\nmove old bell tower\nattack tower-kite\nattack tower-kite\ntalk Orin\ntalk hermit tower ask\nquit\n",
      ["--trace", trace],
    );
    assert.match(
      output,
      /Available conversation commands: talk hermit tower ask/iu,
    );
    assert.match(output, /Orin: /u);
    const replay = spawnSync(
      process.execPath,
      ["dist/cli.js", "--replay", trace],
      {
        encoding: "utf8",
        env: { ...process.env, OPENAI_API_KEY: "" },
      },
    );
    assert.equal(replay.status, 0, replay.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a collect request points to the current evidence command", () => {
  const output = play(
    "negotiation",
    "move reed ferry\ncollect the ferry mud\njournal\n",
  );
  assert.match(
    output,
    /Action unavailable: unknown-command.*search ferry-mud/isu,
  );
});

test("the released v7 trace keeps its rejected command semantics", () => {
  const replay = spawnSync(
    process.execPath,
    ["dist/cli.js", "--replay", "tests/fixtures/issue-60-v7-command.json"],
    { encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" } },
  );
  assert.equal(replay.status, 0, replay.stderr);
});
