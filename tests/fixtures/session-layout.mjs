// Shared by the 5e browser journeys that check #154: after each action, the
// newest history entry and the action buttons are on screen together.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import {
  buildFighter,
  defaultPlacement,
  rollAbilitySet,
} from "../../dist/fighter-5e.js";
import { createSeededRandom } from "../../dist/random.js";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
export const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

// The creation screen's default choices; the placement follows the dice.
const DEFAULT_CHOICES = {
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
};

/** The first Fighter a browser on `seed` creates with the default choices. */
export function firstFighter(seed) {
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
      // A button in a list that scrolls inside the dock (#209) is reached
      // by scrolling that list, so the list must be on screen.
      hiddenButtons: buttons
        .filter((button) => {
          const list = button.closest("#explore-controls");
          const scrolls =
            list !== null && list.scrollHeight > list.clientHeight;
          return !inWindow((scrolls ? list : button).getBoundingClientRect());
        })
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
  const count = await page.locator("#log li").count();
  await click();
  await page.waitForFunction(
    (seen) =>
      document.querySelectorAll("#log li:not([data-pending])").length > seen,
    count,
  );
  // The page moves focus once the action settles.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(resolve);
      }),
  );
  await assertTogether(page, label);
}

// An action on a target: in the action bar, or on a carried item (#198).
export const explore = (page, action, target) =>
  act(page, `${action} ${target}`, () =>
    page
      .locator(`button.act[data-action="${action}"][data-target="${target}"]`)
      .click(),
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
