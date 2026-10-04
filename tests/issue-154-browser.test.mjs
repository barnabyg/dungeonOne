// #154: the adventure session keeps the newest conversation-history entry and
// the action buttons on screen together, at desktop and phone widths.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
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

const adventure = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "smugglers-cellar",
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
  return buildFighter(
    "a".repeat(32),
    "Ada",
    rollAbilitySet(createSeededRandom(stream)),
    DEFAULT_CHOICES,
  );
}

/** A seed where Ada wins the rat fight hurt, so she can drink the potion. */
function findSeed() {
  const walk = [
    { type: "move", destinationId: "alcove" },
    { type: "examine", targetId: "iron-chest" },
    { type: "take", itemId: "healing-potion" },
    { type: "move", destinationId: "stair-foot" },
    { type: "move", destinationId: "rat-cellar" },
  ];
  for (let seed = 0; seed < 5000; seed++) {
    const runtime = createFifthRuntime(adventure, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    const run = (state, action) =>
      runtime.handleAction(state, action, random).state;
    let state = run(runtime.createSession(), { type: "begin" });
    for (const action of walk) {
      state = run(state, action);
    }
    while (
      state.status === "playing" &&
      state.encounter.outcome === "ongoing"
    ) {
      state = run(
        state,
        runtime.attackTargets(state).length > 0
          ? { type: "attack", actorId: "pc", targetId: "giant-rat" }
          : { type: "end-turn", actorId: "pc" },
      );
    }
    if (
      state.status === "playing" &&
      state.character.hp < runtime.projectRoom(state).character.maxHp
    ) {
      return seed;
    }
  }
  throw new Error("no seed where Ada wins the rat fight hurt");
}

/** A scripted AI DM that answers every message with narration. */
const narratingDm = () => ({
  async respond() {
    return { text: "Dust drifts in the lamplight; nothing stirs." };
  },
});

/**
 * Where the newest history entry, the action buttons and the focused control
 * sit: each must be inside the window, and the entry inside the log's
 * scroll area, without the player scrolling.
 */
const layout = (page) =>
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

const assertTogether = async (page, label) => {
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
async function act(page, label, click) {
  const count = await page.locator("#log li").count();
  await click();
  await page.waitForFunction(
    (seen) => document.querySelectorAll("#log li").length > seen,
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

const explore = (page, action, target) =>
  act(page, `${action} ${target}`, () =>
    page
      .locator(
        `#action-bar button[data-action="${action}"][data-target="${target}"]`,
      )
      .click(),
  );

const fightOn = (page) =>
  act(page, "fight", async () => {
    const attack = page.locator("#attack-controls button.attack:enabled");
    await (
      (await attack.count()) > 0
        ? attack.first()
        : page.locator('#feature-controls button[data-action="end-turn"]')
    ).click();
  });

const say = (page, message) =>
  act(page, `message "${message}"`, async () => {
    await page.locator("#message").fill(message);
    await page.locator("#message").press("Enter");
  });

/** The region of each Tab stop from the adventure title to the composer. */
const tabRegions = async (page) => {
  await page.locator("#adventure-title").focus();
  const regions = [];
  for (let step = 0; step < 40; step++) {
    await page.keyboard.press("Tab");
    const region = await page.evaluate(
      () =>
        document.activeElement.closest(
          "#session-status, #session-scene, #session-actions, #session-history, #session-composer",
        )?.id,
    );
    if (!region) {
      break;
    }
    if (regions.at(-1) !== region) {
      regions.push(region);
    }
  }
  return regions;
};

const ORDER = [
  "session-status",
  "session-scene",
  "session-actions",
  "session-history",
  "session-composer",
];

/** Tab visits the regions in ORDER, including each of `expected`. */
function assertTabOrder(seen, expected) {
  const positions = seen.map((region) => ORDER.indexOf(region));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
    `tab order ${seen.join(", ")}`,
  );
  for (const region of expected) {
    assert.ok(seen.includes(region), `tab reaches ${region}: ${seen}`);
  }
}

/** The regions' columns and how the dock is placed, to compare reloads. */
const regions = (page) =>
  page.evaluate(() =>
    ["session-status", "session-scene", "session-dock"].map((id) => {
      const node = document.getElementById(id);
      const rect = node.getBoundingClientRect();
      return {
        id,
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        position: getComputedStyle(node).position,
      };
    }),
  );

const seed = findSeed();

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `actions and their results stay on screen together in the Smugglers' Cellar (${viewport.width}px)`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-154-"));
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
          .locator('.start-adventure[data-adventure="smugglers-cellar"]')
          .click();
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#log li").first().waitFor();
        await assertTogether(page, "start");

        let actions = 0;
        assertTabOrder(await tabRegions(page), [
          "session-actions",
          "session-history",
          "session-composer",
        ]);
        await explore(page, "examine", "rusted-lantern");
        await explore(page, "move", "alcove");
        await explore(page, "examine", "iron-chest");
        await say(page, "I look around the alcove");
        await explore(page, "take", "healing-potion");
        await explore(page, "examine", "healing-potion");
        await explore(page, "move", "stair-foot");
        await say(page, "I listen at the passage");
        await explore(page, "move", "rat-cellar");
        actions += 9;

        // Mid-fight: tab order and the skip link, then a reload keeps the
        // same layout with the newest entry shown.
        assertTabOrder(await tabRegions(page), [
          "session-actions",
          "session-history",
          "session-composer",
        ]);
        await page.evaluate(() => document.activeElement.blur());
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() => document.activeElement.className),
          "skip",
        );
        await page.keyboard.press("Enter");
        assert.equal(
          await page.evaluate(() => document.activeElement.id),
          "content",
        );
        const before = await regions(page);
        await page.reload();
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#attack-controls button").first().waitFor();
        assert.deepEqual(await regions(page), before);
        await assertTogether(page, "reload mid-fight");

        while (
          (await page.locator("#turn").textContent()) !== "The fight is over."
        ) {
          await fightOn(page);
          actions++;
        }
        await explore(page, "use", "healing-potion");
        actions++;

        // A reader who scrolled up keeps their place; the entry still
        // arrives in the live region.
        await page.locator("#log").evaluate((log) => {
          log.scrollTop = 0;
        });
        const count = await page.locator("#log li").count();
        await page
          .locator(
            '#action-bar button[data-action="examine"][data-target="gnawed-sacks"]',
          )
          .click();
        await page.waitForFunction(
          (seen) => document.querySelectorAll("#log li").length > seen,
          count,
        );
        actions++;
        assert.deepEqual(
          await page.locator("#log").evaluate((log) => ({
            scrollTop: log.scrollTop,
            live: log.getAttribute("aria-live"),
            newest: log.lastElementChild.textContent,
          })),
          {
            scrollTop: 0,
            live: "polite",
            newest: await page.locator("#log li").last().textContent(),
          },
        );
        assert.match(
          await page.locator("#log li").last().textContent(),
          /Gnawed Sacks/,
        );

        // Back at the bottom, it follows again.
        await page.locator("#log").evaluate((log) => {
          log.scrollTop = log.scrollHeight;
        });
        await say(page, "I catch my breath");
        await explore(page, "move", "den");
        await fightOn(page);
        actions += 3;
        assert.ok(actions >= 10, `${actions} actions`);

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
