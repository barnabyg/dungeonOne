// #211: The Tinker's Toll, the increment 12 release module, with the
// content the owner approved: a tinker who trades, a shield and coin found
// in the reeds after the wolf, and the bandits' purse and seal at the tower.
// The release run plays it through the browser server, buying and selling
// with coin it finds; shipped-modules.test.mjs checks it qualifies at its
// declared difficulty.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { startAdventureOverHttp } from "../dist/dm-evaluation-5e.js";
import { playReleaseRun, TOLL_FULL_ROUTE } from "../dist/release-run-5e.js";
import { narratingDm } from "./fixtures/session-layout.mjs";

const toll = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "tinkers-toll",
);
const room = (id) => toll.rooms.find((entry) => entry.id === id);

test("The Tinker's Toll is a level-1 Hard module from the shrine to the tower", () => {
  assert.equal(toll.title, "The Tinker's Toll");
  assert.deepEqual(toll.recommendedLevels, { min: 1, max: 1 });
  assert.equal(toll.difficulty, "hard");
  assert.equal(toll.startRoomId, "wayside-shrine");
  assert.deepEqual(
    toll.passages.map(({ between, door, trap }) => [between, door, trap]),
    [
      [["wayside-shrine", "tinkers-cart"], undefined, undefined],
      [["tinkers-cart", "ford"], undefined, undefined],
      [["ford", "toll-tower"], undefined, undefined],
    ],
  );
  assert.equal(room("wayside-shrine").exit, true);
  assert.deepEqual(
    toll.encounters.map(({ id, opponents }) => [
      id,
      opponents.map(({ statBlock }) => statBlock.name),
    ]),
    [
      ["ford-wolf", ["Wolf"]],
      ["tower-bandits", ["Bandit", "Bandit"]],
    ],
  );
});

test("Merrow the tinker sells common gear only, ten minutes a trade", () => {
  const [merrow] = room("tinkers-cart").creatures;
  assert.equal(merrow.name, "Merrow the Tinker");
  assert.deepEqual(merrow.merchant, {
    stock: ["dagger", "shortsword", "shield", "chain-shirt"],
    minutes: 10,
  });
});

test("the shield and the first coin lie in the reeds after the wolf; the purse and the seal are at the tower", () => {
  const found = (roomId) =>
    room(roomId).items.map(({ id, kind, gear, coins, hiddenIn }) => ({
      id,
      kind,
      ...(gear === undefined ? {} : { gear }),
      ...(coins === undefined ? {} : { coins }),
      hiddenIn,
    }));
  // Nothing at the shrine: the gate's cautious run must fight for its loot.
  assert.deepEqual(found("wayside-shrine"), []);
  assert.deepEqual(found("ford"), [
    { id: "reed-shield", kind: "gear", gear: "shield", hiddenIn: "reeds" },
    {
      id: "traveller-purse",
      kind: "coin",
      coins: { gp: 3, sp: 5 },
      hiddenIn: "reeds",
    },
  ]);
  assert.deepEqual(found("toll-tower"), [
    { id: "toll-seal", kind: "treasure", hiddenIn: "strongbox" },
    {
      id: "bandit-purse",
      kind: "coin",
      coins: { gp: 12 },
      hiddenIn: "strongbox",
    },
    // #252: designed against the budget, 125 gp 5 sp of 150 gp.
    { id: "toll-chain", kind: "treasure", hiddenIn: "strongbox" },
    { id: "travellers-carnelian", kind: "treasure", hiddenIn: "strongbox" },
  ]);
});

/** A seed on which Ada, with the mace kit, clears the toll and walks out. */
const RELEASE_SEED = 0;

test("the release run clears the toll, trades with the tinker and walks out, through the server to the library file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-211-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: RELEASE_SEED,
    dmModel: narratingDm(),
    // shipped-modules.test.mjs gates every shipped module; skip it here.
    qualifies: () => true,
  });
  try {
    const { session, turns } = await playReleaseRun({
      url: server.url,
      session: await startAdventureOverHttp(server.url, "tinkers-toll"),
      route: TOLL_FULL_ROUTE,
    });
    assert.equal(session.status, "escaped");
    assert.equal(session.ending.kind, "escape-with-loot");
    assert.deepEqual(
      turns.filter(({ skipped }) => skipped !== undefined),
      [],
    );
    assert.equal(new Set(turns.map(({ room }) => room)).size, 4);
    // The tinker is named as the engine names any creature, without "the".
    const card = (intent) =>
      turns.find((turn) => turn.intent === intent).cards.at(-1).text;
    assert.match(
      card("buy shortsword"),
      /^You buy the shortsword from Merrow the Tinker for 10 gp and stow it\. /u,
    );
    assert.match(
      card("sell mace"),
      /^You sell the mace to Merrow the Tinker for 2 gp 5 sp\. /u,
    );
    // Both fights: the wolf (50 XP), the bandits (25 each), and the ending.
    assert.equal(session.ending.rewards.totalXp, 300);
    assert.equal(session.ending.rewards.level, 2);
    assert.deepEqual(
      session.ending.rewards.treasure.map(({ name }) => name),
      ["Silver Toll Seal", "Silver Toll Chain", "Traveller's Carnelian"],
    );
    // 3 gp 5 sp and 12 gp found, 10 gp on the shortsword, 2 gp 5 sp for
    // the mace: the purse and the gear the sheet keeps.
    assert.equal(session.ending.rewards.coin, "15 gp 5 sp");
    assert.equal(session.ending.rewards.purse, "8 gp");
    const [ada] = JSON.parse(await readFile(libraryPath, "utf8")).characters;
    assert.equal(ada.session, undefined);
    assert.equal(ada.sheet.purse, 800);
    assert.deepEqual(ada.sheet.equipment, ["leather", "shield", "shortsword"]);
    assert.deepEqual(ada.sheet.stowed, []);
    assert.equal(ada.sheet.xp, 300);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("the live release script plays the toll with --adventure tinkers-toll, and refuses an unknown module", async () => {
  const script = fileURLToPath(
    new URL("../scripts/qualify-release-live.mjs", import.meta.url),
  );
  const env = { ...process.env, OPENAI_API_KEY: "" };
  const unknown = spawnSync(
    process.execPath,
    [script, "--dry-run", "--adventure", "nowhere"],
    { encoding: "utf8", env },
  );
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /\[--adventure <id>\]/);

  const directory = await mkdtemp(join(tmpdir(), "issue-211-script-"));
  try {
    const output = join(directory, "report.json");
    const result = spawnSync(
      process.execPath,
      [
        script,
        "--dry-run",
        "--adventure",
        "tinkers-toll",
        "--output",
        output,
        "--max-calls",
        "10",
      ],
      { encoding: "utf8", env, timeout: 60000 },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(output, "utf8"));
    assert.equal(report.issue, 211);
    assert.equal(report.adventureId, "tinkers-toll");
    assert.equal(report.seed, RELEASE_SEED);
    assert.equal(report.providerCalls, 10);
    assert.equal(report.ending.kind, "escape-with-loot");
    assert.equal(report.summary.roomsVisited, 4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
