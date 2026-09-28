import assert from "node:assert/strict";
import test from "node:test";
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

import { generateAdventure } from "../dist/generation.js";

const cli = resolve("dist/cli.js");
const source = JSON.parse(
  readFileSync(resolve("adventures/generation-example.json"), "utf8"),
);
const candidate = () => ({
  ...structuredClone(source),
  id: "issue-55-candidate",
});
const client = (document) => ({
  responses: {
    async create() {
      return { status: "completed", output_text: JSON.stringify(document) };
    },
  },
});
async function inDirectory(run) {
  const directory = mkdtempSync(join(tmpdir(), "dungeon-one-issue-55-"));
  try {
    return await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const generate = (document, outputPath) =>
  generateAdventure({
    premise: "A small mystery",
    outputPath,
    model: "fixture-model",
    apiKey: "fixture-key",
    client: client(document),
  });

test("a playable candidate passes generation, validation, and command startup", async () => {
  await inDirectory(async (directory) => {
    const outputPath = join(directory, "playable.json");
    await generate(candidate(), outputPath);
    const validated = spawnSync(
      process.execPath,
      [cli, "--validate-adventure", outputPath],
      { encoding: "utf8" },
    );
    assert.equal(validated.status, 0, validated.stderr);
    assert.equal(JSON.parse(validated.stdout).ok, true);
    const played = spawnSync(
      process.execPath,
      [cli, "--adventure-file", outputPath, "--seed", "0"],
      {
        input: "look\nquit\n",
        encoding: "utf8",
        env: { ...process.env, OPENAI_API_KEY: "" },
      },
    );
    assert.equal(played.status, 0, played.stderr);
    assert.match(played.stdout, /Square/u);
  });
});

test("distinct ending prose containing separators remains distinct", async () => {
  await inDirectory(async (directory) => {
    const document = candidate();
    document.endings.choices[0].consequences[0].text = "a|b";
    document.endings.choices[0].narration[0].text = "c";
    document.endings.choices[1].consequences[0].text = "a";
    document.endings.choices[1].narration[0].text = "b|c";
    await generate(document, join(directory, "distinct.json"));
  });
});

test("incomplete shapes and impossible clue paths fail without creating output", async () => {
  await inDirectory(async (directory) => {
    const cases = [
      [
        "missing-initial-lead",
        (doc) => {
          doc.initialDiscoveries = [];
        },
      ],
      [
        "location-count",
        (doc) => {
          doc.locations.pop();
          doc.connections = doc.connections.filter(
            (route) => route.from !== "garden" && route.to !== "garden",
          );
          doc.features = doc.features.filter(
            (feature) => feature.locationId !== "garden",
          );
          doc.searches = doc.searches.filter(
            (search) => search.targetId !== "plaque",
          );
          doc.discoveries = doc.discoveries.filter(
            (discovery) => discovery.id !== "plaque-clue",
          );
          doc.npcs = doc.npcs.filter((npc) => npc.locationId !== "garden");
          doc.monsters = [];
          doc.encounters = [];
        },
      ],
      [
        "unreachable-required-progress",
        (doc) => {
          doc.searches[1].when = [
            { type: "discovery-known", id: "record-clue" },
          ];
        },
      ],
      [
        "duplicate-resolution",
        (doc) => {
          doc.endings.choices[1].consequences[0].text =
            doc.endings.choices[0].consequences[0].text;
          doc.endings.choices[1].narration[0].text =
            doc.endings.choices[0].narration[0].text;
        },
      ],
      [
        "overlapping-encounters",
        (doc) => {
          doc.encounters.push({
            id: "second-guard",
            monsterId: "garden-moth",
            when: [],
            effects: [],
          });
        },
      ],
      [
        "insufficient-clues",
        (doc) => {
          doc.searches.pop();
          doc.discoveries.pop();
          doc.features.pop();
        },
      ],
      [
        "missing-producer",
        (doc) => {
          doc.discoveries.push({
            id: "unsourced-clue",
            title: "Unused clue",
            classification: "observation",
            sourceFeatureId: "plaque",
            summary: "A clue.",
            lead: "Follow it.",
          });
        },
      ],
      [
        "unreachable-resolution",
        (doc) => {
          doc.monsters.push({
            id: "archive-moth",
            definitionId: "clockwork-moth",
            locationId: "archive",
            hp: 4,
          });
          doc.encounters.push({
            id: "archive-guard",
            monsterId: "archive-moth",
            when: [],
            effects: [],
          });
          doc.searches[1].when = [
            { type: "discovery-known", id: "plaque-clue" },
          ];
        },
      ],
    ];
    for (const [reason, change] of cases) {
      const document = candidate();
      change(document);
      const outputPath = join(directory, `${reason}.json`);
      await assert.rejects(
        generate(document, outputPath),
        new RegExp(reason, "u"),
      );
      assert.equal(existsSync(outputPath), false, reason);
    }
  });
});

test("loader errors and hidden targets are rejected before generation writes", async () => {
  await inDirectory(async (directory) => {
    const cases = [
      [
        "duplicate",
        (doc) => {
          doc.features[0].aliases = ["archive"];
        },
      ],
      [
        "hidden",
        (doc) => {
          doc.features[1].when = [
            { type: "discovery-known", id: "record-clue" },
          ];
        },
      ],
      [
        "reference",
        (doc) => {
          doc.searches[1].targetId = "absent-feature";
        },
      ],
    ];
    for (const [name, change] of cases) {
      const document = candidate();
      change(document);
      const outputPath = join(directory, `${name}.json`);
      await assert.rejects(
        generate(document, outputPath),
        /invalid rules-v4 document/u,
      );
      assert.equal(existsSync(outputPath), false);
      const rawPath = join(directory, `${name}-raw.json`);
      writeFileSync(rawPath, JSON.stringify(document));
      const validated = spawnSync(
        process.execPath,
        [cli, "--validate-adventure", rawPath],
        { encoding: "utf8" },
      );
      assert.equal(validated.status, 2, `${name}: ${validated.stderr}`);
      assert.equal(JSON.parse(validated.stdout).ok, false);
    }
  });
});
