// #156: one action bar. In a fight it holds the character's whole toolkit,
// an unavailable action disabled with its reason as visible text; after an
// action, focus stays on the clicked control while it is enabled and
// otherwise moves to the newest history entry. Played keyboard-only through
// the Smugglers' Cellar at desktop and phone widths: pressing Enter again
// after an attack attacks again or does nothing, never drinking the potion
// or leaving the room, and after the win focus is on the newest entry, on
// screen.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { loadFifthAdventure } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { buildFighter, rollAbilitySet } from "../dist/fighter-5e.js";
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

// The Smugglers' Cellar as it was before #207, with its Giant Rat fight; the
// server offers it in place of the built-in modules.
const adventure = await loadFifthAdventure(
  "tests/fixtures/smugglers-with-rat.json",
);
const FIXTURE_MODULES = { adventures: [adventure], qualifies: () => true };
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
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
};

/** The first Fighter a browser on `seed` creates with the default choices. */
function firstFighter(seed) {
  const stream = createHash("sha256")
    .update(`5e-ability-rolls:${seed}:1`)
    .digest()
    .readUInt32LE(0);
  return buildFighter(
    "a".repeat(32),
    "Ada",
    rollAbilitySet(createSeededRandom(stream)),
    DEFAULT_CHOICES,
  );
}

const WALK = [
  { type: "move", destinationId: "alcove" },
  { type: "examine", targetId: "iron-chest" },
  { type: "take", itemId: "healing-potion" },
  { type: "move", destinationId: "stair-foot" },
  { type: "move", destinationId: "rat-cellar" },
];

/**
 * A seed where Ada wins the rat fight, attacking whenever she can and
 * otherwise ending her turn, and at least once her attack is spent while
 * her turn goes on (she is hurt, so Second Wind and the potion are left).
 */
function findSeed() {
  for (let seed = 0; seed < 5000; seed++) {
    const runtime = createFifthRuntime(adventure, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    const run = (state, action) =>
      runtime.handleAction(state, action, random).state;
    let state = run(runtime.createSession(), { type: "begin" });
    for (const action of WALK) {
      state = run(state, action);
    }
    let spent = false;
    while (
      state.status === "playing" &&
      state.encounter.outcome === "ongoing"
    ) {
      const attack = runtime
        .projectActions(state)
        .find(({ action }) => action === "attack");
      spent ||= !attack.available;
      state = run(
        state,
        attack.available
          ? { type: "attack", actorId: "pc", targetId: "giant-rat" }
          : { type: "end-turn", actorId: "pc" },
      );
    }
    if (state.status === "playing" && spent) {
      return seed;
    }
  }
  throw new Error("no seed where Ada wins the rat fight after a spent attack");
}

const focused = (page) =>
  page.evaluate(() => {
    const node = document.activeElement;
    return {
      tag: node.tagName,
      action: node.dataset?.action,
      target: node.dataset?.target,
      disabled: node.disabled === true,
      newest:
        node === document.querySelector("#log > li:last-child") &&
        node.classList.contains("newest"),
    };
  });

/** Presses Tab (or Shift+Tab) until the focused button matches. */
async function tabTo(page, selector, backwards = false) {
  for (let step = 0; step < 80; step++) {
    if (
      await page.evaluate(
        (wanted) => document.activeElement.matches(wanted),
        selector,
      )
    ) {
      return;
    }
    await page.keyboard.press(backwards ? "Shift+Tab" : "Tab");
  }
  assert.fail(`Tab never reached ${selector}`);
}

const logCount = (page) => page.locator("#log > li").count();

/** Presses Enter on the focused action and waits for its history entry. */
async function enterAction(page) {
  const count = await logCount(page);
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (seen) =>
      document.querySelectorAll("#log > li").length > seen &&
      !document.querySelector("#action-bar [aria-busy=true]"),
    count,
  );
  // The page moves focus once the action settles.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(resolve);
      }),
  );
}

/** Tabs to an action from the adventure title and presses Enter. */
async function keyboardAction(page, action, target) {
  await page.locator("#adventure-title").focus();
  await tabTo(
    page,
    `#action-bar button[data-action="${action}"][data-target="${target}"]`,
  );
  await enterAction(page);
}

/** The newest entry is inside the window and the log's scroll area. */
const newestOnScreen = (page) =>
  page.evaluate(() => {
    const log = document.getElementById("log").getBoundingClientRect();
    const newest = document
      .querySelector("#log > li:last-child")
      .getBoundingClientRect();
    return (
      newest.bottom <= window.innerHeight + 1 &&
      newest.top >= -1 &&
      newest.bottom <= log.bottom + 1 &&
      newest.bottom - Math.max(newest.top, log.top) >= 16
    );
  });

/** A disabled action shows its reason as text that describes the button. */
async function assertReason(page, selector, reason) {
  const button = page.locator(selector);
  assert.equal(await button.isDisabled(), true, `${selector} disabled`);
  const id = await button.getAttribute("aria-describedby");
  assert.ok(id, `${selector} is described`);
  const text = page.locator(`#${id}`);
  assert.equal(await text.textContent(), reason);
  assert.equal(await text.isVisible(), true, `${reason} is visible`);
}

const sessionFile = async (directory) => {
  const folder = join(directory, "characters-adventures");
  const [name] = (await readdir(folder)).filter((file) =>
    file.endsWith(".json"),
  );
  return JSON.parse(await readFile(join(folder, name), "utf8"));
};

const seed = findSeed();

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `keyboard play: the action bar keeps focus safe in the Smugglers' Cellar (${viewport.width}px)`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-156-"));
      const server = await startFifthBrowserServer({
        ...FIXTURE_MODULES,
        libraryPath: join(directory, "characters.json"),
        seed,
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
          .locator('.start-adventure[data-adventure="smugglers-cellar"]')
          .click();
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#log li").first().waitFor();

        // Exploring actions live in the action region, not the room panel.
        assert.equal(
          await page.locator("#room button:not(#room-toggle)").count(),
          0,
        );
        assert.deepEqual(
          await page
            .locator("#explore-controls button")
            .evaluateAll((buttons) =>
              buttons.map((button) => button.getAttribute("aria-label")),
            ),
          ["Go to Alcove", "Go to Rat-Gnawed Cellar", "Examine Rusted Lantern"],
        );

        // Examining keeps focus on Examine: it is still enabled.
        await keyboardAction(page, "examine", "rusted-lantern");
        assert.deepEqual(await focused(page), {
          tag: "BUTTON",
          action: "examine",
          target: "rusted-lantern",
          disabled: false,
          newest: false,
        });
        // Moving removes the Go to button, so focus goes to the new entry.
        await keyboardAction(page, "move", "alcove");
        assert.equal((await focused(page)).newest, true);
        assert.match(
          await page.locator("#log > li:last-child").textContent(),
          /You enter the Alcove/,
        );
        await keyboardAction(page, "examine", "iron-chest");
        await keyboardAction(page, "take", "healing-potion");
        assert.equal((await focused(page)).newest, true);
        // At full HP the potion stays in the bar, disabled, with the reason.
        await assertReason(
          page,
          '#explore-controls button[data-action="use"][data-target="healing-potion"]',
          "Full HP",
        );
        await keyboardAction(page, "move", "stair-foot");
        await keyboardAction(page, "move", "rat-cellar");

        // The fight's whole toolkit, in one bar.
        const bar = async () =>
          page
            .locator("#action-bar button")
            .evaluateAll((buttons) =>
              buttons.map((button) => button.dataset.action),
            );
        const toolkit = ["attack", "use", "second-wind", "end-turn"];
        assert.deepEqual(await bar(), toolkit);
        assert.equal(await page.locator("#explore-controls button").count(), 0);

        // Keyboard only: Attack, then Enter again and again. Each Enter
        // attacks again (focus stayed on Attack) or does nothing (focus moved
        // to the newest entry); then End turn and back to Attack.
        const attack = '#attack-controls button[data-action="attack"]';
        await page.locator("#adventure-title").focus();
        await tabTo(page, attack);
        let spentShown = false;
        for (let step = 0; step < 60; step++) {
          if (
            (await page.locator("#turn").textContent()) === "The fight is over."
          ) {
            break;
          }
          const now = await focused(page);
          if (now.action === "attack") {
            await enterAction(page);
            const after = await focused(page);
            assert.ok(
              (after.action === "attack" && !after.disabled) || after.newest,
              `after an attack, focus is on Attack or the newest entry: ${JSON.stringify(after)}`,
            );
          } else if (now.newest) {
            // Enter on the newest entry does nothing.
            const count = await logCount(page);
            await page.keyboard.press("Enter");
            await page.waitForTimeout(150);
            assert.equal(await logCount(page), count);
            if (
              (await page.locator("#turn").textContent()) ===
              "The fight is over."
            ) {
              break;
            }
            await assertReason(page, attack, "Action used");
            spentShown = true;
            // Shift+Tab back into the bar: disabled actions are skipped.
            await tabTo(
              page,
              '#feature-controls button[data-action="end-turn"]',
              true,
            );
            await enterAction(page);
          } else if (now.action === "end-turn") {
            await tabTo(page, attack, true);
          } else {
            assert.fail(
              `focus on an unrelated control: ${JSON.stringify(now)}`,
            );
          }
          // The bar keeps its shape through the fight.
          if (
            (await page.locator("#turn").textContent()) !== "The fight is over."
          ) {
            assert.deepEqual(await bar(), toolkit);
          }
          // No potion drunk and no room left.
          assert.equal(
            await page.locator("#room-title").textContent(),
            "Rat-Gnawed Cellar",
          );
          assert.doesNotMatch(
            await page.locator("#log").textContent(),
            /You drink the/,
          );
        }
        assert.ok(spentShown, "the spent attack showed its reason");
        assert.equal(
          await page.locator("#turn").textContent(),
          "The fight is over.",
        );

        // After the win, focus is on the newest entry, on screen.
        assert.equal((await focused(page)).newest, true);
        assert.equal(await newestOnScreen(page), true, "newest entry shown");
        assert.match(
          await page.locator("#log > li:last-child").textContent(),
          /The fight is over\./,
        );
        // Enter there does nothing: no drink, no move.
        const count = await logCount(page);
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(150);
        assert.equal(await logCount(page), count);
        assert.equal(
          await page.locator("#room-title").textContent(),
          "Rat-Gnawed Cellar",
        );

        // The save agrees: the potion was never drunk.
        const file = await sessionFile(directory);
        assert.ok(
          file.transitions.every(({ action }) => action.type !== "use-item"),
        );
        assert.deepEqual(file.state.inventory, ["healing-potion"]);
        assert.equal(file.state.roomId, "rat-cellar");

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
