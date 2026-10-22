// #156: one action bar. In a fight it holds the character's whole toolkit,
// an unavailable action disabled with its reason as visible text; after an
// action, focus stays on the clicked control while it is enabled and
// otherwise moves to the newest history entry. Played keyboard-only through
// the rat tunnels: pressing Enter again after an attack attacks again or does
// nothing, never drinking the potion or leaving the room, and after the win
// focus is on the newest entry, on screen.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { ratTunnels } from "./fixtures/modules.mjs";
import { createAndStart } from "./fixtures/browser-journey.mjs";
import { firstFighter, launch } from "./fixtures/session-layout.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { endTurnOrFall } from "./fixtures/last-stand.mjs";

// The rat tunnels, with the Giant Rat's fight; the server offers only them.
const adventure = ratTunnels;
const SERVER_OPTIONS = { adventures: [adventure], qualifies: () => true };
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
      // No attack is offered while Last Stand waits (#499).
      spent ||= attack?.available === false;
      state = run(
        state,
        attack?.available
          ? { type: "attack", actorId: "pc", targetId: "giant-rat" }
          : endTurnOrFall(state),
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
      !document.querySelector("button.act[aria-busy=true]"),
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

/** Tabs to an action (on a room card, in the bar or the inventory) from the adventure title and presses Enter. */
async function keyboardAction(page, action, target) {
  await page.locator("#adventure-title").focus();
  await tabTo(
    page,
    `button.act[data-action="${action}"][data-target="${target}"]`,
  );
  await enterAction(page);
}

/** The newest entry starts inside the window and the log's scroll area. */
const newestOnScreen = (page) =>
  page.evaluate(() => {
    const log = document.getElementById("log").getBoundingClientRect();
    const newest = document
      .querySelector("#log > li:last-child")
      .getBoundingClientRect();
    // It shows from its top (#529).
    return (
      newest.top >= log.top - 1 &&
      newest.top <= Math.min(log.bottom, window.innerHeight) - 16
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

const seed = findSeed();

const viewport = { width: 1280, height: 850 };
test(
  `keyboard play: the action bar keeps focus safe in the rat tunnels (${viewport.width}px)`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-156-"));
    const server = await startFifthBrowserServer({
      ...SERVER_OPTIONS,
      libraryPath: join(directory, "characters.json"),
      seed,
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "rat-tunnels");

      // Exploring actions live on the room's cards (#520), not the action
      // bar; the character's own gear is acted on from "You carry" in the
      // character column (#198, #209, #432), beside its Rest section's
      // Short rest, greyed with nothing to recover (#521).
      assert.equal(await page.locator("#action-bar button").count(), 0);
      assert.deepEqual(
        await page
          .locator("#session-character button")
          .evaluateAll((buttons) =>
            buttons.map(
              (button) =>
                button.getAttribute("aria-label") ??
                `${button.textContent} (${button.disabled ? "disabled" : "enabled"})`,
            ),
          ),
        ["Unequip Leather armour", "Short rest (disabled)"],
      );
      assert.deepEqual(
        await page
          .locator("#room button.act")
          .evaluateAll((buttons) =>
            buttons.map((button) => button.getAttribute("aria-label")),
          ),
        [
          "Examine Rusted Lantern",
          "Go west to Alcove",
          "Go south to Rat-Gnawed Cellar",
          "Sneak south into Rat-Gnawed Cellar",
        ],
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
        /^Alcove — A cramped alcove/,
      );
      await keyboardAction(page, "examine", "iron-chest");
      await keyboardAction(page, "take", "healing-potion");
      assert.equal((await focused(page)).newest, true);
      // At full HP the potion's Drink stays on its inventory entry (#198),
      // disabled, with the reason.
      await assertReason(
        page,
        '#inventory button[data-action="use"][data-target="healing-potion"]',
        "Full HP",
      );
      await keyboardAction(page, "move", "stair-foot");
      await keyboardAction(page, "move", "rat-cellar");

      // The fight's whole toolkit, in its panel (#525).
      const bar = async () =>
        page
          .locator("#encounter button.act")
          .evaluateAll((buttons) =>
            buttons.map((button) => button.dataset.action),
          );
      // In the panel's order (#525): the healing on Ada's card, the attack
      // on the rat's, then Flee's menu (#396) by each way out and End turn.
      const toolkit = [
        "second-wind",
        "use",
        "attack",
        "flee",
        "flee",
        "end-turn",
      ];
      assert.deepEqual(await bar(), toolkit);
      assert.equal(await page.locator("#room button.act").count(), 0);
      // The potion's Drink sits on Ada's card (#525).
      assert.equal(
        await page.locator('#heal-controls button[data-action="use"]').count(),
        1,
      );

      // Keyboard only: Attack, then Enter again and again. Each Enter
      // attacks again (focus stayed on Attack) or does nothing (focus moved
      // to the newest entry); then End turn and back to Attack.
      const attack = '#encounter button[data-action="attack"]';
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
            (await page.locator("#turn").textContent()) === "The fight is over."
          ) {
            break;
          }
          await assertReason(page, attack, "Action used");
          spentShown = true;
          // Shift+Tab back into the bar: disabled actions are skipped.
          await tabTo(page, '#encounter button[data-action="end-turn"]', true);
          await enterAction(page);
        } else if (now.action === "end-turn") {
          await tabTo(page, attack, true);
        } else {
          assert.fail(`focus on an unrelated control: ${JSON.stringify(now)}`);
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
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
