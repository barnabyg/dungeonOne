// #163: a fresh creation starts with the highest roll on Strength and the
// rest in the Fighter priority order, and skills stop at two with the count
// announced. Browser → API → storage at desktop and phone widths.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  ABILITIES,
  FIGHTER_ABILITY_PRIORITY,
  defaultPlacement,
  keptTotal,
} from "../dist/fighter-5e.js";
import { launch } from "./fixtures/session-layout.mjs";
import { loneGoblin } from "./fixtures/modules.mjs";
import { openCreation, saveFighter } from "./fixtures/browser-journey.mjs";

for (const [width, height, seed] of [
  [1280, 850, 5],
  [375, 812, 9],
]) {
  test(
    `a fresh creation defaults sensibly and caps skills at two (${width} px)`,
    { timeout: 30000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-163-"));
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
        await openCreation(page);
        const dice = JSON.parse(await readFile(libraryPath, "utf8"))
          .pendingCreation.dice;
        const totals = dice.map(keptTotal);
        const expected = defaultPlacement(dice);
        // The server projects the default placement; the page only shows it.
        const projected = await page.evaluate(async () => {
          const response = await fetch("/api/5e/creation", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          });
          return (await response.json()).pendingCreation.defaultPlacement;
        });
        assert.deepEqual(projected, expected);

        // The highest roll is on Strength; the rest follow the priority order.
        const shown = Object.fromEntries(
          await Promise.all(
            ABILITIES.map(async (ability) => [
              ability,
              Number(await page.locator(`#place-${ability}`).inputValue()),
            ]),
          ),
        );
        assert.deepEqual(shown, expected);
        assert.equal(totals[shown.strength], Math.max(...totals));
        const ordered = FIGHTER_ABILITY_PRIORITY.map(
          (ability) => totals[shown[ability]],
        );
        assert.deepEqual(
          ordered,
          [...ordered].sort((a, b) => b - a),
        );

        // Two skills are chosen; the rest are disabled and the count is a
        // status announcement inside the skills fieldset.
        const count = page.locator("#skills [role=status]#skills-count");
        assert.equal(await count.textContent(), "2 of 2 chosen");
        assert.equal(await page.locator("#skill-athletics").isChecked(), true);
        assert.equal(await page.locator("#skill-perception").isChecked(), true);
        const third = page.locator("#skill-survival");
        assert.equal(await third.isDisabled(), true);
        await third.click({ force: true });
        assert.equal(await third.isChecked(), false);
        assert.equal(
          await page.locator("#skill-fields input:disabled").count(),
          (await page.locator("#skill-fields input").count()) - 2,
        );

        // Unticking one re-enables the rest; ticking another caps it again.
        await page.locator("#skill-perception").uncheck();
        await count.filter({ hasText: "1 of 2 chosen" }).waitFor();
        assert.equal(
          await page.locator("#skill-fields input:disabled").count(),
          0,
        );
        await third.check();
        await count.filter({ hasText: "2 of 2 chosen" }).waitFor();
        assert.equal(
          await page.locator("#skill-perception").isDisabled(),
          true,
        );

        // The Fighting Style list is unchanged.
        assert.deepEqual(
          await page
            .locator("#style-fields input")
            .evaluateAll((nodes) =>
              nodes.map((node) => [node.id, node.checked]),
            ),
          [
            ["style-archery", false],
            ["style-defense", true],
            ["style-great-weapon-fighting", false],
            ["style-two-weapon-fighting", false],
          ],
        );

        // Saving keeps the default placement and the chosen skills.
        await page
          .locator("#save-character:not([disabled])")
          .waitFor({ state: "attached" });
        await saveFighter(page);
        const sheet = JSON.parse(await readFile(libraryPath, "utf8"))
          .characters[0].sheet;
        for (const ability of ABILITIES) {
          assert.deepEqual(
            sheet.abilityRolls[ability],
            dice[expected[ability]],
            ability,
          );
        }
        assert.deepEqual(sheet.skills, ["athletics", "survival"]);
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
