// #211, browser → API → storage: the increment 12 player handoff on seed 0.
// Ada, made with the default choices (the mace kit), plays The Tinker's
// Toll: finds coin and a shield at the ford, equips it, buys a dagger and
// wields it in the tower fight, then buys a shortsword, sells the mace and
// the dagger and walks out with her purchases. Abandoning a second run
// after buying and dropping gear leaves her exactly as she was.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { launch } from "./fixtures/session-layout.mjs";
import {
  clickAction,
  fight,
  openCreation,
  saveFighter,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { readAda } from "./fixtures/save-files.mjs";

/** The handoff's seed: Ada survives the toll taking exactly these steps. */
const SEED = 0;

const newest = (page) => text(page.locator("#log li").last());
const merrow = (page) => page.locator('#creatures li[data-id="merrow"]');
const ware = (page, id) => merrow(page).locator(`[data-ware="${id}"]`);

test(
  "the toll handoff: find coin and a shield, wield a bought dagger in a fight, trade, escape with purchases, and abandon without loss",
  { timeout: 240000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-211-browser-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: SEED,
      // shipped-modules.test.mjs gates every shipped module; skip it here.
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(8000);
    try {
      await page.goto(server.url);
      await openCreation(page);
      assert.equal(await page.locator("#kit-mace").isChecked(), true);
      // Each kit's numbers for these rolls, before choosing one.
      assert.match(
        await text(page.locator("#kits")),
        /Mace and leather\nLeather armour, Mace \(15 gp\)\. AC 13; Mace \+6 to hit, 1d6 \+ 4 bludgeoning, Sap\.\nTwo daggers and leather\nLeather armour, Dagger, Dagger \(14 gp\)\. AC 13; Dagger \+6 to hit, 1d4 \+ 4 piercing; then Dagger \+6 to hit, 1d4 piercing, Nick as an extra attack\.\nClub, dagger and leather\nLeather armour, Club, Dagger \(12 gp 1 sp\)\. AC 13; Club \+6 to hit, 1d4 \+ 4 bludgeoning; then Dagger \+6 to hit, 1d4 piercing, Nick as an extra attack\./u,
      );
      await saveFighter(page);
      assert.match(
        await text(page.locator("#sheet-body")),
        /^Level 1 Fighter · 0 XP \(level 2 at 300\) · Leather armour, Mace\n[\s\S]*HP: 13\/13\nAC: 13\n[\s\S]*Mace: \+6 to hit, 1d6 \+ 4 bludgeoning, Sap/u,
      );
      await startAdventure(page, "tinkers-toll");

      await clickAction(page, "examine", "offering-bowl");
      assert.match(await newest(page), /The bowl is empty/);
      await clickAction(page, "move", "tinkers-cart");
      // Merrow's wares at the engine's prices; Ada has no coin yet.
      assert.match(
        await text(merrow(page)),
        /Each trade takes 10 minutes\.\nDagger — 2 gp\nBuy\nToo little coin\nShortsword — 10 gp[\s\S]*Chain shirt — 50 gp\nBuy\nToo little coin\nPays half price: Leather armour 5 gp, Mace 2 gp 5 sp\./u,
      );
      await clickAction(page, "talk", "the-ford");
      assert.match(await newest(page), /His shield's still out in the reeds/);

      await clickAction(page, "move", "ford");
      assert.match(
        await newest(page),
        /Initiative: Wolf 11 \+ 2 = 13; Ada 12 \+ 1 = 13\./,
      );
      await fight(page);
      const wolfFight = await text(page.locator("#log"));
      assert.match(wolfFight, /Wolf has 6\/11 HP\.[^]*Wolf is sapped/u);
      assert.match(
        wolfFight,
        /Wolf attacks Ada with Bite, at disadvantage \(Sap\)[^\n]*Miss\./u,
      );
      assert.match(await newest(page), /Wolf has 0\/11 HP\./);
      await clickAction(page, "examine", "reeds");
      await clickAction(page, "take", "reed-shield");
      await clickAction(page, "take", "traveller-purse");
      assert.equal(
        await page.locator("#purse").textContent(),
        "Purse: 3 gp 5 sp",
      );
      await clickAction(page, "equip", "shield");
      assert.equal(
        await newest(page),
        "You strap the shield to your arm. AC 15; Mace +6 to hit, 1d6 + 4 bludgeoning.",
      );

      await clickAction(page, "move", "tinkers-cart");
      assert.match(await text(ware(page, "shortsword")), /Too little coin/);
      assert.match(
        await text(merrow(page)),
        /Pays half price: Leather armour 5 gp, Shield 5 gp, Mace 2 gp 5 sp\./,
      );
      await clickAction(page, "buy", "dagger");
      assert.equal(
        await newest(page),
        "You buy the dagger from Merrow the Tinker for 2 gp and stow it. The trade takes 10 minutes. Purse: 1 gp 5 sp.",
      );

      await clickAction(page, "move", "ford");
      await clickAction(page, "move", "toll-tower");
      assert.match(
        await newest(page),
        /Initiative: Young Bandit 16 \+ 1 = 17; Scarred Bandit 13 \+ 1 = 14; Ada 4 \+ 1 = 5\./,
      );
      // Drawing the dagger in the fight takes the object interaction only.
      await clickAction(page, "swap", "dagger");
      assert.equal(
        await newest(page),
        "You stow the mace and wield the dagger, using your object interaction. AC 15; Dagger +6 to hit, 1d4 + 4 piercing.\nIt is still your turn: you can attack or end your turn.",
      );
      await fight(page);
      const towerFight = await text(page.locator("#log"));
      for (const line of [
        /Young Bandit has 4\/11 HP\./,
        // The scarred bandit holds its nerve when the young one falls (#237).
        /Young Bandit is defeated\.\nScarred Bandit checks morale as the first of its side falls: a Wisdom saving throw, 13 \+ 0 = 13 against DC 8\. Success: it stands its ground\./,
        /Scarred Bandit has 5\/11 HP\./,
        /Scarred Bandit attacks Ada with Scimitar: 3 \+ 3 = 6 against AC 15\. Miss\./,
      ]) {
        assert.match(towerFight, line);
      }
      assert.match(await newest(page), /Scarred Bandit is defeated\./);
      assert.match(
        await text(page.locator("#room")),
        /Dagger — In hand\.\nMace — Carried, not equipped\./,
      );
      await clickAction(page, "examine", "strongbox");
      await clickAction(page, "take", "toll-seal");
      await clickAction(page, "examine", "scarred-bandit");
      await clickAction(page, "take", "bandit-purse");
      assert.equal(
        await page.locator("#purse").textContent(),
        "Purse: 12 gp 5 sp",
      );

      await clickAction(page, "move", "ford");
      await clickAction(page, "move", "tinkers-cart");
      assert.match(await text(ware(page, "chain-shirt")), /Too little coin/);
      await clickAction(page, "buy", "shortsword");
      await clickAction(page, "swap", "shortsword");
      assert.equal(
        await newest(page),
        "You stow the dagger and wield the shortsword. AC 15; Shortsword +6 to hit, 1d6 + 4 piercing.",
      );
      await clickAction(page, "sell", "mace");
      assert.equal(
        await newest(page),
        "You sell the mace to Merrow the Tinker for 2 gp 5 sp. The trade takes 10 minutes. Purse: 5 gp.",
      );
      await clickAction(page, "sell", "dagger");
      assert.equal(
        await newest(page),
        "You sell the dagger to Merrow the Tinker for 1 gp. The trade takes 10 minutes. Purse: 6 gp.",
      );

      await clickAction(page, "move", "wayside-shrine");
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      const ending = await text(page.locator("#ending"));
      assert.match(ending, /^Back with the takings\nEscaped with loot\n/u);
      assert.match(
        ending,
        /Defeated Wolf: \+50 XP\nDefeated Scarred Bandit and Young Bandit: \+50 XP\nBack with the takings: \+200 XP/,
      );
      assert.match(ending, /Treasure kept\nSilver Toll Seal \(25 gp\)\./);
      assert.match(ending, /Coin found: 14 gp 5 sp\. Purse: 6 gp\./);
      assert.match(
        ending,
        /Level up: Ada is now level 2\nHit points 13 → 22\. New: Action Surge, Tactical Mind\./,
      );

      // Storage and the sheet hold the purchases and the change.
      let record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.deepEqual(record.sheet.equipment, [
        "leather",
        "shield",
        "shortsword",
      ]);
      assert.deepEqual(record.sheet.stowed, []);
      assert.equal(record.sheet.purse, 600);
      await page.locator("#ending-next").click();
      await page.locator("#sheet").waitFor({ state: "visible" });
      const sheet = await text(page.locator("#sheet-body"));
      assert.match(
        sheet,
        /^Level 2 Fighter · 300 XP \(level 3 at 900\) · Leather armour, Shield, Shortsword\n[\s\S]*HP: 22\/22\nAC: 15\n/u,
      );
      assert.match(sheet, /Shortsword: \+6 to hit, 1d6 \+ 4 piercing, Vex/);
      assert.match(sheet, /Treasure\nSilver Toll Seal \(25 gp\)\./);
      assert.match(sheet, /Purse\n6 gp\n/);

      // Buying and dropping gear, then abandoning, changes nothing.
      const before = record.sheet;
      await startAdventure(page, "tinkers-toll");
      await clickAction(page, "move", "tinkers-cart");
      await clickAction(page, "buy", "dagger");
      await clickAction(page, "unequip", "shield");
      await clickAction(page, "drop", "shield");
      assert.equal(await page.locator("#purse").textContent(), "Purse: 4 gp");
      assert.match(
        await text(page.locator("#room")),
        /Items here\nShield — You dropped it here\.\nYou carry\nLeather armour — Worn\.\n[\s\S]*Shortsword — In hand\.\n[\s\S]*Dagger — Carried, not equipped\./u,
      );
      await page.locator('#breadcrumb a[data-view="sheet"]').click();
      // Keep going closes the question; the second Abandon confirms it.
      await page.locator("#abandon-adventure").click();
      await page.locator("#cancel-abandon").click();
      assert.equal(await page.locator("#abandon-confirm").isHidden(), true);
      await page.locator("#abandon-adventure").click();
      await page.locator("#confirm-abandon").click();
      await page
        .locator("#feedback")
        .filter({ hasText: "Ada abandoned The Tinker's Toll." })
        .waitFor();
      record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.deepEqual(record.sheet, before);
      assert.match(
        await text(page.locator("#sheet-body")),
        /· Leather armour, Shield, Shortsword\n[\s\S]*Purse\n6 gp\n/u,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
