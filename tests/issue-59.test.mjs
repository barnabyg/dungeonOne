import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { generateAdventure } from "../dist/generation.js";

test("evaluation observes each generation attempt without retaining provider payloads", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-one-issue-59-"));
  try {
    const source = JSON.parse(
      await readFile(
        new URL("../adventures/generation-example.json", import.meta.url),
        "utf8",
      ),
    );
    const accepted = JSON.stringify({ ...source, id: "evaluation-witness" });
    const rejected = JSON.stringify({
      ...source,
      id: "evaluation-witness",
      locations: [],
    });
    const attempts = [];
    const result = await generateAdventure({
      premise: "A missing surveyor",
      outputPath: join(directory, "adventure.json"),
      model: "fixture-model",
      apiKey: "SECRET-KEY",
      onAttempt: (attempt) => attempts.push(attempt),
      client: {
        responses: {
          async create() {
            const text = attempts.length === 0 ? rejected : accepted;
            return {
              status: "completed",
              output_text: text,
              usage: { input_tokens: 120, output_tokens: 55 },
            };
          },
        },
      },
    });
    assert.equal(result.attempts, 2);
    assert.deepEqual(
      attempts.map((attempt) => attempt.status),
      ["rejected", "accepted"],
    );
    assert.equal(
      attempts[0].candidateSha256,
      createHash("sha256").update(rejected).digest("hex"),
    );
    assert.equal(
      attempts[1].candidateSha256,
      createHash("sha256").update(accepted).digest("hex"),
    );
    assert.ok(attempts[0].diagnosticCodes.length > 0);
    assert.deepEqual(
      attempts.map((attempt) => [attempt.inputTokens, attempt.outputTokens]),
      [
        [120, 55],
        [120, 55],
      ],
    );
    assert.match(attempts[0].promptSha256, /^[a-f0-9]{64}$/u);
    assert.match(attempts[0].prompt, /A missing surveyor/u);
    assert.equal(
      attempts[0].promptSha256,
      createHash("sha256").update(attempts[0].prompt).digest("hex"),
    );
    assert.doesNotMatch(JSON.stringify(attempts), /SECRET-KEY/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("generation request constrains reference IDs and aliases before provider output", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "dungeon-one-issue-59-schema-"),
  );
  try {
    const source = JSON.parse(
      await readFile(
        new URL("../adventures/generation-example.json", import.meta.url),
        "utf8",
      ),
    );
    let format;
    await generateAdventure({
      premise: "A missing surveyor",
      outputPath: join(directory, "adventure.json"),
      model: "fixture-model",
      apiKey: "fixture-key",
      client: {
        responses: {
          async create(body) {
            format = body.text.format;
            return {
              status: "completed",
              output_text: JSON.stringify({ ...source, id: "schema-witness" }),
            };
          },
        },
      },
    });
    const properties = format.schema.properties;
    const npc = properties.npcs.items.properties;
    assert.equal(properties.id.pattern, "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$");
    assert.equal(npc.believes.items.pattern, properties.id.pattern);
    assert.equal(
      npc.topics.items.properties.challengeId.pattern,
      properties.id.pattern,
    );
    assert.match(npc.aliases.items.pattern, /\[a-z0-9\]/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("evaluation plans one bounded ten-premise batch without an API key", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/eval-generation.mjs", "--batch", "1", "--dry-run"],
    { encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" } },
  );
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.total, 10);
  assert.equal(plan.batch, 1);
  assert.equal(plan.premises.length, 10);
  assert.ok(
    plan.premises.some((premise) => premise.category === "adversarial"),
  );
});
