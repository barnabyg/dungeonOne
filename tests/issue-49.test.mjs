import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = JSON.parse(readFileSync("adventures/chapel-clues.json", "utf8"));
const run = (file, option = "--validate-adventure", input = "") =>
  spawnSync(process.execPath, ["dist/cli.js", option, file], {
    input,
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      OPENAI_API_KEY: "",
      ...(input ? {} : { DUNGEON_ONE_TEST_DM_SCRIPT: "missing-script" }),
    },
  });
const withAdventure = (mutate, check) => {
  const directory = mkdtempSync(join(tmpdir(), "issue-49-"));
  try {
    const adventure = structuredClone(source);
    mutate(adventure);
    const file = join(directory, "adventure.json");
    writeFileSync(file, JSON.stringify(adventure));
    check(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};
const diagnostic = (result, code, entity) =>
  JSON.parse(result.stdout).diagnostics.find(
    (entry) => entry.code === code && entry.entity === entity,
  );
const addMilestone = (adventure, id, when) => {
  adventure.quest.milestones.push(id);
  adventure.searches.push({
    id: `search-${id}`,
    targetId: "missing-person-notice",
    when: when.map((needed) => ({ type: "milestone-recorded", id: needed })),
    effects: [{ type: "record-milestone", id }],
    text: `Record ${id}.`,
  });
};

test("CLI rejects a closed required cycle and accepts an initially seeded entry", () => {
  withAdventure(
    (adventure) => {
      addMilestone(adventure, "cycle-a", ["cycle-b"]);
      addMilestone(adventure, "cycle-b", ["cycle-a"]);
      adventure.endings.when.push({
        type: "milestone-recorded",
        id: "cycle-a",
      });
    },
    (file) => {
      const rejected = run(file);
      assert.equal(rejected.status, 2);
      assert.equal(
        diagnostic(rejected, "unreachable-required-progress", "cycle-a")
          ?.severity,
        "error",
      );
      const adventure = JSON.parse(readFileSync(file, "utf8"));
      adventure.initialMilestones = ["cycle-a"];
      writeFileSync(file, JSON.stringify(adventure));
      const accepted = run(file);
      assert.equal(accepted.status, 0, accepted.stdout);
      assert.equal(
        diagnostic(accepted, "unreachable-required-progress", "cycle-a"),
        undefined,
      );
      const played = run(file, "--adventure-file", "journal\nquit\n");
      assert.equal(played.status, 0, played.stderr);
      assert.match(played.stdout, /cycle-a/u);
    },
  );
});

test("CLI preserves an alternate obtainable route into a prerequisite cycle", () => {
  withAdventure(
    (adventure) => {
      addMilestone(adventure, "route-a", ["route-b"]);
      addMilestone(adventure, "route-b", ["route-a"]);
      addMilestone(adventure, "route-c", []);
      adventure.searches.push({
        id: "route-a-alternative",
        targetId: "missing-person-notice",
        when: [{ type: "milestone-recorded", id: "route-c" }],
        effects: [{ type: "record-milestone", id: "route-a" }],
        text: "Record the alternate route.",
      });
      adventure.endings.when.push({
        type: "milestone-recorded",
        id: "route-a",
      });
    },
    (file) => {
      const result = run(file);
      assert.equal(result.status, 0, result.stdout);
      assert.equal(
        diagnostic(result, "unreachable-required-progress", "route-a"),
        undefined,
      );
    },
  );
});

test("CLI reports a missing required producer in validation and startup", () => {
  withAdventure(
    (adventure) => {
      adventure.quest.milestones.push("never-produced");
      adventure.endings.when.push({
        type: "milestone-recorded",
        id: "never-produced",
      });
    },
    (file) => {
      const validation = run(file);
      assert.equal(validation.status, 2);
      assert.deepEqual(
        (({ severity, path, entity }) => ({ severity, path, entity }))(
          diagnostic(validation, "missing-producer", "never-produced"),
        ),
        {
          severity: "error",
          path: "/quest/milestones/9",
          entity: "never-produced",
        },
      );
      const startup = run(file, "--adventure-file");
      assert.equal(startup.status, 2);
      assert.match(startup.stderr, /missing-producer/u);
    },
  );
});

test("CLI reports a bounded analysis limit without an impossibility claim", () => {
  withAdventure(
    (adventure) => {
      const feature = adventure.features.find(
        (entry) => entry.id === "missing-person-notice",
      );
      const milestoneEffects = [];
      const discoveryEffects = [];
      for (let i = 0; i < 247; i++) {
        const id = `extra-${i}`;
        adventure.quest.milestones.push(id);
        adventure.discoveries.push({
          id,
          title: id,
          classification: "observation",
          sourceFeatureId: feature.id,
          summary: id,
          lead: id,
        });
        milestoneEffects.push({ type: "record-milestone", id });
        discoveryEffects.push({ type: "grant-discovery", id });
      }
      adventure.searches.push(
        {
          id: "many-milestones",
          targetId: feature.id,
          when: [],
          effects: milestoneEffects,
          text: "Many milestones.",
        },
        {
          id: "many-discoveries",
          targetId: feature.id,
          when: [],
          effects: discoveryEffects,
          text: "Many discoveries.",
        },
      );
    },
    (file) => {
      const result = run(file);
      assert.equal(result.status, 0, result.stdout);
      assert.equal(
        diagnostic(result, "analysis-limit", "chapel-clues")?.severity,
        "warning",
      );
      assert.ok(
        JSON.parse(result.stdout).diagnostics.every(
          ({ code }) => code !== "unreachable-required-progress",
        ),
      );
    },
  );
});
