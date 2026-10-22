// #157: a trimmed room panel. Empty room lists are left out, and a room with
// nothing in it says so in one line. In a fight the fight panel (#525) comes
// above the room (#386), which folds to its heading and one line naming its
// things; the turn order shows totals and marks the current turn, the rolls
// and roll-offs are in the history's arrival entry (#524), and the panel is
// gone once the fight is over. The exploring side (short verbs, left-out
// empty lists) is checked in issue-214-browser.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";

import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { loneGoblin, moduleFile } from "./fixtures/modules.mjs";
import { createAndStart } from "./fixtures/browser-journey.mjs";
import {
  assertNoSideScroll,
  firstFighter,
  launch,
  narratingDm,
} from "./fixtures/session-layout.mjs";

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
  const attack = page.locator("#encounter button.attack:enabled");
  await (
    (await attack.count()) > 0
      ? attack.first()
      : page.locator('#encounter button[data-action="end-turn"]')
  ).click();
  await page.waitForFunction(
    (seen) => document.querySelectorAll("#log li").length > seen,
    count,
  );
}

const fightOver = async (page) =>
  (await page.locator("#turn").textContent()) === "The fight is over.";

const rollOff = rollOffSeed();

/** The lone goblin's cellar with a feature and an exit to a second room. */
const furnishedCellar = (() => {
  const module = moduleFile("lone-goblin");
  module.id = "furnished-cellar";
  module.title = "The Furnished Cellar";
  module.rooms[0].features = [
    {
      id: "ale-rack",
      name: "Ale Rack",
      description: "A rack of split casks leans against the wall.",
    },
  ];
  module.rooms.push({
    id: "stair",
    name: "Cellar Stair",
    at: [0, -1],
    description: "Steep steps climb to the taproom.",
    features: [],
    items: [],
  });
  module.passages = [
    {
      id: "cellar-to-stair",
      between: ["cellar", "stair"],
      description: "Steep stone steps.",
    },
  ];
  return validateModule(module);
})();

/** The adventure screen's regions, in their order in a fight (#386). */
const REGIONS = [
  // The character's column (#432), which the status strip heads, comes first;
  // its "You carry" entries open to their stats (#504), and the Rest
  // section's "How resting works" opens in a fight too (#521).
  "#session-status",
  "#inventory-group",
  "#rest-group",
  // Then the centre (#523): the error and ending line, the fight panel
  // (#525), the room and the DM box; the history last.
  "#session-actions",
  "#encounter",
  "#room",
  "#session-composer",
  "#session-history",
];

/** `selectors` sorted by where each element sits in the document. */
const documentOrder = (page, selectors) =>
  page.evaluate(
    (list) =>
      list
        .map((selector) => [selector, document.querySelector(selector)])
        .sort(([, a], [, b]) =>
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : 1,
        )
        .map(([selector]) => selector),
    selectors,
  );

/** The regions keyboard focus passes through from the adventure title. */
async function tabRegions(page) {
  await page.locator("#adventure-title").focus();
  const seen = [];
  for (let step = 0; step < 60; step++) {
    await page.keyboard.press("Tab");
    const region = await page.evaluate(
      (regions) =>
        regions.find((selector) => document.activeElement.closest(selector)) ??
        null,
      REGIONS,
    );
    if (region === null) {
      break;
    }
    if (seen.at(-1) !== region) {
      seen.push(region);
    }
  }
  return seen;
}

const viewport = { width: 1280, height: 850 };
test(
  `a fight panel over the room, gone after the fight (${viewport.width}px)`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-157-"));
    const server = await startFifthBrowserServer({
      adventures: [loneGoblin],
      // Fixtures are engine material, not gated content: the gate is
      // tested in balance-5e.test.mjs (#310).
      qualifies: () => true,
      libraryPath: join(directory, "characters.json"),
      seed: rollOff,
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "lone-goblin");

      // In the fight the room's heading shows (#386), and no "None." rows
      // render anywhere.
      assert.equal(await page.locator("#room-toggle").count(), 0);
      assert.equal(await page.locator("#room-title").isVisible(), true);
      assert.doesNotMatch(
        await page.locator("#session-scene").textContent(),
        /None\./,
      );
      // The fight starts on the first screen.
      const fightTop = (await page.locator("#encounter").boundingBox()).y;
      assert.ok(fightTop + 100 < viewport.height, String(fightTop));
      // No lists at all: what the character carries is in its own column
      // (#432).
      assert.deepEqual(
        await page.locator("#room h4:visible").allTextContents(),
        [],
      );
      assert.equal(await page.locator("#inventory-group").isVisible(), true);
      // Re-rendering after an action keeps the room shown, below the fight.
      await clickNext(page);
      assert.equal(await page.locator("#room-title").isVisible(), true);
      assert.deepEqual(await documentOrder(page, ["#room", "#encounter"]), [
        "#encounter",
        "#room",
      ]);

      // The turn order: each initiative is the total, and the current turn
      // is marked. The roll-off seed's fight outlasts that first action.
      assert.equal(await fightOver(page), false, "the fight is still on");
      assert.equal(await page.locator("#initiative").count(), 0);
      const entries = await page
        .locator("#turn-order .turn-entry")
        .allTextContents();
      assert.equal(entries.length, 2);
      for (const entry of entries) {
        assert.match(entry, /^(Ada|Goblin Warrior) \d+( · your turn)?$/u);
      }
      const current = page.locator('#turn-order [aria-current="true"]');
      assert.equal(await current.count(), 1);
      assert.match(await current.textContent(), /^Ada \d+ · your turn$/u);
      // The rolls behind the totals, with the roll-off, are in the history
      // (#524).
      assert.match(
        await page.locator("#log").textContent(),
        /Initiative: .*roll-off \d+/u,
      );

      while (!(await fightOver(page))) {
        await clickNext(page);
      }

      // After the fight the panel is gone, and the room unfolds.
      assert.equal(await page.locator("#encounter").isHidden(), true);
      assert.equal(await page.locator("#room-title").isVisible(), true);
      assert.equal(await page.locator("#room-things").isVisible(), true);

      // No horizontal scroll, even with a wide font as CI's Linux one is.
      await assertNoSideScroll(page, "no horizontal scroll", {
        wideFont: true,
      });
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  `in a fight the Fight section comes before the room's exits and features (${viewport.width}px)`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-386-"));
    const server = await startFifthBrowserServer({
      adventures: [furnishedCellar],
      qualifies: () => true,
      // A DM, so the composer takes part in the tab order.
      dmModel: narratingDm(),
      libraryPath: join(directory, "characters.json"),
      seed: rollOff,
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "furnished-cellar");
      assert.equal(await fightOver(page), false, "the fight is on");

      // The fight panel (#525) sits above the room, which folds to its
      // heading and one line naming its features; the line opens them.
      // Scrolling the centre brings each group into view above the DM box.
      assert.equal(await page.locator("#room-toggle").count(), 0);
      const area = await page.locator("#session-main").boundingBox();
      const fold = page.locator("#room-fold");
      assert.equal(await fold.textContent(), "Ale Rack");
      assert.equal(await fold.getAttribute("aria-expanded"), "false");
      assert.equal(await page.locator("#features-group").isVisible(), false);
      await fold.click();
      assert.equal(await fold.getAttribute("aria-expanded"), "true");
      const table = await page.locator("#encounter").boundingBox();
      assert.ok(table, "the fight panel is shown");
      for (const selector of ["#exits-group", "#features-group"]) {
        const group = await page.locator(selector).boundingBox();
        assert.ok(group, selector + " is shown");
        assert.ok(table.y + table.height <= group.y, selector);
      }
      for (const selector of ["#exits-group", "#features-group"]) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        const seen = await page.locator(selector).boundingBox();
        assert.ok(
          seen.y >= area.y - 1 && seen.y + seen.height <= area.y + area.height,
          selector,
        );
      }
      await page.locator("#session-main").evaluate((main) => {
        main.scrollTop = 0;
      });
      assert.match(await page.locator("#exits").textContent(), /Cellar Stair/);
      assert.match(await page.locator("#features").textContent(), /Ale Rack/);

      // DOM and tab order: the character's column, the fight panel, room,
      // composer, history.
      assert.deepEqual(await documentOrder(page, REGIONS), REGIONS);
      const tabbed = await tabRegions(page);
      assert.deepEqual(
        tabbed,
        REGIONS.filter((region) => tabbed.includes(region)),
      );
      for (const region of [
        "#encounter",
        "#room",
        "#session-history",
        "#session-composer",
      ]) {
        assert.ok(tabbed.includes(region), tabbed.join(", "));
      }
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
