// #520, browser → API: the room panel is where Ada acts. Each creature,
// item, feature and exit is one card, in the order Here, Items here, Look
// at, Ways on, with its name, description, what she found or was told there
// and its own buttons: Go (the primary button) and the door and trap
// actions on an exit, Examine on a feature, Take on an item, a button per
// topic under "Ask about" on a creature. A room-wide action (Search) sits in
// a row under the room's heading, and the way-out room's heading has "Way
// out · Leave", which asks first as before. The action bar keeps no
// exploring button; the fight's controls are still there. She plays the crypt with
// the cards alone, and the layout holds at every width.
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
import { moduleFile, room } from "./fixtures/modules.mjs";
import {
  createAndStart,
  fightTurn,
  settled,
  text,
} from "./fixtures/browser-journey.mjs";
import {
  assertNoSideScroll,
  firstFighter,
  launch,
} from "./fixtures/session-layout.mjs";

// The sealed crypt with a way out at its stair, where a potion lies in the
// open.
const openCrypt = (() => {
  const module = moduleFile("sealed-crypt");
  module.id = "open-crypt";
  module.title = "The Open Crypt";
  room(module, "crypt-stair").exit = true;
  room(module, "crypt-stair").items.push({
    id: "stair-potion",
    name: "Potion of Healing",
    description: "A stoppered vial of red liquid left on the bottom step.",
    kind: "potion-of-healing",
  });
  module.endings = [
    {
      id: "out-empty-handed",
      kind: "escape-without-loot",
      title: "Out empty-handed",
      text: "You climb back up the stair with nothing to show for it.",
    },
    ...module.endings,
  ];
  return validateModule(module);
})();

// Ada's way through, each a card's button.
const ROUTE = [
  ["examine", "carved-warning"],
  ["take", "stair-potion"],
  ["move", "hall"],
  ["talk", "warden"],
  ["search", "hall"],
];

/** A seed where Ada's search of the hall finds the dart trap. */
function findSeed() {
  const engine = {
    examine: (id) => ({ type: "examine", targetId: id }),
    take: (id) => ({ type: "take", itemId: id }),
    move: (id) => ({ type: "move", destinationId: id }),
    talk: (id) => ({ type: "talk", topicId: id }),
    search: (id) => ({ type: "search", roomId: id }),
  };
  for (let seed = 0; seed < 500; seed++) {
    const runtime = createFifthRuntime(openCrypt, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    let state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    for (const [action, id] of ROUTE) {
      state = runtime.handleAction(state, engine[action](id), random).state;
    }
    if (state.foundTrapIds.includes("dart-trap")) {
      return seed;
    }
  }
  throw new Error("No seed finds the dart trap.");
}

const WIDTHS = [
  { width: 1880, height: 1000 },
  { width: 1280, height: 760 },
  { width: 900, height: 560 },
];

/** No horizontal scroll on the page, in the scene or on any card. */
async function assertFits(page, when) {
  for (const viewport of WIDTHS) {
    await page.setViewportSize(viewport);
    await assertNoSideScroll(page, `${when}: no scroll at ${viewport.width}`);
    const over = await page.evaluate(() =>
      [
        "session-main",
        "session-scene",
        "room",
        ...[...document.querySelectorAll("#room li[data-id]")].map(
          (card) => card.closest("ul").id + "/" + card.dataset.id,
        ),
      ].filter((id) => {
        const [list, card] = id.split("/");
        const box =
          card === undefined
            ? document.getElementById(id)
            : document.querySelector(`#${list} li[data-id="${card}"]`);
        return box.scrollWidth > box.clientWidth + 1;
      }),
    );
    assert.deepEqual(
      over,
      [],
      `${when}: nothing overflows at ${viewport.width}`,
    );
  }
  await page.setViewportSize(WIDTHS[0]);
}

/**
 * Every action control on the page outside "You carry" and the rests: where
 * it sits (its card as list/id, the room-wide row, the heading, or the
 * action bar) and what it does.
 */
const placedActions = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("button.act")]
      .filter((button) => !button.closest("#inventory, #rest-group"))
      .map((button) => {
        const card = button.closest("#room li[data-id]");
        return {
          place: card
            ? card.closest("ul").id + "/" + card.dataset.id
            : button.closest("#room-actions")
              ? "room"
              : button.closest("#leave-controls")
                ? "heading"
                : button.closest("#action-bar")
                  ? "bar"
                  : "elsewhere",
          action: button.dataset.action,
          target: button.dataset.target,
        };
      }),
  );

/** A card's button for `action` on `target`. */
const cardButton = (page, list, id, action, target) =>
  page.locator(
    `#${list} li[data-id="${id}"] button.act[data-action="${action}"][data-target="${target}"]`,
  );

/** Clicks a card's button and waits for its settled history entry. */
const onCard = (page, list, id, action, target) =>
  settled(page, () => cardButton(page, list, id, action, target).click());

const focusedAction = (page) =>
  page.evaluate(() => ({
    action: document.activeElement.dataset.action,
    target: document.activeElement.dataset.target,
    newest: document.activeElement.matches("#log li.newest"),
  }));

test(
  "Ada explores the crypt from the room's cards, and the action bar keeps only the fight",
  { timeout: 180000 },
  async () => {
    const seed = findSeed();
    const directory = await mkdtemp(join(tmpdir(), "issue-520-browser-"));
    const server = await startFifthBrowserServer({
      adventures: [openCrypt],
      libraryPath: join(directory, "characters.json"),
      seed,
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport: WIDTHS[0] });
    page.setDefaultTimeout(8000);
    try {
      await createAndStart(page, server.url, "open-crypt");

      // The stair: the cards in order, each with its own buttons.
      assert.deepEqual(
        await page.locator("#room h4:visible").allTextContents(),
        ["Items here", "Look at", "Ways on"],
      );
      assert.deepEqual(await placedActions(page), [
        { place: "heading", action: "leave", target: "crypt-stair" },
        { place: "room", action: "search", target: "crypt-stair" },
        {
          place: "room-items/stair-potion",
          action: "take",
          target: "stair-potion",
        },
        {
          place: "room-items/stair-potion",
          action: "examine",
          target: "stair-potion",
        },
        {
          place: "features/carved-warning",
          action: "examine",
          target: "carved-warning",
        },
        { place: "exits/flooded-cell", action: "move", target: "flooded-cell" },
        {
          place: "exits/flooded-cell",
          action: "force",
          target: "swollen-door",
        },
        { place: "exits/hall", action: "move", target: "hall" },
      ]);
      // A card: its name and description, then its buttons; Go is primary.
      const hall = page.locator('#exits li[data-id="hall"]');
      assert.match(
        await text(hall),
        /^South: Hall of Niches — The passage into the dark\.\nGo$/u,
      );
      const go = cardButton(page, "exits", "hall", "move", "hall");
      assert.equal(
        await go.evaluate((b) => b.classList.contains("primary")),
        true,
      );
      assert.match(
        await go.getAttribute("aria-label"),
        /^Go south to Hall of Niches$/u,
      );
      // The shut door's way: Go greyed with its reason, and Force on its card.
      const cell = page.locator('#exits li[data-id="flooded-cell"]');
      assert.equal(
        await cardButton(
          page,
          "exits",
          "flooded-cell",
          "move",
          "flooded-cell",
        ).isDisabled(),
        true,
      );
      assert.match(await text(cell), /Swollen Door: shut\./u);
      assert.equal(
        await cardButton(
          page,
          "exits",
          "flooded-cell",
          "force",
          "swollen-door",
        ).getAttribute("aria-label"),
        "Force Swollen Door",
      );
      // The item's Stats are behind its toggle, as before; the search of the
      // room in the row under the heading.
      assert.equal(await text(page.locator("#room-actions")), "Search");
      await assertFits(page, "at the stair");

      // The way out: "Way out · Leave" asks first, and Stay comes back to it.
      const leave = page.locator("#leave-controls button");
      assert.equal(await text(leave), "Way out · Leave");
      assert.equal(
        await page.locator("#room-heading #leave-controls").count(),
        1,
      );
      await leave.click();
      assert.equal(await page.locator("#leave-confirm").isVisible(), true);
      assert.match(
        await text(page.locator("#leave-question")),
        /^Leave The Open Crypt\? This ends the adventure here as Out empty-handed/u,
      );
      assert.equal(await leave.isVisible(), false);
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "confirm-leave",
      );
      await page.locator("#cancel-leave").click();
      assert.equal(await page.locator("#leave-confirm").isVisible(), false);
      assert.equal(
        await page.evaluate(
          () => document.activeElement.closest("#leave-controls") !== null,
        ),
        true,
      );

      // Examining marks the card's button and shows the find on the card;
      // focus stays on the button.
      await onCard(
        page,
        "features",
        "carved-warning",
        "examine",
        "carved-warning",
      );
      const warning = page.locator('#features li[data-id="carved-warning"]');
      assert.match(
        await text(warning),
        /^Carved Warning — Words are cut into the stone above the passage\.\n✓ Examined\nYou found: The words read: "The warden keeps the tomb\. Mind the offerings\."$/u,
      );
      assert.deepEqual(await focusedAction(page), {
        action: "examine",
        target: "carved-warning",
        newest: false,
      });

      // Taking the potion moves it to "You carry"; focus goes to the result.
      await onCard(page, "room-items", "stair-potion", "take", "stair-potion");
      assert.equal(
        await page.locator('#room-items li[data-id="stair-potion"]').count(),
        0,
      );
      assert.equal(
        await page
          .locator(
            '#inventory li[data-id="stair-potion"] button.act[data-action="use"]',
          )
          .count(),
        1,
      );
      assert.deepEqual(await focusedAction(page), {
        action: undefined,
        target: undefined,
        newest: true,
      });

      // Going on by the exit's Go.
      await onCard(page, "exits", "hall", "move", "hall");
      assert.equal(await text(page.locator("#room-title")), "Hall of Niches");
      // No way out here.
      assert.equal(await page.locator("#leave-controls button").count(), 0);
      assert.equal(await page.locator("#leave-controls").isVisible(), false);
      assert.deepEqual(
        await page.locator("#room h4:visible").allTextContents(),
        ["Here", "Ways on"],
      );

      // The smuggler's card: "Ask about" and a button per topic.
      const smuggler = page.locator('#creatures li[data-id="smuggler"]');
      const ask = smuggler.locator(".ask-row");
      assert.equal(await text(ask.locator(".ask-label")), "Ask about");
      assert.equal(await ask.getAttribute("role"), "group");
      assert.equal(
        await ask.getAttribute("aria-label"),
        "Ask Bound Smuggler about",
      );
      assert.deepEqual(await ask.locator("button.act").allTextContents(), [
        "the warden",
        "the iron key",
      ]);
      await onCard(page, "creatures", "smuggler", "talk", "warden");
      // The reply on the card; the asked topic greyed out in place.
      assert.match(
        await text(smuggler),
        /About the warden: "I lifted the sarcophagus lid/u,
      );
      assert.equal(
        await cardButton(
          page,
          "creatures",
          "smuggler",
          "talk",
          "warden",
        ).isDisabled(),
        true,
      );
      assert.deepEqual(await focusedAction(page), {
        action: undefined,
        target: undefined,
        newest: true,
      });

      // The search from the row under the heading finds the dart trap: its
      // Disarm goes on the archway's card, beside its Go.
      await settled(page, () =>
        page.locator('#room-actions button.act[data-action="search"]').click(),
      );
      const archway = page.locator('#exits li[data-id="offering-room"]');
      assert.match(await text(archway), /Dart Trap: found, armed\./u);
      // Every action sits on its card or in the room's row, nothing in the
      // action bar: the door's Break on the strongroom's way, the tomb's Sneak
      // beside its Go.
      assert.deepEqual(await placedActions(page), [
        { place: "room", action: "search", target: "hall" },
        { place: "creatures/smuggler", action: "talk", target: "warden" },
        {
          place: "creatures/smuggler",
          action: "talk",
          target: "key-whereabouts",
        },
        { place: "exits/crypt-stair", action: "move", target: "crypt-stair" },
        { place: "exits/tomb", action: "move", target: "tomb" },
        { place: "exits/tomb", action: "sneak", target: "tomb" },
        {
          place: "exits/offering-room",
          action: "move",
          target: "offering-room",
        },
        { place: "exits/offering-room", action: "disarm", target: "dart-trap" },
        { place: "exits/strongroom", action: "move", target: "strongroom" },
        { place: "exits/strongroom", action: "break", target: "iron-door" },
      ]);
      await assertFits(page, "in the hall");

      // Into the tomb's fight: the room's cards have no buttons; the bar's
      // fight controls work as before.
      await onCard(page, "exits", "tomb", "move", "tomb");
      assert.equal(await page.locator("#room button.act").count(), 0);
      assert.ok((await page.locator("#action-bar button.act").count()) > 0);
      await fightTurn(page);
      await assertFits(page, "in the fight");
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
