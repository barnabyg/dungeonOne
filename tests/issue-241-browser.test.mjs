// #241, browser → API → storage: the increment 13 player handoff on seed 26.
// Ada at level 3, from the handoff's input library, clears The Silvervein
// Mine with the buttons alone: the kobold tunneller surrenders and gives up
// the iron key, the drowned miners show Undead Fortitude and a Skeleton's
// vulnerability, the bugbear overseer falls behind the iron door, and the
// spider's bite carries poison. She walks out with the silver, and the
// library file holds what the ending says.
import assert from "node:assert/strict";
import test from "node:test";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { launch } from "./fixtures/session-layout.mjs";
import {
  clickAction,
  settled,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { readAda } from "./fixtures/save-files.mjs";

/** The handoff's seed: Ada clears the mine taking exactly these steps. */
const SEED = 26;

const LIBRARY = fileURLToPath(
  new URL(
    "../docs/acceptance/inputs/increment-13/level-3-ada.json",
    import.meta.url,
  ),
);

const newest = (page) => text(page.locator("#log li").last());
const enabled = (page, action) =>
  page.locator(`button.act[data-action="${action}"]:enabled`).first();

/**
 * Takes fight turns as the handoff tells the owner to, until the fight is
 * over: at half HP or less, Second Wind, or else drink a potion; otherwise
 * Attack the first opponent offered; with the action spent, Action Surge;
 * and End turn when nothing else is left.
 */
async function fight(page) {
  while ((await page.locator("#turn").textContent()) !== "The fight is over.") {
    const [hp, maxHp] = (await page.locator("#character-hp").innerText())
      .match(/HP (\d+)\/(\d+)/u)
      .slice(1)
      .map(Number);
    const heal =
      hp * 2 <= maxHp
        ? [enabled(page, "second-wind"), enabled(page, "use")]
        : [];
    const choices = [
      ...heal,
      enabled(page, "attack"),
      enabled(page, "action-surge"),
      enabled(page, "end-turn"),
    ];
    let chosen;
    for (const choice of choices) {
      if ((await choice.count()) > 0) {
        chosen = choice;
        break;
      }
    }
    await settled(page, () => chosen.click());
  }
}

test(
  "the mine handoff: a level-3 Fighter spares the tunneller for its key, clears the mine and walks out with the silver",
  { timeout: 240000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-241-browser-"));
    const libraryPath = join(directory, "characters.json");
    await copyFile(LIBRARY, libraryPath);
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
      await page
        .locator("#characters button")
        .filter({ hasText: "Ada" })
        .click();
      assert.match(
        await text(page.locator("#sheet-body")),
        /^Level 3 Fighter · 900 XP · Leather armour, Mace\n[\s\S]*HP: 28\/28\nAC: 14\n[\s\S]*Mace: \+5 to hit, 1d6 \+ 3 bludgeoning, Sap, critical on 19–20\n/u,
      );
      assert.match(
        await text(page.locator("#adventure-choices")),
        /The Silvervein Mine\nStart\nLevels 2–3\nMedium\nKobolds have dug into the old Silvervein mine/u,
      );
      await startAdventure(page, "silvervein-mine");

      // Nothing to take at the mine mouth.
      await clickAction(page, "examine", "ore-cart");
      assert.match(await newest(page), /The cart is empty\./);
      await clickAction(page, "move", "sorting-shed");
      assert.match(
        await newest(page),
        /Initiative: Kobold Lookout 8 \+ 2 = 10; Ada 4 \+ 2 = 6; Kobold Tunneller 1 \+ 2 = 3\.\n[\s\S]*Kobold Lookout attacks Ada with Spike, at advantage \(Pack Tactics\): 15 and 20, keeping 20; 20 \+ 4 = 24 against AC 14\. Critical hit! Damage 4 \+ 1 \+ 2 = 7 piercing; Ada has 21\/28 HP\./u,
      );
      await fight(page);
      const shed = await text(page.locator("#log"));
      for (const line of [
        /Kobold Lookout has 0\/5 HP\.\n[\s\S]*Kobold Lookout is defeated\.\nKobold Tunneller checks morale as the first of its side falls: a Wisdom saving throw, 1 − 2 = -1 against DC 8\. Failure: it will surrender on its turn\./u,
        /Ada uses Action Surge: one more action this turn\. 0 uses left\./u,
        /Kobold Tunneller has 1\/5 HP\./u,
        /Ada ends the turn\.\nKobold Tunneller throws down its arms and surrenders\.\nThe fight is over\./u,
      ]) {
        assert.match(shed, line);
      }
      await clickAction(page, "talk", "the-iron-door");
      assert.match(
        await newest(page),
        /Kobold Tunneller offers you the Iron Key\.$/u,
      );
      await clickAction(page, "take", "iron-key");
      await clickAction(page, "talk", "the-spider");
      await clickAction(page, "talk", "the-overseer");
      await clickAction(page, "examine", "ore-bin");
      await clickAction(page, "take", "shed-potion");
      await clickAction(page, "take", "kobold-takings");
      await clickAction(page, "examine", "kobold-lookout");
      await clickAction(page, "take", "kobold-lookout-coins");
      assert.equal(
        await page.locator("#purse").textContent(),
        "Purse: 4 gp 9 cp",
      );

      await clickAction(page, "move", "main-gallery");
      await clickAction(page, "examine", "notice-board");
      await clickAction(page, "move", "flooded-drift");
      assert.match(
        await newest(page),
        /Initiative: Miner's Bones 9 \+ 3 = 12; Ada 5 \+ 2 = 7; Drowned Miner 1 − 2 = -1\./u,
      );
      await fight(page);
      const drift = await text(page.locator("#log"));
      for (const line of [
        /Critical hit! Damage 6 \+ 3 \+ 3 = 12 bludgeoning, doubled to 24 \(vulnerable\); Miner's Bones has 0\/13 HP\./u,
        /Undead Fortitude: Drowned Miner makes a Constitution saving throw against DC 5 \+ 9 damage taken: 17 \+ 3 = 20 against DC 14\. Success: Drowned Miner refuses to fall and has 1\/15 HP\./u,
        /Failure: Drowned Miner stays down\./u,
      ]) {
        assert.match(drift, line);
      }
      // It gets up twice in all, and Ada comes through unhurt.
      assert.equal(drift.match(/Success: Drowned Miner refuses/gu).length, 2);
      assert.match(
        await page.locator("#character-hp").innerText(),
        /HP 21\/28/u,
      );
      await clickAction(page, "examine", "burial-niche");
      await clickAction(page, "take", "silver-locket");
      await clickAction(page, "move", "main-gallery");
      await clickAction(page, "unlock", "iron-door");
      assert.equal(
        await newest(page),
        "You unlock the Iron Door with the Iron Key.",
      );
      await clickAction(page, "move", "overseers-office");
      assert.match(
        await newest(page),
        /Initiative: Bugbear Overseer 14 \+ 2 = 16; Ada 9 \+ 2 = 11\./u,
      );
      await fight(page);
      const office = await text(page.locator("#log"));
      // The overseer hits once.
      assert.equal(
        office.match(/Bugbear Overseer attacks Ada[^\n]*\. Hit\./gu).length,
        1,
      );
      for (const line of [
        /Bugbear Overseer attacks Ada with Light Hammer: 16 \+ 4 = 20 against AC 14\. Hit\. Damage 4 \+ 3 \+ 4 \+ 2 = 13 bludgeoning; Ada has 8\/28 HP\./u,
        /Ada uses Second Wind: 3 \+ 3 = 6; Ada regains 6 HP and has 14\/28 HP\. 1 use left\./u,
        /Ada uses Second Wind: 2 \+ 3 = 5; Ada regains 5 HP and has 19\/28 HP\. 0 uses left\./u,
        /Bugbear Overseer has 0\/33 HP\.\n[\s\S]*Bugbear Overseer is defeated\./u,
      ]) {
        assert.match(office, line);
      }
      await clickAction(page, "examine", "bugbear-overseer");
      await clickAction(page, "take", "bugbear-overseer-coins");
      await clickAction(page, "take", "bugbear-overseer-trinket");
      await clickAction(page, "examine", "ledger-desk");
      await clickAction(page, "examine", "payroll-chest");
      await clickAction(page, "take", "payroll");
      assert.equal(
        await page.locator("#purse").textContent(),
        "Purse: 65 gp 2 sp 9 cp",
      );
      await clickAction(page, "move", "main-gallery");
      await clickAction(page, "move", "webbed-winze");
      assert.match(
        await newest(page),
        /Initiative: Ada 14 \+ 2 = 16; Giant Spider 10 \+ 3 = 13\./u,
      );
      await fight(page);
      const winze = await text(page.locator("#log"));
      for (const line of [
        /Damage 6 \+ 3 = 9 piercing, plus 6 = 6 poison; Ada has 4\/28 HP\.\n[\s\S]*?Ada makes a Constitution saving throw against being poisoned: 7 \+ 4 = 11 against DC 11\. Success\./u,
        /You drink the Potion of Healing: 3 \+ 2 \+ 2 = 7; you regain 7 HP and have 11\/28 HP\./u,
        /Giant Spider has 0\/26 HP\.\n[\s\S]*Giant Spider is defeated\./u,
      ]) {
        assert.match(winze, line);
      }
      await clickAction(page, "examine", "cocoon");
      await clickAction(page, "take", "uncut-sapphire");
      await clickAction(page, "take", "winze-potion");
      await clickAction(page, "move", "main-gallery");
      await clickAction(page, "move", "sorting-shed");
      await clickAction(page, "move", "mine-mouth");
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      const ending = await text(page.locator("#ending"));
      assert.match(ending, /^Out with the silver\nEscaped with loot\n/u);
      assert.match(
        ending,
        /Defeated the Kobold Lookout; spared the Kobold Tunneller: \+62 XP\nDefeated Drowned Miner and Miner's Bones: \+100 XP\nDefeated the Bugbear Overseer: \+200 XP\nDefeated the Giant Spider: \+200 XP\nOut with the silver: \+300 XP/u,
      );
      assert.match(
        ending,
        /Treasure kept\nSilver Locket \(25 gp\)\.[^\n]*\nBugbear Overseer's Rough Gem \(10 gp\)\.[^\n]*\nUncut Sapphire \(100 gp\)\./u,
      );
      assert.match(
        ending,
        /Coin found: 65 gp 2 sp 9 cp\. Purse: 65 gp 2 sp 9 cp\.\nAda has 1762 XP\./u,
      );

      // Storage holds what the ending says.
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.xp, 1762);
      assert.equal(record.sheet.purse, 6529);
      assert.deepEqual(
        record.sheet.treasure.map(({ name }) => name),
        ["Silver Locket", "Bugbear Overseer's Rough Gem", "Uncut Sapphire"],
      );
      await page.locator("#ending-next").click();
      await page.locator("#sheet").waitFor({ state: "visible" });
      const sheet = await text(page.locator("#sheet-body"));
      assert.match(
        sheet,
        /^Level 3 Fighter · 1762 XP · Leather armour, Mace\n[\s\S]*HP: 28\/28\n/u,
      );
      assert.match(sheet, /Purse\n65 gp 2 sp 9 cp\n/u);

      // Turning back at the mine mouth gets out empty-handed.
      await startAdventure(page, "silvervein-mine");
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.match(
        await text(page.locator("#ending")),
        /^Out empty-handed\nEscaped empty-handed\n[\s\S]*Nothing new earned/u,
      );
      assert.deepEqual((await readAda(libraryPath)).sheet, record.sheet);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
