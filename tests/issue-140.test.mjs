// #140: the release run plays The Abandoned Delve from start to an ending
// through the browser server, typing every step to the AI DM and pressing
// the step's button only when the DM's turn left it undone; the live script
// keeps to its stated call budget and records each turn for review. Since
// the Delve's expansion (#442) its route is generated from the harness's
// cautious run (#409), played by a saved level-2 Ada.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  startDelveOverHttp,
  startSavedAdventureOverHttp,
} from "../dist/dm-evaluation-5e.js";
import {
  chooseFightStep,
  generateReleaseRun,
  playReleaseRun,
} from "../dist/release-run-5e.js";
import { libraryAt } from "../dist/test-fighter-5e.js";
import { narratingDm } from "./fixtures/session-layout.mjs";

/** The seed the release run is qualified on: Ada escapes with loot. */
const RELEASE_SEED = 2;
const delve = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "abandoned-delve",
);
const script = fileURLToPath(
  new URL("../scripts/qualify-release-live.mjs", import.meta.url),
);

/** With `saved`, the library starts holding level-2 Ada, already saved. */
const withServer = async (dmModel, work, { saved = false } = {}) => {
  const directory = await mkdtemp(join(tmpdir(), "issue-140-"));
  const libraryPath = join(directory, "characters.json");
  if (saved) {
    await writeFile(libraryPath, JSON.stringify(libraryAt(2)));
  }
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: RELEASE_SEED,
    dmModel,
    // shipped-modules.test.mjs gates every shipped module; skip it here.
    qualifies: () => true,
  });
  try {
    await work(server.url, libraryPath);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
};

test("the release run plays the delve's generated route and climbs out with the loot, by button when the DM only narrates", () =>
  withServer(
    narratingDm(),
    async (url, libraryPath) => {
      const [{ sheet }] = libraryAt(2).characters;
      const { session, turns } = await playReleaseRun({
        url,
        session: await startSavedAdventureOverHttp(url, "abandoned-delve"),
        ...generateReleaseRun(delve, sheet, { seed: RELEASE_SEED }),
      });
      assert.equal(session.status, "escaped");
      assert.equal(session.ending.kind, "escape-with-loot");
      assert.deepEqual(
        turns.filter(({ skipped }) => skipped !== undefined),
        [],
      );
      // Every typed step went unanswered, so every step took its button.
      assert.ok(
        turns.every(({ committed, fallback }) => !committed && fallback),
      );
      const leave = turns.at(-1);
      assert.equal(leave.message, undefined);
      assert.match(leave.intent, /^leave /u);
      // The guard post's zombie at least, and the ending's 600 XP take Ada
      // from 300 XP to level 3.
      assert.ok(turns.some(({ phase }) => phase === "fight"));
      assert.ok(session.ending.rewards.totalXp >= 300 + 50 + 600);
      assert.equal(session.ending.rewards.level, 3);
      // The library on disk credits them and frees Ada.
      const library = JSON.parse(await readFile(libraryPath, "utf8"));
      const [ada] = library.characters;
      assert.equal(ada.sheet.level, 3);
      assert.equal(ada.sheet.xp, session.ending.rewards.totalXp);
      assert.equal(ada.session, undefined);
    },
    { saved: true },
  ));

test("a step the DM's turn did is not pressed again; one it left undone is", () =>
  withServer(
    {
      // Always reads the chalk marks: right for the first step, and a
      // wasted re-read for the second, which leaves Ada at the gate.
      async respond(request) {
        return request.toolResults.length > 0
          ? { text: "So it is." }
          : {
              toolCalls: [
                {
                  id: "call",
                  name: "examine",
                  argumentsJson: JSON.stringify({ target: "chalk-marks" }),
                },
              ],
            };
      },
    },
    async (url) => {
      const { session, turns } = await playReleaseRun({
        url,
        session: await startDelveOverHttp(url),
        route: [
          {
            action: "examine",
            target: "chalk-marks",
            say: "Read the chalk marks on the gatepost.",
          },
          {
            action: "move",
            target: "gate-hall",
            say: "Head through the gate into the hall.",
          },
        ],
      });
      assert.deepEqual(
        turns.map(({ committed, matched, fallback }) => ({
          committed,
          matched,
          fallback,
        })),
        [
          { committed: true, matched: true, fallback: false },
          { committed: true, matched: false, fallback: true },
        ],
      );
      assert.equal(session.room.id, "gate-hall");
      assert.match(turns[0].reply, /Chalk Marks/);
    },
  ));

test("a fight heals at half HP or less, otherwise attacks, and ends the turn when nothing else is left", () => {
  const action = (kind, available = true, target) => ({
    action: kind,
    available,
    ...(target === undefined ? {} : { target }),
  });
  const zombie = { id: "zombie", name: "Zombie" };
  const potion = { id: "rack-potion", name: "Potion of Healing" };
  const view = (hp, actions) => ({
    room: { character: { hp, maxHp: 12 } },
    actions,
  });
  const all = [
    action("attack", true, zombie),
    action("use", true, potion),
    action("second-wind"),
    action("end-turn"),
  ];
  assert.deepEqual(chooseFightStep(view(7, all)), {
    action: "attack",
    target: "zombie",
    say: "Attack the Zombie.",
  });
  assert.equal(chooseFightStep(view(6, all)).action, "second-wind");
  assert.deepEqual(
    chooseFightStep(
      view(6, [all[0], all[1], action("second-wind", false), all[3]]),
    ),
    {
      action: "use",
      target: "rack-potion",
      say: "Drink the Potion of Healing.",
    },
  );
  assert.equal(
    chooseFightStep(
      view(12, [action("attack", false, zombie), all[1], action("end-turn")]),
    ).action,
    "end-turn",
  );
  // With the action spent, the Light extra attack comes before Action Surge
  // (#311).
  assert.deepEqual(
    chooseFightStep(
      view(12, [
        action("attack", false, zombie),
        action("light-attack", true, zombie),
        action("action-surge"),
        action("end-turn"),
      ]),
    ),
    {
      action: "light-attack",
      target: "zombie",
      say: "Strike the Zombie with my other blade.",
    },
  );
});

test("the live release script needs --live or --dry-run, and a dry run records every turn within its call budget", async () => {
  const bare = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(bare.status, 2);
  assert.match(bare.stderr, /Usage: node scripts\/qualify-release-live\.mjs/);
  const noKey = spawnSync(process.execPath, [script, "--live"], {
    encoding: "utf8",
    env: { ...process.env, OPENAI_API_KEY: "" },
  });
  assert.equal(noKey.status, 2);
  assert.match(noKey.stderr, /OPENAI_API_KEY is required for --live/);

  const directory = await mkdtemp(join(tmpdir(), "issue-140-script-"));
  try {
    const output = join(directory, "report.json");
    // Run from the empty directory: a live run keeps its saves under
    // .verify-artifacts there, but a dry run leaves only its report.
    const result = spawnSync(
      process.execPath,
      [script, "--dry-run", "--output", output, "--max-calls", "20"],
      {
        cwd: directory,
        encoding: "utf8",
        env: { ...process.env, OPENAI_API_KEY: "" },
        timeout: 60000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await readdir(directory), ["report.json"]);
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.runDirectory, undefined);
    assert.equal(report.issue, 140);
    assert.equal(report.generated, true);
    assert.equal(report.mode, "dry-run");
    assert.equal(report.seed, RELEASE_SEED);
    assert.equal(report.maxProviderCalls, 20);
    // The budget ran out part-way; the run still reached its ending.
    assert.equal(report.providerCalls, 20);
    assert.equal(report.ending.kind, "escape-with-loot");
    assert.ok(report.turns.length > 40);
    assert.ok(report.turns[0].calls.length > 0);
    assert.deepEqual(report.turns.at(-1).calls, []);
    assert.equal(typeof report.summary.fallbacks, "number");
    assert.equal(typeof report.summary.reviewClaims, "number");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the live release script refuses an unknown module", () => {
  const env = { ...process.env, OPENAI_API_KEY: "" };
  const unknown = spawnSync(
    process.execPath,
    [script, "--dry-run", "--adventure", "nowhere"],
    { encoding: "utf8", env },
  );
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /\[--adventure <id>\]/);
});
