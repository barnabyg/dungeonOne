import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { settleCharacter } from "../dist/character-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { lintelBarrow as barrow } from "./fixtures/modules.mjs";
import {
  createFighter,
  fight,
  startAdventure,
} from "./fixtures/browser-journey.mjs";
import {
  assertNoSideScroll,
  firstFighter,
  launch,
} from "./fixtures/session-layout.mjs";
import { readAda } from "./fixtures/save-files.mjs";

const fightStep = (runtime, state) =>
  runtime.attackTargets(state).length > 0
    ? { type: "attack", actorId: "pc", targetId: "barrow-goblin" }
    : { type: "end-turn", actorId: "pc" };

/**
 * Plays the barrow as the test does: into the hall, attacks until the fight
 * ends, the bier, the torc if it is there, and out. Returns the runtime and
 * the ended state, or undefined if Ada falls.
 */
function simulate(sheet, seed, number) {
  const runtime = createFifthRuntime(barrow, sheet);
  const random = createSeededRandom(sessionSeed(seed, number));
  const run = (state, action) =>
    runtime.handleAction(state, action, random).state;
  let state = run(runtime.createSession(), { type: "begin" });
  state = run(state, { type: "move", destinationId: "burial-hall" });
  while (state.encounter?.outcome === "ongoing") {
    state = run(state, fightStep(runtime, state));
  }
  if (state.status !== "playing") {
    return undefined;
  }
  state = run(state, { type: "examine", targetId: "stone-bier" });
  if (runtime.projectRoom(state).items.length > 0) {
    state = run(state, { type: "take", itemId: "silver-torc" });
  }
  state = run(state, { type: "move", destinationId: "barrow-mouth" });
  return {
    runtime,
    state: run(state, { type: "leave", roomId: "barrow-mouth" }),
  };
}

/** A seed on which Ada wins the barrow's fight on her first two visits. */
function findSeed() {
  for (let seed = 0; seed < 2000; seed++) {
    const first = simulate(firstFighter(seed), seed, 1);
    if (first === undefined) {
      continue;
    }
    const veteran = settleCharacter(
      firstFighter(seed),
      first.runtime.projectSettlement(first.state),
    );
    if (simulate(veteran, seed, 2) !== undefined) {
      return seed;
    }
  }
  throw new Error("no seed wins the barrow twice");
}

/** Clicks an exploring button and waits for its result card. */
async function explore(page, action, target) {
  const count = await page.locator("#log li").count();
  await page
    .locator(
      `#action-bar button[data-action="${action}"][data-target="${target}"]`,
    )
    .click();
  await page.waitForFunction(
    (seen) => document.querySelectorAll("#log li").length > seen,
    count,
  );
}

const focusedId = (page) => page.evaluate(() => document.activeElement?.id);

/** Leaves from the barrow mouth through the confirmation in the panel. */
async function leave(page) {
  await page.locator("#leave-controls button").click();
  assert.equal(await page.locator("#leave-confirm").isVisible(), true);
  assert.equal(await focusedId(page), "confirm-leave");
  await page.locator("#confirm-leave").click();
  await page.locator("#ending").waitFor({ state: "visible" });
}

test(
  "escape with the torc, see it and level 2 on the sheet, earn nothing twice, and abandon without loss",
  { timeout: 180000 },
  async () => {
    const seed = findSeed();
    const directory = await mkdtemp(join(tmpdir(), "rewards-5e-browser-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      libraryPath,
      seed,
      adventures: [barrow],
      // Fixtures are engine material, not gated content: the gate is
      // tested in balance-5e.test.mjs (#310).
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 760 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await createFighter(page);
      assert.match(
        await page.locator("#sheet-body").innerText(),
        /Treasure\n+No treasure yet\./,
      );
      assert.match(
        await page.locator("#sheet-body").innerText(),
        /Purse\n+No coin yet\./,
      );
      await startAdventure(page, "lintel-barrow");

      // Leave is an explicit choice that asks first, inside the panel.
      const leaveButton = page.locator("#leave-controls button");
      assert.equal(await leaveButton.textContent(), "Leave the adventure");
      await leaveButton.click();
      assert.match(
        await page.locator("#leave-question").textContent(),
        /^Leave The Lintel Barrow\? This ends the adventure here/,
      );
      assert.equal(await leaveButton.isVisible(), false);
      await page.locator("#cancel-leave").click();
      assert.equal(await page.locator("#leave-confirm").isVisible(), false);
      assert.equal(
        await page.evaluate(
          () =>
            document.activeElement ===
            document.querySelector("#leave-controls button"),
        ),
        true,
      );

      await explore(page, "move", "burial-hall");
      // There is no way out of the hall.
      assert.equal(await page.locator("#leave-controls button").count(), 0);
      await fight(page);
      await explore(page, "examine", "stone-bier");
      await explore(page, "take", "silver-torc");
      // The goblin's pouch is on its body: searched, then taken.
      assert.equal(
        await page
          .locator('#action-bar button[data-target="coin-pouch"]')
          .count(),
        0,
      );
      await explore(page, "examine", "barrow-goblin");
      assert.match(
        await page.locator("#room").innerText(),
        /Goblin Warrior's body — It lies where it fell\.\s+You found: Pouch of Old Coins/,
      );
      assert.equal(await page.locator("#purse").isVisible(), false);
      await explore(page, "take", "coin-pouch");
      // The coin is in the purse at once, beside what Ada carries (#208).
      assert.equal(
        await page.locator("#log li").last().innerText(),
        "You take the Pouch of Old Coins and put 2 gp 5 sp in your purse.",
      );
      assert.equal(
        await page.locator("#purse").textContent(),
        "Purse: 2 gp 5 sp",
      );
      assert.equal(await page.locator("#purse").isVisible(), true);
      await explore(page, "move", "barrow-mouth");
      await leave(page);

      // The escape in place of the action bar, by kind in words and colour.
      assert.equal(await focusedId(page), "ending-title");
      assert.equal(await page.locator("#action-bar").isHidden(), true);
      assert.equal(
        await page.locator("#ending").getAttribute("data-kind"),
        "escape-with-loot",
      );
      assert.equal(
        await page.locator("#ending-kind").textContent(),
        "Escaped with loot",
      );
      // Its border takes the escape-with-loot colour token, whatever the
      // token's value.
      const [border, token] = await page.locator("#ending").evaluate((node) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--color-gold-text)";
        node.append(probe);
        const colours = [
          getComputedStyle(node).borderLeftColor,
          getComputedStyle(probe).color,
        ];
        probe.remove();
        return colours;
      });
      assert.equal(border, token);
      const ending = await page.locator("#ending").innerText();
      assert.match(ending, /Defeated Goblin Warrior: \+50 XP/);
      assert.match(ending, /Out with the silver: \+250 XP/);
      assert.match(
        ending,
        /Treasure kept\n+Silver Torc \(25 gp\)\. A neck ring/,
      );
      assert.doesNotMatch(ending, /Pouch of Old Coins/);
      assert.match(ending, /Coin found: 2 gp 5 sp\. Purse: 2 gp 5 sp\./);
      assert.match(ending, /Ada has 300 XP\./);
      assert.match(ending, /Level up: Ada is now level 2/);
      assert.match(
        ending,
        /Hit points \d+ → \d+\. New: Action Surge, Tactical Mind\./,
      );
      // The level-up and the way back fit the dock without covering the
      // history at a desktop size.
      await page.setViewportSize({ width: 1280, height: 850 });
      assert.ok(
        await page.evaluate(() => {
          const title = document
            .getElementById("history-title")
            .getBoundingClientRect();
          const ending = document
            .getElementById("ending")
            .getBoundingClientRect();
          return title.bottom <= ending.top;
        }),
        "the ending sits below the history heading",
      );
      await page.setViewportSize({ width: 375, height: 760 });
      assert.equal(
        await page.locator("#ending button.primary").count(),
        1,
        "one primary step back to the sheet",
      );
      await assertNoSideScroll(page, "no horizontal scroll at phone width");

      // Storage holds it, once.
      let record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.xp, 300);
      assert.equal(record.sheet.level, 2);
      assert.deepEqual(
        record.sheet.treasure.map(({ name }) => name),
        ["Silver Torc"],
      );
      assert.equal(record.sheet.purse, 250);
      assert.deepEqual(record.sheet.finds, [
        "lintel-barrow/silver-torc",
        "lintel-barrow/coin-pouch",
      ]);

      await page.locator("#ending-next").click();
      await page.locator("#sheet").waitFor({ state: "visible" });
      const sheet = await page.locator("#sheet-body").innerText();
      assert.match(sheet, /^Level 2 Fighter · 300 XP \(level 3 at 900\)/);
      assert.match(sheet, /Treasure\n+Silver Torc \(25 gp\)\. A neck ring/);
      assert.match(sheet, /Purse\n+2 gp 5 sp/);

      // The same adventure again: no torc or coin to find, and nothing earned.
      await startAdventure(page, "lintel-barrow");
      await explore(page, "move", "burial-hall");
      await fight(page);
      await explore(page, "examine", "stone-bier");
      await explore(page, "examine", "barrow-goblin");
      assert.equal(
        await page.locator('#action-bar button[data-action="take"]').count(),
        0,
      );
      // The purse Ada brought is still hers.
      assert.equal(
        await page.locator("#purse").textContent(),
        "Purse: 2 gp 5 sp",
      );
      await explore(page, "move", "barrow-mouth");
      await leave(page);
      assert.equal(
        await page.locator("#ending-kind").textContent(),
        "Escaped empty-handed",
      );
      assert.match(
        await page.locator("#ending").innerText(),
        /Nothing new earned: Ada already has everything this adventure gives\./,
      );
      record = await readAda(libraryPath);
      assert.equal(record.sheet.xp, 300);
      assert.equal(record.sheet.treasure.length, 1);
      assert.equal(record.sheet.purse, 250);

      // Abandoning, from the sheet, keeps everything as it was.
      const before = record.sheet;
      await page.locator("#ending-next").click();
      await startAdventure(page, "lintel-barrow");
      await explore(page, "examine", "scratched-lintel");
      await page.locator('#breadcrumb a[data-view="sheet"]').click();
      await page.locator("#abandon-adventure").click();
      assert.equal(await focusedId(page), "confirm-abandon");
      assert.match(
        await page.locator("#abandon-question").textContent(),
        /^Abandon The Lintel Barrow\? Ada keeps nothing found on it/,
      );
      await page.locator("#confirm-abandon").click();
      await page
        .locator("#feedback")
        .filter({ hasText: "Ada abandoned The Lintel Barrow." })
        .waitFor();
      assert.equal(
        await page.locator(".start-adventure").count(),
        1,
        "Ada can start the barrow again",
      );
      record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.deepEqual(record.sheet, before);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
