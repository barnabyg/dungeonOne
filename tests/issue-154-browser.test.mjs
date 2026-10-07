// #154: the adventure session keeps the newest conversation-history entry and
// the action buttons on screen together, at desktop and phone widths.
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
import {
  assertTogether,
  explore,
  fightOn,
  firstFighter,
  launch,
  narratingDm,
  say,
} from "./fixtures/session-layout.mjs";

// The rat tunnels, with the Giant Rat's fight; the server offers only them.
const adventure = ratTunnels;
const FIXTURE_MODULES = { adventures: [adventure], qualifies: () => true };

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
    `actions and their results stay on screen together in the rat tunnels (${viewport.width}px)`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-154-"));
      const server = await startFifthBrowserServer({
        ...FIXTURE_MODULES,
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
          .locator('.start-adventure[data-adventure="rat-tunnels"]')
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
          (seen) =>
            document.querySelectorAll("#log li:not([data-pending])").length >
            seen,
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
        // Wait for the scroll event: a player can't scroll and send in the
        // same frame, and the page learns the position from that event.
        await page.locator("#log").evaluate(
          (log) =>
            new Promise((resolve) => {
              log.addEventListener("scroll", resolve, { once: true });
              log.scrollTop = log.scrollHeight;
            }),
        );
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
