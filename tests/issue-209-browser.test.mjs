// #209, browser → API → storage: find a longsword behind the barrow's lintel,
// wield it (the gear panel's AC and attack change at once), drop the starting
// mace, leave, and see the longsword (and no mace) on the sheet and in the
// saved library.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { characterProfile } from "../dist/character-5e.js";
import { longswordBarrow } from "./fixtures/armoury-barrow.mjs";
import { explore, launch } from "./fixtures/session-layout.mjs";
import { createFighter, startAdventure } from "./fixtures/browser-journey.mjs";

const newest = (page) => page.locator("#log li").last().innerText();

/** Each "You carry" entry's text, and the verbs on it. */
const carried = (page) =>
  page
    .locator("#inventory > li")
    .evaluateAll((entries) =>
      entries.map((entry) => [
        entry.querySelector("p").textContent,
        [...entry.querySelectorAll("button")].map((button) =>
          button.getAttribute("aria-label"),
        ),
      ]),
    );

test(
  "find a longsword, wield it, drop the mace and escape: the sheet keeps the longsword",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-209-browser-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [longswordBarrow],
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
      assert.deepEqual(start.equipment, ["leather", "mace"]);

      await startAdventure(page, "lintel-barrow");
      const before = characterProfile(start);
      // The status strip shows AC and attack from the gear worn and held.
      assert.match(
        await page.locator("#gear-numbers").textContent(),
        new RegExp(`^AC ${before.armorClass} \\(leather armour\\) · Mace `),
      );
      // Ada's own gear heads what she carries, acted on from there (#198).
      assert.deepEqual(await carried(page), [
        ["Leather armour — Worn.", ["Unequip Leather armour"]],
        ["Mace — In hand.", []],
      ]);

      await explore(page, "examine", "scratched-lintel");
      await explore(page, "take", "lintel-longsword");
      assert.equal(await newest(page), "You take the Longsword and stow it.");
      assert.deepEqual(await carried(page), [
        ["Leather armour — Worn.", ["Unequip Leather armour"]],
        ["Mace — In hand.", []],
        [
          "Longsword — Carried, not equipped.",
          ["Wield Longsword", "Drop Longsword"],
        ],
      ]);
      // No gear verb is in the action bar outside a fight.
      assert.equal(
        await page
          .locator(
            "#action-bar button:is([data-action=equip], [data-action=unequip], [data-action=swap], [data-action=drop])",
          )
          .count(),
        0,
      );

      // Wielding it changes the attack and damage on the page at once.
      await explore(page, "swap", "longsword");
      const wielding = characterProfile({
        ...start,
        equipment: ["leather", "longsword"],
      });
      assert.match(
        await newest(page),
        /^You stow the mace and wield the longsword\. AC \d+; Longsword /,
      );
      const numbers = await page.locator("#gear-numbers").textContent();
      assert.ok(
        numbers.startsWith(
          `AC ${wielding.armorClass} (leather armour) · Longsword `,
        ),
        numbers,
      );
      // Ada has no longsword mastery, so no Sap.
      assert.match(numbers, /1d10 [+−] \d+ slashing, two-handed\.$/);
      assert.deepEqual(await carried(page), [
        ["Leather armour — Worn.", ["Unequip Leather armour"]],
        ["Longsword — In hand.", []],
        ["Mace — Carried, not equipped.", ["Wield Mace", "Drop Mace"]],
      ]);

      // The mace dropped lies here, with Take to pick it back up.
      await explore(page, "drop", "mace");
      assert.equal(await newest(page), "You drop the mace. It stays here.");
      assert.match(
        await page.locator("#room-items").innerText(),
        /Mace — You dropped it here\./,
      );
      assert.equal(
        await page
          .locator(
            '#action-bar button[data-action="take"][data-target="dropped:mace"]',
          )
          .isEnabled(),
        true,
      );
      assert.deepEqual(await carried(page), [
        ["Leather armour — Worn.", ["Unequip Leather armour"]],
        ["Longsword — In hand.", []],
      ]);

      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      await page.locator("#ending-next").click();
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      const body = await page.locator("#sheet-body").innerText();
      // Equipped gear heads the sheet; the mace is gone.
      assert.equal(
        body.split("\n")[0],
        "Level 1 Fighter · 0 XP (level 2 at 300) · Leather armour, Longsword",
      );
      assert.match(body, new RegExp(`AC:\\s*${wielding.armorClass}(?!\\d)`));
      assert.match(body, /Longsword: \+\d+ to hit, 1d10 [+−] \d+ slashing/);

      const { sheet } = JSON.parse(await readFile(libraryPath, "utf8"))
        .characters[0];
      assert.deepEqual(sheet.equipment, ["leather", "longsword"]);
      assert.deepEqual(sheet.stowed, []);
      assert.deepEqual(sheet.finds, ["lintel-barrow/lintel-longsword"]);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
