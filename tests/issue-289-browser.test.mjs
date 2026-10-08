// #289, browser → API → storage: the player handoff for the Wolfstone
// Hillfort. Ada, from the level-3 handoff library, finds it in the adventure
// list under levels 3–4 and Hard, plays it with the buttons alone on a seed
// found by simulating her clicks: the wolf in the ditch, its lair, the
// portcullis forced with the drover's crowbar as a lever, the gatehouse's
// locker, and out by the camp. The library file holds what the ending says.
import assert from "node:assert/strict";
import test from "node:test";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { libraryAt } from "../dist/test-fighter-5e.js";
import { launch } from "./fixtures/session-layout.mjs";
import {
  clickAction,
  fight,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { firstJourney } from "./fixtures/module-journey.mjs";
import { readAda } from "./fixtures/save-files.mjs";

const LIBRARY = fileURLToPath(
  new URL(
    "../docs/acceptance/inputs/increment-13/level-3-ada.json",
    import.meta.url,
  ),
);

const hillfort = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "wolfstone-hillfort",
);
const [{ sheet }] = libraryAt(3).characters;

const ROUTE = [
  ["examine", "drovers-cart"],
  ["take", "cart-potion"],
  ["take", "crowbar"],
  ["move", "outer-ditch"],
  ["examine", "wolf-lair"],
  ["take", "drovers-purse"],
  ["take", "silver-bell"],
  ["force", "rusted-portcullis"],
  ["move", "gatehouse"],
  ["examine", "guard-locker"],
  ["take", "bloodstone"],
  ["move", "outer-ditch"],
  ["move", "drovers-camp"],
];

// A seed where Ada's clicks win the fight, force the portcullis at the first
// try and walk out with the loot.
const { seed } = firstJourney(
  hillfort,
  sheet,
  [...ROUTE, ["leave", "drovers-camp"]],
  ({ status, endingId }) =>
    status === "escaped" && endingId === "out-with-the-plunder",
  { browser: true },
);

test(
  `Wolfstone Hillfort handoff: a level-3 Fighter finds it in the list, forces the portcullis and walks out with the loot (seed ${seed})`,
  { timeout: 120000 },
  async () => {
    // The input library is the one the handoff gives the owner.
    assert.deepEqual(
      JSON.parse(await readFile(LIBRARY, "utf8")),
      JSON.parse(JSON.stringify(libraryAt(3))),
    );
    const directory = await mkdtemp(join(tmpdir(), "issue-289-browser-"));
    const libraryPath = join(directory, "characters.json");
    await copyFile(LIBRARY, libraryPath);
    const server = await startFifthBrowserServer({
      libraryPath,
      seed,
      // shipped-modules.test.mjs gates every shipped module; skip it here.
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
      assert.match(
        await text(page.locator("#adventure-choices")),
        /The Wolfstone Hillfort\nStart\nLevels 3–4\nHard\n/u,
      );
      await startAdventure(page, "wolfstone-hillfort");
      let fought = false;
      for (const [action, target] of ROUTE) {
        await clickAction(page, action, target);
        // Entering the ditch starts the wolf's fight: fight it out.
        if (action === "move" && target === "outer-ditch" && !fought) {
          fought = true;
          await fight(page);
        }
        if (action === "force") {
          // With the crowbar as a lever, nothing cancels Remarkable
          // Athlete's advantage.
          assert.match(
            await text(page.locator("#log li").last()),
            /^Athletics check, at advantage \(Remarkable Athlete\)/u,
          );
        }
      }
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      const ending = await text(page.locator("#ending"));
      assert.match(ending, /^Out with the plunder\nEscaped with loot\n/u);
      assert.ok(
        ending.includes(
          "Defeated the Reaver's Wolf: +200 XP\nOut with the plunder: +500 XP",
        ),
        ending,
      );

      // Storage holds what the ending says.
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.xp, sheet.xp + 700);
      assert.equal(record.sheet.purse, 2500);
      assert.deepEqual(
        record.sheet.treasure.map(({ name }) => name),
        ["Silver Sheep Bell", "Bloodstone"],
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
