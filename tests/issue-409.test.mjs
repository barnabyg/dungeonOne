// #409: a generated release run. A release run may take its route from the
// harness's cautious run on a fixed seed and class instead of a hand-written
// step list, each exploring action typed to the AI DM in words a player
// would use, with its turn cap scaled to the module's rooms. The shipped
// modules' hand-written routes are unchanged (their own tests play them).
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { characterProfile } from "../dist/character-5e.js";
import { startSavedAdventureOverHttp } from "../dist/dm-evaluation-5e.js";
import {
  RELEASE_TURNS_PER_ROOM,
  generateReleaseRun,
  playReleaseRun,
  releaseTurnCap,
} from "../dist/release-run-5e.js";
import { levelThreeLibrary } from "../dist/test-fighter-5e.js";
import { narratingDm } from "./fixtures/session-layout.mjs";
import { longTunnels, windingTunnels } from "./fixtures/modules.mjs";

const SEED = 409;
const [{ sheet }] = levelThreeLibrary().characters;

test("the handoff's level-3 library is Ada at level 3, as generated release runs start", async () => {
  const input = new URL(
    "../docs/acceptance/inputs/increment-13/level-3-ada.json",
    import.meta.url,
  );
  // Regenerate it from levelThreeLibrary() when the library format changes.
  assert.deepEqual(
    JSON.parse(await readFile(input, "utf8")),
    JSON.parse(JSON.stringify(levelThreeLibrary())),
  );
  assert.deepEqual([sheet.name, sheet.level, sheet.xp], ["Ada", 3, 900]);
  assert.equal(sheet.hp, characterProfile(sheet).maxHp);
});

test("the turn cap is 40 turns a room", () => {
  assert.equal(RELEASE_TURNS_PER_ROOM, 40);
  assert.equal(windingTunnels.rooms.length, 8);
  assert.equal(releaseTurnCap(windingTunnels), 320);
  assert.equal(releaseTurnCap(longTunnels), 200);
});

test("the generated route is the harness's exploring actions, each with words a player would type", () => {
  const { route, maxTurns } = generateReleaseRun(windingTunnels, sheet, {
    seed: SEED,
  });
  assert.equal(maxTurns, 320);
  // No fight actions: the release run fights each fight itself.
  assert.ok(
    route.every(({ action }) =>
      ["move", "examine", "take", "search"].includes(action),
    ),
    JSON.stringify(route.map(({ action }) => action)),
  );
  assert.ok(route.every(({ say }) => typeof say === "string" && say !== ""));
  assert.deepEqual(route[0], {
    action: "examine",
    target: "rusted-lantern",
    say: "Examine the Rusted Lantern.",
  });
  assert.ok(
    route.some(
      (step) =>
        step.action === "take" &&
        step.target === "well-locket" &&
        step.say === "Take the Tarnished Locket.",
    ),
  );
  assert.ok(
    route.some(
      (step) =>
        step.action === "move" &&
        step.target === "drain-tunnel" &&
        step.say === "Go to the Drain Tunnel.",
    ),
  );
  // The same seed and class give the same route.
  assert.deepEqual(
    generateReleaseRun(windingTunnels, sheet, { seed: SEED }).route,
    route,
  );
});

test("a release run of an eight-room module passes with a generated route", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-409-"));
  const libraryPath = join(directory, "characters.json");
  await writeFile(libraryPath, JSON.stringify(levelThreeLibrary()));
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: SEED,
    dmModel: narratingDm(),
    adventures: [windingTunnels],
    qualifies: () => true,
  });
  try {
    const { session, turns } = await playReleaseRun({
      url: server.url,
      session: await startSavedAdventureOverHttp(server.url, "winding-tunnels"),
      ...generateReleaseRun(windingTunnels, sheet, { seed: SEED }),
    });
    assert.equal(session.status, "victory");
    assert.equal(session.ending.kind, "victory");
    assert.deepEqual(
      turns.filter(({ skipped }) => skipped !== undefined),
      [],
    );
    // Every room was visited; the narrating DM never acts, so each step fell
    // back to its button.
    assert.equal(new Set(turns.map(({ room }) => room)).size, 8);
    assert.ok(
      turns
        .filter(({ phase }) => phase === "explore")
        .every(({ fallback }) => fallback),
    );
    assert.deepEqual(
      session.ending.rewards.treasure.map(({ name }) => name),
      ["Tarnished Locket"],
    );
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
