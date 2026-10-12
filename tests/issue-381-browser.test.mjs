// #381, browser → API → storage: the page is desktop-only. In a window below
// the 900 × 560 px floor the adventure keeps its two columns at the floor's
// size and the window scrolls: every scene and dock button can be scrolled
// into view, unclipped and uncovered, and still works.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { launch } from "./fixtures/session-layout.mjs";
import {
  clickAction,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { beaLibrary } from "./fixtures/charismatic-fighter.mjs";
import { goblinYard } from "./fixtures/modules.mjs";

/** The page's size, and where the scene and the dock sit. */
const layout = (page) =>
  page.evaluate(() => {
    const box = (id) => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top };
    };
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      scene: box("session-scene"),
      dock: box("session-dock"),
    };
  });

/**
 * Scrolls each shown button in `#session-scene` and `#session-dock` into view
 * and returns the names of any still outside the window or covered there.
 */
const unreachable = async (page) => {
  const buttons = page.locator(
    "#session-scene button:visible, #session-dock button:visible",
  );
  const missed = [];
  for (const button of await buttons.all()) {
    await button.scrollIntoViewIfNeeded();
    const reached = await button.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth &&
        node.contains(document.elementFromPoint(x, y))
      );
    });
    if (!reached) {
      missed.push(await text(button));
    }
  }
  return missed;
};

test("below 900 x 560 px the adventure keeps its two columns and the window scrolls to every button", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-381-browser-"));
  const libraryPath = join(directory, "characters.json");
  await writeFile(libraryPath, JSON.stringify(beaLibrary()));
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: 7,
    adventures: [goblinYard],
    qualifies: () => true,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 800, height: 500 },
  });
  page.setDefaultTimeout(8000);
  try {
    await page.goto(server.url);
    // The character list keeps the floor's width too.
    assert.ok(
      (await page.evaluate(() => document.documentElement.scrollWidth)) >= 900,
    );
    await page.locator("#characters button").filter({ hasText: "Bea" }).click();
    await startAdventure(page, "goblin-yard");

    const before = await layout(page);
    assert.ok(before.width >= 900, `page width ${before.width}`);
    assert.ok(before.height >= 560, `page height ${before.height}`);
    // Two columns: the dock beside the scene, not below it.
    assert.ok(before.dock.left >= before.scene.right);
    assert.ok(before.dock.top < before.scene.top + 1);
    assert.deepEqual(await unreachable(page), []);

    // Scrolled to the far corner, the dock's buttons still work.
    await page.evaluate(() =>
      window.scrollTo(
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
      ),
    );
    await clickAction(page, "examine", "woodpile");
    assert.match(
      await text(page.locator("#log > li").last()),
      /You find the Dagger\.$/u,
    );
    assert.deepEqual(await unreachable(page), []);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
