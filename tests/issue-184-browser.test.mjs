// #184: each roll appears once, in the ability table's Roll column, and every
// score, modifier, the 20 cap and the skill limit come from the server's
// projection. #162: rolls and the background increase are placed in one live
// table, a bonus or roll moves by swapping, errors sit beside their fields
// and the preview keeps updating. Browser → API → storage at desktop and
// phone widths.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  ABILITIES,
  buildFighter,
  defaultPlacement,
  fighterProfile,
  keptTotal,
} from "../dist/fighter-5e.js";
import { launch } from "./fixtures/session-layout.mjs";
import { loneGoblin } from "./fixtures/modules.mjs";

const title = (ability) => ability.charAt(0).toUpperCase() + ability.slice(1);
const signed = (value) => (value >= 0 ? "+" : "") + value;
const isPreview = (response) =>
  response.url().endsWith("/api/5e/creation/preview");

/** Runs a change and returns the server's projection of it. */
async function projected(page, change) {
  const [response] = await Promise.all([
    page.waitForResponse(isPreview),
    change(),
  ]);
  const projection = await response.json();
  // The page fills every row once the projection arrives.
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("#ability-rows .num")].some(
        (cell) => cell.textContent === "…",
      ),
  );
  return projection;
}

/** Each row as shown: [score, modifier, cap note, the spoken dice]. */
const shownRows = (page) =>
  page
    .locator("#ability-rows tr")
    .evaluateAll((rows) =>
      rows.map((row) => [
        row.querySelector(".score").firstChild.textContent,
        row.querySelector(".modifier").textContent,
        row.querySelector(".score .cap")?.textContent ?? "",
        row.querySelector(".dice .visually-hidden").textContent,
      ]),
    );

const spokenDice = (roll) => {
  const dropped = roll.indexOf(Math.min(...roll));
  return (
    "Dice " +
    roll
      .map((die, index) => die + (index === dropped ? " dropped" : ""))
      .join(", ")
  );
};

/** What the rows should show for a projection and placement. */
const expectedRows = (projection, dice, placement) =>
  projection.rows.map(({ ability, score, modifier, atCap }) => [
    String(score),
    signed(modifier),
    atCap ? "max 20" : "",
    spokenDice(dice[placement[ability]]),
  ]);

for (const [width, height, seed] of [
  [1280, 850, 1],
  [375, 812, 39],
]) {
  test(
    `each roll shows once and the server projects every row (${width} px)`,
    { timeout: 60000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-184-"));
      const libraryPath = join(directory, "characters.json");
      const server = await startFifthBrowserServer({
        adventures: [loneGoblin],
        libraryPath,
        seed,
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport: { width, height } });
      page.setDefaultTimeout(5000);
      try {
        await page.goto(server.url);
        let projection = await projected(page, () =>
          page.locator("#open-creation").click(),
        );
        await page
          .locator("#preview-body")
          .filter({ hasText: "AC:" })
          .waitFor();

        // The pending creation was saved before it was shown.
        const dice = JSON.parse(await readFile(libraryPath, "utf8"))
          .pendingCreation.dice;
        const placement = { ...defaultPlacement(dice) };

        // One table and no separate list: 24 dice, six of them dropped.
        assert.equal(await page.locator("#rolls").count(), 0);
        assert.equal(await page.locator("#creation .dice").count(), 6);
        assert.equal(await page.locator("#creation .die").count(), 24);
        assert.equal(await page.locator("#creation .die.dropped").count(), 6);
        assert.deepEqual(
          await shownRows(page),
          expectedRows(projection, dice, placement),
        );

        // The cap is in the hint from the start, and marked on Strength,
        // whose 18 takes the +2.
        assert.match(
          await page.locator("#ability-hint").textContent(),
          /No score can exceed 20\./,
        );
        if (seed === 1) {
          const strength = projection.rows.find(
            ({ ability }) => ability === "strength",
          );
          assert.deepEqual(strength, {
            ability: "strength",
            score: 20,
            modifier: 5,
            atCap: true,
          });
          assert.equal(
            await page.locator("#score-strength .cap").textContent(),
            "max 20",
          );
        }
        assert.equal(
          await page.locator("#skills legend").textContent(),
          "Skill proficiencies: choose 2",
        );

        // Accessible names are kept.
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

        const fits = () =>
          page.evaluate(() => {
            const wrap = document.querySelector("#ability-table").parentElement;
            return (
              document.documentElement.scrollWidth <= window.innerWidth &&
              wrap.scrollWidth <= wrap.clientWidth
            );
          });
        if (width === 375) {
          assert.ok(await fits(), "no horizontal scroll at 375 px");
        }

        // A roll placed elsewhere says which ability it swaps with (#162).
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

        // Swap Strength's roll with Wisdom's: the dice move with the roll,
        // focus stays put and both rows update from the server.
        projection = await projected(page, () =>
          strengthRoll.selectOption(String(wisdom)),
        );
        [placement.strength, placement.wisdom] = [wisdom, held];
        assert.equal(
          await page
            .getByRole("combobox", { name: "Wisdom roll" })
            .inputValue(),
          String(held),
        );
        assert.equal(
          await page.evaluate(() => document.activeElement.id),
          "place-strength",
        );
        assert.deepEqual(
          await shownRows(page),
          expectedRows(projection, dice, placement),
        );

        // +2 and +1: a bonus moves by swapping, so the shape stays legal.
        const dexterityBonus = page.getByRole("combobox", {
          name: "Dexterity background bonus",
        });
        assert.match(
          await dexterityBonus.locator("option[value='2']").textContent(),
          /\+2, swaps with Strength/,
        );
        projection = await projected(page, () =>
          dexterityBonus.selectOption("2"),
        );
        assert.deepEqual(
          await shownRows(page),
          expectedRows(projection, dice, placement),
        );
        assert.equal(
          await dexterityBonus.locator("option[value='0']").isDisabled(),
          true,
        );

        // +1 to three: rows update while it is still being ticked.
        projection = await projected(page, () =>
          page.getByRole("radio", { name: "+1 to three" }).check(),
        );
        const box = (ability) =>
          page.getByRole("checkbox", {
            name: `${title(ability)} background bonus`,
          });
        // The ticks start from the +2/+1 abilities; a fourth cannot be ticked.
        for (const ability of ABILITIES) {
          assert.equal(
            await box(ability).isChecked(),
            ["dexterity", "constitution", "strength"].includes(ability),
            ability,
          );
        }
        assert.equal(await box("wisdom").isDisabled(), true);
        if (width === 375) {
          assert.ok(await fits(), "the +1 to three table fits too");
        }
        projection = await projected(page, () => box("strength").uncheck());
        assert.equal(
          projection.unfinished.increase,
          "Choose 1 more ability for +1.",
        );
        await page
          .locator("#increase-error")
          .filter({ hasText: "Choose 1 more ability" })
          .waitFor();
        assert.deepEqual(
          await shownRows(page),
          expectedRows(projection, dice, placement),
        );
        assert.equal(await page.locator("#save-character").isDisabled(), true);
        // The preview keeps the last numbers rather than collapsing (#162).
        assert.match(await page.locator("#preview-body").innerText(), /AC:/);
        projection = await projected(page, () => box("wisdom").check());
        assert.deepEqual(projection.unfinished, {});
        assert.deepEqual(
          await shownRows(page),
          expectedRows(projection, dice, placement),
        );

        // The skill limit is the server's.
        projection = await projected(page, () =>
          page.locator("#skill-perception").uncheck(),
        );
        assert.deepEqual(projection.skills, {
          chosen: 1,
          limit: 2,
          full: false,
        });
        await page
          .locator("#skills-count")
          .filter({ hasText: "1 of 2 chosen" })
          .waitFor();
        // The skill error sits in the skills fieldset; the preview stays.
        await page
          .locator("#skills #skills-error")
          .filter({ hasText: "Choose 2 skills" })
          .waitFor();
        assert.match(await page.locator("#preview-body").innerText(), /AC:/);
        assert.equal(await page.locator("#save-character").isDisabled(), true);
        assert.equal(
          await page.locator("#skill-fields input:disabled").count(),
          0,
        );
        projection = await projected(page, () =>
          page.locator("#skill-survival").check(),
        );
        await page
          .locator("#skills-count")
          .filter({ hasText: "2 of 2 chosen" })
          .waitFor();
        assert.equal(await page.locator("#skill-history").isDisabled(), true);
        await page
          .locator("#skills-error")
          .filter({ hasText: /^$/ })
          .waitFor({ state: "attached" });

        if (width === 375) {
          // CI fonts run wider than Windows ones: keep slack with a wide font.
          await page.evaluate(() => {
            document.body.style.fontFamily = "Verdana";
            for (const node of document.querySelectorAll("#creation *")) {
              node.style.fontFamily = "Verdana";
            }
          });
          assert.ok(await fits(), "no horizontal scroll with a wide font");
        }

        // Save: the stored sheet and the shown sheet match the projection.
        const choices = {
          placement,
          increase: { dexterity: 1, constitution: 1, wisdom: 1 },
          skills: ["athletics", "survival"],
          fightingStyle: "defense",
          kit: "mace",
          masteries: ["dagger", "mace", "shortsword"],
        };
        const expected = buildFighter("0".repeat(32), "Preview", dice, choices);
        assert.deepEqual(projection.sheet.abilities, expected.abilities);
        const profile = fighterProfile(expected);
        await page
          .locator("#preview-body")
          .filter({ hasText: new RegExp(`AC:\\s*${profile.armorClass}`) })
          .filter({
            hasText: new RegExp(`HP:\\s*${profile.maxHp}/${profile.maxHp}`),
          })
          .filter({ hasText: `Mace: ${signed(profile.attack.bonus)} to hit` })
          .waitFor();
        await page
          .locator("#save-character:not([disabled])")
          .waitFor({ state: "attached" });

        // A missing name is reported beside the name field (#162).
        await page.locator("#save-character").click();
        const nameError = page.locator("#name-error");
        await nameError.filter({ hasText: "Enter a name" }).waitFor();
        const input = await page.locator("#character-name").boundingBox();
        const error = await nameError.boundingBox();
        assert.ok(Math.abs(error.y - (input.y + input.height)) < 40);

        await page.locator("#character-name").fill("Cassia");
        await page.locator("#character-name").press("Enter");
        await page
          .locator("#sheet-name")
          .filter({ hasText: "Cassia" })
          .waitFor();
        const sheet = JSON.parse(await readFile(libraryPath, "utf8"))
          .characters[0].sheet;
        assert.deepEqual(sheet.abilities, expected.abilities);
        assert.deepEqual(sheet.backgroundIncrease, choices.increase);
        assert.deepEqual(sheet.skills, choices.skills);
        const shown = await page.locator("#sheet-body").innerText();
        for (const { ability, score, modifier } of projection.rows) {
          assert.match(
            shown,
            new RegExp(
              `${title(ability)}\\s+${score}\\s+${signed(modifier).replace("+", "\\+")}`,
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
}
