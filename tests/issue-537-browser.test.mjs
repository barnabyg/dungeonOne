// #537, browser → API → storage: a Wizard finds the Wand of the War Mage +1
// behind the barrow's lintel. "You carry" says it is attuned; after leaving,
// the saved sheet holds it, and the sheet shows it attuned with the spell
// attack bonus 1 higher.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { characterProfile, defaultPlacement } from "../dist/character-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import { explore, launch } from "./fixtures/session-layout.mjs";
import { startAdventure } from "./fixtures/browser-journey.mjs";
import { warMageBarrow } from "./fixtures/war-mage-barrow.mjs";

const saved = async (path) =>
  JSON.parse(await readFile(path, "utf8")).characters[0].sheet;
const signed = (value) => (value >= 0 ? `+${value}` : `−${-value}`);

test(
  "a Wizard finds the wand, is attuned to it, and the sheet shows its +1 to spell attacks",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-537-browser-"));
    const libraryPath = join(directory, "characters.json");
    const library = new FifthCharacterLibrary(libraryPath, 0);
    const started = await library.startCreation();
    await library.create(
      "Vela",
      {
        ...WIZARD.defaults,
        placement: defaultPlacement(started.pendingCreation.dice, WIZARD),
      },
      started.revision,
      "wizard",
    );
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [warMageBarrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1024, height: 768 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await page.locator("#characters .open-character").first().click();
      await page.locator("#sheet-name").filter({ hasText: "Vela" }).waitFor();
      const start = await saved(libraryPath);
      const bonus = characterProfile(start).spellcasting.attackBonus;
      await startAdventure(page, "lintel-barrow");

      await explore(page, "examine", "scratched-lintel");
      await explore(page, "take", "war-wand");
      const carried = page.locator(
        '#inventory li[data-id="lintel-barrow/war-wand"]',
      );
      assert.equal(
        await carried.locator("strong").innerText(),
        "Wand of the War Mage +1",
      );
      assert.match(
        await carried.locator(".carry-text").textContent(),
        /^An uncommon wand that requires attunement by a spellcaster: while attuned, \+1 to your spell attack rolls .* Attuned\.$/u,
      );

      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      await page.locator("#ending-next").click();
      await page.locator("#sheet-name").filter({ hasText: "Vela" }).waitFor();

      const settled = await saved(libraryPath);
      assert.deepEqual(settled.magicItems, [
        {
          id: "lintel-barrow/war-wand",
          casterItem: "wand-of-the-war-mage-plus-1",
        },
      ]);
      const entry = page.locator("#magic-items li");
      assert.equal(await entry.count(), 1);
      assert.match(
        await entry.innerText(),
        /^Wand of the War Mage \+1\..*\+1 to your spell attack rolls.* Attuned\.$/su,
      );
      assert.match(
        await page.locator("#spellcasting-numbers").innerText(),
        new RegExp(
          `^Spell attack ${signed(bonus + 1).replace("+", "\\+")} `,
          "u",
        ),
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
