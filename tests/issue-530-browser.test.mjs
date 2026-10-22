// #530, browser → API: the opponents waiting in a room get a card at the top
// of Here while their fight has not begun. Sneaked in unseen, it names each
// opponent with its icon, says "Hasn't seen you" and holds the room's only
// Ambush, which starts the fight with them surprised and gives way to the
// fight panel. Reacting, it shows the band in words and the band's options,
// and a parley that moves the band updates it. The card is stronger than
// the others, and nothing scrolls sideways.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { libraryAt, testFighterAt } from "../dist/test-fighter-5e.js";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";
import {
  actionButton,
  clickAction,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { BEA, beaLibrary } from "./fixtures/charismatic-fighter.mjs";
import { banditToll, ratRun } from "./fixtures/modules.mjs";

const WIDTHS = [
  { width: 1880, height: 1000 },
  { width: 1280, height: 760 },
  { width: 900, height: 560 },
];

/** The states `steps` reach on the browser server's first session of `seed`. */
function played(adventure, sheet, seed, steps) {
  const runtime = createFifthRuntime(adventure, sheet);
  const random = createSeededRandom(sessionSeed(seed, 1));
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  return steps.map((action) => {
    state = runtime.handleAction(state, action, random).state;
    return state;
  });
}

/** The first seed whose `steps` reach states `wanted` accepts. */
const seedFor = (adventure, sheet, steps, wanted) =>
  Array.from({ length: 200 }, (_, index) => index).find((seed) =>
    wanted(played(adventure, sheet, seed, steps)),
  );

/** The room's cards in order, and the opponents' card's parts. */
const cards = (page) =>
  page.evaluate(() => {
    const card = document.querySelector("#creatures li.opponents-card");
    return {
      first: document.querySelector("#room-things li.thing")?.className,
      card: card && {
        state: card.querySelector(".opponents-state").textContent,
        opponents: [...card.querySelectorAll(".opponent")].map((line) => ({
          name: line.querySelector(".opponent-name").textContent,
          icon: line
            .querySelector(".opponent-name")
            .previousElementSibling?.matches("svg.icon"),
          text: line.querySelector(".opponent-text")?.textContent,
        })),
        buttons: [...card.querySelectorAll("button.act")].map((button) => [
          button.dataset.action,
          button.dataset.target,
        ]),
      },
    };
  });

/** How strong a card looks: its border and its name's type. */
const looks = (page, card, name) =>
  page.evaluate(
    ([card, name]) => {
      const box = getComputedStyle(document.querySelector(card));
      const words = getComputedStyle(document.querySelector(name));
      return {
        border: Number.parseFloat(box.borderLeftWidth),
        color: box.borderLeftColor,
        size: Number.parseFloat(words.fontSize),
      };
    },
    [card, name],
  );

const sheet = testFighterAt(1);
const SNEAK = { type: "sneak", destinationId: "rat-cellar" };
const sneakSeed = seedFor(ratRun, sheet, [SNEAK], ([unseen]) =>
  Boolean(unseen.unseenBy),
);

test(
  `unseen, the rat's card says so and holds the only Ambush (seed ${sneakSeed})`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-530-unseen-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, JSON.stringify(libraryAt(1)));
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: sneakSeed,
      adventures: [ratRun],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport: WIDTHS[0] });
    page.setDefaultTimeout(8000);
    try {
      await page.goto(server.url);
      await page
        .locator("#characters button")
        .filter({ hasText: "Ada" })
        .click();
      await startAdventure(page, "rat-run");
      await clickAction(page, "sneak", "rat-cellar");

      const [fight] = ratRun.encounters;
      const [rat] = fight.opponents;
      const shown = await cards(page);
      assert.equal(shown.first, "thing opponents-card");
      assert.deepEqual(shown.card, {
        state: "Hasn't seen you",
        opponents: [{ name: rat.name, icon: true, text: rat.description }],
        buttons: [["ambush", "rat-cellar"]],
      });
      assert.equal(await actionButton(page, "ambush").count(), 1);
      assert.equal(await page.locator("#room-actions").innerText(), "");
      // Stronger than the other cards: a thicker danger-coloured edge and a
      // larger name.
      const strong = await looks(
        page,
        "li.opponents-card",
        "li.opponents-card .opponent-name",
      );
      const plain = await looks(
        page,
        "#exits li.thing",
        "#exits li.thing strong",
      );
      assert.ok(strong.border >= plain.border + 3, JSON.stringify(strong));
      assert.notEqual(strong.color, plain.color);
      assert.ok(strong.size > plain.size, JSON.stringify({ strong, plain }));
      for (const viewport of WIDTHS) {
        await page.setViewportSize(viewport);
        await assertNoSideScroll(page, `${viewport.width}: no side scroll`, {
          wideFont: viewport === WIDTHS.at(-1),
        });
      }
      await page.setViewportSize(WIDTHS[0]);

      // Ambush from the card: the fight begins with the rat surprised, and
      // the card gives way to the fight panel.
      await clickAction(page, "ambush", "rat-cellar");
      assert.match(await text(page.locator("#log li").last()), /ambush/iu);
      assert.equal(await page.locator("li.opponents-card").count(), 0);
      const foe = page.locator("#foe-cards li.foe-card");
      assert.equal(await foe.count(), 1);
      assert.match(await text(foe), new RegExp(rat.name, "u"));
      assert.equal(await foe.locator(".tag.surprised").count(), 1);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

/** Bea, with 2 gp in her purse. */
const RICH = { ...BEA, purse: 200 };
const MOVE = { type: "move", destinationId: "rat-cellar" };
const PERSUADE = { type: "react", option: "parley", approach: "persuasion" };
const bandOf = (state) => {
  const runtime = createFifthRuntime(banditToll, RICH);
  return runtime.projectRoom(state).waiting?.state;
};
// A seed where she is unfriendly and a parley makes her uncertain.
const parleySeed = seedFor(
  banditToll,
  RICH,
  [MOVE, PERSUADE],
  ([met, parleyed]) =>
    bandOf(met) === "unfriendly" && bandOf(parleyed) === "uncertain",
);

test(
  `reacting, the bandit's card shows her band and its options, and a parley moves it (seed ${parleySeed})`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-530-reacting-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, JSON.stringify(beaLibrary(RICH)));
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: parleySeed,
      adventures: [banditToll],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport: WIDTHS[1] });
    page.setDefaultTimeout(8000);
    try {
      await page.goto(server.url);
      await page
        .locator("#characters button")
        .filter({ hasText: "Bea" })
        .click();
      await startAdventure(page, "bandit-toll");
      await clickAction(page, "move", "rat-cellar");

      const [bandit] = banditToll.encounters[0].opponents;
      const met = await cards(page);
      assert.equal(met.first, "thing opponents-card");
      assert.deepEqual(met.card, {
        state: "Unfriendly",
        opponents: [
          { name: bandit.name, icon: true, text: bandit.description },
        ],
        buttons: [
          ["react", "attack"],
          ["react", "parley"],
          ["react", "parley"],
          ["react", "parley"],
          ["react", "toll"],
        ],
      });
      assert.deepEqual(
        await page.locator(".opponents-card .approach").allInnerTexts(),
        ["Persuasion DC 12", "Deception DC 14", "Intimidation DC 13"],
      );
      assert.equal(await page.locator("#room-actions").innerText(), "");
      await assertNoSideScroll(page, "no side scroll while reacting");

      // The parley moves her to uncertain: the tag follows, and no second
      // parley is offered.
      await page
        .locator(
          '.opponents-card button[data-action="react"][data-approach="persuasion"]',
        )
        .click();
      await page
        .locator(".opponents-state", { hasText: "Uncertain" })
        .waitFor();
      const parleyed = await cards(page);
      assert.deepEqual(parleyed.card.buttons, [
        ["react", "attack"],
        ["react", "toll"],
      ]);
      // Paying the toll ends it peacefully: the card is gone.
      await clickAction(page, "react", "toll");
      assert.equal(await page.locator("li.opponents-card").count(), 0);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
