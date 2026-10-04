// #157: a trimmed room panel and initiative table. Empty room lists are left
// out, and a room with nothing in it says so in one line. In a fight the
// room's details collapse behind a keyboard-operable disclosure. The
// initiative table shows totals, marks the current turn by highlighting its
// row and tagging the name, keeps the rolls and roll-offs in a disclosure,
// and collapses once the fight is over. Exploring buttons show short verbs,
// with the full name ("Examine Rusted Lantern") as their accessible name.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  buildFighter,
  defaultPlacement,
  rollAbilitySet,
} from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

const DEFAULT_CHOICES = {
  placement: {
    strength: 0,
    dexterity: 1,
    constitution: 2,
    intelligence: 3,
    wisdom: 4,
    charisma: 5,
  },
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
};

/** The first Fighter a browser on `seed` creates with the default choices. */
function firstFighter(seed) {
  const stream = createHash("sha256")
    .update(`5e-ability-rolls:${seed}:1`)
    .digest()
    .readUInt32LE(0);
  const dice = rollAbilitySet(createSeededRandom(stream));
  return buildFighter("a".repeat(32), "Ada", dice, {
    ...DEFAULT_CHOICES,
    placement: defaultPlacement(dice),
  });
}

const cellarGoblin = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "cellar-goblin",
);

/** A seed where The Goblin in the Cellar opens with an initiative roll-off. */
function rollOffSeed() {
  for (let seed = 0; seed < 5000; seed++) {
    const runtime = createFifthRuntime(cellarGoblin, firstFighter(seed));
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

async function start(page, url, adventureId) {
  await page.goto(url);
  await page.locator("#open-creation").click();
  await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
  await page.locator("#character-name").fill("Ada");
  await page.locator("#save-character").click();
  await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
  await page
    .locator(`.start-adventure[data-adventure="${adventureId}"]`)
    .click();
  await page.locator("#adventure").waitFor({ state: "visible" });
  await page.locator("#log li").first().waitFor();
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
        libraryPath: join(directory, "characters.json"),
        seed: rollOff,
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await start(page, server.url, "cellar-goblin");

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
        assert.equal(await page.locator("#room h4:visible").count(), 0);
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

test(
  "exploring buttons show short verbs and are named in full",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-157-"));
    const server = await startFifthBrowserServer({
      libraryPath: join(directory, "characters.json"),
      seed: 0,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      await start(page, server.url, "smugglers-cellar");
      const act = async (name) => {
        const count = await page.locator("#log li").count();
        await page.getByRole("button", { name, exact: true }).click();
        await page.waitForFunction(
          (seen) => document.querySelectorAll("#log li").length > seen,
          count,
        );
      };

      // Out of a fight there is no room disclosure, and empty lists are left
      // out: the stair has exits and a feature, but no items.
      assert.equal(await page.locator("#room-toggle").isVisible(), false);
      assert.equal(await page.locator("#room-items-group").isVisible(), false);
      assert.equal(await page.locator("#inventory-group").isVisible(), false);
      assert.equal(await page.locator("#room-empty").isVisible(), false);
      assert.doesNotMatch(await page.locator("#room").innerText(), /None\./);

      // Each target's name is shown once, beside its short verbs.
      assert.deepEqual(
        await page
          .locator("#explore-controls .thing-actions")
          .evaluateAll((things) =>
            things.map((thing) => thing.innerText.replace(/\s+/g, " ")),
          ),
        ["Alcove Go", "Rat-Gnawed Cellar Go", "Rusted Lantern Examine"],
      );
      const examine = page.getByRole("button", {
        name: "Examine Rusted Lantern",
        exact: true,
      });
      assert.equal(await examine.textContent(), "Examine");

      await act("Go to Alcove");
      await act("Examine Iron-Bound Chest");
      assert.equal(
        await page
          .getByRole("button", { name: "Take Potion of Healing", exact: true })
          .textContent(),
        "Take",
      );
      await act("Take Potion of Healing");

      // Drink is unavailable at full HP: the reason is its description.
      const drink = page.getByRole("button", {
        name: "Drink Potion of Healing",
        exact: true,
      });
      assert.equal(await drink.textContent(), "Drink");
      assert.equal(await drink.isDisabled(), true);
      assert.equal(
        await drink.evaluate(
          (button) =>
            document.getElementById(button.getAttribute("aria-describedby"))
              .textContent,
        ),
        "Full HP",
      );
      assert.equal(await page.locator("#inventory-group").isVisible(), true);
      assert.equal(await page.locator("#room-items-group").isVisible(), false);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
