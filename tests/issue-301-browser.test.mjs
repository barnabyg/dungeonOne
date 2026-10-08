// #301, browser → API → storage: Ada sneaks into the rat cellar and the
// goblin's den, sees each surprise card and the surprised opponents tagged
// in the initiative table, wins, and the library credits what she earned.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { libraryAt, testFighterAt } from "../dist/test-fighter-5e.js";
import { launch } from "./fixtures/session-layout.mjs";
import {
  clickAction,
  fight,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { firstJourney, xpOf } from "./fixtures/module-journey.mjs";
import { ratTunnels } from "./fixtures/modules.mjs";
import { readAda } from "./fixtures/save-files.mjs";

// Each sneak leaves Ada unseen (#302), and she springs an ambush.
const ROUTE = [
  ["sneak", "rat-cellar"],
  ["ambush", "rat-cellar"],
  ["sneak", "den"],
  ["ambush", "den"],
];
const sheet = testFighterAt(1);

// A seed where both sneaks succeed and Ada's clicks win both fights.
const { seed, state, runtime } = firstJourney(
  ratTunnels,
  sheet,
  ROUTE,
  ({ status, sneaks }) =>
    status === "victory" &&
    sneaks.length === 2 &&
    sneaks.every(({ roll }) => roll.success),
  { browser: true, limit: 400 },
);

test(
  `sneak into two fights, see who was surprised, win and keep the XP (seed ${seed})`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-301-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, JSON.stringify(libraryAt(1)));
    const server = await startFifthBrowserServer({
      libraryPath,
      seed,
      adventures: [ratTunnels],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(8000);
    try {
      await page.goto(server.url);
      await page
        .locator("#characters button")
        .filter({ hasText: "Ada" })
        .click();
      await startAdventure(page, "rat-tunnels");
      for (const [action, target] of ROUTE) {
        await clickAction(page, action, target);
        const card = await text(page.locator("#log li").last());
        if (action === "sneak") {
          assert.match(
            card,
            /^You sneak into the [^\n]+\. Stealth check: d20 \d+ \+ 2 = \d+ against DC \d+\. Success\. The best passive Perception is [^\n]+: [^\n]+ has not noticed you\. Ambush it, and it is surprised; or slip past through another way\./u,
          );
          continue;
        }
        assert.match(
          card,
          /^You spring your ambush: [^\n]+ is surprised and rolls initiative with disadvantage\./u,
        );
        // The initiative table tags each surprised opponent.
        assert.equal(
          await page.locator("#initiative-rows .tag.surprised").count(),
          1,
        );
        await fight(page);
      }
      await page.locator("#ending").waitFor({ state: "visible" });
      const ending = await text(page.locator("#ending"));
      assert.match(ending, /Defeated the Giant Rat: \+25 XP/u);

      // Storage holds what the ending credits.
      const xp = xpOf(runtime, state).reduce((sum, [, each]) => sum + each, 0);
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.xp, sheet.xp + xp);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
