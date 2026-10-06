// #140: the release run plays The Abandoned Delve from start to an ending
// through the browser server, typing every step to the AI DM and pressing
// the step's button only when the DM's turn left it undone; the live script
// keeps to its stated call budget and records each turn for review.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { startDelveOverHttp } from "../dist/dm-evaluation-5e.js";
import {
  chooseFightStep,
  DELVE_FULL_ROUTE,
  playReleaseRun,
} from "../dist/release-run-5e.js";

/** The seed the release run is qualified on: Ada clears every room. */
const RELEASE_SEED = 99;
const script = fileURLToPath(
  new URL("../scripts/qualify-release-live.mjs", import.meta.url),
);

const withServer = async (dmModel, work) => {
  const directory = await mkdtemp(join(tmpdir(), "issue-140-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: RELEASE_SEED,
    dmModel,
  });
  try {
    await work(server.url, libraryPath);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
};

const narrating = {
  async respond() {
    return { text: "The dark waits." };
  },
};

test("the release run clears every room of the delve and climbs out with the loot, by button when the DM only narrates", () =>
  withServer(narrating, async (url, libraryPath) => {
    const { session, turns } = await playReleaseRun({
      url,
      session: await startDelveOverHttp(url),
    });
    assert.equal(session.status, "escaped");
    assert.equal(session.ending.kind, "escape-with-loot");
    assert.deepEqual(
      turns.filter(({ skipped }) => skipped !== undefined),
      [],
    );
    const rooms = new Set(turns.map(({ room }) => room));
    assert.equal(rooms.size, 10, [...rooms].join(", "));
    // Every typed step went unanswered, so every step took its button.
    assert.ok(turns.every(({ committed, fallback }) => !committed && fallback));
    const leave = turns.at(-1);
    assert.equal(leave.intent, "leave shaft-bottom");
    assert.equal(leave.message, undefined);
    // All four fights, and the ending's rewards: 750 XP is level 2.
    assert.ok(turns.filter(({ phase }) => phase === "fight").length >= 5);
    assert.equal(session.ending.rewards.totalXp, 750);
    assert.equal(session.ending.rewards.level, 2);
    assert.deepEqual(
      session.ending.rewards.treasure.map(({ name }) => name).sort(),
      [
        "Candlesticks",
        "Dagger Hilt",
        "Goblet",
        "Gold Coins",
        "Gold Ring",
        "Guard's Purse",
      ],
    );
    // The library on disk credits them and frees Ada.
    const library = JSON.parse(await readFile(libraryPath, "utf8"));
    const [ada] = library.characters;
    assert.equal(ada.sheet.level, 2);
    assert.equal(ada.sheet.xp, 750);
    assert.equal(ada.session, undefined);
  }));

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
        route: DELVE_FULL_ROUTE.slice(0, 2),
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
    const result = spawnSync(
      process.execPath,
      [script, "--dry-run", "--output", output, "--max-calls", "20"],
      {
        encoding: "utf8",
        env: { ...process.env, OPENAI_API_KEY: "" },
        timeout: 60000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.issue, 140);
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
