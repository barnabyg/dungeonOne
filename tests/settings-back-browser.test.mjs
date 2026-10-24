// Settings returns to the view it was opened from: an adventure in progress,
// a sheet, or the characters. The breadcrumb runs through that view, a reload
// keeps it, and the Back button returns as the browser's Back does; a
// Settings URL opened on its own goes back to the characters.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { buildCharacter, validateCharacter } from "../dist/character-5e.js";
import { armoury } from "./fixtures/armoury-barrow.mjs";
import { launch } from "./fixtures/session-layout.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import { startAdventure } from "./fixtures/browser-journey.mjs";

const barrow = validateModule(armoury);

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
        strength: 0,
        dexterity: 1,
        constitution: 2,
        intelligence: 3,
        wisdom: 4,
        charisma: 5,
      },
      increase: { strength: 2, constitution: 1 },
      skills: ["athletics", "perception"],
      fightingStyle: "defense",
      kit: "mace",
      masteries: ["dagger", "mace", "shortsword"],
    },
  ),
);

const breadcrumb = async (page) =>
  (await page.locator("#breadcrumb-list li").allTextContents()).map((item) =>
    item.trim(),
  );

/** Opens Settings from the header and waits for it. */
async function openSettings(page) {
  await page.locator("#open-settings").click();
  await page.locator("#settings").waitFor({ state: "visible" });
}

test(
  "Settings goes back to the adventure, sheet or characters it was opened from",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "settings-back-browser-"));
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
    const back = page.locator("#settings-back");
    try {
      // From the characters.
      await page.goto(server.url);
      await openSettings(page);
      assert.deepEqual(await breadcrumb(page), ["Characters", "Settings"]);
      assert.equal(await back.textContent(), "Back to your characters");
      await back.click();
      await page.locator("#library").waitFor({ state: "visible" });
      assert.equal(new URL(page.url()).hash, "");

      // From the sheet.
      await page.goto(`${server.url}#character-${sheet.id}`);
      await page.locator("#sheet-name").filter({ hasText: "Wren" }).waitFor();
      await openSettings(page);
      assert.deepEqual(await breadcrumb(page), [
        "Characters",
        "Wren",
        "Settings",
      ]);
      assert.equal(await back.textContent(), "Back to Wren");
      await back.click();
      await page.locator("#sheet").waitFor({ state: "visible" });
      assert.equal(new URL(page.url()).hash, `#character-${sheet.id}`);

      // From an adventure in progress, through a reload.
      await startAdventure(page, "lintel-barrow");
      const adventureUrl = page.url();
      const title = (await page.title()).replace(/ · Dungeon One$/u, "");
      await openSettings(page);
      assert.deepEqual(await breadcrumb(page), [
        "Characters",
        "Wren",
        title,
        "Settings",
      ]);
      assert.equal(await back.textContent(), `Back to ${title}`);
      await page.reload();
      await page.locator("#settings").waitFor({ state: "visible" });
      assert.equal(await back.textContent(), `Back to ${title}`);
      assert.equal(
        await page
          .locator('#breadcrumb a[data-view="adventure"]')
          .getAttribute("href"),
        new URL(adventureUrl).hash,
      );
      await back.click();
      await page.locator("#adventure").waitFor({ state: "visible" });
      await page.locator("#log li").first().waitFor();
      assert.equal(page.url(), adventureUrl);
      // Back left no extra entry: Forward returns to Settings.
      await page.goForward();
      await page.locator("#settings").waitFor({ state: "visible" });
      assert.equal(await back.textContent(), `Back to ${title}`);

      // The breadcrumb's adventure link goes there too.
      await page.locator('#breadcrumb a[data-view="adventure"]').click();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.equal(page.url(), adventureUrl);

      // A Settings URL opened on its own goes back to the characters.
      const other = await browser.newPage();
      await other.goto(`${server.url}#settings`);
      await other.locator("#settings").waitFor({ state: "visible" });
      assert.equal(
        await other.locator("#settings-back").textContent(),
        "Back to your characters",
      );
      await other.locator("#settings-back").click();
      await other.locator("#library").waitFor({ state: "visible" });
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
