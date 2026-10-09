// #319, browser → API → storage: an ending's level-up card names each new
// feature as a collapsed disclosure that opens to what the feature does (the
// sheet's text). A level-1 Fighter reaches level 2 (Action Surge, Tactical
// Mind) and a level-2 Rogue reaches level 3 (Steady Aim and the Thief's Fast
// Hands and Second-Story Work), at 1280 px and at 375×812: no horizontal
// scroll, and the way back to the sheet still works with every one open.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { levelUpChanges, validateCharacter } from "../dist/character-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { testRogueAt } from "../dist/test-rogue-5e.js";
import { clickAction } from "./fixtures/browser-journey.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import { moduleFile, room } from "./fixtures/modules.mjs";
import { readAda } from "./fixtures/save-files.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

// The barrow with its goblin moved to a side crypt the test never enters:
// walking out with the torc earns the escape's 250 XP, no dice rolled.
const emptyBarrow = (() => {
  const module = moduleFile("lintel-barrow");
  const hall = room(module, "burial-hall");
  delete hall.encounterId;
  hall.items = hall.items.filter(({ id }) => id !== "coin-pouch");
  module.rooms.push({
    id: "side-crypt",
    name: "Side Crypt",
    description: "A cramped niche of stacked bones.",
    encounterId: "barrow-goblin",
    features: [],
    items: [],
  });
  module.passages.push({
    id: "hall-to-crypt",
    between: ["burial-hall", "side-crypt"],
    description: "A gap in the hall's wall.",
  });
  return validateModule(module);
})();

// Each 250 XP short of its next level.
const CASES = [
  {
    sheet: validateCharacter({ ...testFighterAt(1), xp: 50 }),
    from: testFighterAt(1),
    to: testFighterAt(2),
    names: ["Action Surge", "Tactical Mind"],
  },
  {
    sheet: validateCharacter({ ...testRogueAt(2), xp: 650 }),
    from: testRogueAt(2),
    to: testRogueAt(3),
    names: ["Steady Aim", "Thief: Fast Hands", "Thief: Second-Story Work"],
  },
];

for (const { sheet, from, to, names } of CASES) {
  const expected = levelUpChanges(from, to).features;
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 375, height: 812 },
  ]) {
    test(
      `a level-${from.level} ${sheet.class} ends at level ${to.level} and its card opens each new feature's text (${viewport.width}px)`,
      { timeout: 60000 },
      async () => {
        assert.deepEqual(
          expected.map(({ name }) => name),
          names,
        );
        const directory = await mkdtemp(join(tmpdir(), "issue-319-browser-"));
        const libraryPath = join(directory, "characters.json");
        await writeFile(
          libraryPath,
          JSON.stringify({
            kind: "dungeon-one-characters",
            formatVersion: FIFTH_LIBRARY_FORMAT,
            revision: "0".repeat(32),
            creationsStarted: 1,
            sessionsStarted: 0,
            characters: [{ sheet, revision: 1 }],
          }),
        );
        const server = await startFifthBrowserServer({
          libraryPath,
          seed: 0,
          adventures: [emptyBarrow],
          qualifies: () => true,
        });
        const browser = await launch();
        const page = await browser.newPage({ viewport });
        page.setDefaultTimeout(8000);
        try {
          await page.goto(`${server.url}#character-${sheet.id}`);
          await page.locator(".start-adventure").click();
          await page.locator("#log li").first().waitFor();
          await clickAction(page, "move", "burial-hall");
          await clickAction(page, "examine", "stone-bier");
          await clickAction(page, "take", "silver-torc");
          await clickAction(page, "move", "barrow-mouth");
          await page.locator("#leave-controls button").click();
          await page.locator("#confirm-leave").click();
          await page.locator("#ending").waitFor({ state: "visible" });
          assert.equal(
            await page.locator("#level-up-title").textContent(),
            `Level up: ${sheet.name} is now level ${to.level}`,
          );
          assert.match(
            await page.locator("#level-up").innerText(),
            /Hit points \d+ → \d+\.[^\n]* New features:/u,
          );

          // Each new feature is closed at first: its name alone shows.
          const features = page.locator("#level-up-features details");
          assert.deepEqual(
            await page.locator("#level-up-features summary").allTextContents(),
            names,
          );
          for (const [index, { text }] of expected.entries()) {
            const feature = features.nth(index);
            assert.equal(await feature.getAttribute("open"), null);
            assert.equal(await feature.locator("p").isVisible(), false);
            // Opening it shows the sheet's text for that feature.
            await feature.locator("summary").click();
            assert.equal(await feature.locator("p").isVisible(), true);
            assert.equal(await feature.locator("p").textContent(), text);
          }
          await assertNoSideScroll(page, "every feature open: no side scroll", {
            wideFont: viewport.width < 900,
          });

          // With every feature open, the way back is still on screen to use.
          const back = page.locator("#ending-next");
          await back.scrollIntoViewIfNeeded();
          assert.ok(
            await back.evaluate((node) => {
              const rect = node.getBoundingClientRect();
              const hit = document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
              );
              return rect.bottom <= window.innerHeight && node.contains(hit);
            }),
            "the way back is on screen and uncovered",
          );
          await back.click();
          await page
            .locator("#sheet-name")
            .filter({ hasText: sheet.name })
            .waitFor();
          // The library holds the new level the card announced.
          const record = await readAda(libraryPath);
          assert.deepEqual(
            [record.sheet.level, record.sheet.xp],
            [to.level, sheet.xp + 250],
          );
        } finally {
          await browser.close();
          await server.close();
          await rm(directory, { recursive: true, force: true });
        }
      },
    );
  }
}
