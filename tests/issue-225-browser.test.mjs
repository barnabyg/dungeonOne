// #225, browser → API → storage: creation offers Archery and tags it as
// having no effect with every (melee) starting kit; the sheet of an archer
// holding a bow says it applies, and of one holding a mace that it does not.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { validateCharacter } from "../dist/character-5e.js";
import { archer } from "./fixtures/archery-barrow.mjs";
import { saveFighter } from "./fixtures/browser-journey.mjs";
import { loneGoblin } from "./fixtures/modules.mjs";
import { launch } from "./fixtures/session-layout.mjs";

test(
  "creation offers Archery, and creation and the sheet say whether it applies",
  { timeout: 60000 },
  async () => {
    const wren = validateCharacter({ ...archer(), fightingStyle: "archery" });
    const directory = await mkdtemp(join(tmpdir(), "issue-225-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(
      libraryPath,
      JSON.stringify({
        kind: "dungeon-one-characters",
        formatVersion: FIFTH_LIBRARY_FORMAT,
        revision: "1".repeat(32),
        creationsStarted: 1,
        sessionsStarted: 0,
        characters: [{ sheet: wren, revision: 1 }],
      }),
    );
    const server = await startFifthBrowserServer({
      adventures: [loneGoblin],
      libraryPath,
      seed: 0,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(`${server.url}#character-${wren.id}`);
      assert.equal(
        await page
          .locator("#sheet-style-use")
          .filter({ hasText: "Archery" })
          .innerText(),
        "Fighting Style: Archery Applies Applies: the shortbow is a ranged weapon.",
      );

      await page.goto(server.url);
      await page.locator("#open-creation").click();
      const tag = page.locator("#style-use-archery");
      await tag.filter({ hasText: "No effect with this kit" }).waitFor();
      assert.equal(
        await page.locator("#style-note-archery").textContent(),
        "No effect with the mace: it needs a ranged weapon.",
      );
      await page.locator("#style-archery").check();
      await saveFighter(page);

      const saved = JSON.parse(await readFile(libraryPath, "utf8"));
      assert.equal(saved.characters[1].sheet.fightingStyle, "archery");
      assert.equal(
        await page.locator("#sheet-style-use").innerText(),
        "Fighting Style: Archery No effect No effect with the mace: it needs a ranged weapon.",
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
