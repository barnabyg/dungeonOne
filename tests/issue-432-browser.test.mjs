// #432: from 1500 px wide the adventure screen has three columns, character,
// centre (the scene and the DM box) and history (#523), in that tab order,
// up to about 1880 px in all; the
// character column holds the status strip, "You carry" and the rests.
// "You carry" is a compact, grouped list, a line per entry with its verbs on
// the right. Narrower, the screen keeps two columns without scrolling
// sideways. Drinking a potion and resting work from the wide layout, through
// the server, and buying and selling from the shop (#515).
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
import { HAUL, packedBarrow } from "./fixtures/packed-barrow.mjs";
import {
  assertNoSideScroll,
  firstFighter,
  launch,
} from "./fixtures/session-layout.mjs";
import {
  actionButton,
  clickAction,
  createAndStart,
  fight,
  leaveShop,
  settled,
  shopItem,
  trade,
} from "./fixtures/browser-journey.mjs";
import { readAda } from "./fixtures/save-files.mjs";
import { endTurnOrFall } from "./fixtures/last-stand.mjs";

const WIDE = { width: 2560, height: 1300 };

/** Each column's box, and whether the scene holds the character's parts. */
const columns = (page) =>
  page.evaluate(() => {
    const box = (id) => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    };
    const scene = document.getElementById("session-scene");
    return {
      layout: box("session-layout"),
      scene: box("session-scene"),
      character: box("session-character"),
      composer: box("session-composer"),
      history: box("session-history"),
      status: box("session-status"),
      carry: box("inventory-group"),
      sceneHolds: ["inventory-group", "session-status", "rest-group"].filter(
        (id) => scene.contains(document.getElementById(id)),
      ),
    };
  });

/** The region of each Tab stop from the adventure title to the composer. */
async function tabRegions(page) {
  await page.locator("#adventure-title").focus();
  const regions = [];
  for (let step = 0; step < 80; step++) {
    await page.keyboard.press("Tab");
    const region = await page.evaluate(
      () =>
        document.activeElement.closest(
          "#session-scene, #session-character, #session-composer, #session-history",
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
}

const entry = (page, id) => page.locator(`#inventory li[data-id="${id}"]`);

test(
  'three columns at 2560 px, a compact grouped "You carry", and trades from the shop',
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-432-browser-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [packedBarrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport: WIDE });
    page.setDefaultTimeout(5000);
    page.on("dialog", (dialog) => {
      void dialog.dismiss();
      assert.fail(`unexpected browser dialog: ${dialog.message()}`);
    });
    try {
      await createAndStart(page, server.url, "packed-barrow");
      const wide = await columns(page);
      assert.ok(
        wide.layout.width >= 1780 && wide.layout.width <= 1900,
        `layout ${wide.layout.width} px wide`,
      );
      // The character's column is on the left (owner decision, 14 October
      // 2026).
      assert.ok(wide.character.right <= wide.scene.left, JSON.stringify(wide));
      assert.ok(wide.scene.right <= wide.history.left, JSON.stringify(wide));
      assert.ok(
        wide.composer.left === wide.scene.left &&
          wide.composer.right <= wide.history.left,
        JSON.stringify(wide),
      );
      assert.deepEqual(wide.sceneHolds, []);
      assert.ok(wide.status.left >= wide.character.left);
      assert.deepEqual(await tabRegions(page), [
        "session-character",
        "session-scene",
        // No AI DM, so the DM box is off and Tab passes it by.
        "session-history",
      ]);

      await clickAction(page, "examine", "scratched-lintel");
      for (const { id } of HAUL) {
        await clickAction(page, "take", id);
      }
      // Buy from the pedlar with the coin found: 15 entries in all.
      await trade(page, "buy", "dagger");
      await trade(page, "buy", "shield");
      await leaveShop(page);
      assert.deepEqual(
        await page
          .locator("#inventory .carry-group")
          .evaluateAll((groups) =>
            groups.map((group) => [
              group.querySelector(".carry-title").textContent,
              group.querySelectorAll("li[data-id]").length,
            ]),
          ),
        [
          ["Worn and wielded", 2],
          ["Consumables", 4],
          ["Treasure (7)", 7],
          ["Other", 2],
        ],
      );
      // Seven treasures start collapsed; opening them stays open.
      const treasure = page.locator('#inventory [data-group="treasure"]');
      assert.equal(await treasure.evaluate((node) => node.open), false);
      await treasure.locator(":scope > summary").click();
      // A line per entry, where a card was 77 px or more; an entry with
      // many verbs may take two.
      const heights = await page
        .locator("#inventory li[data-id]")
        .evaluateAll((items) =>
          items.map((item) => Math.round(item.getBoundingClientRect().height)),
        );
      assert.equal(heights.length, 15);
      assert.ok(
        heights.filter((height) => height <= 40).length >= 13 &&
          heights.every((height) => height <= 70),
        `entry heights ${heights}`,
      );

      // Each entry: icon, name and state; its description opens from its name.
      const mace = entry(page, "mace");
      assert.equal(await mace.locator("strong").textContent(), "Mace");
      assert.equal(await mace.locator(".carry-state").textContent(), "In hand");
      const potion = entry(page, "healing-potion-1");
      const text = potion.locator(".carry-text");
      assert.equal(await text.isVisible(), false);
      await potion.locator("summary").click();
      assert.equal(await text.isVisible(), true);
      assert.equal(
        await potion.locator("summary").getAttribute("title"),
        await text.textContent(),
      );

      // A disabled verb keeps its reason beside it, linked to it.
      const drink = actionButton(page, "use", "healing-potion-1");
      assert.equal(await drink.isDisabled(), true);
      const reason = await drink.getAttribute("aria-describedby");
      assert.equal(await page.locator(`#${reason}`).textContent(), "Full HP");

      // In the shop (#515), sell a gem, then the leather armour after
      // confirming, then the stowed dagger.
      await page.locator("#open-shop").click();
      await shopItem(page, "sell-treasure", "dull-garnet-1").click();
      const sell = actionButton(page, "sell-treasure", "dull-garnet-1");
      assert.equal(await sell.getAttribute("data-busy-label"), "Selling…");
      await trade(page, "sell-treasure", "dull-garnet-1");
      assert.equal(await entry(page, "dull-garnet-1").count(), 0);
      await shopItem(page, "sell-equipped", "leather").click();
      await actionButton(page, "sell-equipped", "leather").click();
      await page.locator("#shop-detail #sale-confirm").waitFor();
      await settled(page, () => page.locator("#confirm-sale").click());
      const leather = page.locator(
        '#inventory li[data-id="leather"][data-slot="equipped"]',
      );
      assert.equal(await leather.count(), 0);
      await trade(page, "sell", "dagger");
      assert.equal(await entry(page, "dagger").count(), 0);
      // Back in the room, the opened treasure and description stay open.
      await leaveShop(page);
      assert.equal(await treasure.evaluate((node) => node.open), true);
      assert.equal(await text.isVisible(), true);

      // Saved through the server: the library holds what is left after the
      // escape.
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      const ada = await readAda(libraryPath);
      assert.equal(
        ada.sheet.treasure.length,
        6,
        "four garnets and two art objects kept",
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

/**
 * A browser seed on which Ada takes the alcove's potion, wins the rat
 * cellar's fight and is still hurt after drinking it, so a rest restores HP.
 */
function hurtAfterPotionSeed() {
  const walk = [
    { type: "move", destinationId: "alcove" },
    { type: "examine", targetId: "iron-chest" },
    { type: "take", itemId: "healing-potion" },
    { type: "move", destinationId: "stair-foot" },
    { type: "move", destinationId: "rat-cellar" },
  ];
  for (let seed = 0; seed < 5000; seed++) {
    const runtime = createFifthRuntime(ratTunnels, firstFighter(seed));
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
          : endTurnOrFall(state),
      );
    }
    if (state.status !== "playing") {
      continue;
    }
    state = run(state, { type: "use-item", itemId: "healing-potion" });
    if (state.character.hp < runtime.projectRoom(state).character.maxHp) {
      return seed;
    }
  }
  throw new Error("no seed leaves Ada hurt after the potion");
}

const hp = async (page) =>
  Number(
    /^HP (\d+) of/u.exec(await page.locator("#character-hp").textContent())[1],
  );

test(
  "drink a potion and rest from the character column at 2560 px; two columns at 1400 and 900 px",
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-432-rest-"));
    const server = await startFifthBrowserServer({
      libraryPath: join(directory, "characters.json"),
      seed: hurtAfterPotionSeed(),
      adventures: [ratTunnels],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport: WIDE });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "rat-tunnels");
      await clickAction(page, "move", "alcove");
      await clickAction(page, "examine", "iron-chest");
      await clickAction(page, "take", "healing-potion");
      await clickAction(page, "move", "stair-foot");
      await clickAction(page, "move", "rat-cellar");
      await fight(page);

      const character = page.locator("#session-character");
      const hurt = await hp(page);
      await settled(page, () =>
        character
          .locator(
            'button.act[data-action="use"][data-target="healing-potion"]',
          )
          .click(),
      );
      const drunk = await hp(page);
      assert.ok(drunk > hurt, `${hurt} → ${drunk}`);
      await settled(page, () =>
        character.locator("#rest-controls button.act").click(),
      );
      assert.ok((await hp(page)) > drunk);

      // Narrower: two columns, the character's parts under the scene.
      for (const viewport of [
        { width: 1400, height: 900 },
        { width: 900, height: 560 },
      ]) {
        await page.setViewportSize(viewport);
        const narrow = await columns(page);
        assert.ok(
          narrow.carry.right <= narrow.history.left,
          `${viewport.width} px: ${JSON.stringify(narrow)}`,
        );
        assert.ok(narrow.layout.width <= 1240);
        await assertNoSideScroll(page, `${viewport.width} px`);
      }
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
