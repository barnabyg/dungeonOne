// #157: a trimmed room panel and initiative table. Empty room lists are left
// out, and a room with nothing in it says so in one line. In a fight the
// room's details stay shown, with the Fight section above them (#386). The
// initiative table shows totals, marks the current turn by highlighting its
// row and tagging the name, keeps the rolls and roll-offs in a disclosure,
// and collapses once the fight is over. The exploring side (short verbs,
// left-out empty lists) is checked in issue-214-browser.test.mjs.
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
  "#encounter",
  "#room",
  // The known rooms (#405) follow the room, then the character's column
  // (#432), which the status strip heads.
  "#known-rooms",
  "#session-status",
  "#session-actions",
  "#session-history",
  "#session-composer",
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
  `a fight with the room shown below it, and the table after it (${viewport.width}px)`,
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

      // In the fight, the room's details show with no disclosure (#386),
      // and no "None." rows render anywhere.
      assert.equal(await page.locator("#room-toggle").count(), 0);
      assert.equal(await page.locator("#room-description").isVisible(), true);
      assert.doesNotMatch(
        await page.locator("#session-scene").textContent(),
        /None\./,
      );
      // The fight starts on the first screen.
      const fightTop = (await page.locator("#encounter").boundingBox()).y;
      assert.ok(fightTop + 100 < viewport.height, String(fightTop));

      // A cellar with nothing in it shows one short line and no empty
      // lists.
      assert.equal(
        await page.locator("#room-empty").textContent(),
        "There is nothing else here.",
      );
      assert.equal(await page.locator("#room-empty").isVisible(), true);
      // No lists at all: what the character carries is in its own column
      // (#432).
      assert.deepEqual(
        await page.locator("#room h4:visible").allTextContents(),
        [],
      );
      assert.equal(await page.locator("#inventory-group").isVisible(), true);
      // Re-rendering after an action keeps the room shown, below the fight.
      await clickNext(page);
      assert.equal(await page.locator("#room-description").isVisible(), true);
      assert.deepEqual(await documentOrder(page, ["#room", "#encounter"]), [
        "#encounter",
        "#room",
      ]);

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
      // The roll-off seed's fight outlasts that first action.
      assert.equal(await fightOver(page), false, "the fight is still on");
      const current = page.locator("#initiative-rows tr.current");
      assert.equal(await current.count(), 1);
      assert.equal(await current.getAttribute("aria-current"), "true");
      assert.equal(await current.locator("th .tag.now").textContent(), "Now");

      // The rolls behind the totals, with the roll-off, open by keyboard.
      const breakdown = page.locator("#initiative-breakdown");
      assert.equal(await page.locator("#initiative-rolls").isVisible(), false);
      await tabTo(page, "#initiative-breakdown summary");
      await page.keyboard.press("Enter");
      assert.equal(await breakdown.evaluate((node) => node.open), true);
      const rolls = await page
        .locator("#initiative-rolls li")
        .allTextContents();
      assert.ok(
        rolls.some((roll) => /^Ada \(you\): d20 \d+ [+−] \d+ = \d+/.test(roll)),
        rolls.join("; "),
      );
      assert.ok(
        rolls.some((roll) => /, roll-off \d+(, \d+)*$/.test(roll)),
        rolls.join("; "),
      );

      while (!(await fightOver(page))) {
        await clickNext(page);
      }

      // After the fight: the room is back above the Fight section, and the
      // table is collapsed behind its own disclosure.
      assert.equal(await page.locator("#room-description").isVisible(), true);
      assert.deepEqual(await documentOrder(page, ["#encounter", "#room"]), [
        "#room",
        "#encounter",
      ]);
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

      // No disclosure: the initiative table sits above the exits and the
      // features, and all three are on screen without a click.
      assert.equal(await page.locator("#room-toggle").count(), 0);
      const table = await page.locator("#initiative").boundingBox();
      assert.ok(table, "the initiative table is shown");
      for (const selector of ["#exits-group", "#features-group"]) {
        const group = await page.locator(selector).boundingBox();
        assert.ok(group, selector + " is shown");
        assert.ok(table.y + table.height <= group.y, selector);
        assert.ok(group.y + group.height <= viewport.height, selector);
      }
      assert.match(await page.locator("#exits").textContent(), /Cellar Stair/);
      assert.match(await page.locator("#features").textContent(), /Ale Rack/);

      // DOM and tab order: Fight, room, known rooms, status, actions,
      // history, composer.
      assert.deepEqual(await documentOrder(page, REGIONS), REGIONS);
      const tabbed = await tabRegions(page);
      assert.deepEqual(
        tabbed,
        REGIONS.filter((region) => tabbed.includes(region)),
      );
      for (const region of [
        "#encounter",
        "#session-actions",
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
