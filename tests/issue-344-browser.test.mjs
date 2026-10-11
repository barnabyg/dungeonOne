// #344, browser → API → storage: a level-5 Wizard's short rest offers
// Memorize Spell in the room panel; the swap is saved with the adventure
// session, changes what she can cast in the next fight, and leaves the
// library's prepared spells as they were (D8).
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import {
  clickAction,
  settled,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { moduleFile } from "./fixtures/modules.mjs";
import { readAda, sessionFile } from "./fixtures/save-files.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";
import { vela } from "./fixtures/level-5-wizard.mjs";

/** The rat tunnels, levels 1–5, with a bandit in the cellar. */
const tunnels = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "bandit-tunnels";
  module.recommendedLevels = { min: 1, max: 5 };
  module.encounters.find(({ id }) => id === "cellar-rat").opponents = [
    { id: "bandit", monster: "bandit", description: "A bandit." },
  ];
  return validateModule(module);
})();

/** Writes a library holding `sheet` alone, as the browser saves one. */
async function libraryWith(directory, sheet) {
  const path = join(directory, "characters.json");
  await writeFile(
    path,
    JSON.stringify({
      kind: "dungeon-one-characters",
      formatVersion: FIFTH_LIBRARY_FORMAT,
      revision: "b".repeat(32),
      creationsStarted: 1,
      sessionsStarted: 0,
      characters: [{ sheet, revision: 1 }],
    }),
  );
  return path;
}

test(
  "a level-5 Wizard's short rest offers Memorize Spell, and the swap lasts the adventure only (375px)",
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-344-browser-"));
    const sheet = vela(["vampiric-touch", "haste"]);
    const libraryPath = await libraryWith(directory, sheet);
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [tunnels],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(8000);
    try {
      await page.goto(server.url);
      await page
        .locator("#characters button")
        .filter({ hasText: "Vela" })
        .click();
      await page.locator("#sheet-name").filter({ hasText: "Vela" }).waitFor();
      await startAdventure(page, "bandit-tunnels");
      // At full health the swap is all a rest would bring: no "keep".
      await page.locator("#rest-memorize").waitFor();
      assert.match(
        await text(page.locator("#rest-memorize")),
        /^Memorize Spell: swap one prepared spell for another in your spellbook until the adventure ends\.$/u,
      );
      const forget = page.locator("#rest-forget");
      const learn = page.locator("#rest-learn");
      assert.deepEqual(await forget.locator("option").allTextContents(), [
        "Mage Armor (1st)",
        "Magic Missile (1st)",
        "Shield (1st)",
        "Ice Knife (1st)",
        "Burning Hands (1st)",
        "Chromatic Orb (1st)",
        "Thunderwave (1st)",
        "Vampiric Touch (3rd)",
        "Haste (3rd)",
      ]);
      assert.deepEqual(await learn.locator("option").allTextContents(), [
        "Ray of Sickness (1st)",
        "Scorching Ray (2nd)",
        "Shatter (2nd)",
        "Acid Arrow (2nd)",
        "Mind Spike (2nd)",
      ]);
      await assertNoSideScroll(page, "the rest panel fits a phone", {
        wideFont: true,
      });
      await forget.selectOption("ice-knife");
      await learn.selectOption("shatter");
      await settled(page, () =>
        page.locator("#rest-controls button.act[data-action=rest]").click(),
      );
      assert.match(
        await text(page.locator("#log li.newest")),
        /Memorize Spell: you study your spellbook and prepare Shatter in place of Ice Knife until the adventure ends\./u,
      );
      // Saved with the session, not the library.
      const saved = await sessionFile(directory);
      assert.ok(saved.state.character.prepared.includes("shatter"));
      assert.ok(!saved.state.character.prepared.includes("ice-knife"));
      assert.deepEqual(
        (await readAda(libraryPath)).sheet.spells.prepared,
        sheet.spells.prepared,
      );
      // In the cellar's fight Shatter can be cast and Ice Knife can't.
      await clickAction(page, "move", "rat-cellar");
      const spells = page.locator("#cast-spell option");
      await page.locator("#cast-spell").waitFor();
      const offered = await spells.allTextContents();
      assert.ok(
        offered.some((label) => label.startsWith("Shatter")),
        offered.join(", "),
      );
      assert.ok(!offered.some((label) => label.startsWith("Ice Knife")));
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
