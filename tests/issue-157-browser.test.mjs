// #157: a trimmed room panel and initiative table. Empty room lists are left
// out, and a room with nothing in it says so in one line. In a fight the
// room's details collapse behind a keyboard-operable disclosure. The
// initiative table shows totals, marks the current turn by highlighting its
// row and tagging the name, keeps the rolls and roll-offs in a disclosure,
// and collapses once the fight is over. The exploring side (short verbs,
// left-out empty lists) is checked in issue-214-browser.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {} from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { loneGoblin } from "./fixtures/modules.mjs";
import { createAndStart } from "./fixtures/browser-journey.mjs";
import { firstFighter } from "./fixtures/session-layout.mjs";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

/** A seed where the lone goblin fight opens with an initiative roll-off. */
function rollOffSeed() {
  for (let seed = 0; seed < 5000; seed++) {
    const runtime = createFifthRuntime(loneGoblin, firstFighter(seed));
    const { state } = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      createSeededRandom(sessionSeed(seed, 1)),
    );
    if (state.encounter.order.some(({ tieBreaks }) => tieBreaks.length > 0)) {
      return seed;
    }
  }
  throw new Error("no seed with an initiative roll-off");
}

/** Clicks the first Attack button, or End turn once the action is spent. */
async function clickNext(page) {
  const count = await page.locator("#log li").count();
  const attack = page.locator("#attack-controls button.attack:enabled");
  await (
    (await attack.count()) > 0
      ? attack.first()
      : page.locator('#feature-controls button[data-action="end-turn"]')
  ).click();
  await page.waitForFunction(
    (seen) => document.querySelectorAll("#log li").length > seen,
    count,
  );
}

const fightOver = async (page) =>
  (await page.locator("#turn").textContent()) === "The fight is over.";

/** Tabs from the adventure title until `selector` has focus. */
async function tabTo(page, selector) {
  await page.locator("#adventure-title").focus();
  for (let step = 0; step < 40; step++) {
    await page.keyboard.press("Tab");
    if (
      await page.evaluate((s) => document.activeElement.matches(s), selector)
    ) {
      return;
    }
  }
  assert.fail(`Tab never reached ${selector}`);
}

const rollOff = rollOffSeed();

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `a fight with the room collapsed and expanded, and the table after it (${viewport.width}px)`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-157-"));
      const server = await startFifthBrowserServer({
        adventures: [loneGoblin],
        libraryPath: join(directory, "characters.json"),
        seed: rollOff,
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await createAndStart(page, server.url, "lone-goblin");

        // In the fight, the room's details are collapsed, and no "None."
        // rows render anywhere.
        const toggle = page.getByRole("button", { name: "Room details" });
        assert.equal(await toggle.getAttribute("aria-expanded"), "false");
        assert.equal(await page.locator("#room-details").isVisible(), false);
        assert.doesNotMatch(
          await page.locator("#session-scene").textContent(),
          /None\./,
        );
        // The fight starts on the first screen.
        const fightTop = (await page.locator("#encounter").boundingBox()).y;
        assert.ok(fightTop + 100 < viewport.height, String(fightTop));

        // Keyboard: Enter expands the room; a cellar with nothing in it
        // shows one short line and no empty lists. Space collapses it again.
        await tabTo(page, "#room-toggle");
        await page.keyboard.press("Enter");
        assert.equal(await toggle.getAttribute("aria-expanded"), "true");
        assert.equal(await page.locator("#room-details").isVisible(), true);
        assert.equal(
          await page.locator("#room-empty").textContent(),
          "There is nothing else here.",
        );
        assert.equal(await page.locator("#room-empty").isVisible(), true);
        // Only what the character carries: its own gear (#209).
        assert.deepEqual(
          await page.locator("#room h4:visible").allTextContents(),
          ["You carry"],
        );
        // Re-rendering after an action keeps the player's choice.
        await clickNext(page);
        assert.equal(await page.locator("#room-details").isVisible(), true);
        await tabTo(page, "#room-toggle");
        await page.keyboard.press(" ");
        assert.equal(await toggle.getAttribute("aria-expanded"), "false");
        assert.equal(await page.locator("#room-details").isVisible(), false);

        // A compact table: no Turn column or caption; each initiative is the
        // total, and the current turn's row is highlighted and tagged.
        assert.deepEqual(
          await page.locator("#initiative thead th").allTextContents(),
          ["Combatant", "Initiative", "HP", "AC"],
        );
        assert.equal(await page.locator("#initiative caption").count(), 0);
        for (const cell of await page
          .locator("#initiative-rows td:nth-child(2)")
          .allTextContents()) {
          assert.match(cell, /^\d+$/);
        }
        if (!(await fightOver(page))) {
          const current = page.locator("#initiative-rows tr.current");
          assert.equal(await current.count(), 1);
          assert.equal(await current.getAttribute("aria-current"), "true");
          assert.equal(
            await current.locator("th .tag.now").textContent(),
            "Now",
          );
        }

        // The rolls behind the totals, with the roll-off, open by keyboard.
        const breakdown = page.locator("#initiative-breakdown");
        assert.equal(
          await page.locator("#initiative-rolls").isVisible(),
          false,
        );
        await tabTo(page, "#initiative-breakdown summary");
        await page.keyboard.press("Enter");
        assert.equal(await breakdown.evaluate((node) => node.open), true);
        const rolls = await page
          .locator("#initiative-rolls li")
          .allTextContents();
        assert.ok(
          rolls.some((roll) =>
            /^Ada \(you\): d20 \d+ [+−] \d+ = \d+/.test(roll),
          ),
          rolls.join("; "),
        );
        assert.ok(
          rolls.some((roll) => /, roll-off \d+(, \d+)*$/.test(roll)),
          rolls.join("; "),
        );

        while (!(await fightOver(page))) {
          await clickNext(page);
        }

        // After the fight: the room is open again with no toggle, and the
        // table is collapsed behind its own disclosure.
        assert.equal(await toggle.count(), 0);
        assert.equal(await page.locator("#room-details").isVisible(), true);
        const table = page.getByRole("button", { name: "Initiative order" });
        assert.equal(await table.getAttribute("aria-expanded"), "false");
        assert.equal(await page.locator("#initiative").isVisible(), false);
        await tabTo(page, "#initiative-toggle");
        await page.keyboard.press("Enter");
        assert.equal(await table.getAttribute("aria-expanded"), "true");
        assert.equal(await page.locator("#initiative").isVisible(), true);
        assert.equal(
          await page.locator("#initiative-rows tr.current").count(),
          0,
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
