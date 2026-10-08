// #305, browser → API → storage: Bea, with 2 gp, goes into the Bandit's Toll
// cellar, where the bandit's reaction offers a parley (one button per skill,
// with its DC) and a 5 sp toll. She pays the toll, passes, goes on to the
// den and leaves: the library keeps the loss and credits the peaceful XP. A
// second run pays the toll again and is abandoned: the coin comes back.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { act, launch } from "./fixtures/session-layout.mjs";
import {
  actionButton,
  clickAction,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { BEA, beaLibrary } from "./fixtures/charismatic-fighter.mjs";
import { banditToll } from "./fixtures/modules.mjs";
import { readAda } from "./fixtures/save-files.mjs";

/** Bea, with 2 gp in her purse. */
const RICH = { ...BEA, purse: 200 };

/** The bandit's band as the library's `number`th session meets her. */
function bandOf(seed, number) {
  const runtime = createFifthRuntime(banditToll, RICH);
  const random = createSeededRandom(sessionSeed(seed, number));
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  return runtime.handleAction(
    begun,
    { type: "move", destinationId: "rat-cellar" },
    random,
  ).state.reactions[0]?.roll.band;
}

// A seed whose first two sessions meet the bandit asking a toll.
const TOLLING = ["unfriendly", "uncertain"];
const seed = Array.from({ length: 200 }, (_, index) => index).find(
  (candidate) =>
    TOLLING.includes(bandOf(candidate, 1)) &&
    TOLLING.includes(bandOf(candidate, 2)),
);

test(
  `Bea pays the bandit's toll: kept on settlement, restored on abandonment (seed ${seed})`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-305-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, JSON.stringify(beaLibrary(RICH)));
    const server = await startFifthBrowserServer({
      libraryPath,
      seed,
      adventures: [banditToll],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(8000);
    const toll = () => actionButton(page, "react", "toll");
    try {
      await page.goto(server.url);
      await page
        .locator("#characters button")
        .filter({ hasText: "Bea" })
        .click();
      await startAdventure(page, "bandit-toll");

      await clickAction(page, "move", "rat-cellar");
      assert.match(
        await text(page.locator("#log li").last()),
        /Bandit sees you\. Reaction roll: 2d6 \(\d \+ \d\) \+ 3 Charisma = [5-8]: (unfriendly|uncertain)\. .* You may attack, parley \(Persuasion DC 12, Deception DC 14, Intimidation DC 13\) or pay the toll \(5 sp\)\./u,
      );
      // A parley button per skill, its skill and DC under it; the toll
      // names its price.
      const parleys = page.locator(
        'button.act[data-action="react"][data-target="parley"]',
      );
      assert.deepEqual(await parleys.allInnerTexts(), [
        "Parley",
        "Parley",
        "Parley",
      ]);
      assert.equal(
        await parleys.nth(1).getAttribute("aria-label"),
        "Parley with Deception DC 14",
      );
      assert.deepEqual(
        await page.locator("#feature-controls .approach").allInnerTexts(),
        ["Persuasion DC 12", "Deception DC 14", "Intimidation DC 13"],
      );
      assert.equal(await toll().innerText(), "Pay the toll (5 sp)");
      assert.equal(await actionButton(page, "move", "den").count(), 0);

      await clickAction(page, "react", "toll");
      assert.equal(
        await text(page.locator("#log li").last()),
        "You pay the toll of 5 sp. She bites a coin and waves you on. Bandit lets you pass: the encounter ends peacefully. Purse: 1 gp 5 sp.",
      );
      assert.equal(
        await page.locator("#purse").textContent(),
        "Purse: 1 gp 5 sp",
      );
      await clickAction(page, "move", "den");
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      const ending = await text(page.locator("#ending"));
      assert.ok(
        ending.includes("Parted peacefully with the Bandit: +25 XP"),
        ending,
      );

      // Settled: the library keeps the toll paid, and the peaceful XP.
      let record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.purse, 150);
      assert.equal(record.sheet.xp, BEA.xp + 25);
      await page.locator("#ending-next").click();
      await page.locator("#sheet").waitFor({ state: "visible" });
      assert.match(
        await text(page.locator("#sheet-body")),
        /Purse\n1 gp 5 sp\n/u,
      );

      // A second run pays again, then is abandoned: the coin comes back.
      const before = record.sheet;
      await startAdventure(page, "bandit-toll");
      await clickAction(page, "move", "rat-cellar");
      await clickAction(page, "react", "toll");
      assert.equal(await page.locator("#purse").textContent(), "Purse: 1 gp");
      await page.locator('#breadcrumb a[data-view="sheet"]').click();
      await page.locator("#abandon-adventure").click();
      await page.locator("#confirm-abandon").click();
      await page
        .locator("#feedback")
        .filter({ hasText: "Bea abandoned The Bandit's Toll." })
        .waitFor();
      record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.deepEqual(record.sheet, before);
      assert.equal(record.sheet.purse, 150);
      assert.match(
        await text(page.locator("#sheet-body")),
        /Purse\n1 gp 5 sp\n/u,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  `on a phone the reaction's options and the newest entry share the screen (seed ${seed})`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-305-phone-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, JSON.stringify(beaLibrary(RICH)));
    const server = await startFifthBrowserServer({
      libraryPath,
      seed,
      adventures: [banditToll],
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
        .filter({ hasText: "Bea" })
        .click();
      await startAdventure(page, "bandit-toll");
      // Attack, three parleys and the toll: every button, and the reaction
      // card, on screen at once.
      await act(page, "reaction", () =>
        actionButton(page, "move", "rat-cellar").click(),
      );
      assert.equal(
        await page
          .locator('#session-actions button[data-action="react"]')
          .count(),
        5,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
