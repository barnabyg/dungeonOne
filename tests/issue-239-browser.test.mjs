// #239, browser → API → storage: find a gem under the barrow's bier, sell it
// to the pedlar at its full value, buy a shortsword with the coin, escape,
// and see the gear and the change on the sheet and in the saved library.
// The same journey ending in defeat in the ogre's den leaves the character's
// possessions and ledger exactly as they started.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { gemMarket } from "./fixtures/gem-market.mjs";
import {
  assertTogether,
  firstFighter,
  launch,
} from "./fixtures/session-layout.mjs";
import { createFighter, startAdventure } from "./fixtures/browser-journey.mjs";

/** A browser seed on which the first Ada wins the burial hall's fight. */
function winningSeed() {
  for (let seed = 0; seed < 500; seed++) {
    const runtime = createFifthRuntime(gemMarket, firstFighter(seed));
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

/**
 * Fights until the fight is over or the adventure ends: Attack, or End turn
 * once it is spent. Each round waits for the next thing to do, as the
 * ending can appear just after the result that caused it.
 */
async function fight(page) {
  const attack = page.locator("#attack-controls button.attack:enabled");
  const endTurn = page.locator(
    '#feature-controls button[data-action="end-turn"]:enabled',
  );
  const over = page.locator(
    "#ending:visible, #turn:text-is('The fight is over.')",
  );
  for (;;) {
    await attack.first().or(endTurn).or(over.first()).first().waitFor();
    if ((await over.count()) > 0) {
      return;
    }
    const count = await page.locator("#log li").count();
    await ((await attack.count()) > 0 ? attack.first() : endTurn).click();
    await page.waitForFunction(
      (seen) => document.querySelectorAll("#log li").length > seen,
      count,
    );
  }
}

const newest = (page) => page.locator("#log li").last().innerText();
const ada = async (libraryPath) =>
  JSON.parse(await readFile(libraryPath, "utf8")).characters[0];

/** What settling may change: the possessions and the ledger. */
const held = ({ equipment, stowed, treasure, purse, finds, xp, xpAwards }) => ({
  equipment,
  stowed,
  treasure,
  purse,
  finds,
  xp,
  xpAwards,
});

/**
 * Creates Ada, finds the opal, sells it to the pedlar and buys a shortsword
 * with the coin, then hands the page to `finish`.
 */
async function journey(seed, finish) {
  const directory = await mkdtemp(join(tmpdir(), "issue-239-browser-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({
    libraryPath,
    seed,
    adventures: [gemMarket],
    qualifies: () => true,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
  });
  page.setDefaultTimeout(5000);
  try {
    await page.goto(server.url);
    await createFighter(page);
    const start = (await ada(libraryPath)).sheet;
    await startAdventure(page, "lintel-barrow");
    assert.match(
      await page.locator('#creatures li[data-id="pedlar"]').innerText(),
      /Pays full value for gems and art objects\./,
    );

    await click(page, "move", "burial-hall");
    await fight(page);
    await click(page, "examine", "stone-bier");
    await click(page, "take", "blue-opal");
    const opal = page.locator('#inventory > li[data-id="blue-opal"]');
    assert.match(await opal.innerText(), /Blue Opal \(50 gp\)/);
    await click(page, "move", "barrow-mouth");

    // Sell sits on the opal's "You carry" entry, never in the action bar.
    assert.equal(
      await page
        .locator('#action-bar button[data-action="sell-treasure"]')
        .count(),
      0,
    );
    await click(page, "sell-treasure", "blue-opal");
    assert.equal(
      await newest(page),
      "You sell the blue opal to Pedlar for 50 gp. The trade takes 10 minutes. Purse: 50 gp.",
    );
    assert.equal(await opal.count(), 0);
    await click(page, "buy", "shortsword");
    assert.equal(await page.locator("#purse").textContent(), "Purse: 40 gp");
    await finish(page, libraryPath, start);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test(
  "sell a found gem, buy gear with the coin, escape, and keep the gear and the change",
  { timeout: 180000 },
  async () => {
    await journey(winningSeed(), async (page, libraryPath, start) => {
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#ending-kind").textContent(),
        "Escaped with loot",
      );

      const record = await ada(libraryPath);
      assert.equal(record.session, undefined);
      assert.deepEqual(record.sheet.stowed, [...start.stowed, "shortsword"]);
      assert.equal(record.sheet.purse, 4000);
      assert.deepEqual(record.sheet.treasure, []);
      // Sold, but found: the ledger keeps the find.
      assert.ok(record.sheet.finds.includes("lintel-barrow/blue-opal"));

      await page.locator("#ending-next").click();
      await page.locator("#sheet").waitFor({ state: "visible" });
      const sheet = await page.locator("#sheet-body").innerText();
      assert.match(sheet, /Carried: Shortsword/);
      assert.match(sheet, /Purse\n+40 gp/);
    });
  },
);

test(
  "sell a found gem and buy gear, then fall: the character is as it started",
  { timeout: 180000 },
  async () => {
    await journey(winningSeed(), async (page, libraryPath, start) => {
      await page
        .locator('button.act[data-action="move"][data-target="ogre-den"]')
        .click();
      await fight(page);
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#ending").getAttribute("data-kind"),
        "defeat",
      );
      const record = await ada(libraryPath);
      assert.equal(record.defeated, true);
      assert.deepEqual(held(record.sheet), held(start));
      // The sheet shows no bought shortsword, no opal and no coin.
      await page.locator("#ending-next").click();
      await page.locator("#sheet").waitFor({ state: "visible" });
      const sheet = await page.locator("#sheet-body").innerText();
      assert.doesNotMatch(sheet, /Carried: Shortsword|Blue Opal/);
      assert.match(sheet, /No treasure yet\./);
    });
  },
);
