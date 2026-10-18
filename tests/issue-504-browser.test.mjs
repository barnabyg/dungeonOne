// #504, browser → API: open an item to see its stats. The library sheet's
// gear opens to its facts; loot behind the lintel has a Stats toggle with
// what wielding it would do; once carried, its "You carry" entry opens to
// the same; and worn chain mail's Stealth disadvantage is in the status
// strip.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { armouryBarrow } from "./fixtures/armoury-barrow.mjs";
import { explore, launch } from "./fixtures/session-layout.mjs";
import { createFighter, startAdventure } from "./fixtures/browser-journey.mjs";

const IF_WIELDED =
  /If wielded: Longsword \+\d+ to hit, 1d10 [+−] \d+ slashing, two-handed/;

test(
  "open the sheet's gear, then a found longsword's stats before and after taking it",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-504-browser-"));
    const server = await startFifthBrowserServer({
      libraryPath: join(directory, "characters.json"),
      seed: 0,
      adventures: [armouryBarrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await createFighter(page);

      // The sheet lists its gear, each opening to its stats.
      const sheetGear = page.locator("#sheet-gear li");
      assert.deepEqual(await sheetGear.locator("summary").allInnerTexts(), [
        "Leather armour Equipped",
        "Mace Equipped",
      ]);
      const leather = sheetGear.first().locator("details");
      assert.equal(await leather.locator(".item-stats").isVisible(), false);
      await leather.locator("summary").click();
      assert.match(
        await leather.locator(".item-stats").innerText(),
        /^Light armour\nAC 11 \+ Dexterity modifier\nYou are trained with light armour\./,
      );
      assert.equal(await leather.locator(".item-compare").count(), 0);

      await startAdventure(page, "lintel-barrow");
      await explore(page, "examine", "scratched-lintel");

      // Loot shows its stats behind a toggle named for it.
      const toggle = page.getByRole("group").filter({
        has: page.getByLabel("Stats: Longsword"),
      });
      await page.getByLabel("Stats: Longsword").click();
      assert.match(
        await toggle.locator(".item-stats").innerText(),
        /^Martial melee weapon\nDamage 1d8 slashing; 1d10 in two hands\n/,
      );
      assert.match(
        await toggle.locator(".item-compare").first().innerText(),
        IF_WIELDED,
      );
      assert.match(
        await toggle.locator(".item-compare").last().innerText(),
        /^Now: Mace \+\d+ to hit, 1d6 [+−] \d+ bludgeoning, Sap$/,
      );

      // Taken, its "You carry" entry opens to the same. A Stats toggle
      // opened stays open as the room redraws.
      await page.getByLabel("Stats: Chain Mail").click();
      await explore(page, "take", "lintel-longsword");
      assert.match(
        await page
          .locator("#room-items .stats-more[open] .item-compare")
          .first()
          .innerText(),
        /^If worn: AC \d+, Stealth disadvantage$/,
      );
      const entry = page.locator('#inventory li[data-id="longsword"]');
      await entry.locator("summary").click();
      assert.match(
        await entry.locator(".item-compare").first().innerText(),
        IF_WIELDED,
      );
      // Worn gear opens to its facts, with no comparison.
      const mace = page.locator('#inventory li[data-id="mace"]');
      await mace.locator("summary").click();
      assert.match(
        await mace.locator(".item-stats").innerText(),
        /^Simple melee weapon\n/,
      );
      assert.equal(await mace.locator(".item-compare").count(), 0);

      // Chain mail worn: Stealth disadvantage shows in the status strip.
      assert.doesNotMatch(
        await page.locator("#gear-numbers").textContent(),
        /Stealth/,
      );
      await explore(page, "take", "lintel-mail");
      await explore(page, "equip", "chain-mail");
      assert.match(
        await page.locator("#gear-numbers").textContent(),
        /^AC \d+ \(chain mail\) · .*; Stealth disadvantage\.$/,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
