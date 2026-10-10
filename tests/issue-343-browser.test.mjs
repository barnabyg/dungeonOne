// #343, browser → API → storage: a Wizard's level-2 card on the ending
// screen offering the spells for its spellbook and Scholar's Expertise,
// then the sheet holding the next adventure until both are chosen and the
// new spell prepared; and a level-3 card explaining the Evoker's features,
// then Scorching Ray written, prepared and cast in a fight.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  buildCharacter,
  defaultPlacement,
  settleCharacter,
  withOwedChoices,
} from "../dist/character-5e.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
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

// Kept totals 15, 14, 13, 12, 10, 8: Intelligence 17, Dexterity 14.
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
const vela = buildCharacter(
  "a".repeat(32),
  "Vela",
  DICE,
  { ...WIZARD.defaults, placement: defaultPlacement(DICE, WIZARD) },
  "wizard",
);
/** Vela one XP short of level 2. */
const nearTwo = earn(vela, 299, "cellar");
/** Vela at level 2, one XP short of level 3, her choices made. */
const nearThree = withOwedChoices(earn(vela, 899, "cellar"));

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

/** Opens Vela's sheet in the library. */
async function openVela(page, url) {
  await page.goto(url);
  await page.locator("#characters button").filter({ hasText: "Vela" }).click();
  await page.locator("#sheet-name").filter({ hasText: "Vela" }).waitFor();
}

/** Plays out by the stair for its 1 XP, to the ending screen. */
async function climbOut(page) {
  await startAdventure(page, "bandit-tunnels");
  await actionButton(page, "leave", "stair-foot").click();
  await page.locator("#confirm-leave").click();
  await page.locator("#ending").waitFor({ state: "visible" });
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

const ids = (locator) =>
  locator.evaluateAll((boxes) => boxes.map(({ id }) => id));

test(
  "a Wizard's level-2 spellbook spells, Expertise and prepared spell hold the next adventure until chosen (375px)",
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-343-browser-"));
    const libraryPath = await libraryWith(directory, nearTwo);
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
      await openVela(page, server.url);
      await climbOut(page);
      assert.equal(
        await page.locator("#level-up-title").innerText(),
        "Level up: Vela is now level 2",
      );
      // Scholar opens to its text.
      const scholar = page
        .locator("#level-up-features details")
        .filter({ hasText: "Scholar" });
      await scholar.locator("summary").click();
      assert.match(
        await scholar.innerText(),
        /Not chosen yet: Expertise in one skill you are proficient in among Arcana, History, Investigation, Medicine, Nature and Religion/u,
      );
      // The card offers the 1st-level spells the book lacks.
      assert.deepEqual(
        await page.locator("#level-up-spellbook summary").allInnerTexts(),
        ["Thunderwave", "Ray of Sickness", "Ice Knife"],
      );
      assert.match(
        await text(page.locator("#level-up")),
        /Write 2 of these into your spellbook on Vela's sheet before the next adventure:/u,
      );
      assert.equal(
        await page.locator("#level-up-expertise").innerText(),
        "Scholar: choose Expertise in Arcana or Investigation on Vela's sheet before the next adventure.",
      );
      assert.equal(
        await page.locator("#level-up-prepare").innerText(),
        "Prepare 1 more spell on Vela's sheet before the next adventure.",
      );

      // The sheet leads with the picks and offers no adventure.
      await page.locator("#ending-next").click();
      await page.locator("#expertise-card").waitFor();
      assert.equal(await page.locator(".start-adventure").count(), 0);
      assert.match(
        await text(page.locator("#adventure-choices")),
        /Choose Scholar's Expertise, write 2 more spells into the spellbook and prepare 1 more spell above before starting another adventure\./u,
      );
      const { revision } = JSON.parse(await readFile(libraryPath, "utf8"));
      const refused = await post(page, "/api/5e/adventures/start", {
        revision,
        characterId: vela.id,
        adventureId: "bandit-tunnels",
      });
      assert.equal(refused.status, 409);
      assert.match(refused.body.error, /Vela has 2 more spells to write/u);
      assert.deepEqual(await ids(page.locator("#expertise-choices input")), [
        "expertise-arcana",
        "expertise-investigation",
      ]);
      assert.deepEqual(await ids(page.locator("#spellbook-choices input")), [
        "spellbook-thunderwave",
        "spellbook-ray-of-sickness",
        "spellbook-ice-knife",
      ]);
      await assertNoSideScroll(page, "the level-2 picks fit a phone", {
        wideFont: true,
      });
      await page.locator("#save-expertise:disabled").waitFor();
      await page.locator("#expertise-arcana").check();
      await page.locator("#save-expertise").click();
      await page.locator("#expertise-card").waitFor({ state: "detached" });
      await page.locator("#spellbook-ray-of-sickness").check();
      await page.locator("#spellbook-ice-knife").check();
      // A third is disabled once two are ticked.
      assert.equal(
        await page.locator("#spellbook-thunderwave").isDisabled(),
        true,
      );
      await page.locator("#save-spellbook").click();
      await page.locator("#spellbook-card").waitFor({ state: "detached" });
      await page.locator("#prepared-ice-knife").check();
      await page.locator("#save-prepared").click();
      await page
        .locator('.start-adventure[data-adventure="bandit-tunnels"]')
        .waitFor();
      const { sheet } = await readAda(libraryPath);
      assert.equal(sheet.level, 2);
      assert.deepEqual(sheet.expertise, ["arcana"]);
      assert.deepEqual(sheet.spellbook.slice(6), [
        "ray-of-sickness",
        "ice-knife",
      ]);
      assert.equal(sheet.spells.prepared.length, 5);
      assert.match(
        await text(page.locator("#sheet-body")),
        /Arcana \+7 \(Expertise\)/u,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "a Wizard's level-3 card explains the Evoker, and Scorching Ray is written, prepared and cast",
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-343-browser-"));
    const libraryPath = await libraryWith(directory, nearThree);
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
      await openVela(page, server.url);
      await climbOut(page);
      assert.equal(
        await page.locator("#level-up-slots").innerText(),
        "Spell slots: 3 1st-level → 4 1st-level, 2 2nd-level. Prepared spells: 5 → 6.",
      );
      assert.deepEqual(
        await page.locator("#level-up-features summary").allInnerTexts(),
        ["Evoker: Evocation Savant", "Evoker: Potent Cantrip"],
      );
      const potent = page
        .locator("#level-up-features details")
        .filter({ hasText: "Potent Cantrip" });
      await potent.locator("summary").click();
      assert.match(
        await potent.innerText(),
        /misses with its attack roll, or its target succeeds on its saving throw, the target still takes half the cantrip's damage/u,
      );
      const spellbook = await page
        .locator("#level-up-spellbook summary")
        .allInnerTexts();
      assert.deepEqual(spellbook.slice(0, 3), [
        "Scorching Ray",
        "Shatter",
        "Hold Person",
      ]);
      await page.locator("#ending-next").click();
      await page.locator("#spellbook-card").waitFor();
      await page.locator("#spellbook-scorching-ray").check();
      await page.locator("#spellbook-mirror-image").check();
      await page.locator("#save-spellbook").click();
      await page.locator("#spellbook-card").waitFor({ state: "detached" });
      await page.locator("#prepared-scorching-ray").check();
      await page.locator("#save-prepared").click();
      await startAdventure(page, "bandit-tunnels");
      await clickAction(page, "move", "rat-cellar");
      const select = page.locator("#cast-spell");
      await select.waitFor();
      await select.selectOption({
        label: "Scorching Ray (2nd-level slot)",
      });
      await page.locator("#cast-targets").waitFor();
      assert.match(await text(page.locator("#cast-targets")), /Up to 3:/u);
      await settled(page, () =>
        page.locator("button.act[data-action=cast]").click(),
      );
      assert.match(
        await text(page.locator("#log")),
        /You cast Scorching Ray at Bandit with a 2nd-level spell slot \(1 of 2 left\)\./u,
      );
      const { sheet } = await readAda(libraryPath);
      assert.deepEqual(sheet.spellbook.slice(8), [
        "scorching-ray",
        "mirror-image",
      ]);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
