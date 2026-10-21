// #507, browser → API → storage: the Settings page lists the loot and
// economy settings with their defaults marked. With starting coin 25 gp, a
// Fighter created in the page starts with 25 gp. On Scarce items found,
// treasure 150%, merchant prices × 2 and full buy-back, the adventure's
// potion in plain sight is missing (and still missing after a reload), the
// pedlar asks double and pays full price, and a found gem is worth half again.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { scarceItemIds } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { SETTINGS } from "../dist/settings-5e.js";
import {
  actionButton,
  createFighter,
  openShop,
  shopItem,
  startAdventure,
  trade,
} from "./fixtures/browser-journey.mjs";
import { findsYard } from "./fixtures/finds-yard.mjs";
import { explore, launch } from "./fixtures/session-layout.mjs";

/**
 * A browser seed whose first session misses the yard's potion but not its
 * dagger.
 */
function scarceSeed() {
  for (let seed = 0; seed < 1000; seed++) {
    const missing = scarceItemIds(findsYard, sessionSeed(seed, 1));
    if (missing.has("yard-potion") && !missing.has("yard-dagger")) {
      return seed;
    }
  }
  throw new Error("no seed misses the potion and keeps the dagger");
}

const choice = (page, id, value) =>
  page.locator(`[id="setting-${id}-${value}"]`);

/** Chooses `value` for setting `id` and waits for it to be saved. */
async function choose(page, id, value) {
  await choice(page, id, value).check();
  await page
    .locator("#feedback")
    .filter({ hasText: `${SETTINGS[id].name}: ` })
    .filter({ hasText: "Saved." })
    .waitFor();
}

test(
  "the loot settings give starting coin, leave out scarce items through a reload, raise treasure and change the pedlar's prices",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-507-browser-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: scarceSeed(),
      adventures: [findsYard],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await page.locator("#open-settings").click();
      await page.locator("#setting-startingCoin").waitFor();
      // Each new setting with its default marked and chosen.
      for (const [id, value, label] of [
        ["treasureFound", 100, "100% Default"],
        ["itemsFound", "normal", "Normal Default"],
        ["merchantPrices", 1, "× 1 Default"],
        ["merchantBuyBack", 50, "50% Default"],
        ["startingCoin", 0, "None Default"],
      ]) {
        assert.equal(
          await page.locator(`#setting-${id} legend`).textContent(),
          SETTINGS[id].name,
        );
        assert.equal(
          (
            await page
              .locator("label", { has: choice(page, id, value) })
              .textContent()
          ).trim(),
          label,
        );
        assert.equal(await choice(page, id, value).isChecked(), true);
      }
      await choose(page, "startingCoin", 25);
      await choose(page, "itemsFound", "scarce");
      await choose(page, "treasureFound", 150);
      await choose(page, "merchantPrices", 2);
      await choose(page, "merchantBuyBack", 100);
      const saved = JSON.parse(
        await readFile(join(directory, "settings.json"), "utf8"),
      ).settings;
      assert.equal(saved.itemsFound, "scarce");
      assert.equal(saved.startingCoin, 25);

      // A Fighter saved now starts with 25 gp.
      await page.goto(server.url);
      await createFighter(page);
      assert.equal(await page.locator("#sheet-purse").textContent(), "25 gp");

      await startAdventure(page, "finds-yard");
      assert.equal(await page.locator("#purse").textContent(), "Purse: 25 gp");
      // The potion in plain sight is missing.
      const potion = actionButton(page, "take", "yard-potion");
      assert.equal(await potion.count(), 0);

      // The handcart's 10 gp gem is worth half again.
      await explore(page, "examine", "handcart");
      await explore(page, "take", "cart-gem");
      assert.match(
        await page.locator('#inventory li[data-id="cart-gem"]').innerText(),
        /15 gp/,
      );
      // In the shop (#515) the pedlar asks double and pays full price.
      await openShop(page);
      assert.match(
        await page.locator("#shop-terms").textContent(),
        /Pedlar pays full price for gear/,
      );
      assert.equal(
        await shopItem(page, "buy", "dagger").textContent(),
        "Dagger, 4 gp",
      );
      assert.equal(
        await shopItem(page, "sell-equipped", "leather").textContent(),
        "Leather armour Worn, 10 gp",
      );
      await trade(page, "buy", "dagger");
      assert.equal(
        await page.locator("#shop-purse").textContent(),
        "Purse: 21 gp",
      );

      // A reload misses the same potion.
      await page.reload();
      await page.locator("#purse").filter({ hasText: "21 gp" }).waitFor();
      assert.equal(await potion.count(), 0);
      await explore(page, "examine", "woodpile");
      assert.equal(await actionButton(page, "take", "yard-dagger").count(), 1);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
