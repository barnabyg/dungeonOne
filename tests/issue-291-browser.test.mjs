// #291, browser → API → storage: the increment 14 player handoff
// (docs/acceptance/increment-14-release.md), each scenario on its own library
// and seed, with the numbers the handoff quotes:
// - Scenario 1: the 2,690 XP Ada of #286 wins the Drowned Chapel and settles
//   at level 4, owing her choices.
// - Scenario 2: a level-4 Ada with 4,100 XP (about a career's after the
//   earlier modules) finds the Thornwood Lodge under levels 4–5 and Hard, wins
//   Brann over with Persuasion (a check with two approaches) to open the
//   poachers' hide, wins the kennel yard and walks out with its loot; the
//   ending's 2,600 XP takes her to level 5 with Extra Attack.
// - Scenario 3: the level-5 Ada of #287 fails the trophy wall, fetches the
//   lantern for another try, succeeds by 5, opens the hatch at advantage and
//   finds and disarms the man-trap.
// The library file holds what each ending says.
import assert from "node:assert/strict";
import test from "node:test";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { levelFourCareerLibrary } from "../dist/test-fighter-5e.js";
import { launch } from "./fixtures/session-layout.mjs";
import {
  clickAction,
  fight,
  settled,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { journey, xpOf } from "./fixtures/module-journey.mjs";
import { readAda } from "./fixtures/save-files.mjs";

const LIBRARY = fileURLToPath(
  new URL(
    "../docs/acceptance/inputs/increment-14/level-4-ada-4100-xp.json",
    import.meta.url,
  ),
);

const lodge = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "thornwood-lodge",
);
const [{ sheet }] = levelFourCareerLibrary().characters;

const ROUTE = [
  ["examine", "woodpile"],
  ["take", "woodpile-potion"],
  ["take", "hooded-lantern"],
  ["talk", "the-poachers-path", "persuasion"],
  ["move", "poachers-hide"],
  ["examine", "poachers-cache"],
  ["take", "hide-potion"],
  ["take", "trap-tongs"],
  ["move", "forest-gate"],
  ["move", "kennel-yard"],
  ["examine", "hounds-kennel"],
  ["take", "hunting-cup"],
  ["take", "kennel-gold"],
  ["move", "forest-gate"],
];

// The handoff's seed for scenario 2: Ada's clicks win Brann over, kill all
// three beasts (none flees, so each gives its full XP) and walk out with the
// loot. The engine journey checks that before the browser plays it.
const seed = 2;

test(
  `Thornwood Lodge handoff: a level-4 Fighter talks her way to the poachers' hide, wins the kennel yard and reaches level 5 (seed ${seed})`,
  { timeout: 120000 },
  async () => {
    const played = journey(
      lodge,
      sheet,
      seed,
      [...ROUTE, ["leave", "forest-gate"]],
      { browser: true },
    );
    assert.equal(played.state.endingId, "out-with-the-spoils");
    assert.deepEqual(xpOf(played.runtime, played.state)[0], [
      "Defeated Hesk's Hound, Kennel Mastiff 1 and Kennel Mastiff 2",
      250,
    ]);
    // The input library is the one the handoff gives the owner.
    assert.deepEqual(
      JSON.parse(await readFile(LIBRARY, "utf8")),
      JSON.parse(JSON.stringify(levelFourCareerLibrary())),
    );
    const directory = await mkdtemp(join(tmpdir(), "issue-291-browser-"));
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
        /The Thornwood Lodge\nStart\nLevels 4–5\nHard\n/u,
      );
      await startAdventure(page, "thornwood-lodge");
      for (const [action, target, approach] of ROUTE) {
        if (action === "talk") {
          // One Talk button per approach: Persuasion or Intimidation.
          await settled(page, () =>
            page
              .locator(
                `button.act[data-action="talk"][data-target="${target}"][data-approach="${approach}"]`,
              )
              .click(),
          );
          assert.match(
            await text(page.locator("#log li").last()),
            /Persuasion check/u,
          );
          continue;
        }
        await clickAction(page, action, target);
        // Entering the yard starts the kennel fight: fight it out.
        if (action === "move" && target === "kennel-yard") {
          await fight(page);
        }
      }
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      const ending = await text(page.locator("#ending"));
      assert.match(ending, /^Out with the spoils\nEscaped with loot\n/u);
      assert.ok(
        ending.includes(
          "Defeated Hesk's Hound, Kennel Mastiff 1 and Kennel Mastiff 2: +250 XP\nOut with the spoils: +2350 XP",
        ),
        ending,
      );
      assert.equal(
        await page.locator("#level-up-title").textContent(),
        "Level up: Ada is now level 5",
      );
      assert.match(
        await page.locator("#level-up").innerText(),
        /Extra Attack/u,
      );

      // Storage holds what the ending says.
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.deepEqual([record.sheet.level, record.sheet.xp], [5, 4100 + 2600]);
      assert.equal(record.sheet.purse, 3000);
      assert.deepEqual(
        record.sheet.treasure.map(({ name }) => name),
        ["Gilt Hunting Cup"],
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const LEVEL_FIVE = fileURLToPath(
  new URL(
    "../docs/acceptance/inputs/issue-287/level-5-ada.json",
    import.meta.url,
  ),
);
/** The checks scenario's seed: the handoff's numbers are this seed's. */
const CHECKS_SEED = 1;

/** A check's button: by approach, and the retry's own button. */
const checkButton = (page, action, target, { approach, retry } = {}) =>
  page.locator(
    `button.act[data-action="${action}"][data-target="${target}"]` +
      (approach === undefined ? "" : `[data-approach="${approach}"]`) +
      (retry ? "[data-retry]" : ":not([data-retry])"),
  );
const lastEntry = (page) => text(page.locator("#log li").last());

test(
  `Thornwood Lodge handoff: a level-5 Fighter fails the trophy wall, retries it with the lantern, opens the hatch and finds the man-trap (seed ${CHECKS_SEED})`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-291-checks-"));
    const libraryPath = join(directory, "characters.json");
    await copyFile(LEVEL_FIVE, libraryPath);
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: CHECKS_SEED,
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(8000);
    const click = (action, target, options) =>
      settled(page, () => checkButton(page, action, target, options).click());
    try {
      await page.goto(server.url);
      await page
        .locator("#characters button")
        .filter({ hasText: "Ada" })
        .click();
      await startAdventure(page, "thornwood-lodge");
      await clickAction(page, "examine", "woodpile");
      await clickAction(page, "take", "woodpile-potion");
      await clickAction(page, "move", "kennel-yard");
      await fight(page);
      assert.match(
        await text(page.locator("#character-hp")),
        /40\/44/u,
        "Ada wins the kennel yard at 40/44 HP",
      );
      await clickAction(page, "move", "lodge-hall");
      await fight(page);

      // The trophy wall offers one Examine per approach.
      assert.equal(
        await checkButton(page, "examine", "trophy-wall", {
          approach: "history",
        }).count(),
        1,
      );
      await click("examine", "trophy-wall", { approach: "perception" });
      assert.match(
        await lastEntry(page),
        /^Perception check: d20 11 \+ 0 \+ 3 proficiency = 14 against DC 15\. Failure\./u,
      );
      // No lantern yet: no other try.
      assert.equal(
        await checkButton(page, "examine", "trophy-wall", {
          approach: "perception",
          retry: true,
        }).count(),
        0,
      );
      await clickAction(page, "move", "kennel-yard");
      await clickAction(page, "move", "forest-gate");
      await clickAction(page, "take", "hooded-lantern");
      await clickAction(page, "move", "kennel-yard");
      await clickAction(page, "move", "lodge-hall");
      await click("examine", "trophy-wall", {
        approach: "perception",
        retry: true,
      });
      const retried = await lastEntry(page);
      assert.match(
        retried,
        /Another try at the Trophy Wall \(Hooded Lantern\)\.\nPerception check: d20 17 \+ 0 \+ 3 proficiency = 20 against DC 15\. Success by 5 or more\./u,
      );
      assert.match(
        retried,
        /You find the Topaz\.\nYou find the Potion of Healing\./u,
      );

      await click("examine", "ice-house-hatch", { approach: "athletics" });
      assert.match(
        await lastEntry(page),
        /^Athletics check, at advantage \(Remarkable Athlete\): d20 9 and 16, keeping 16; 16 \+ 4 \+ 3 proficiency = 23 against DC 15\. Success\.[\s\S]*The way to the Ice House is open\./u,
      );
      await clickAction(page, "search", "lodge-hall");
      assert.match(await lastEntry(page), /You find a Man-trap/u);
      await clickAction(page, "disarm", "gallery-man-trap");
      assert.match(await lastEntry(page), /You disarm the Man-trap\./u);
      await clickAction(page, "take", "trophy-topaz");
      await clickAction(page, "take", "trophy-potion");
      await clickAction(page, "move", "kennel-yard");
      await clickAction(page, "move", "forest-gate");
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.ok(
        (await text(page.locator("#ending"))).includes(
          "Defeated Hesk's Hound, Kennel Mastiff 1 and Kennel Mastiff 2: +250 XP\nDefeated the Baiting Bear: +200 XP\nOut with the spoils: +2350 XP",
        ),
      );
      const record = await readAda(libraryPath);
      assert.equal(record.sheet.xp, 6500 + 2800);
      assert.deepEqual(
        record.sheet.treasure.map(({ name }) => name),
        ["Topaz"],
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const LEVEL_THREE = fileURLToPath(
  new URL(
    "../docs/acceptance/inputs/issue-286/level-3-ada-2690-xp.json",
    import.meta.url,
  ),
);

test(
  "increment 14 handoff: the Drowned Chapel takes the 2,690 XP Ada to level 4, owing her choices (seed 0)",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-291-level-4-"));
    const libraryPath = join(directory, "characters.json");
    await copyFile(LEVEL_THREE, libraryPath);
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
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
      await startAdventure(page, "drowned-chapel");
      await clickAction(page, "move", "flooded-nave");
      assert.match(
        await lastEntry(page),
        /Initiative: Ada 12 \+ 2 = 14; Drowned Sexton 11 − 2 = 9\./u,
      );
      await fight(page);
      await clickAction(page, "examine", "sunken-altar");
      await clickAction(page, "take", "silver-reliquary");
      await clickAction(page, "take", "moss-agate");
      await clickAction(page, "move", "chapel-porch");
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#level-up-title").textContent(),
        "Level up: Ada is now level 4",
      );
      const record = await readAda(libraryPath);
      assert.deepEqual(
        [record.sheet.level, record.sheet.xp, record.sheet.hp],
        [4, 3040, 36],
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
