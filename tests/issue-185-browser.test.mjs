// #185: while an action-bar request runs, the clicked button shows a busy
// label ("Examining…") and is named in full ("Examining Rusted Lantern…"),
// every other action is disabled, and the bar does not move. Afterwards the
// label returns and the #156 focus rule holds. Each request is held with a
// Playwright route so the busy state is observed deterministically.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { ratTunnels } from "./fixtures/modules.mjs";

// The rat tunnels, with the Giant Rat's fight; the server offers only them.
const FIXTURE_MODULES = {
  adventures: [ratTunnels],
  qualifies: () => true,
};

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

/** Holds the page's next POST to `path` until the returned function is called. */
async function holdRequests(page, path) {
  let open;
  const held = new Promise((resolve) => {
    open = resolve;
  });
  await page.route(
    `**${path}`,
    async (route) => {
      await held;
      await route.continue();
    },
    { times: 1 },
  );
  return open;
}

/** Every action button: its place, state and what it shows and is named. */
const bar = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#action-bar button")].map((button) => {
      const { x, y, width, height } = button.getBoundingClientRect();
      const label = button.querySelector("span");
      const busy = getComputedStyle(button, "::after");
      return {
        key: button.dataset.action + ":" + (button.dataset.target || ""),
        box: [x, y, width, height].map(Math.round),
        disabled: button.disabled,
        busy: button.getAttribute("aria-busy"),
        name: button.getAttribute("aria-label") || label.textContent,
        shows:
          getComputedStyle(label).visibility === "visible"
            ? label.textContent
            : busy.visibility === "visible"
              ? JSON.parse(busy.content)
              : "",
      };
    }),
  );

/**
 * Clicks the action button `selector` with its request to `path` held, checks
 * the busy state, then releases it and checks where focus went: "stays" on
 * the button (whose label has returned), or "newest" history entry.
 */
async function holdAction(page, selector, path, shows, name, focusTo) {
  const button = page.locator(selector);
  // Scrolled first, so the click's own scrolling doesn't move the bar: to the
  // page's end, where the dock rests below the scene. Playwright scrolls a
  // control in the sticky dock as if the page's scroll padding (the dock's
  // height) hid it, which a real click never does.
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const idle = await bar(page);
  const key =
    (await button.getAttribute("data-action")) +
    ":" +
    ((await button.getAttribute("data-target")) || "");
  const before = idle.find((entry) => entry.key === key);
  // The hidden busy label is not part of the idle accessible name.
  assert.equal(
    await page.getByRole("button", { name: before.name, exact: true }).count(),
    1,
  );
  const count = await page.locator("#log > li").count();
  const release = await holdRequests(page, path);
  await button.click();
  await page
    .locator(`${selector}[aria-busy="true"]`)
    .waitFor({ state: "attached" });

  const busy = await bar(page);
  const clicked = busy.find((entry) => entry.key === key);
  assert.deepEqual(
    { busy: clicked.busy, disabled: clicked.disabled, shows: clicked.shows },
    { busy: "true", disabled: true, shows },
  );
  assert.equal(clicked.name, name);
  assert.equal(
    await page.getByRole("button", { name, exact: true }).count(),
    1,
  );
  for (const entry of busy) {
    assert.equal(entry.disabled, true, `${entry.key} is disabled`);
  }
  // Nothing in the bar moves or resizes while the label shows.
  assert.deepEqual(
    busy.map(({ key, box }) => ({ key, box })),
    idle.map(({ key, box }) => ({ key, box })),
  );

  release();
  await page.waitForFunction(
    (seen) => document.querySelectorAll("#log > li").length > seen,
    count,
  );
  await page.waitForFunction(
    () => !document.querySelector("#session-actions [aria-busy]"),
  );
  const after = (await bar(page)).find((entry) => entry.key === key);
  // #156: focus stays on the clicked control while it is enabled, and
  // otherwise moves to the newest history entry.
  const focus = await page.evaluate(() => {
    const active = document.activeElement;
    return active.matches("#log > li.newest")
      ? "newest"
      : active.dataset.action + ":" + (active.dataset.target || "");
  });
  if (focusTo === "stays") {
    assert.deepEqual(
      { ...after, box: undefined },
      { ...before, box: undefined },
    );
    assert.equal(focus, key);
  } else {
    assert.ok(!after || after.disabled, `${key} is gone or disabled`);
    assert.equal(focus, "newest");
  }
}

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `action buttons show a busy label without moving the bar (${viewport.width}px)`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-185-"));
      const server = await startFifthBrowserServer({
        ...FIXTURE_MODULES,
        libraryPath: join(directory, "characters.json"),
        seed: 0,
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
        // Two daggers, so the fight row has the extra attack too (#207).
        await page.locator("#kit-two-daggers").check();
        await page
          .locator("#preview-body")
          .filter({ hasText: "Dagger (extra attack)" })
          .waitFor();
        await page.locator("#character-name").fill("Ada");
        await page.locator("#save-character").click();
        await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
        await page
          .locator('.start-adventure[data-adventure="rat-tunnels"]')
          .click();
        await page.locator("#log > li").first().waitFor();

        // Exploring: a short verb shows its own busy verb.
        await holdAction(
          page,
          '#explore-controls button[data-action="examine"][data-target="rusted-lantern"]',
          "/api/5e/session/explore",
          "Examining…",
          "Examining Rusted Lantern…",
          "stays",
        );
        await holdAction(
          page,
          '#explore-controls button[data-action="move"][data-target="rat-cellar"]',
          "/api/5e/session/explore",
          "Going…",
          "Going to Rat-Gnawed Cellar…",
          "newest",
        );

        // Fighting: no button is widened by its busy label, since the fight
        // row has no width to spare at 375 px (the same in any font).
        await page.locator("#attack-controls button").first().waitFor();
        assert.deepEqual(
          await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                "#attack-controls button, #feature-controls button",
              ),
            ]
              .map((button) => {
                const busy = button.dataset.busyLabel;
                const width = button.getBoundingClientRect().width;
                button.dataset.busyLabel = "";
                const idle = button.getBoundingClientRect().width;
                button.dataset.busyLabel = busy;
                return width > idle ? busy : "";
              })
              .filter(Boolean),
          ),
          [],
        );

        // End turn, a control without a target, then the attack.
        await holdAction(
          page,
          '#feature-controls button[data-action="end-turn"]',
          "/api/5e/session/action",
          "Ending",
          "Ending turn…",
          "stays",
        );
        const attack = page
          .locator('#attack-controls button[data-action="attack"]')
          .first();
        await attack.waitFor();
        const target = await attack.getAttribute("data-target");
        const opponent = (await attack.textContent()).replace(/^Attack /, "");
        await holdAction(
          page,
          `#attack-controls button[data-action="attack"][data-target="${target}"]`,
          "/api/5e/session/attack",
          "Attacking…",
          `Attacking ${opponent}…`,
          "newest",
        );
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
