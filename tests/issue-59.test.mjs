import assert from "node:assert/strict";
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
    assert.doesNotMatch(
      JSON.stringify(attempts),
      /SECRET-KEY|missing surveyor|evaluation-witness/iu,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
