// #481 and #482, browser → API → storage: a check, and a fight played
// through the page, ask for the sounds their roll data and the fight call
// for, answer by answer, and the history shown on reload asks for none.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { obstacleYard, ratTunnels } from "./fixtures/modules.mjs";
import {
  clickAction,
  createAndStart,
  fightTurn,
  settled,
} from "./fixtures/browser-journey.mjs";
import { launch } from "./fixtures/session-layout.mjs";

/** The sounds the page has asked for since it loaded. */
const requested = (page) => page.evaluate(() => window.requestedSounds);

/** The sounds one answer asks for: those asked for while `run` runs. */
async function answerSounds(page, run) {
  const before = (await requested(page)).length;
  await run();
  return (await requested(page)).slice(before);
}

/**
 * A stand-in for the browser's Audio, installed before the page loads: each
 * play is recorded in window.playedSounds with when it started and, 600 ms
 * later, when it ended.
 */
function recordPlays() {
  window.playedSounds = [];
  window.Audio = class {
    constructor(src) {
      this.src = src;
      this.onended = null;
    }

    play() {
      const played = { src: this.src, start: performance.now() };
      window.playedSounds.push(played);
      setTimeout(() => {
        played.end = performance.now();
        this.onended?.();
      }, 600);
      return Promise.resolve();
    }

    pause() {}
  };
}

async function withPage(adventure, seed, work) {
  const directory = await mkdtemp(join(tmpdir(), "issue-481-482-browser-"));
  const server = await startFifthBrowserServer({
    libraryPath: join(directory, "characters.json"),
    seed,
    adventures: [adventure],
    qualifies: () => true,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
  });
  page.setDefaultTimeout(8000);
  await page.addInitScript(recordPlays);
  try {
    await createAndStart(page, server.url, adventure.id);
    // Opening the adventure is not an answer: it is silent.
    assert.deepEqual(await requested(page), []);
    await work(page);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

/** The tags on the last history entry's compact lines, such as "Hit". */
const lastTags = (page) =>
  page.locator("#log li").last().locator(".compact .tag").allTextContents();

test(
  "a check rattles the dice, then stings for its outcome",
  { timeout: 120000 },
  () =>
    withPage(obstacleYard, 0, async (page) => {
      const sounds = await answerSounds(page, () =>
        settled(page, () =>
          page
            .locator(
              '#room button[data-target="crumbling-wall"][data-approach="athletics"]',
            )
            .click(),
        ),
      );
      // Seed 0 rolls a 12: no natural 20 or 1.
      assert.deepEqual(await lastTags(page), ["Success"]);
      assert.deepEqual(sounds, ["dice", "success"]);
    }),
);

test(
  "a fight's drum, attacks, fall and victory play answer by answer, in order, and not on reload",
  { timeout: 120000 },
  () =>
    withPage(ratTunnels, 0, async (page) => {
      // Entering the cellar rolls initiative, and the rat attacks first.
      const start = await answerSounds(page, () =>
        clickAction(page, "move", "rat-cellar"),
      );
      assert.deepEqual(await lastTags(page), ["Miss"]);
      assert.deepEqual(start, ["fight-start", "miss"]);
      // They play one at a time, each a gap after the one before ends.
      await page.waitForFunction(
        () => window.playedSounds.length === 2 && window.playedSounds[1].end,
      );
      const played = await page.evaluate(() => window.playedSounds);
      assert.deepEqual(
        played.map(({ src }) => src),
        ["/sounds/fight-start.wav", "/sounds/miss.wav"],
      );
      for (let index = 1; index < played.length; index += 1) {
        assert.ok(
          played[index].start - played[index - 1].end >= 100,
          JSON.stringify(played),
        );
      }

      // Ada hits, and the rat misses her. Muting while the first of them
      // plays stops the rest.
      assert.deepEqual(await answerSounds(page, () => fightTurn(page)), [
        "hit-bludgeoning",
        "miss",
      ]);
      await page.locator("#sound-mute").click();
      await page.waitForTimeout(1500);
      assert.deepEqual(
        (await page.evaluate(() => window.playedSounds))
          .slice(2)
          .map(({ src }) => src),
        ["/sounds/hit-bludgeoning.wav"],
      );
      assert.deepEqual(await lastTags(page), ["Hit", "Miss"]);
      // Ada's next hit drops the rat, which ends the fight.
      assert.deepEqual(await answerSounds(page, () => fightTurn(page)), [
        "hit-bludgeoning",
        "fall",
        "victory",
      ]);
      assert.equal(
        await page.locator("#turn").textContent(),
        "The fight is over.",
      );

      await page.reload();
      await page.locator("#log li").nth(3).waitFor();
      assert.deepEqual(await requested(page), []);
      assert.deepEqual(await page.evaluate(() => window.playedSounds), []);
    }),
);
