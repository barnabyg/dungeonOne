// #506, browser → API → storage: the Settings page lists carrying capacity
// with its default marked, saves a change and resets it. A Strength 5
// character starts an adventure at Strength × 10 lb, keeps that through a
// change of setting and a reload, and is refused chain mail; the next
// adventure plays with no limit and takes it.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { buildCharacter, validateCharacter } from "../dist/character-5e.js";
import { armoury } from "./fixtures/armoury-barrow.mjs";
import { explore, launch } from "./fixtures/session-layout.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import { startAdventure } from "./fixtures/browser-journey.mjs";

const barrow = validateModule(armoury);

// Str 5: leather and mace (14 lb).
const sheet = validateCharacter(
  buildCharacter(
    "b".repeat(32),
    "Wren",
    [
      [6, 6, 4, 1],
      [4, 4, 4, 1],
      [4, 4, 4, 1],
      [3, 3, 3, 1],
      [3, 3, 3, 1],
      [2, 2, 1, 1],
    ],
    {
      placement: {
        strength: 5,
        dexterity: 1,
        constitution: 0,
        intelligence: 3,
        wisdom: 4,
        charisma: 2,
      },
      increase: { constitution: 2, intelligence: 1 },
      skills: ["athletics", "perception"],
      fightingStyle: "defense",
      kit: "mace",
      masteries: ["dagger", "mace", "shortsword"],
    },
  ),
);

const carrying = (page) => page.locator("#carrying").textContent();
const choice = (page, value) =>
  page.locator(`#setting-carryingCapacity-${value}`);
const savedCapacity = async (directory) =>
  JSON.parse(await readFile(join(directory, "settings.json"), "utf8")).settings
    .carryingCapacity;

/** Opens the Settings page from the header and waits for its settings. */
async function openSettings(page) {
  await page.locator("#open-settings").click();
  await page.locator("#settings-title").waitFor();
  await page.locator("#setting-carryingCapacity").waitFor();
}

/** Chooses carrying capacity `value` and waits for it to be saved. */
async function chooseCapacity(page, value) {
  await choice(page, value).check();
  await page.locator("#feedback").filter({ hasText: "Saved." }).waitFor();
}

test(
  "the Settings page changes carrying capacity; an adventure keeps the capacity it started with, and the next uses the new one",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-506-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(
      libraryPath,
      JSON.stringify({
        kind: "dungeon-one-characters",
        formatVersion: FIFTH_LIBRARY_FORMAT,
        revision: "1".repeat(32),
        creationsStarted: 1,
        sessionsStarted: 0,
        characters: [{ sheet, revision: 1 }],
      }),
    );
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [barrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await openSettings(page);
      assert.equal(await page.title(), "Settings · Dungeon One");
      const field = page.locator("#setting-carryingCapacity");
      assert.equal(
        await field.locator("legend").textContent(),
        "Carrying capacity",
      );
      // The default is marked and chosen; nothing is saved until a change.
      assert.equal(
        (
          await page.locator("label", { has: choice(page, 15) }).textContent()
        ).trim(),
        "Strength × 15 lb Default",
      );
      assert.equal(await choice(page, 15).isChecked(), true);
      assert.equal(
        await page.locator("#settings-in-progress").isHidden(),
        true,
      );

      await chooseCapacity(page, 20);
      assert.equal(
        await page.locator("#feedback").textContent(),
        "Carrying capacity: Strength × 20 lb. Saved.",
      );
      assert.equal(await savedCapacity(directory), 20);
      await page.locator("#reset-settings").click();
      await page
        .locator("#feedback")
        .filter({ hasText: "back to its default" })
        .waitFor();
      assert.equal(await choice(page, 15).isChecked(), true);
      assert.equal(await savedCapacity(directory), 15);

      // Strength 5 × 10 lb: the sheet and the adventure carry 50 lb.
      await chooseCapacity(page, 10);
      await page.goto(`${server.url}#character-${sheet.id}`);
      await page.locator("#sheet-name").filter({ hasText: "Wren" }).waitFor();
      assert.match(
        await page.locator("#sheet-body").innerText(),
        /Carrying:\s*14 of 50 lb/,
      );
      await startAdventure(page, "lintel-barrow");
      const adventureUrl = page.url();
      assert.equal(
        await carrying(page),
        "Carrying 14 lb of the 50 lb your Strength allows.",
      );

      // A change mid-adventure is saved for the next one.
      await openSettings(page);
      assert.equal(
        await page.locator("#settings-in-progress").textContent(),
        "An adventure is in progress: changes apply from the next adventure.",
      );
      await chooseCapacity(page, "unlimited");
      await page.goto(adventureUrl);
      await page.reload();
      await page.locator("#carrying").waitFor();
      assert.equal(
        await carrying(page),
        "Carrying 14 lb of the 50 lb your Strength allows.",
      );
      await explore(page, "examine", "scratched-lintel");
      const takeMail = page.locator(
        'button.act[data-action="take"][data-target="lintel-mail"]',
      );
      assert.equal(await takeMail.isDisabled(), true);
      assert.equal(
        await page
          .locator(`#${await takeMail.getAttribute("aria-describedby")}`)
          .textContent(),
        "Too heavy",
      );

      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      await page.locator("#ending-next").click();
      await page.locator("#sheet-name").filter({ hasText: "Wren" }).waitFor();
      // Between adventures the sheet shows the settings of the moment.
      assert.match(
        await page.locator("#sheet-body").innerText(),
        /Carrying:\s*14 lb/,
      );

      await startAdventure(page, "lintel-barrow");
      assert.equal(await carrying(page), "Carrying 14 lb.");
      await explore(page, "examine", "scratched-lintel");
      await explore(page, "take", "lintel-mail");
      assert.equal(await carrying(page), "Carrying 69 lb.");
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
