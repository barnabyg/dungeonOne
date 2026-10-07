// #162: rolls and the background increase are placed in one live table,
// one row per ability, with errors beside their fields and a preview that
// keeps updating. Browser → API → storage at desktop and phone widths.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  ABILITIES,
  abilityModifier,
  buildFighter,
  defaultPlacement,
  fighterProfile,
  keptTotal,
} from "../dist/fighter-5e.js";
import { loneGoblin } from "./fixtures/modules.mjs";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

const title = (ability) => ability.charAt(0).toUpperCase() + ability.slice(1);
const signed = (value) => (value >= 0 ? "+" : "") + value;

/**
 * Each row's [score, modifier] as shown, in table order, once the server's
 * projection of the latest change has filled every row (#184).
 */
const shownScores = async (page) => {
  await page.waitForFunction(
    () =>
      document.querySelectorAll("#ability-rows .score").length === 6 &&
      ![...document.querySelectorAll("#ability-rows .num")].some(
        (cell) => cell.textContent === "…",
      ),
  );
  return page
    .locator("#ability-rows tr")
    .evaluateAll((rows) =>
      rows.map((row) => [
        row.querySelector(".score").firstChild.textContent,
        row.querySelector(".modifier").textContent,
      ]),
    );
};

const expectedScores = (dice, placement, increase) =>
  ABILITIES.map((ability) => {
    const score =
      keptTotal(dice[placement[ability]]) + (increase[ability] ?? 0);
    return [String(score), signed(abilityModifier(score))];
  });

async function openCreation(page, url) {
  await page.goto(url);
  await page.locator("#open-creation").click();
  await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
}

test(
  "place and swap rolls, give +1 to three abilities, watch the scores and save",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-162-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      adventures: [loneGoblin],
      libraryPath,
      seed: 11,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(5000);
    try {
      await openCreation(page, server.url);
      const dice = JSON.parse(await readFile(libraryPath, "utf8"))
        .pendingCreation.dice;
      const placement = { ...defaultPlacement(dice) };
      let increase = { strength: 2, constitution: 1 };
      assert.deepEqual(
        await shownScores(page),
        expectedScores(dice, placement, increase),
      );

      // Every control names its ability and purpose.
      for (const ability of ABILITIES) {
        await page
          .getByRole("combobox", { name: `${title(ability)} roll` })
          .waitFor();
        await page
          .getByRole("combobox", {
            name: `${title(ability)} background bonus`,
          })
          .waitFor();
      }

      // A roll placed elsewhere says which ability it swaps with.
      const strengthRoll = page.getByRole("combobox", {
        name: "Strength roll",
      });
      const options = await strengthRoll
        .locator("option")
        .evaluateAll((nodes) => nodes.map((node) => node.textContent));
      const [held, wisdom] = [placement.strength, placement.wisdom];
      assert.equal(
        options[held],
        `${keptTotal(dice[held])} (roll ${held + 1})`,
      );
      assert.equal(
        options[wisdom],
        `${keptTotal(dice[wisdom])} (roll ${wisdom + 1}), swaps with Wisdom`,
      );
      await strengthRoll.selectOption(String(wisdom));
      placement.strength = wisdom;
      placement.wisdom = held;
      assert.equal(
        await page.getByRole("combobox", { name: "Wisdom roll" }).inputValue(),
        String(held),
      );
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "place-strength",
      );
      assert.deepEqual(
        await shownScores(page),
        expectedScores(dice, placement, increase),
      );

      // +2 and +1: a bonus moves by swapping, so the shape stays legal.
      const dexterityBonus = page.getByRole("combobox", {
        name: "Dexterity background bonus",
      });
      assert.match(
        await dexterityBonus.locator("option[value='2']").textContent(),
        /\+2, swaps with Strength/,
      );
      await dexterityBonus.selectOption("2");
      increase = { dexterity: 2, constitution: 1 };
      assert.deepEqual(
        await shownScores(page),
        expectedScores(dice, placement, increase),
      );
      assert.equal(
        await page
          .getByRole("combobox", { name: "Dexterity background bonus" })
          .locator("option[value='0']")
          .isDisabled(),
        true,
      );

      // +1 to three: then which abilities. A fourth cannot be ticked.
      await page.getByRole("radio", { name: "+1 to three" }).check();
      const box = (ability) =>
        page.getByRole("checkbox", {
          name: `${title(ability)} background bonus`,
        });
      await box("dexterity").waitFor();
      increase = { dexterity: 1, constitution: 1, strength: 1 };
      for (const ability of ABILITIES) {
        assert.equal(
          await box(ability).isChecked(),
          Object.hasOwn(increase, ability),
          ability,
        );
      }
      assert.equal(await box("wisdom").isDisabled(), true);
      await box("strength").uncheck();
      await page
        .locator("#increase-error")
        .filter({ hasText: "Choose 1 more" })
        .waitFor();
      assert.equal(await page.locator("#save-character").isDisabled(), true);
      // The preview keeps the last numbers rather than collapsing.
      assert.match(await page.locator("#preview-body").innerText(), /AC:/);
      await box("wisdom").check();
      increase = { dexterity: 1, constitution: 1, wisdom: 1 };
      await page
        .locator("#increase-error")
        .filter({ hasText: /^$/ })
        .waitFor({ state: "attached" });
      assert.deepEqual(
        await shownScores(page),
        expectedScores(dice, placement, increase),
      );

      const choices = {
        placement,
        increase,
        skills: ["athletics", "perception"],
        fightingStyle: "defense",
        kit: "mace",
        masteries: ["dagger", "mace", "shortsword"],
      };
      const expected = buildFighter("0".repeat(32), "Preview", dice, choices);
      const profile = fighterProfile(expected);
      await page
        .locator("#preview-body")
        .filter({ hasText: new RegExp(`AC:\\s*${profile.armorClass}`) })
        .filter({
          hasText: new RegExp(`HP:\\s*${profile.maxHp}/${profile.maxHp}`),
        })
        .filter({
          hasText: `Mace: ${signed(profile.attack.bonus)} to hit`,
        })
        .waitFor();
      assert.equal(await page.locator("#save-character").isDisabled(), false);

      // A missing name is reported beside the name field.
      await page.locator("#save-character").click();
      const nameError = page.locator("#name-error");
      await nameError.filter({ hasText: "Enter a name" }).waitFor();
      const input = await page.locator("#character-name").boundingBox();
      const error = await nameError.boundingBox();
      assert.ok(Math.abs(error.y - (input.y + input.height)) < 40);

      await page.locator("#character-name").fill("Brienne");
      await page.locator("#character-name").press("Enter");
      await page
        .locator("#sheet-name")
        .filter({ hasText: "Brienne" })
        .waitFor();
      const sheet = JSON.parse(await readFile(libraryPath, "utf8"))
        .characters[0].sheet;
      assert.deepEqual(sheet.abilities, expected.abilities);
      assert.deepEqual(sheet.backgroundIncrease, increase);
      const shown = await page.locator("#sheet-body").innerText();
      for (const ability of ABILITIES) {
        assert.match(
          shown,
          new RegExp(
            `${title(ability)}\\s+${expected.abilities[ability]}\\s+${signed(profile.modifiers[ability]).replace("+", "\\+")}`,
          ),
        );
      }
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "the ability table fits a phone and errors appear beside their fields",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-162-phone-"));
    const server = await startFifthBrowserServer({
      adventures: [loneGoblin],
      libraryPath: join(directory, "characters.json"),
      seed: 4,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      await openCreation(page, server.url);
      const fits = () =>
        page.evaluate(() => {
          const wrap = document.querySelector("#ability-table").parentElement;
          return (
            document.documentElement.scrollWidth <= window.innerWidth &&
            wrap.scrollWidth <= wrap.clientWidth
          );
        });
      assert.ok(await fits(), "no horizontal scroll at 375 px");
      // CI fonts run wider than Windows ones: keep slack with a wide font.
      await page.evaluate(() => {
        document.body.style.fontFamily = "Verdana";
        for (const node of document.querySelectorAll("#creation *")) {
          node.style.fontFamily = "Verdana";
        }
      });
      assert.ok(await fits(), "no horizontal scroll with a wide font");
      await page.getByRole("radio", { name: "+1 to three" }).check();
      assert.ok(await fits(), "the +1 to three table fits too");

      // A skill error sits in the skills fieldset; the preview stays.
      await page.locator("#skill-perception").uncheck();
      await page
        .locator("#skills #skills-error")
        .filter({ hasText: "Choose 2 skills" })
        .waitFor();
      assert.match(await page.locator("#preview-body").innerText(), /AC:/);
      assert.equal(await page.locator("#save-character").isDisabled(), true);
      await page.locator("#skill-perception").check();
      await page
        .locator("#skills-error")
        .filter({ hasText: /^$/ })
        .waitFor({ state: "attached" });
      await page
        .locator("#save-character:not([disabled])")
        .waitFor({ state: "attached" });
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
