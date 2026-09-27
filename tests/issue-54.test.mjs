import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { generateAdventure } from "../dist/generation.js";

const example = readFileSync(
  resolve("adventures/generation-example.json"),
  "utf8",
);
const fixture = example
  .replace('"id": "lantern-archive"', '"id": "fog-cartographer"')
  .replace("The Lantern Archive", "The Fog Cartographer")
  .replace(
    "A signal from the old archive has gone dark.",
    "A lost cartographer follows a bell into the fog.",
  );
const cli = resolve("dist/cli.js");

async function temporary(run) {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-one-generation-"));
  try {
    return await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function client(response, observe = () => {}) {
  return {
    responses: {
      async create(body) {
        observe(body);
        return response;
      },
    },
  };
}

test("one valid model document is written and plays through a seeded ending", async () => {
  await temporary(async (directory) => {
    const outputPath = join(directory, "generated adventure.json");
    let request;
    const generated = await generateAdventure({
      premise: "A lost cartographer follows a bell into the fog",
      outputPath,
      model: "fixture-model",
      apiKey: "test-key",
      client: client({ status: "completed", output_text: fixture }, (body) => {
        request = body;
      }),
    });
    assert.equal(generated.id, "fog-cartographer");
    assert.match(generated.digest, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(readFileSync(outputPath, "utf8"), fixture);
    assert.equal(request.model, "fixture-model");
    assert.equal(request.store, false);
    assert.ok(request.max_output_tokens > 0);
    assert.equal(request.text.format.strict, true);
    assert.deepEqual(
      request.text.format.schema.properties.discoveries.items.properties
        .classification.enum,
      ["observation"],
    );
    const validated = spawnSync(
      process.execPath,
      [cli, "--validate-adventure", outputPath],
      { encoding: "utf8" },
    );
    assert.equal(validated.status, 0, validated.stderr);
    const played = spawnSync(
      process.execPath,
      [cli, "--adventure-file", outputPath, "--seed", "0"],
      {
        input:
          "search notice\nmove archive\nsearch record\nmove square\nresolve private report\nstatus\nquit\n",
        encoding: "utf8",
        env: { ...process.env, OPENAI_API_KEY: "" },
      },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /private report/iu);
  });
});

test("invalid input and destinations stop before a provider call", async () => {
  await temporary(async (directory) => {
    const outputPath = join(directory, "adventure.json");
    let calls = 0;
    const options = {
      premise: "A tiny mystery",
      outputPath,
      model: "fixture-model",
      apiKey: "test-key",
      client: client(null, () => {
        calls++;
      }),
    };
    for (const change of [
      { premise: "" },
      { premise: "x".repeat(501) },
      { model: "" },
      { apiKey: "" },
      { outputPath: join(directory, "missing", "adventure.json") },
      { outputPath: join(outputPath, "child.json") },
    ]) {
      await assert.rejects(generateAdventure({ ...options, ...change }));
    }
    writeFileSync(outputPath, "keep me");
    await assert.rejects(generateAdventure(options), /already exists/u);
    assert.equal(readFileSync(outputPath, "utf8"), "keep me");
    assert.equal(calls, 0);
  });
});

test("malformed, oversized, and failed provider responses leave no output", async () => {
  await temporary(async (directory) => {
    for (const [name, response] of [
      ["malformed", { status: "completed", output_text: "{bad" }],
      ["incomplete", { status: "incomplete", output_text: fixture }],
      ["example-copy", { status: "completed", output_text: example }],
      [
        "oversized",
        { status: "completed", output_text: "x".repeat(16 * 1024 + 1) },
      ],
    ]) {
      const outputPath = join(directory, `${name}.json`);
      await assert.rejects(
        generateAdventure({
          premise: "Mystery",
          outputPath,
          model: "fixture-model",
          apiKey: "test-key",
          client: client(response),
        }),
      );
      assert.equal(existsSync(outputPath), false);
    }
    const outputPath = join(directory, "provider.json");
    await assert.rejects(
      generateAdventure({
        premise: "Mystery",
        outputPath,
        model: "fixture-model",
        apiKey: "test-key",
        client: {
          responses: {
            async create() {
              throw new Error("secret provider details");
            },
          },
        },
      }),
      /provider request failed/u,
    );
    assert.equal(existsSync(outputPath), false);
  });
});

test("a destination created during the provider call is never replaced", async () => {
  await temporary(async (directory) => {
    const outputPath = join(directory, "claimed.json");
    await assert.rejects(
      generateAdventure({
        premise: "Mystery",
        outputPath,
        model: "fixture-model",
        apiKey: "test-key",
        client: client({ status: "completed", output_text: fixture }, () => {
          writeFileSync(outputPath, "keep me");
        }),
      }),
      /Unable to write generation output/u,
    );
    assert.equal(readFileSync(outputPath, "utf8"), "keep me");
  });
});

test("CLI generation rejects mixed options and missing credentials without touching output", async () => {
  await temporary((directory) => {
    const outputPath = join(directory, "generated.json");
    for (const extra of [
      ["--seed", "0"],
      ["--ai"],
      ["--replay", "trace.json"],
      ["--trace", "trace.json"],
      ["--validate-adventure", "x"],
      ["--adventure", "chapel"],
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          cli,
          "--generate-adventure",
          outputPath,
          "--premise",
          "Mystery",
          "--model",
          "fixture-model",
          ...extra,
        ],
        { encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" } },
      );
      assert.equal(result.status, 2);
      assert.equal(existsSync(outputPath), false);
    }
    const missingKey = spawnSync(
      process.execPath,
      [
        cli,
        "--generate-adventure",
        outputPath,
        "--premise",
        "Mystery",
        "--model",
        "fixture-model",
      ],
      { encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" } },
    );
    assert.equal(missingKey.status, 2);
    assert.match(missingKey.stderr, /OPENAI_API_KEY/u);
    assert.equal(existsSync(outputPath), false);
  });
});
