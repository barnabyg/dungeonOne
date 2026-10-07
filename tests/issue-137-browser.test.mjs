// #137: the critical journey under the default launch command, at phone
// size, browser → API → storage. Create a Fighter, start The Abandoned
// Delve, move between views with Back and Forward, continue from the library
// row, fight the barracks' two Skeletons, reload and restart the launcher
// mid-fight, then escape with loot and see the level-up.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { FIFTH_DM_OFF_NOTICE } from "../dist/browser-5e-page.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { launchDefault } from "./fixtures/default-launch.mjs";
import {
  assertNoSideScroll,
  assertTogether,
  explore,
  fightOn,
  firstFighter,
  launch,
} from "./fixtures/session-layout.mjs";
import {
  openCreation,
  saveFighter,
  startAdventure,
} from "./fixtures/browser-journey.mjs";

const delve = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "abandoned-delve",
);

const TO_THE_FIGHT = [
  ["move", "gate-hall"],
  ["move", "barracks"],
];
const AFTER_THE_FIGHT = [
  ["examine", "footlocker"],
  ["take", "dagger-hilt"],
  ["move", "gate-hall"],
  ["move", "broken-gate"],
];
const ENGINE = {
  examine: (id) => ({ type: "examine", targetId: id }),
  move: (id) => ({ type: "move", destinationId: id }),
  take: (id) => ({ type: "take", itemId: id }),
};

/** A seed on which Ada beats both Skeletons, as the browser plays it. */
function findSeed() {
  for (let seed = 0; seed < 5000; seed++) {
    const runtime = createFifthRuntime(delve, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    const run = (state, action) =>
      runtime.handleAction(state, action, random).state;
    let state = run(runtime.createSession(), { type: "begin" });
    for (const [action, id] of TO_THE_FIGHT) {
      state = run(state, ENGINE[action](id));
    }
    let turns = 0;
    while (
      state.status === "playing" &&
      state.encounter?.outcome === "ongoing"
    ) {
      const [target] = runtime.attackTargets(state);
      state = run(
        state,
        target === undefined
          ? { type: "end-turn", actorId: "pc" }
          : { type: "attack", actorId: "pc", targetId: target.id },
      );
      turns++;
    }
    // At least two clicks, so there is a mid-fight to reload.
    if (state.status === "playing" && turns >= 3) {
      return seed;
    }
  }
  throw new Error("no seed where Ada beats the Skeletons");
}

/** What the adventure shows: room, HP, whose turn and the history. */
const shown = async (page) => ({
  hash: new URL(page.url()).hash,
  room: await page.locator("#room-title").textContent(),
  hp: await page.locator("#character-hp").textContent(),
  turn: await page.locator("#turn").textContent(),
  log: await page.locator("#log").innerText(),
});

const libraryFile = async (path) => JSON.parse(await readFile(path, "utf8"));

test(
  "the default launch plays a 5e adventure from creation to a level-up at 375×812",
  { timeout: 180000 },
  async () => {
    const seed = String(findSeed());
    const directory = await mkdtemp(join(tmpdir(), "issue-137-browser-"));
    // The player's command: npm.cmd run browser -- --seed <seed> --characters <path>
    const libraryPath = join(directory, "characters.json");
    const args = ["--seed", seed, "--characters", libraryPath];
    let launcher = await launchDefault(directory, args);
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(launcher.url);
      await page.locator("#no-characters").waitFor();
      assert.equal(await page.title(), "Characters · Dungeon One");
      assert.equal(await page.locator(".masthead .eyebrow").count(), 0);

      await openCreation(page);
      assert.equal(new URL(page.url()).hash, "#create");
      await saveFighter(page);
      const [{ sheet }] = (await libraryFile(libraryPath)).characters;
      assert.equal(new URL(page.url()).hash, `#character-${sheet.id}`);
      assert.equal(await page.title(), "Ada · Dungeon One");

      await startAdventure(page, "abandoned-delve");
      const { session } = (await libraryFile(libraryPath)).characters[0];
      assert.equal(new URL(page.url()).hash, `#adventure-${session.id}`);
      assert.equal(await page.title(), "The Abandoned Delve · Dungeon One");
      const started = await shown(page);
      // Without a key the composer tells the player typing is off.
      assert.equal(
        await page.locator("#dm-notice").textContent(),
        FIFTH_DM_OFF_NOTICE,
      );
      assert.equal(await page.locator("#dm-notice").isVisible(), true);

      // Back to the sheet and the library, Forward to the sheet, then the
      // library row's Continue resumes the adventure where it was.
      await page.goBack();
      await page.locator("#continue-adventure").waitFor();
      assert.equal(new URL(page.url()).hash, `#character-${sheet.id}`);
      await page.goBack();
      await page.locator("#characters .continue-adventure").waitFor();
      assert.equal(new URL(page.url()).hash, "");
      await page.goForward();
      await page.locator("#continue-adventure").waitFor();
      await page.locator('#breadcrumb a[data-view="library"]').click();
      await page.locator("#characters .continue-adventure").click();
      await page.locator("#adventure").waitFor({ state: "visible" });
      await page.locator("#log li").first().waitFor();
      assert.deepEqual(await shown(page), started);
      await assertTogether(page, "continued");

      for (const [action, target] of TO_THE_FIGHT) {
        await explore(page, action, target);
      }
      assert.equal(await page.locator("#room-title").textContent(), "Barracks");
      await fightOn(page);
      assert.notEqual(
        await page.locator("#turn").textContent(),
        "The fight is over.",
      );

      // Reload mid-fight: the same fight, and nothing is repeated.
      const midFight = await shown(page);
      const savedBytes = await readFile(
        join(directory, "characters-adventures", `${session.id}.json`),
      );
      await page.reload();
      await page.locator("#log li").first().waitFor();
      assert.deepEqual(await shown(page), midFight);
      await assertTogether(page, "reloaded mid-fight");

      // Ctrl+C and the same command again: the same fight, unchanged on disk.
      await launcher.stop();
      launcher = await launchDefault(directory, args);
      await page.goto(`${launcher.url}/${midFight.hash}`);
      await page.locator("#log li").first().waitFor();
      assert.deepEqual(await shown(page), midFight);
      assert.deepEqual(
        await readFile(
          join(directory, "characters-adventures", `${session.id}.json`),
        ),
        savedBytes,
      );

      while (
        (await page.locator("#turn").textContent()) !== "The fight is over."
      ) {
        await fightOn(page);
      }
      for (const [action, target] of AFTER_THE_FIGHT) {
        await explore(page, action, target);
      }
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#ending-kind").textContent(),
        "Escaped with loot",
      );
      const ending = await page.locator("#ending").innerText();
      assert.match(ending, /Ada has 300 XP\./);
      assert.match(ending, /Level up: Ada is now level 2/);
      await assertNoSideScroll(page, "no horizontal scroll");

      // Storage holds the settled character.
      const [record] = (await libraryFile(libraryPath)).characters;
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.level, 2);
      assert.equal(record.sheet.xp, 300);
      assert.deepEqual(
        record.sheet.treasure.map(({ name }) => name),
        ["Dagger Hilt"],
      );
      await page.locator("#ending-next").click();
      await page.locator("#sheet").waitFor({ state: "visible" });
      assert.match(
        await page.locator("#sheet-body").innerText(),
        /^Level 2 Fighter · 300 XP/,
      );
    } finally {
      await browser.close();
      await launcher.stop();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
