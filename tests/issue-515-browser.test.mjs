// #515, browser → API → storage: a merchant's Trade opens the shop over the
// session area, the header bar kept. Its wares, the details of the item
// chosen, with the one Buy or Sell, and the pack, grouped by what the
// merchant pays; the purse, load and receipt line update after each trade,
// and each trade writes its usual history entry. Equipped gear asks first,
// Sell all treasure names its coin and minutes first, and Leave the shop or
// Esc returns to the room with focus on Trade. The layout holds from 1880 px
// down to the 900 × 560 floor. A band's reaction trade opens the same shop.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { HAUL, packedBarrow } from "./fixtures/packed-barrow.mjs";
import { banditToll } from "./fixtures/modules.mjs";
import { BEA, beaLibrary } from "./fixtures/charismatic-fighter.mjs";
import { act, assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";
import {
  actionButton,
  clickAction,
  createAndStart,
  leaveShop,
  openShop,
  settled,
  shopItem,
  startAdventure,
  trade,
} from "./fixtures/browser-journey.mjs";

const focusedId = (page) => page.evaluate(() => document.activeElement?.id);

/** Each pack group's heading and its rows' text. */
const packGroups = (page) =>
  page
    .locator("#shop-pack-groups .shop-group")
    .evaluateAll((groups) =>
      groups.map((group) => [
        group.querySelector("h5").textContent,
        [...group.querySelectorAll("li")].map((row) => row.textContent),
      ]),
    );

/** The boxes of the shop's three parts. */
const shopParts = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      ["shop-wares", "shop-details", "shop-pack"].map((id) => {
        const { left, right, top, bottom } = document
          .getElementById(id)
          .getBoundingClientRect();
        return [id.slice(5), { left, right, top, bottom }];
      }),
    ),
  );

test(
  "the shop takes over the session area: buy, sell with a question, sell all treasure, and back to the room",
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-515-browser-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [packedBarrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(5000);
    page.on("dialog", (dialog) => {
      void dialog.dismiss();
      assert.fail(`unexpected browser dialog: ${dialog.message()}`);
    });
    try {
      await createAndStart(page, server.url, "packed-barrow");

      // The pedlar's card has Trade, and no wares; nothing sells from
      // "You carry".
      const pedlar = page.locator('#creatures li[data-id="pedlar"]');
      const tradeButton = page.locator("#open-shop");
      assert.equal(await tradeButton.textContent(), "Trade");
      assert.equal(
        await tradeButton.getAttribute("aria-label"),
        "Trade with Pedlar",
      );
      assert.doesNotMatch(await pedlar.innerText(), /Shortsword|Pays/);
      assert.equal(
        await page.locator('#inventory button[data-action^="sell"]').count(),
        0,
      );

      // The shop replaces the session area; the header bar stays.
      await tradeButton.click();
      await page.locator("#shop").waitFor();
      assert.equal(await page.locator("#session-layout").isHidden(), true);
      assert.equal(await page.locator("#message").isHidden(), true);
      assert.equal(await page.locator("#open-map").isVisible(), true);
      assert.equal(await page.locator("#open-settings").isVisible(), true);
      assert.equal(await focusedId(page), "shop-title");
      // A shop's sign: the merchant's name and words, and its door's bell.
      assert.equal(
        await page.locator("#shop-title").textContent(),
        "Pedlar open for trade",
      );
      assert.equal(
        await page.locator("#shop-greeting").textContent(),
        "A weathered pedlar sits on a pack by the doorway, waiting out the rain.",
      );
      assert.deepEqual(
        (await page.evaluate(() => window.requestedSounds)).slice(-1),
        ["shop-bell"],
      );
      assert.equal(await page.locator(".shop-scene").isVisible(), true);
      assert.equal(
        await page.locator("#shop-terms").textContent(),
        "Each trade takes 10 minutes. Pedlar pays half price for gear and full value for gems and art objects.",
      );
      assert.equal(
        await page.locator("#shop-purse").textContent(),
        "Purse: empty",
      );
      assert.match(
        await page.locator("#shop-load").textContent(),
        /^Carrying \d+ lb of the \d+ lb your Strength allows\.$/u,
      );
      assert.deepEqual(
        await page.locator("#shop-ware-list li").allTextContents(),
        ["Shortsword, 10 gp", "Shield, 10 gp", "Dagger, 2 gp"],
      );

      // The first ware is chosen: its stats and comparison show directly,
      // and its Buy, disabled, says why.
      assert.equal(
        await shopItem(page, "buy", "shortsword").getAttribute("aria-pressed"),
        "true",
      );
      const details = page.locator("#shop-detail");
      assert.equal(
        await page.locator("#shop-item-name").textContent(),
        "Shortsword",
      );
      assert.match(
        await details.innerText(),
        /Price: 10 gp[\s\S]*If wielded: Shortsword[\s\S]*Now: Mace/u,
      );
      const buyShortsword = actionButton(page, "buy", "shortsword");
      assert.equal(await buyShortsword.innerText(), "Buy for 10 gp");
      assert.equal(
        await buyShortsword.getAttribute("aria-label"),
        "Buy Shortsword for 10 gp",
      );
      assert.equal(await buyShortsword.isDisabled(), true);
      assert.equal(
        await buyShortsword.getAttribute("aria-describedby"),
        "shop-reason",
      );
      assert.equal(
        await page.locator("#shop-reason").textContent(),
        "Too little coin",
      );
      assert.equal(await page.locator("#shop-purse-after").count(), 0);

      // The layout: three columns at 1280 and 1880 px, and at the 900 × 560
      // floor the details under the two lists; never a sideways scroll.
      for (const size of [
        { width: 1280, height: 850 },
        { width: 1880, height: 1000 },
      ]) {
        await page.setViewportSize(size);
        const parts = await shopParts(page);
        assert.ok(
          parts.wares.right <= parts.details.left &&
            parts.details.right <= parts.pack.left,
          `three columns at ${size.width} px: ${JSON.stringify(parts)}`,
        );
        await assertNoSideScroll(page, `no sideways scroll at ${size.width}`);
      }
      await page.setViewportSize({ width: 900, height: 560 });
      const narrow = await shopParts(page);
      assert.ok(
        narrow.wares.right <= narrow.pack.left &&
          narrow.details.top >= narrow.wares.bottom &&
          narrow.details.top >= narrow.pack.bottom,
        `details under the lists at 900 px: ${JSON.stringify(narrow)}`,
      );
      await assertNoSideScroll(page, "no sideways scroll at 900 px");
      await page.setViewportSize({ width: 1280, height: 850 });

      // Esc returns to the room, with focus on Trade.
      await page.keyboard.press("Escape");
      await page.locator("#session-layout").waitFor();
      assert.equal(await page.locator("#shop").isHidden(), true);
      assert.equal(await focusedId(page), "open-shop");

      await clickAction(page, "examine", "scratched-lintel");
      for (const { id } of HAUL) {
        await clickAction(page, "take", id);
      }

      // Buying updates the purse, the load and the receipt, and writes the
      // usual history entry; Buy keeps focus while it can buy again.
      await openShop(page);
      const load = await page.locator("#shop-load").textContent();
      // Buy says what it leaves in the purse.
      await shopItem(page, "buy", "dagger").click();
      assert.equal(
        await page.locator("#shop-purse-after").textContent(),
        "Purse after: 18 gp",
      );
      assert.equal(
        await actionButton(page, "buy", "dagger").getAttribute(
          "aria-describedby",
        ),
        "shop-purse-after",
      );
      await trade(page, "buy", "dagger");
      const receipt = page.locator("#shop-receipt");
      const bought =
        "You buy the dagger from Pedlar for 2 gp and stow it. The trade takes 10 minutes. Purse: 18 gp.";
      assert.equal(await receipt.textContent(), bought);
      assert.equal(await page.locator("#log li").last().textContent(), bought);
      assert.equal(
        await page.locator("#shop-purse").textContent(),
        "Purse: 18 gp",
      );
      assert.notEqual(await page.locator("#shop-load").textContent(), load);
      assert.equal(
        await page.evaluate(() => document.activeElement?.dataset.target),
        "dagger",
      );

      // The pack: treasure at its full value, gear at the buy-back price
      // marked worn or in hand, and what the pedlar doesn't buy.
      assert.deepEqual(await packGroups(page), [
        [
          "Treasure",
          [
            "Dull Garnet 1, 10 gp",
            "Dull Garnet 2, 10 gp",
            "Dull Garnet 3, 10 gp",
            "Dull Garnet 4, 10 gp",
            "Dull Garnet 5, 10 gp",
            "Silver Cup, 25 gp",
            "Silver Comb, 25 gp",
          ],
        ],
        [
          "Gear",
          [
            "Leather armour Worn, 5 gp",
            "Mace In hand, 2 gp 5 sp",
            "Dagger, 1 gp",
          ],
        ],
        [
          "Pedlar doesn't buy these",
          [
            "Potion of Healing",
            "Potion of Healing",
            "Potion of Healing",
            "Spell Scroll (Mage Armor)",
          ],
        ],
      ]);
      await page
        .locator(`#shop-pack-groups li[data-id="healing-potion-1"] button`)
        .click();
      assert.match(await details.innerText(), /Pedlar doesn't buy this\./u);
      assert.equal(await details.locator("button.act").count(), 0);

      // Equipped gear asks first, in the details; Esc keeps it.
      await shopItem(page, "sell-equipped", "leather").click();
      assert.match(
        await details.innerText(),
        /Pedlar pays 5 gp \(half price\)\./u,
      );
      const sellLeather = actionButton(page, "sell-equipped", "leather");
      await sellLeather.click();
      assert.equal(
        await page.locator("#shop-detail #sale-question").textContent(),
        "Sell the leather armour you are wearing to Pedlar for 5 gp?",
      );
      assert.equal(await focusedId(page), "confirm-sale");
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#sale-confirm").count(), 0);
      assert.equal(await page.locator("#shop").isVisible(), true);
      assert.equal(
        await page.evaluate(() => document.activeElement?.dataset.action),
        "sell-equipped",
      );
      await settled(page, async () => {
        await sellLeather.click();
        await page.locator("#confirm-sale").click();
      });
      assert.match(
        await receipt.textContent(),
        /^You spend 1 minute doffing the leather armour and sell it to Pedlar for 5 gp\. The trade takes 10 minutes\. Purse: 23 gp\./u,
      );
      assert.equal(
        await page.locator('#shop-pack-groups li[data-id="leather"]').count(),
        0,
      );
      assert.equal(await focusedId(page), "shop-receipt");

      // Sell all treasure names the coin and minutes, then sells each.
      const entries = await page.locator("#log li").count();
      await page.locator("#sell-all-treasure").click();
      assert.equal(
        await page.locator("#sell-all-question").textContent(),
        "Sell all 7 gems and art objects to Pedlar for 100 gp? Each trade takes 10 minutes: 70 minutes in all.",
      );
      assert.equal(await focusedId(page), "confirm-sell-all");
      await page.locator("#confirm-sell-all").click();
      await page
        .locator('#shop-pack-groups [data-shelf="treasure"]')
        .waitFor({ state: "detached" });
      await page.locator("#confirm-sell-all").waitFor({ state: "detached" });
      assert.equal(
        await receipt.textContent(),
        "You sell 7 gems and art objects to Pedlar for 100 gp. The trades take 70 minutes. Purse: 123 gp.",
      );
      assert.equal(await page.locator("#log li").count(), entries + 7);
      assert.match(
        await page.locator("#log li").nth(entries).textContent(),
        /^You sell the dull garnet 1 to Pedlar for 10 gp\./u,
      );
      assert.equal(
        await page.locator("#shop-purse").textContent(),
        "Purse: 123 gp",
      );

      // Leave the shop: the room again, focus on Trade, still no Sell.
      await leaveShop(page);
      assert.equal(await focusedId(page), "open-shop");
      assert.equal(await page.locator("#message").isVisible(), true);
      assert.equal(
        await page.locator('#inventory button[data-action^="sell"]').count(),
        0,
      );

      // The shop is page state: a reload returns to the room.
      await openShop(page);
      await page.reload();
      await page.locator("#log li").first().waitFor();
      assert.equal(await page.locator("#session-layout").isVisible(), true);
      assert.equal(await page.locator("#shop").isHidden(), true);
      // Saved through the server: the reloaded session holds the coin.
      assert.equal(await page.locator("#purse").textContent(), "Purse: 123 gp");
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

/** Bea, with 2 gp in her purse. */
const RICH = { ...BEA, purse: 200 };

/** The bandit's band as the library's first session meets her. */
function firstBand(seed) {
  const runtime = createFifthRuntime(banditToll, RICH);
  const random = createSeededRandom(sessionSeed(seed, 1));
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  return runtime.handleAction(
    begun,
    { type: "move", destinationId: "rat-cellar" },
    random,
  ).state.reactions[0]?.roll.band;
}

// A seed whose first session meets the bandit willing to trade.
const TRADING = ["indifferent", "friendly"];
const seed = Array.from({ length: 200 }, (_, index) => index).find(
  (candidate) => TRADING.includes(firstBand(candidate)),
);

test(
  `the bandit's reaction trade opens the same shop and returns to the reaction (seed ${seed})`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-515-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, JSON.stringify(beaLibrary(RICH)));
    const server = await startFifthBrowserServer({
      libraryPath,
      seed,
      adventures: [banditToll],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 900, height: 560 },
    });
    page.setDefaultTimeout(8000);
    try {
      await page.goto(server.url);
      await page
        .locator("#characters button")
        .filter({ hasText: "Bea" })
        .click();
      await startAdventure(page, "bandit-toll");
      await act(page, "reaction", () =>
        actionButton(page, "move", "rat-cellar").click(),
      );

      await page.locator("#open-shop").click();
      await page.locator("#shop").waitFor();
      assert.equal(
        await page.locator("#shop-title").textContent(),
        "Bandit open for trade",
      );
      await trade(page, "buy", "dagger");
      assert.match(
        await page.locator("#shop-receipt").textContent(),
        /^You buy the dagger from Bandit for 2 gp and stow it\./u,
      );
      await assertNoSideScroll(page, "no sideways scroll at 900 px");

      // Trading ended nothing: the reaction's options are back with Trade.
      await leaveShop(page);
      assert.equal(await focusedId(page), "open-shop");
      assert.ok(
        (await page
          .locator('#room-actions button[data-action="react"]')
          .count()) > 0,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
