// #509, browser → API → storage: a character is created by the standard
// array, by point buy and with the one reroll, each method chosen on the
// Settings page; a pending creation keeps its method and dice through a
// change of setting and a reload. At XP × 2, the leave confirmation, the XP
// lines and the level-up show doubled XP.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { launch } from "./fixtures/session-layout.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import { moduleFile } from "./fixtures/modules.mjs";
import {
  createFighter,
  saveFighter,
  startAdventure,
} from "./fixtures/browser-journey.mjs";

/** The ossuary, whose empty-handed escape pays 150 XP and victory 400. */
const ossuary = (() => {
  const file = moduleFile("shifting-ossuary");
  file.endings.find(({ kind }) => kind === "victory").xp = 400;
  file.endings.find(({ kind }) => kind === "escape-without-loot").xp = 150;
  return validateModule(file);
})();

/** Chooses `value` for setting `id` on the Settings page and waits for the save. */
async function choose(page, id, value) {
  await page.locator("#open-settings").click();
  await page.locator(`#setting-${id}`).waitFor();
  await page.locator(`[id="setting-${id}-${value}"]`).check();
  await page.locator("#feedback").filter({ hasText: "Saved." }).waitFor();
}

/** Opens creation from the library and waits for a complete preview. */
async function openCreation(page) {
  await page.locator(`#breadcrumb a[data-view="library"]`).click();
  await page.locator("#open-creation").click();
  await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
}

const shownDice = (page) =>
  page
    .locator("#ability-rows .dice .visually-hidden")
    .evaluateAll((items) => items.map((item) => item.textContent));

const withServer = async (adventures, run) => {
  const directory = await mkdtemp(join(tmpdir(), "issue-509-browser-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: 0,
    adventures,
    qualifies: () => true,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
  });
  page.setDefaultTimeout(5000);
  try {
    await page.goto(server.url);
    await run(page, libraryPath);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
};

const readLibrary = async (path) => JSON.parse(await readFile(path, "utf8"));

test(
  "a character is created by the standard array, by point buy and with one reroll; a pending creation keeps its method and dice",
  { timeout: 120000 },
  () =>
    withServer([ossuary], async (page, libraryPath) => {
      // The standard array: six scores, no dice, placed freely.
      await choose(page, "abilityScores", "standard-array");
      await openCreation(page);
      assert.equal(
        await page.locator("#method-hint").textContent(),
        "The standard array: 15, 14, 13, 12, 10 and 8. Choose a class, place the six scores on your abilities in any order, then make your other choices.",
      );
      assert.equal(await page.locator("#ability-rows .dice").count(), 0);
      assert.equal(await page.locator("#base-heading").textContent(), "Array");
      assert.deepEqual(
        await page.locator("#place-strength option").allTextContents(),
        [
          "15",
          "14, swaps with Constitution",
          "13, swaps with Dexterity",
          "12, swaps with Wisdom",
          "10, swaps with Charisma",
          "8, swaps with Intelligence",
        ],
      );
      assert.equal(await page.locator("#score-strength").textContent(), "17");
      await saveFighter(page, "Ada");
      assert.match(
        await page.locator("#sheet").innerText(),
        /Base scores: Strength 15; Dexterity 13; Constitution 14; Intelligence 8; Wisdom 12; Charisma 10\./u,
      );

      // Point buy: each score with its cost; over 27 points can't be saved.
      await choose(page, "abilityScores", "point-buy");
      await openCreation(page);
      assert.equal(
        await page.locator("#method-hint").textContent(),
        "Point buy: spend up to 27 points on scores from 8 to 15. Choose a class, buy your ability scores, then make your other choices.",
      );
      assert.equal(
        await page.locator("#points-status").textContent(),
        "Points spent: 27 of 27.",
      );
      assert.deepEqual(
        await page.locator("#place-wisdom option").allTextContents(),
        [
          "8 (0 points)",
          "9 (1 point)",
          "10 (2 points)",
          "11 (3 points)",
          "12 (4 points)",
          "13 (5 points)",
          "14 (7 points)",
          "15 (9 points)",
        ],
      );
      await page.locator("#place-wisdom").selectOption("15");
      await page
        .locator("#scores-error")
        .filter({ hasText: "These scores cost 32 points; you have 27." })
        .waitFor();
      assert.equal(await page.locator("#save-character").isDisabled(), true);
      await page.locator("#place-wisdom").selectOption("8");
      await page
        .locator("#points-status")
        .filter({ hasText: "Points spent: 23 of 27." })
        .waitFor();
      assert.equal(await page.locator("#scores-error").textContent(), "");
      await saveFighter(page, "Bram");
      assert.match(
        await page.locator("#sheet").innerText(),
        /Base scores: Strength 15; Dexterity 13; Constitution 14; Intelligence 8; Wisdom 8; Charisma 10\./u,
      );

      // 4d6 with one reroll: the whole set again, once, kept.
      await choose(page, "abilityScores", "roll-reroll");
      await openCreation(page);
      assert.match(
        await page.locator("#method-hint").textContent(),
        /^Rolled once, with one reroll of the whole set\. /u,
      );
      const first = await shownDice(page);
      assert.equal(first.length, 6);
      await page.locator("#reroll").click();
      await page
        .locator("#reroll-status")
        .filter({ hasText: "Rerolled: you keep these dice." })
        .waitFor();
      assert.equal(await page.locator("#reroll").isHidden(), true);
      await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
      const second = await shownDice(page);
      assert.notDeepEqual(second, first);
      const stored = (await readLibrary(libraryPath)).pendingCreation;
      assert.equal(stored.method, "roll-reroll");
      assert.equal(stored.rerolled, true);

      // Changing the method and reloading changes neither method nor dice.
      await choose(page, "abilityScores", "point-buy");
      await page.reload();
      await openCreation(page);
      assert.deepEqual(await shownDice(page), second);
      assert.equal(await page.locator("#reroll").isHidden(), true);
      assert.deepEqual(
        (await readLibrary(libraryPath)).pendingCreation,
        stored,
      );
      await saveFighter(page, "Cass");
      const library = await readLibrary(libraryPath);
      assert.deepEqual(
        library.characters.map(({ sheet }) => sheet.name),
        ["Ada", "Bram", "Cass"],
      );
      assert.equal(library.pendingCreation, undefined);
    }),
);

test(
  "at XP × 2, the leave confirmation, the XP lines and the level-up show doubled XP",
  { timeout: 120000 },
  () =>
    withServer([ossuary], async (page, libraryPath) => {
      await choose(page, "xpRate", 2);
      await page.locator(`#breadcrumb a[data-view="library"]`).click();
      await createFighter(page);
      await startAdventure(page, ossuary.id);
      await page.locator("#leave-controls button").click();
      assert.match(
        await page.locator("#leave-warning").textContent(),
        /Leaving now earns 300 XP for “Out empty-handed” but gives up the 800 XP for “/u,
      );
      // A change now applies from the next adventure.
      await page.locator("#cancel-leave").click();
      await choose(page, "xpRate", 1);
      await page.goBack();
      await page.locator("#adventure").waitFor({ state: "visible" });
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.deepEqual(await page.locator("#ending-xp li").allTextContents(), [
        "Out empty-handed: +300 XP",
      ]);
      assert.equal(
        await page.locator("#level-up-title").textContent(),
        "Level up: Ada is now level 2",
      );
      const [record] = (await readLibrary(libraryPath)).characters;
      assert.equal(record.sheet.xp, 300);
      assert.equal(record.sheet.level, 2);
    }),
);
