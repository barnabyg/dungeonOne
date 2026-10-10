// #342, browser → API → storage: a Cleric's level-4 card on the ending
// screen, then the sheet holding the next adventure until the Ability Score
// Improvement is chosen, the new cantrip learned and the new spell
// prepared; and a level-5 Cleric choosing Bestow Curse's curse in a fight.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  applyLevelChoice,
  buildCharacter,
  defaultPlacement,
  prepareSpells,
  settleCharacter,
  withOwedChoices,
} from "../dist/character-5e.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { CLERIC } from "../dist/cleric-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import {
  actionButton,
  clickAction,
  settled,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { moduleFile } from "./fixtures/modules.mjs";
import { readAda } from "./fixtures/save-files.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

/**
 * The rat tunnels, levels 1–5, with a bandit in the cellar and the stair
 * foot an exit whose escape ending gives 1 XP.
 */
const tunnels = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "bandit-tunnels";
  module.recommendedLevels = { min: 1, max: 5 };
  module.rooms.find(({ id }) => id === "stair-foot").exit = true;
  module.endings.push({
    id: "climbed-out",
    kind: "escape-without-loot",
    title: "Back up the stair",
    text: "You climb back out into the daylight.",
    xp: 1,
  });
  module.encounters.find(({ id }) => id === "cellar-rat").opponents = [
    { id: "bandit", monster: "bandit", description: "A bandit." },
  ];
  return validateModule(module);
})();

// Kept totals 15, 14, 13, 12, 10, 8: Wisdom 17, Constitution 15.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const earn = (sheet, xp, id) =>
  settleCharacter(sheet, {
    possessions: {
      equipment: sheet.equipment,
      stowed: sheet.stowed,
      ammunition: sheet.ammunition,
      treasure: [],
      purse: 0,
    },
    xp: [{ id: `${id}/ending/out`, name: "Out", xp }],
    finds: [],
    sold: [],
    coin: [],
    gear: [],
  });
const mira = buildCharacter(
  "a".repeat(32),
  "Mira",
  DICE,
  { ...CLERIC.defaults, placement: defaultPlacement(DICE, CLERIC) },
  "cleric",
);
/** Mira at level 3, one XP short of level 4, her spells chosen. */
const nearFour = withOwedChoices(
  earn(withOwedChoices(earn(mira, 300, "cellar")), 2399, "barrow"),
);
/** Mira at level 5 with Bestow Curse prepared. */
const atFive = (() => {
  const four = withOwedChoices(
    applyLevelChoice(earn(nearFour, 1, "near"), {
      increase: { wisdom: 1, constitution: 1 },
    }),
  );
  const five = withOwedChoices(earn(four, 3800, "tomb"));
  return prepareSpells(five, [
    ...five.spells.prepared.filter((id) => id !== "spirit-guardians"),
    "bestow-curse",
  ]);
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

/** Opens Mira's sheet in the library. */
async function openMira(page, url) {
  await page.goto(url);
  await page.locator("#characters button").filter({ hasText: "Mira" }).click();
  await page.locator("#sheet-name").filter({ hasText: "Mira" }).waitFor();
}

/** POSTs `body` to `path` from the page, as the page's own requests do. */
const post = (page, path, body) =>
  page.evaluate(
    async ([url, data]) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      return { status: response.status, body: await response.json() };
    },
    [path, body],
  );

test(
  "a Cleric's level-4 choice, cantrip and spell hold the next adventure until made (375px)",
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-342-browser-"));
    const libraryPath = await libraryWith(directory, nearFour);
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
      await openMira(page, server.url);
      await startAdventure(page, "bandit-tunnels");
      await actionButton(page, "leave", "stair-foot").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#level-up-title").innerText(),
        "Level up: Mira is now level 4",
      );
      assert.equal(
        await page.locator("#level-up-slots").innerText(),
        "Spell slots: 4 1st-level, 2 2nd-level → 4 1st-level, 3 2nd-level. Prepared spells: 6 → 7. Cantrips: 3 → 4.",
      );
      assert.equal(
        await page.locator("#level-up-learn").innerText(),
        "Learn 1 more cantrip on Mira's sheet before the next adventure.",
      );
      assert.equal(
        await page.locator("#level-up-prepare").innerText(),
        "Prepare 1 more spell on Mira's sheet before the next adventure.",
      );
      assert.equal(
        await page.locator("#level-up-choices").innerText(),
        "Choose an Ability Score Improvement on Mira's sheet before the next adventure.",
      );

      // The sheet asks for the improvement first and offers no adventure.
      await page.locator("#ending-next").click();
      await page.locator("#level-choice").waitFor({ state: "visible" });
      assert.equal(await page.locator(".start-adventure").count(), 0);
      assert.match(
        await text(page.locator("#adventure-choices")),
        /Choose Mira's level 4 Ability Score Improvement above before starting another adventure\./u,
      );
      const { revision } = JSON.parse(await readFile(libraryPath, "utf8"));
      const refused = await post(page, "/api/5e/adventures/start", {
        revision,
        characterId: mira.id,
        adventureId: "bandit-tunnels",
      });
      assert.equal(refused.status, 409);
      assert.match(refused.body.error, /Mira must choose the level 4/u);
      await page.locator("#asi-wisdom").check();
      await page.locator("#confirm-level-choice:enabled").click();
      await page.locator("#level-choice").waitFor({ state: "hidden" });

      // Then the cantrip and the spell, still before any adventure.
      await page.locator("#learn-cantrips").waitFor();
      assert.equal(await page.locator(".start-adventure").count(), 0);
      assert.match(
        await text(page.locator("#adventure-choices")),
        /Learn 1 more cantrip and prepare 1 more spell above before starting another adventure\./u,
      );
      assert.deepEqual(
        await page
          .locator("#learn-cantrips input")
          .evaluateAll((boxes) => boxes.map(({ id }) => id)),
        ["learn-thaumaturgy", "learn-light"],
      );
      await assertNoSideScroll(page, "the cantrip choice fits a phone", {
        wideFont: true,
      });
      await page.locator("#save-cantrips:disabled").waitFor();
      await page.locator("#learn-light").check();
      await page.locator("#save-cantrips").click();
      await page.locator("#learn-cantrips").waitFor({ state: "detached" });
      await page.locator("#prepared-protection-from-poison").check();
      await page.locator("#save-prepared").click();
      await page
        .locator('.start-adventure[data-adventure="bandit-tunnels"]')
        .waitFor();
      const { sheet } = await readAda(libraryPath);
      assert.equal(sheet.level, 4);
      assert.equal(sheet.abilities.wisdom, 19);
      assert.deepEqual(sheet.spells.cantrips, [
        "sacred-flame",
        "guidance",
        "resistance",
        "light",
      ]);
      assert.equal(sheet.spells.prepared.length, 7);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "a level-5 Cleric chooses Bestow Curse's curse in the fight's cast list",
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-342-browser-"));
    const libraryPath = await libraryWith(directory, atFive);
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [tunnels],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(8000);
    try {
      await openMira(page, server.url);
      await startAdventure(page, "bandit-tunnels");
      await clickAction(page, "move", "rat-cellar");
      const select = page.locator("#cast-spell");
      await select.waitFor();
      const options = await select.locator("option").allTextContents();
      assert.ok(
        options.includes(
          "Bestow Curse: disadvantage on its attacks against you (3rd-level slot)",
        ),
        options.join(" | "),
      );
      assert.ok(
        options.includes(
          "Bestow Curse: extra necrotic damage from your attacks and spells (3rd-level slot)",
        ),
      );
      await select.selectOption({
        label:
          "Bestow Curse: extra necrotic damage from your attacks and spells (3rd-level slot)",
      });
      await settled(page, () =>
        page.locator("button.act[data-action=cast]").click(),
      );
      assert.match(
        await text(page.locator("#log")),
        /You cast Bestow Curse at Bandit with a 3rd-level spell slot \(1 of 2 left\)\.\s+Bandit makes a Wisdom saving throw against Bestow Curse/u,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
