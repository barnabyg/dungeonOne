// #302, browser → API → storage: Ada sneaks into the Rat Run's cellar, slips
// past the rat to the den unseen, and leaves. The ending and the library
// credit only the XP the module authors for slipping past.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { libraryAt, testFighterAt } from "../dist/test-fighter-5e.js";
import { launch } from "./fixtures/session-layout.mjs";
import {
  actionButton,
  clickAction,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { firstJourney } from "./fixtures/module-journey.mjs";
import { ratRun } from "./fixtures/modules.mjs";
import { readAda } from "./fixtures/save-files.mjs";

const ROUTE = [
  ["sneak", "rat-cellar"],
  ["move", "den"],
];
const sheet = testFighterAt(1);

// A seed where the sneak succeeds, so Ada slips past the rat and out.
const { seed, state } = firstJourney(
  ratRun,
  sheet,
  [...ROUTE, ["leave", "den"]],
  ({ status, bypassedEncounterIds }) =>
    status === "escaped" && bypassedEncounterIds.length === 1,
  { browser: true },
);

test(
  `sneak past the rat, leave, and keep only the XP for slipping past (seed ${seed})`,
  { timeout: 120000 },
  async () => {
    assert.deepEqual(state.clearedEncounterIds, []);
    const directory = await mkdtemp(join(tmpdir(), "issue-302-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, JSON.stringify(libraryAt(1)));
    const server = await startFifthBrowserServer({
      libraryPath,
      seed,
      adventures: [ratRun],
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
      await startAdventure(page, "rat-run");

      await clickAction(page, ...ROUTE[0]);
      assert.match(
        await text(page.locator("#log li").last()),
        /^You sneak into the Rat-Gnawed Cellar\. Stealth check: d20 \d+ \+ 2 = \d+ against DC 10\. Success\. The best passive Perception is Giant Rat's 10: Giant Rat has not noticed you\./u,
      );
      // Unseen: Ambush is offered, and the cellar's sacks can't be examined.
      assert.equal(
        await actionButton(page, "ambush", "rat-cellar").isEnabled(),
        true,
      );
      assert.equal(
        await actionButton(page, "examine", "gnawed-sacks").isEnabled(),
        false,
      );
      assert.equal(await page.locator("#initiative-rows tr").count(), 0);

      await clickAction(page, ...ROUTE[1]);
      assert.match(
        await text(page.locator("#log li").last()),
        /^You slip out of the Rat-Gnawed Cellar unseen, past Giant Rat\. The fight there is left unfought\./u,
      );
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      const ending = await text(page.locator("#ending"));
      assert.match(ending, /^Out through the den\n/u);
      assert.ok(ending.includes("Slipped past the Giant Rat: +20 XP"), ending);
      assert.ok(!ending.includes("Defeated"), ending);

      // Storage credits the 20 XP authored for slipping past, and no more.
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.xp, sheet.xp + 20);
      assert.deepEqual(record.sheet.xpAwards, ["rat-run/encounter/cellar-rat"]);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
