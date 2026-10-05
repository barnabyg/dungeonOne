// #136: The Abandoned Delve plays in the browser through the action bar,
// keeping the newest history entry and the actions on screen after each
// action (#154) at desktop and phone widths, with no horizontal scroll.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import {
  assertTogether,
  explore as exploreOnly,
  fightOn,
  firstFighter,
  launch,
  narratingDm,
  say,
} from "./fixtures/session-layout.mjs";

/** The page never scrolls sideways. */
const assertNoSideScroll = async (page, label) =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    `${label}: no horizontal scroll`,
  );

/** Runs one action bar action with the #154 check, then the scroll check. */
const explore = async (page, action, target) => {
  await exploreOnly(page, action, target);
  await assertNoSideScroll(page, `${action} ${target}`);
};

const delve = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "abandoned-delve",
);

// The journey up to the guard post's fight, as the browser's actions.
const TO_THE_FIGHT = [
  ["examine", "chalk-marks"],
  ["move", "gate-hall"],
  ["force", "swollen-door"],
  ["move", "storeroom"],
  // The potion stays in its barrel: each carried item adds a row to the
  // phone action bar, and a full one overflows it (#198).
  ["examine", "old-barrel"],
  ["move", "gate-hall"],
  ["move", "guard-post"],
];
// After it: loot the zombie, ask the goblin about the key, and walk out.
const AFTER_THE_FIGHT = [
  ["examine", "zombie"],
  ["take", "guard-purse"],
  ["move", "dry-well"],
  ["talk", "the-vault"],
  ["move", "guard-post"],
  ["move", "gate-hall"],
  ["move", "broken-gate"],
];

const ENGINE = {
  examine: (id) => ({ type: "examine", targetId: id }),
  move: (id) => ({ type: "move", destinationId: id }),
  force: (id) => ({ type: "force", doorId: id }),
  take: (id) => ({ type: "take", itemId: id }),
  talk: (id) => ({ type: "talk", topicId: id }),
};

/** A seed where Ada forces the swollen door and survives the zombie. */
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
    while (
      state.status === "playing" &&
      state.encounter?.outcome === "ongoing"
    ) {
      state = run(
        state,
        runtime.attackTargets(state).length > 0
          ? { type: "attack", actorId: "pc", targetId: "zombie" }
          : { type: "end-turn", actorId: "pc" },
      );
    }
    if (
      state.status === "playing" &&
      state.openedDoorIds.includes("swollen-door")
    ) {
      return seed;
    }
  }
  throw new Error("no seed where Ada opens the door and beats the zombie");
}

const seed = findSeed();

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `the Abandoned Delve plays through the action bar to an escape with loot (${viewport.width}px)`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-136-"));
      const server = await startFifthBrowserServer({
        libraryPath: join(directory, "characters.json"),
        seed,
        dmModel: narratingDm(),
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await page.goto(server.url);
        await page.locator("#open-creation").click();
        await page
          .locator("#preview-body")
          .filter({ hasText: "AC:" })
          .waitFor();
        await page.locator("#character-name").fill("Ada");
        await page.locator("#save-character").click();
        await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
        await page
          .getByRole("button", { name: "Start The Abandoned Delve" })
          .click();
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#log li").first().waitFor();
        await assertTogether(page, "start");

        for (const [action, target] of TO_THE_FIGHT) {
          await explore(page, action, target);
        }
        while (
          (await page.locator("#turn").textContent()) !== "The fight is over."
        ) {
          await fightOn(page);
        }
        await say(page, "I listen for anything else moving");
        for (const [action, target] of AFTER_THE_FIGHT) {
          await explore(page, action, target);
        }

        await page.locator("#leave-controls button").click();
        await page.locator("#confirm-leave").click();
        await page.locator("#ending").waitFor({ state: "visible" });
        assert.equal(
          await page.locator("#ending-title").textContent(),
          "Out with the loot",
        );

        // No horizontal scroll, even with a wide font as CI's Linux one is.
        assert.ok(
          await page.evaluate(() => {
            for (const node of document.querySelectorAll("*")) {
              node.style.fontFamily = "Verdana, sans-serif";
            }
            return document.documentElement.scrollWidth <= window.innerWidth;
          }),
          "no horizontal scroll",
        );
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
