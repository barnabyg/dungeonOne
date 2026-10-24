// #559, browser → API → storage: the character column's status block opens
// with the class crest, its silhouette on an ink tile and the level on a gold
// badge, named "Level 1 Fighter" for a screen reader. The HP line, bar and
// pips sit to its right and the AC line runs below it. A level-3 Rogue shows
// its own crest and level at the 900 × 560 floor, after a reload too.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { testFighterAt } from "../dist/test-fighter-5e.js";
import { testRogueAt } from "../dist/test-rogue-5e.js";
import { ratlessTunnels } from "./fixtures/modules.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

const ADA = testFighterAt(1);
const VEX = testRogueAt(3);

/** The crest as the page shows it, and where it sits beside the status. */
const crest = (page) =>
  page.evaluate(() => {
    const tile = document.getElementById("class-crest");
    const box = (node) => node.getBoundingClientRect();
    const status = document.getElementById("session-status");
    return {
      role: tile.getAttribute("role"),
      name: tile.getAttribute("aria-label"),
      icon: tile.dataset.icon,
      href: tile.querySelector("use").getAttribute("href"),
      silhouette: tile.querySelector("svg").getAttribute("aria-hidden"),
      badge: getComputedStyle(tile, "::after").content,
      visible: box(tile).width > 0 && box(tile).height > 0,
      hpRight: box(document.getElementById("status-hp")).left >= box(tile).right,
      acBelow: box(document.getElementById("gear-numbers")).top >= box(tile).bottom - 6,
      // The badge is drawn, not text: the status reads as it did.
      statusText: !/^\s*\d/u.test(status.innerText),
    };
  });

const shown = (name, icon, level) => ({
  role: "img",
  name,
  icon,
  href: "#icon-" + icon,
  silhouette: "true",
  badge: `"${level}"`,
  visible: true,
  hpRight: true,
  acBelow: true,
  statusText: true,
});

test(
  "the character column shows each class's crest and level beside the HP (#559)",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "class-crest-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(
      libraryPath,
      JSON.stringify({
        kind: "dungeon-one-characters",
        formatVersion: FIFTH_LIBRARY_FORMAT,
        revision: "0".repeat(32),
        creationsStarted: 2,
        sessionsStarted: 0,
        characters: [
          { sheet: ADA, revision: 1 },
          { sheet: VEX, revision: 1 },
        ],
      }),
    );
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [ratlessTunnels],
      // Fixtures are engine material, not gated content.
      qualifies: () => true,
    });
    const browser = await launch();
    try {
      const start = async (page, sheet) => {
        await page.goto(`${server.url}#character-${sheet.id}`);
        await page.locator(".start-adventure").click();
        await page.locator("#log li").first().waitFor();
      };

      // The three-column layout: the crest heads the character column.
      const wide = await browser.newPage({ viewport: { width: 1600, height: 900 } });
      wide.setDefaultTimeout(8000);
      await start(wide, ADA);
      assert.deepEqual(await crest(wide), shown("Level 1 Fighter", "barbute", 1));
      assert.ok(
        await wide.evaluate(() =>
          document.getElementById("session-character").contains(document.getElementById("class-crest")),
        ),
      );
      await wide
        .getByRole("img", { name: "Level 1 Fighter" })
        .waitFor({ state: "visible" });

      // The floor: the Rogue's own crest and level, with no side scroll.
      const floor = await browser.newPage({ viewport: { width: 900, height: 560 } });
      floor.setDefaultTimeout(8000);
      await start(floor, VEX);
      const rogue = shown("Level 3 Rogue", "cowled", 3);
      assert.deepEqual(await crest(floor), rogue);
      await assertNoSideScroll(floor, "the crest at the 900 px floor");
      await floor.reload();
      await floor.locator("#log li").first().waitFor();
      assert.deepEqual(await crest(floor), rogue);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
