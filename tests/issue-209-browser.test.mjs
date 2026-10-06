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
import { fighterProfile } from "../dist/fighter-5e.js";
import { armouryBarrow } from "./fixtures/armoury-barrow.mjs";
import { assertTogether, launch } from "./fixtures/session-layout.mjs";

/** Clicks an action button and waits for its result card. */
async function click(page, action, target) {
  const count = await page.locator("#log li").count();
  const button = page.locator(
    `#action-bar button[data-action="${action}"][data-target="${target}"]`,
  );
  await button.click();
  await page.waitForFunction(
    (seen) => document.querySelectorAll("#log li").length > seen,
    count,
  );
}

const newest = (page) => page.locator("#log li").last().innerText();

test(
  "find a longsword, wield it, drop the mace and escape: the sheet keeps the longsword",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-209-browser-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [armouryBarrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await page.locator("#open-creation").click();
      await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
      await page.locator("#character-name").fill("Ada");
      await page.locator("#save-character").click();
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      const start = JSON.parse(await readFile(libraryPath, "utf8"))
        .characters[0].sheet;
      assert.deepEqual(start.equipment, ["leather", "mace"]);

      await page
        .locator('.start-adventure[data-adventure="robbers-barrow"]')
        .click();
      await page.locator("#adventure").waitFor({ state: "visible" });
      const before = fighterProfile(start);
      // The status strip shows AC and attack from the gear worn and held.
      assert.match(
        await page.locator("#gear-numbers").textContent(),
        new RegExp(`^AC ${before.armorClass} \\(leather armour\\) · Mace `),
      );
      assert.equal(await page.locator("#inventory-group").isHidden(), true);

      await click(page, "examine", "scratched-lintel");
      await click(page, "take", "lintel-longsword");
      assert.equal(await newest(page), "You take the Longsword and stow it.");
      // Stowed gear is listed with what Ada carries.
      assert.equal(
        await page.locator("#inventory").innerText(),
        "Longsword — Carried, not equipped.",
      );
      // Gear changes take their own rows, after exploring's.
      assert.deepEqual(
        (
          await page
            .locator("#explore-controls button")
            .evaluateAll((buttons) =>
              buttons.map((button) => button.getAttribute("aria-label")),
            )
        ).slice(-3),
        ["Unequip Leather armour", "Wield Longsword", "Drop Longsword"],
      );

      // Wielding it changes the attack and damage on the page at once.
      await click(page, "swap", "longsword");
      const wielding = fighterProfile({
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
      assert.equal(
        await page.locator("#inventory").innerText(),
        "Mace — Carried, not equipped.",
      );

      // The mace dropped lies here, with Take to pick it back up.
      await click(page, "drop", "mace");
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
      assert.equal(await page.locator("#inventory-group").isHidden(), true);

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
      assert.deepEqual(sheet.finds, ["robbers-barrow/lintel-longsword"]);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "on a phone, a long list of gear rows scrolls inside the dock and the history keeps its place",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-209-browser-"));
    const server = await startFifthBrowserServer({
      libraryPath: join(directory, "characters.json"),
      seed: 0,
      adventures: [armouryBarrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
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
      const list = page.locator("#explore-controls");
      const scrolls = () =>
        list.evaluate((node) => node.scrollHeight > node.clientHeight);
      assert.equal(await scrolls(), false);

      await click(page, "examine", "scratched-lintel");
      for (const item of ["longsword", "shield", "greatsword", "mail"]) {
        await click(page, "take", `lintel-${item}`);
        await assertTogether(page, `take ${item}`);
      }
      // Leather, then a row per stowed piece: more than a third of the window.
      assert.equal(await scrolls(), true);
      const last = list.locator("button").last();
      assert.equal(await last.getAttribute("aria-label"), "Drop Chain mail");
      await last.scrollIntoViewIfNeeded();
      await click(page, "drop", "chain-mail");
      await assertTogether(page, "drop chain mail");
      assert.equal(
        await newest(page),
        "You drop the chain mail. It stays here.",
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
