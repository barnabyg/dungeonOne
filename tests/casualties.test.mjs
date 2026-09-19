import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  CHAPEL_NPCS,
  chapelResolutionChoices,
  createChapelSession,
  handleChapelAction,
  projectChapelJournal,
  renderChapelResult,
  visibleChapelNpcs,
} from "../dist/chapel.js";
import { dispatchChapelTool } from "../dist/chapel-tools.js";
import { runDmTurn } from "../dist/dm-turn.js";
import {
  resolveAdventure,
  resolveHistoricalAdventure,
} from "../dist/runtime.js";

function sequenceRandom(values) {
  let index = 0;
  return {
    roll(sides) {
      const value = values[index++];
      assert.ok(
        value >= 1 && value <= sides,
        `${value} is not a d${sides} roll`,
      );
      return value;
    },
  };
}

function fatalAttack(state, target) {
  return handleChapelAction(
    state,
    { type: "attack", target },
    sequenceRandom([20, 1, 20, 8, 8]),
  );
}

test("authored NPC combat uses HP as the authoritative life state", () => {
  assert.deepEqual(
    CHAPEL_NPCS.map(
      ({ id, maxHp, armorClass, attackBonus, initiativeBonus }) => ({
        id,
        maxHp,
        armorClass,
        attackBonus,
        initiativeBonus,
      }),
    ),
    [
      {
        id: "mara",
        maxHp: 8,
        armorClass: 10,
        attackBonus: 1,
        initiativeBonus: 0,
      },
      {
        id: "oren",
        maxHp: 9,
        armorClass: 11,
        attackBonus: 2,
        initiativeBonus: 1,
      },
      {
        id: "tavi",
        maxHp: 6,
        armorClass: 10,
        attackBonus: 1,
        initiativeBonus: 2,
      },
    ],
  );

  const initial = createChapelSession();
  assert.deepEqual(initial.npcStates.mara, { hp: 8, maxHp: 8 });
  const killed = fatalAttack(initial, "mara");

  assert.equal(killed.state.npcStates.mara.hp, 0);
  assert.deepEqual(visibleChapelNpcs(killed.state), []);
  assert.equal(
    killed.events.filter(({ type }) => type === "combat-ended").length,
    1,
  );
  assert.equal(
    handleChapelAction(killed.state, { type: "attack", target: "mara" })
      .rejection.reason,
    "chapel-dead-target",
  );
  assert.equal(
    handleChapelAction(killed.state, {
      type: "talk",
      target: "mara",
      topic: "tavi",
      approach: "ask",
    }).rejection.reason,
    "chapel-unavailable",
  );
});

test("dead Tavi requires a mutation-classified remains search before resolution", () => {
  const initial = createChapelSession();
  const accessibleCrypt = {
    ...initial,
    locationId: "crypt",
    quest: {
      ...initial.quest,
      milestones: [
        ...initial.quest.milestones,
        "guardian-cleared",
        "ledger-recovered",
      ],
    },
    discoveries: [
      {
        id: "diversion-ledger",
        title: "Oren's diversion ledger",
        source: {
          type: "feature",
          id: "diversion-ledger",
          name: "diversion ledger",
          locationId: "crypt",
        },
        classification: "observation",
        summary:
          "The ledger proves Oren diverted chapel repair funds to buy medicine, leaving the unsafe work unfinished.",
      },
    ],
    opponents: {
      "skeleton-guardian": {
        ...initial.opponents["skeleton-guardian"],
        hp: 0,
      },
    },
  };
  const killed = fatalAttack(accessibleCrypt, "tavi");
  assert.equal(killed.state.npcStates.tavi.hp, 0);
  assert.equal(
    killed.state.quest.milestones.includes("tavi-death-confirmed"),
    false,
  );
  assert.equal(chapelResolutionChoices(killed.state).length, 0);

  const inspected = handleChapelAction(killed.state, {
    type: "inspect",
    target: "tavi remains",
  });
  assert.equal(inspected.state, killed.state);
  assert.equal(
    inspected.state.quest.milestones.includes("tavi-death-confirmed"),
    false,
  );

  const searched = handleChapelAction(killed.state, {
    type: "search",
    target: "tavi remains",
  });
  assert.equal(
    searched.state.quest.milestones.includes("tavi-death-confirmed"),
    true,
  );
  assert.equal(
    searched.state.discoveries.some(({ id }) => id === "tavi-remains"),
    true,
  );
  assert.equal(
    handleChapelAction(searched.state, {
      type: "talk",
      target: "tavi",
      topic: "rescue",
      approach: "ask",
    }).rejection.reason,
    "chapel-unavailable",
  );
});

test("Tavi's remains stay discoverable at their authoritative post-rescue location", () => {
  const initial = createChapelSession();
  const returned = {
    ...initial,
    locationId: "inn",
    npcLocations: { ...initial.npcLocations, tavi: "inn" },
    quest: {
      ...initial.quest,
      milestones: ["guardian-cleared", "tavi-rescued"],
    },
  };
  const killed = fatalAttack(returned, "tavi");
  const searched = handleChapelAction(killed.state, {
    type: "search",
    target: "tavi remains",
  });

  assert.equal(searched.rejection, undefined);
  assert.equal(
    searched.state.discoveries.find(({ id }) => id === "tavi-remains").source
      .locationId,
    "inn",
  );
  assert.match(renderChapelResult(searched), /died at the Village Inn/i);
  assert.doesNotMatch(renderChapelResult(searched), /died in the crypt/i);
  assert.equal(
    searched.state.quest.milestones.includes("tavi-death-confirmed"),
    true,
  );
  const eligible = {
    ...searched.state,
    discoveries: [
      ...searched.state.discoveries,
      {
        id: "diversion-ledger",
        title: "Oren's diversion ledger",
        source: {
          type: "feature",
          id: "diversion-ledger",
          name: "diversion ledger",
          locationId: "crypt",
        },
        classification: "observation",
        summary:
          "The ledger proves Oren diverted chapel repair funds to buy medicine, leaving the unsafe work unfinished.",
      },
    ],
  };
  const resolved = handleChapelAction(eligible, {
    type: "resolve",
    target: "public disclosure",
  });
  assert.equal(resolved.state.resolution.taviFate, "dead-at-inn");
});

test("casualty-aware endings never promise dead Oren's restitution or Tavi's rescue", () => {
  const initial = createChapelSession();
  const eligible = {
    ...initial,
    locationId: "inn",
    npcStates: {
      mara: { ...initial.npcStates.mara, hp: 0 },
      oren: { ...initial.npcStates.oren, hp: 0 },
      tavi: { ...initial.npcStates.tavi, hp: 0 },
    },
    quest: {
      ...initial.quest,
      milestones: ["ledger-recovered", "tavi-death-confirmed"],
    },
    discoveries: [
      {
        id: "diversion-ledger",
        title: "Oren's diversion ledger",
        source: {
          type: "feature",
          id: "diversion-ledger",
          name: "diversion ledger",
          locationId: "crypt",
        },
        classification: "observation",
        summary:
          "The ledger proves Oren diverted chapel repair funds to buy medicine, leaving the unsafe work unfinished.",
        actionableLead: "Return to Oren with the conclusive ledger evidence.",
      },
      {
        id: "tavi-remains",
        title: "Tavi's fate",
        source: {
          type: "feature",
          id: "tavi-remains",
          name: "Tavi's remains",
          locationId: "crypt",
        },
        classification: "observation",
        summary:
          "Tavi died in the crypt after being trapped beyond the guardian.",
        actionableLead:
          "Return to the inn noticeboard and resolve the investigation truthfully.",
      },
    ],
  };

  assert.deepEqual(chapelResolutionChoices(eligible), [
    "public-disclosure",
    "confidential-referral",
  ]);
  for (const target of ["public disclosure", "confidential referral"]) {
    const resolved = handleChapelAction(eligible, {
      type: "resolve",
      target,
    });
    assert.equal(resolved.state.resolution.taviFate, "dead-in-crypt");
    assert.deepEqual(resolved.state.resolution.casualties, [
      "mara",
      "oren",
      "tavi",
    ]);
    assert.equal(
      resolved.state.resolution.consequences.includes(
        "oren-committed-future-restitution",
      ),
      false,
    );
  }
  assert.deepEqual(projectChapelJournal(eligible).actionableLeads, [
    "Return to the inn noticeboard and resolve the investigation with the ledger evidence.",
    "Return to the inn noticeboard and resolve the investigation truthfully.",
  ]);
});

test("stale dialogue and simultaneous encounter tool calls cannot mutate state", () => {
  const initial = createChapelSession();
  const staleTalk = {
    name: "talk",
    argumentsJson: '{"speakerId":"mara","topicId":"tavi","approach":"ask"}',
  };
  const killed = fatalAttack(initial, "mara");
  const stale = dispatchChapelTool(killed.state, staleTalk);
  assert.equal(stale.modelOutput.error.code, "unknown-tool");
  assert.equal(stale.state, killed.state);

  const fighting = handleChapelAction(
    initial,
    { type: "attack", target: "mara" },
    sequenceRandom([20, 1, 1, 1]),
  );
  assert.ok(fighting.state.npcStates.mara.hp > 0);
  const simultaneous = dispatchChapelTool(fighting.state, {
    name: "attack",
    argumentsJson: '{"combatantId":"oren"}',
  });
  assert.equal(simultaneous.modelOutput.error.code, "unavailable-reference");
  assert.equal(simultaneous.state, fighting.state);
});

test("provider failure after a fatal NPC attack preserves the authoritative death", async () => {
  const runtime = resolveAdventure("chapel");
  let response = 0;
  const result = await runDmTurn({
    runtime,
    state: runtime.createSession(),
    playerInput: "Attack Mara",
    transcript: [],
    random: sequenceRandom([20, 1, 20, 8, 8]),
    model: {
      async respond() {
        response += 1;
        if (response === 1) {
          return {
            toolCalls: [
              {
                id: "fatal-mara",
                name: "attack",
                argumentsJson: '{"combatantId":"mara"}',
              },
            ],
          };
        }
        throw new Error("provider failed after fatal action");
      },
    },
  });

  assert.equal(result.state.npcStates.mara.hp, 0);
  assert.equal(result.toolResults.length, 1);
  assert.equal(result.toolResults[0].disposition.executed, true);
  assert.equal(result.diagnostics.at(-1).code, "model-failure");
});

test("resolution-v8 remains condition-based and does not expose NPC attacks", () => {
  const runtime = resolveHistoricalAdventure(
    "chapel-resolution-rules-v8",
    "chapel-resolution-v8",
    "chapel",
  );
  const state = runtime.createSession();

  assert.deepEqual(state.npcStates, {
    mara: { condition: "living" },
    oren: { condition: "living" },
    tavi: { condition: "living" },
  });
  assert.equal(
    runtime.getGameToolDefinitions(state).some(({ name }) => name === "attack"),
    false,
  );
  assert.equal(
    runtime.handleAction(state, runtime.parseCommand("attack mara")).rejection
      .reason,
    "chapel-invalid-attack-target",
  );
});

test("CLI casualty routes and the all-casualty fallback reach an ending and replay", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "chapel-casualties-"));
  const commonReturn = ["move ruined-chapel", "move chapel-path", "move inn"];
  const scenarios = [
    {
      name: "mara",
      casualty: ["mara"],
      resolution: "public disclosure",
      commands: [
        "attack mara",
        "attack mara",
        "attack mara",
        "search missing-person-notice",
        "move chapel-path",
        "move ruined-chapel",
        "move crypt",
        "attack skeleton",
        "attack skeleton",
        "attack skeleton",
        "attack skeleton",
        "search diversion-ledger",
        "talk tavi crypt ask",
        "talk tavi rescue ask",
        ...commonReturn,
      ],
    },
    {
      name: "oren",
      casualty: ["oren"],
      resolution: "confidential referral",
      commands: [
        "move ferry-landing",
        "attack oren",
        "attack oren",
        "attack oren",
        "attack oren",
        "move inn",
        "move chapel-path",
        "move ruined-chapel",
        "move crypt",
        "attack skeleton",
        "attack skeleton",
        "attack skeleton",
        "attack skeleton",
        "search diversion-ledger",
        "talk tavi crypt ask",
        "talk tavi rescue ask",
        ...commonReturn,
      ],
    },
    {
      name: "tavi",
      casualty: ["tavi"],
      resolution: "public disclosure",
      commands: [
        "move chapel-path",
        "take healing potion",
        "move ruined-chapel",
        "move crypt",
        "attack skeleton",
        "attack skeleton",
        "attack skeleton",
        "attack skeleton",
        "use healing potion",
        "search diversion-ledger",
        "attack tavi",
        "attack tavi",
        "attack tavi",
        "attack tavi",
        "search tavi remains",
        ...commonReturn,
      ],
    },
    {
      name: "all",
      casualty: ["mara", "oren", "tavi"],
      resolution: "confidential referral",
      commands: [
        "attack mara",
        "attack mara",
        "attack mara",
        "attack mara",
        "move ferry-landing",
        "attack oren",
        "attack oren",
        "attack oren",
        "attack oren",
        "move inn",
        "move chapel-path",
        "take healing potion",
        "move ruined-chapel",
        "move crypt",
        "attack skeleton",
        "attack skeleton",
        "attack skeleton",
        "attack skeleton",
        "attack skeleton",
        "use healing potion",
        "search diversion-ledger",
        "attack tavi",
        "attack tavi",
        "attack tavi",
        "attack tavi",
        "search tavi remains",
        ...commonReturn,
      ],
    },
  ];

  try {
    for (const scenario of scenarios) {
      const tracePath = path.join(directory, `${scenario.name}.json`);
      const played = spawnSync(
        process.execPath,
        [
          "dist/cli.js",
          "--adventure",
          "chapel",
          "--seed",
          "0",
          "--trace",
          tracePath,
        ],
        {
          encoding: "utf8",
          input: [
            ...scenario.commands,
            `resolve ${scenario.resolution}`,
            "quit",
            "",
          ].join("\n"),
        },
      );
      assert.equal(played.status, 0, played.stderr);
      assert.match(
        played.stdout,
        /Session: victory|disclosure recorded|referral recorded/i,
      );
      if (scenario.casualty.includes("oren")) {
        assert.match(played.stdout, /Oren is dead.*no personal promise/is);
      }
      if (scenario.casualty.includes("tavi")) {
        assert.match(played.stdout, /Tavi's death.*truthfully/is);
        assert.doesNotMatch(played.stdout, /Tavi is alive and safe/i);
      }
      const trace = JSON.parse(readFileSync(tracePath, "utf8"));
      assert.equal(trace.completion.outcome, "victory");
      assert.deepEqual(
        trace.actions.at(-1).stateAfter.resolution.casualties,
        scenario.casualty,
      );
      const replayed = spawnSync(
        process.execPath,
        ["dist/cli.js", "--replay", tracePath],
        { encoding: "utf8" },
      );
      assert.equal(replayed.status, 0, replayed.stderr);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
