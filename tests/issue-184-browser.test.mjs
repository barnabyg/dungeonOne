// #184: each roll appears once, in the ability table's Roll column, and every
// score, modifier, the 20 cap and the skill limit come from the server's
// projection. Browser → API → storage at desktop and phone widths.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  ABILITIES,
  buildFighter,
  defaultPlacement,
} from "../dist/fighter-5e.js";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

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
      const server = await startFifthBrowserServer({ libraryPath, seed });
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

        // The page script computes no rule.
        const script = await page.evaluate(async () =>
          (await fetch("/app.js")).text(),
        );
        for (const rule of ["Math.floor", "- 10", "max 20", "of 2", ">= 2"]) {
          assert.ok(!script.includes(rule), rule);
        }

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

        // Swap Strength's roll with Wisdom's: the dice move with the roll
        // and both rows update from the server.
        projection = await projected(page, () =>
          page
            .getByRole("combobox", { name: "Strength roll" })
            .selectOption(String(placement.wisdom)),
        );
        [placement.strength, placement.wisdom] = [
          placement.wisdom,
          placement.strength,
        ];
        assert.deepEqual(
          await shownRows(page),
          expectedRows(projection, dice, placement),
        );

        // +1 to three: rows update while it is still being ticked.
        projection = await projected(page, () =>
          page.getByRole("radio", { name: "+1 to three" }).check(),
        );
        const box = (ability) =>
          page.getByRole("checkbox", {
            name: `${title(ability)} background bonus`,
          });
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

        if (width === 375) {
          const fits = () =>
            page.evaluate(() => {
              const wrap =
                document.querySelector("#ability-table").parentElement;
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
        await page
          .locator("#save-character:not([disabled])")
          .waitFor({ state: "attached" });
        await page.locator("#character-name").fill("Cassia");
        await page.locator("#save-character").click();
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
