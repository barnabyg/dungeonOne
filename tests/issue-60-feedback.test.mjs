import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function play(sample, input) {
  const result = spawnSync(
    process.execPath,
    [
      "dist/cli.js",
      "--adventure-file",
      `docs/acceptance/issue-60-samples/${sample}.json`,
      "--seed",
      "0",
    ],
    { input, encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" } },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("a first look offers copyable actions, including conversation", () => {
  const output = play("rescue", "look\n");
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

test("talking to a person without a topic explains that person's options", () => {
  const mira = play("rescue", "talk Mira\nquit\n");
  assert.match(
    mira,
    /No action was taken with Mira Vale\. Available conversation commands: talk mira-vale missing-courier ask/iu,
  );

  const search = play("rescue", "search Mira\nquit\n");
  assert.match(search, /No action was taken with Mira Vale/iu);

  const orin = play(
    "negotiation",
    "move reed ferry\nmove old bell tower\nattack tower-kite\nattack tower-kite\ntalk Orin\nquit\n",
  );
  assert.match(orin, /Orin Coil has no available conversation topics/iu);
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
