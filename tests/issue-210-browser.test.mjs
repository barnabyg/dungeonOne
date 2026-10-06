// #210, browser → API → storage: loot 10 gp from the barrow goblin's body,
// buy a shortsword from the pedlar at the mouth, wield it, sell the mace and
// (after confirming in the panel) the leather armour, and escape: the sheet
// and the saved library hold the shortsword and the change. Then buy again
// and abandon: the sheet is exactly as it was.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { marketBarrow } from "./fixtures/market-barrow.mjs";
import {
  assertTogether,
  firstFighter,
  launch,
} from "./fixtures/session-layout.mjs";

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

/** Clicks an action control and waits for its result card. */
async function click(page, action, target) {
  const count = await page.locator("#log li").count();
  await page
    .locator(`button.act[data-action="${action}"][data-target="${target}"]`)
    .click();
  await page.waitForFunction(
    (seen) => document.querySelectorAll("#log li").length > seen,
    count,
  );
  // #154: the newest entry and the actions stay on screen together.
  await assertTogether(page, `${action} ${target}`);
}

/** Fights until the fight is over: Attack, or End turn once it is spent. */
async function fight(page) {
  while ((await page.locator("#turn").textContent()) !== "The fight is over.") {
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
}

const newest = (page) => page.locator("#log li").last().innerText();
const ada = async (libraryPath) =>
  JSON.parse(await readFile(libraryPath, "utf8")).characters[0];
const ware = (page, id) =>
  page.locator(`#creatures li[data-id="pedlar"] [data-ware="${id}"]`);

test(
  "buy a shortsword with looted coin, sell gear, escape and keep the change; abandon undoes a purchase",
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
      await page.goto(server.url);
      await page.locator("#open-creation").click();
      await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
      await page.locator("#character-name").fill("Ada");
      await page.locator("#save-character").click();
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      await page
        .locator('.start-adventure[data-adventure="robbers-barrow"]')
        .click();
      await page.locator("#adventure").waitFor({ state: "visible" });

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

      await click(page, "move", "burial-hall");
      await fight(page);
      await click(page, "examine", "barrow-goblin");
      await click(page, "take", "coin-pouch");
      assert.equal(await page.locator("#purse").textContent(), "Purse: 10 gp");
      await click(page, "move", "barrow-mouth");

      await click(page, "buy", "shortsword");
      assert.equal(
        await newest(page),
        "You buy the shortsword from the Pedlar for 10 gp and stow it. The trade takes 10 minutes. Your purse is empty.",
      );
      await click(page, "swap", "shortsword");
      // The mace, now stowed, sells at once for half its price.
      assert.match(
        await pedlar.innerText(),
        /Pays half price: Leather armour 5 gp, Shortsword 5 gp, Mace 2 gp 5 sp\./,
      );
      await click(page, "sell", "mace");
      assert.equal(
        await newest(page),
        "You sell the mace to the Pedlar for 2 gp 5 sp. The trade takes 10 minutes. Purse: 2 gp 5 sp.",
      );

      // Selling worn armour asks first, inside its "You carry" entry.
      const leather = page.locator(
        '#inventory > li[data-id="leather"][data-slot="equipped"]',
      );
      await leather.locator('button[data-action="sell-equipped"]').click();
      assert.equal(await page.locator("#sale-confirm").isVisible(), true);
      assert.equal(
        await page.locator("#sale-question").textContent(),
        "Sell the leather armour you are wearing to the Pedlar for 5 gp?",
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
        /^You spend 1 minute doffing the leather armour and sell it to the Pedlar for 5 gp\. The trade takes 10 minutes\. Purse: 7 gp 5 sp\. AC \d+; Shortsword /,
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
      let record = await ada(libraryPath);
      assert.equal(record.session, undefined);
      assert.deepEqual(record.sheet.equipment, ["shortsword"]);
      assert.deepEqual(record.sheet.stowed, []);
      assert.equal(record.sheet.purse, 750);
      await page.locator("#ending-next").click();
      await page.locator("#sheet").waitFor({ state: "visible" });
      const sheet = await page.locator("#sheet-body").innerText();
      assert.match(sheet, /Shortsword/);
      assert.match(sheet, /Purse\n+7 gp 5 sp/);

      // Buying again, then abandoning, leaves the sheet exactly as it was.
      const before = record.sheet;
      await page
        .locator('.start-adventure[data-adventure="robbers-barrow"]')
        .click();
      await page.locator("#adventure").waitFor({ state: "visible" });
      await click(page, "buy", "dagger");
      assert.equal(
        await page.locator("#purse").textContent(),
        "Purse: 5 gp 5 sp",
      );
      await page.locator('#breadcrumb a[data-view="sheet"]').click();
      await page.locator("#abandon-adventure").click();
      await page.locator("#confirm-abandon").click();
      await page
        .locator("#feedback")
        .filter({ hasText: "Ada abandoned The Robbers' Barrow." })
        .waitFor();
      record = await ada(libraryPath);
      assert.equal(record.session, undefined);
      assert.deepEqual(record.sheet, before);
      assert.match(
        await page.locator("#sheet-body").innerText(),
        /Purse\n+7 gp 5 sp/,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
