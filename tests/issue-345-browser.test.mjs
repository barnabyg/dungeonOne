// #345, browser → API → storage: find a +1 Shortsword behind the barrow's
// lintel, wield it ("You carry" explains its bonus, and the gear panel's
// attack gains +1 at once), leave, and see it on the sheet, its bonus
// explained, and in the saved library.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { characterProfile } from "../dist/character-5e.js";
import { magicBarrow } from "./fixtures/magic-barrow.mjs";
import { explore, launch } from "./fixtures/session-layout.mjs";
import { createFighter, startAdventure } from "./fixtures/browser-journey.mjs";

const newest = (page) => page.locator("#log li").last().innerText();

/** Each "You carry" entry's text. */
const carried = (page) =>
  page
    .locator("#inventory > li > p")
    .evaluateAll((entries) => entries.map((entry) => entry.textContent));

const BONUS = "Uncommon magic weapon: +1 to attack and damage rolls.";

test(
  "find a +1 shortsword, wield it and escape: the sheet keeps it, its bonus explained",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-345-browser-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [magicBarrow],
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
      const start = JSON.parse(await readFile(libraryPath, "utf8"))
        .characters[0].sheet;
      await startAdventure(page, "lintel-barrow");

      await explore(page, "examine", "scratched-lintel");
      await explore(page, "take", "lintel-blade");
      assert.equal(
        await newest(page),
        "You take the +1 Shortsword and stow it.",
      );
      assert.deepEqual(await carried(page), [
        "Leather armour — Worn.",
        "Mace — In hand.",
        `+1 Shortsword — Carried, not equipped. ${BONUS}`,
      ]);

      await explore(page, "swap", "shortsword-plus-1");
      const plain = characterProfile({
        ...start,
        equipment: ["leather", "shortsword"],
      });
      const magic = characterProfile({
        ...start,
        equipment: ["leather", "shortsword-plus-1"],
      });
      assert.equal(magic.attack.bonus, plain.attack.bonus + 1);
      assert.equal(
        magic.attack.damage.modifier,
        plain.attack.damage.modifier + 1,
      );
      const numbers = await page.locator("#gear-numbers").textContent();
      assert.ok(
        numbers.startsWith(
          `AC ${magic.armorClass} (leather armour) · +1 Shortsword +${magic.attack.bonus} to hit, 1d6 + ${magic.attack.damage.modifier} piercing`,
        ),
        numbers,
      );
      assert.deepEqual(await carried(page), [
        "Leather armour — Worn.",
        `+1 Shortsword — In hand. ${BONUS}`,
        "Mace — Carried, not equipped.",
      ]);

      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      await page.locator("#ending-next").click();
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      const body = await page.locator("#sheet-body").innerText();
      assert.equal(
        body.split("\n")[0],
        "Level 1 Fighter · 0 XP (level 2 at 300) · Leather armour, +1 Shortsword · Carried: Mace",
      );
      assert.ok(
        body.includes(
          `+1 Shortsword: +${magic.attack.bonus} to hit, 1d6 + ${magic.attack.damage.modifier} piercing`,
        ),
        body,
      );
      assert.deepEqual(await page.locator("#magic-items li").allInnerTexts(), [
        `+1 Shortsword. ${BONUS}`,
      ]);

      const { sheet } = JSON.parse(await readFile(libraryPath, "utf8"))
        .characters[0];
      assert.deepEqual(sheet.equipment, ["leather", "shortsword-plus-1"]);
      assert.deepEqual(sheet.stowed, ["mace"]);
      assert.deepEqual(sheet.finds, ["lintel-barrow/lintel-blade"]);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
