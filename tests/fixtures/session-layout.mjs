// Shared by the 5e browser journeys that check #154: after each action, the
// newest history entry and the action buttons are on screen together.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import {
  buildCharacter,
  defaultPlacement,
  rollAbilitySet,
} from "../../dist/character-5e.js";
import { FIGHTER_DEFAULT_CHOICES } from "../../dist/fighter-5e.js";
import { createSeededRandom } from "../../dist/random.js";
import { actionButton, settled } from "./browser-journey.mjs";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
export const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

/**
 * The first Fighter a browser on `seed` creates with the creation screen's
 * default choices, its placement following the dice as the page's does.
 */
export function firstFighter(seed) {
  const stream = createHash("sha256")
    .update(`5e-ability-rolls:${seed}:1`)
    .digest()
    .readUInt32LE(0);
  const dice = rollAbilitySet(createSeededRandom(stream));
  return buildCharacter("a".repeat(32), "Ada", dice, {
    ...FIGHTER_DEFAULT_CHOICES,
    placement: defaultPlacement(dice),
  });
}

/** A scripted AI DM that answers every message with narration. */
export const narratingDm = () => ({
  async respond() {
    return { text: "Dust drifts in the lamplight; nothing stirs." };
  },
});

/**
 * Where the newest history entry, the action buttons and the focused control
 * sit: each must be inside the window, and the entry inside the log's
 * scroll area, without the player scrolling.
 */
export const layout = (page) =>
  page.evaluate(() => {
    const height = window.innerHeight;
    const width = window.innerWidth;
    const inWindow = (rect) =>
      rect.width > 0 &&
      rect.top >= -1 &&
      rect.bottom <= height + 1 &&
      rect.left >= -1 &&
      rect.right <= width + 1;
    const log = document.getElementById("log").getBoundingClientRect();
    const newest = document
      .querySelector("#log li:last-child")
      .getBoundingClientRect();
    const dock = document.getElementById("session-dock");
    const dockRect = dock.getBoundingClientRect();
    // Shown buttons only: the ending's (#158) is hidden while playing.
    const buttons = [
      ...document.querySelectorAll("#session-actions button, #send-message"),
    ].filter((button) => button.getClientRects().length > 0);
    const focused = document.activeElement;
    const focusRect = focused.getBoundingClientRect();
    const overlaps = (a, b) =>
      a.left < b.right &&
      b.left < a.right &&
      a.top < b.bottom &&
      b.top < a.bottom;
    return {
      geometry: JSON.stringify({
        log,
        newest,
        height,
        scrollY: window.scrollY,
      }),
      newestShown:
        inWindow(log) &&
        newest.bottom <= log.bottom + 1 &&
        newest.bottom > log.top &&
        newest.bottom - Math.max(newest.top, log.top) >= 16,
      hiddenButtons: buttons
        .filter((button) => !inWindow(button.getBoundingClientRect()))
        .map((button) => button.textContent),
      focus: focused.id || focused.textContent,
      focusShown:
        focused === document.body ||
        focused.tagName !== "BUTTON" ||
        (inWindow(focusRect) &&
          (dock.contains(focused) || !overlaps(focusRect, dockRect))),
    };
  });

export const assertTogether = async (page, label) => {
  const shown = await layout(page);
  assert.equal(
    shown.newestShown,
    true,
    `${label}: newest entry on screen ${shown.geometry}`,
  );
  assert.deepEqual(shown.hiddenButtons, [], `${label}: actions on screen`);
  assert.equal(
    shown.focusShown,
    true,
    `${label}: focused ${shown.focus} on screen`,
  );
};

/** Runs one action by `click` and waits for its history entry. */
export async function act(page, label, click) {
  await settled(page, click);
  // The page moves focus once the action settles.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(resolve);
      }),
  );
  await assertTogether(page, label);
}

/** Runs `actionButton(page, action, target)` by `act`. */
export const explore = (page, action, target) =>
  act(page, `${action} ${target}`, () =>
    actionButton(page, action, target).click(),
  );

export const fightOn = (page) =>
  act(page, "fight", async () => {
    const attack = page.locator("#attack-controls button.attack:enabled");
    await (
      (await attack.count()) > 0
        ? attack.first()
        : page.locator('#feature-controls button[data-action="end-turn"]')
    ).click();
  });

export const say = (page, message) =>
  act(page, `message "${message}"`, async () => {
    await page.locator("#message").fill(message);
    await page.locator("#message").press("Enter");
  });

/**
 * Sets every element's font to Verdana, which is as wide as the Linux
 * fallback font CI renders with and wider than Windows' default.
 */
export const widenFont = (page) =>
  page.evaluate(() => {
    for (const node of document.querySelectorAll("*")) {
      node.style.fontFamily = "Verdana, sans-serif";
    }
  });

/**
 * Asserts the page does not scroll sideways; with `wideFont`, after
 * `widenFont`.
 */
export async function assertNoSideScroll(
  page,
  message = "no horizontal scroll",
  { wideFont = false } = {},
) {
  if (wideFont) {
    await widenFont(page);
  }
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    message,
  );
}
