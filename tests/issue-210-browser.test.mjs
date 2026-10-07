// #210, browser → API → storage: loot 10 gp from the barrow goblin's body,
// buy a shortsword from the pedlar at the mouth, wield it, sell the mace and
// (after confirming in the panel) the leather armour, and escape: the sheet
// and the saved library hold the shortsword and the change. Abandoning
// after a purchase is checked in issue-211-browser.test.mjs.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { marketBarrow } from "./fixtures/market-barrow.mjs";
import { explore, firstFighter, launch } from "./fixtures/session-layout.mjs";
import { createAndStart, fight } from "./fixtures/browser-journey.mjs";
import { readAda } from "./fixtures/save-files.mjs";

/** A browser seed on which the first Ada wins the burial hall's fight. */
function winningSeed() {
  for (let seed = 0; seed < 500; seed++) {
    const runtime = createFifthRuntime(marketBarrow, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    const run = (state, action) =>
      runtime.handleAction(state, action, random).state;
    let state = run(runtime.createSession(), { type: "begin" });
    state = run(state, { type: "move", destinationId: "burial-hall" });
    while (state.encounter?.outcome === "ongoing") {
      state = run(
        state,
        runtime.attackTargets(state).length > 0
          ? { type: "attack", actorId: "pc", targetId: "barrow-goblin" }
          : { type: "end-turn", actorId: "pc" },
      );
    }
    if (state.status === "playing") {
      return seed;
    }
  }
  throw new Error("no seed wins the burial hall");
}

const newest = (page) => page.locator("#log li").last().innerText();
const ware = (page, id) =>
  page.locator(`#creatures li[data-id="pedlar"] [data-ware="${id}"]`);

test(
  "buy a shortsword with looted coin, sell gear, escape and keep the change",
  { timeout: 180000 },
  async () => {
    const seed = winningSeed();
    const directory = await mkdtemp(join(tmpdir(), "issue-210-browser-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      libraryPath,
      seed,
      adventures: [marketBarrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    // Confirmations are in the panel: a browser dialog fails the test.
    page.on("dialog", (dialog) => {
      void dialog.dismiss();
      assert.fail(`unexpected browser dialog: ${dialog.message()}`);
    });
    try {
      await createAndStart(page, server.url, "lintel-barrow");

      // The pedlar's wares, priced by the engine; Ada has no coin yet.
      const pedlar = page.locator('#creatures li[data-id="pedlar"]');
      assert.match(
        await pedlar.innerText(),
        /Each trade takes 10 minutes\.[\s\S]*Shortsword — 10 gp[\s\S]*Shield — 10 gp[\s\S]*Dagger — 2 gp/,
      );
      const buyShortsword = ware(page, "shortsword").locator("button");
      assert.equal(
        await buyShortsword.getAttribute("aria-label"),
        "Buy Shortsword",
      );
      assert.equal(await buyShortsword.isDisabled(), true);
      assert.match(
        await ware(page, "shortsword").innerText(),
        /Too little coin/,
      );
      // Buying is not in the action bar.
      assert.equal(
        await page.locator('#action-bar button[data-action="buy"]').count(),
        0,
      );

      await explore(page, "move", "burial-hall");
      await fight(page);
      await explore(page, "examine", "barrow-goblin");
      await explore(page, "take", "coin-pouch");
      assert.equal(await page.locator("#purse").textContent(), "Purse: 10 gp");
      await explore(page, "move", "barrow-mouth");

      await explore(page, "buy", "shortsword");
      assert.equal(
        await newest(page),
        "You buy the shortsword from Pedlar for 10 gp and stow it. The trade takes 10 minutes. Your purse is empty.",
      );
      await explore(page, "swap", "shortsword");
      // The mace, now stowed, sells at once for half its price.
      assert.match(
        await pedlar.innerText(),
        /Pays half price: Leather armour 5 gp, Shortsword 5 gp, Mace 2 gp 5 sp\./,
      );
      await explore(page, "sell", "mace");
      assert.equal(
        await newest(page),
        "You sell the mace to Pedlar for 2 gp 5 sp. The trade takes 10 minutes. Purse: 2 gp 5 sp.",
      );

      // Selling worn armour asks first, inside its "You carry" entry.
      const leather = page.locator(
        '#inventory > li[data-id="leather"][data-slot="equipped"]',
      );
      await leather.locator('button[data-action="sell-equipped"]').click();
      assert.equal(await page.locator("#sale-confirm").isVisible(), true);
      assert.equal(
        await page.locator("#sale-question").textContent(),
        "Sell the leather armour you are wearing to Pedlar for 5 gp?",
      );
      assert.equal(
        await page.evaluate(() => document.activeElement?.id),
        "confirm-sale",
      );
      await page.locator("#cancel-sale").click();
      assert.equal(await page.locator("#sale-confirm").count(), 0);
      assert.equal(
        await page.evaluate(() => document.activeElement?.dataset.action),
        "sell-equipped",
      );
      await leather.locator('button[data-action="sell-equipped"]').click();
      const count = await page.locator("#log li").count();
      await page.locator("#confirm-sale").click();
      await page.waitForFunction(
        (seen) => document.querySelectorAll("#log li").length > seen,
        count,
      );
      assert.match(
        await newest(page),
        /^You spend 1 minute doffing the leather armour and sell it to Pedlar for 5 gp\. The trade takes 10 minutes\. Purse: 7 gp 5 sp\. AC \d+; Shortsword /,
      );
      assert.equal(await page.locator("#sale-confirm").count(), 0);
      assert.equal(
        await page.locator("#purse").textContent(),
        "Purse: 7 gp 5 sp",
      );

      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#ending-kind").textContent(),
        "Escaped with loot",
      );

      // Storage and the sheet hold the shortsword and the change.
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.deepEqual(record.sheet.equipment, ["shortsword"]);
      assert.deepEqual(record.sheet.stowed, []);
      assert.equal(record.sheet.purse, 750);
      await page.locator("#ending-next").click();
      await page.locator("#sheet").waitFor({ state: "visible" });
      const sheet = await page.locator("#sheet-body").innerText();
      assert.match(sheet, /Shortsword/);
      assert.match(sheet, /Purse\n+7 gp 5 sp/);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
