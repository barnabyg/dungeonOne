// #311, browser → API → storage: the increment 15 player handoff
// (docs/acceptance/increment-15-release.md), each scenario on its own library
// and seed, with the numbers the handoff quotes:
// - Scenario 1: a new Rogue is created with the default choices.
// - Scenario 2: the level-3 Rogue Vex meets an unfriendly Snikk at the toll
//   arch, wins him round with Persuasion and pays his toll, sneaks into the
//   counting hall and slips past the goblin (springing the scything blade),
//   sneaks back and ambushes it, picks the strongroom lock and walks out.
// - Scenario 3: the level-3 Fighter Ada attacks an indifferent Snikk anyway,
//   is surprised by the goblin lurking in the hall, and breaks the strongroom
//   door open on her second try.
// The library file holds what each ending says.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  buildCharacter,
  defaultPlacement,
  rollAbilitySet,
} from "../dist/character-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { ROGUE } from "../dist/rogue-5e.js";
import { levelThreeLibrary } from "../dist/test-fighter-5e.js";
import { rogueLibrary } from "../dist/test-rogue-5e.js";
import {
  actionButton,
  fight,
  settled,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { journey, xpOf } from "./fixtures/module-journey.mjs";
import { readAda } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

const input = (path) =>
  fileURLToPath(new URL(`../docs/acceptance/inputs/${path}`, import.meta.url));
const VEX_LIBRARY = input("increment-15/level-3-vex.json");
const ADA_LIBRARY = input("increment-13/level-3-ada.json");

const quay = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "mallow-counting-house",
);

/** A browser on a server for `libraryPath` on `seed`, and its page. */
async function open(libraryPath, seed) {
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
  await page.goto(server.url);
  return {
    page,
    close: async () => {
      await browser.close();
      await server.close();
    },
  };
}

/** The newest history entry's text. */
const lastEntry = (page) => text(page.locator("#log li").last());

/** Clicks the button for a route step, as the handoff lists it. */
async function click(page, [action, target, approach, retry]) {
  const selector =
    `button.act[data-action="${action}"][data-target="${target}"]` +
    (approach === undefined ? "" : `[data-approach="${approach}"]`) +
    (retry ? "[data-retry]" : "");
  await settled(page, () => page.locator(selector).first().click());
}

/** Leaves by the quay steps and returns the ending's text. */
async function leave(page) {
  await page.locator("#leave-controls button").click();
  await page.locator("#confirm-leave").click();
  await page.locator("#ending").waitFor({ state: "visible" });
  return text(page.locator("#ending"));
}

const COFFER = [
  ["move", "strongroom"],
  ["examine", "iron-coffer"],
  ["take", "coffer-garnet"],
  ["take", "coffer-garnet-2"],
  ["take", "chain-of-office"],
  ["take", "guild-gold"],
  ["move", "counting-hall"],
  ["move", "toll-arch"],
  ["move", "quay-steps"],
];
const TREASURE = ["Garnet", "Second Garnet", "Chain of Office"];

const CREATION_SEED = 0;

test(
  `increment 15 handoff 1: create a Rogue with the default choices (seed ${CREATION_SEED})`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-311-create-"));
    const libraryPath = join(directory, "characters.json");
    const { page, close } = await open(libraryPath, CREATION_SEED);
    try {
      await page.locator("#open-creation").click();
      await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
      await page.locator("#class-rogue").check();
      await page
        .locator("#preview-body")
        .filter({ hasText: "Sneak Attack" })
        .waitFor();
      assert.match(
        await text(page.locator("#kit-fields")),
        /Shortsword, dagger and leather\nLeather armour, Shortsword, Dagger, Thieves' tools \(47 gp\)/u,
      );
      await page.locator("#character-name").fill("Vex");
      await page.locator("#save-character").click();
      await page.locator("#sheet-name").filter({ hasText: "Vex" }).waitFor();
      const sheet = await text(page.locator("#sheet-body"));
      assert.match(sheet, /^Level 1 Rogue/u);
      assert.match(sheet, /HP: 11\/11/u);
      assert.match(sheet, /AC: 15/u);
      assert.match(sheet, /Stealth \+8 \(Expertise\)/u);
      assert.match(sheet, /Perception \+5 \(Expertise\)/u);
      assert.match(sheet, /Tools: Thieves' tools\./u);

      // Storage holds the Rogue the engine builds from the seed's dice.
      const stream = createHash("sha256")
        .update(`5e-ability-rolls:${CREATION_SEED}:1`)
        .digest()
        .readUInt32LE(0);
      const dice = rollAbilitySet(createSeededRandom(stream));
      const expected = buildCharacter(
        "a".repeat(32),
        "Vex",
        dice,
        { ...ROGUE.defaults, placement: defaultPlacement(dice, ROGUE) },
        "rogue",
      );
      const { sheet: saved } = await readAda(libraryPath);
      assert.deepEqual(
        { ...saved, id: expected.id },
        { ...expected, purse: saved.purse },
      );
      assert.deepEqual(saved.abilities, {
        strength: 8,
        dexterity: 18,
        constitution: 16,
        intelligence: 11,
        wisdom: 13,
        charisma: 12,
      });
    } finally {
      await close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const ROGUE_ROUTE = [
  ["examine", "mooring-bollard"],
  ["take", "bollard-potion"],
  ["move", "toll-arch"],
  ["react", "parley", "persuasion"],
  ["react", "toll"],
  ["sneak", "counting-hall"],
  ["move", "clerks-gallery"],
  ["examine", "tally-desk"],
  ["sneak", "counting-hall"],
  ["ambush", "counting-hall"],
  ["examine", "smashed-till"],
  ["take", "till-silver"],
  ["pick", "strongroom-door"],
  ...COFFER,
];
// The handoff's seed for scenario 2: Snikk is unfriendly, the parley
// succeeds, both sneaks leave Vex unseen and Vex wins the ambush. The engine
// journey checks that before the browser plays it.
const ROGUE_SEED = 8;

test(
  `increment 15 handoff 2: a Rogue parleys and pays the toll, slips past and ambushes the goblin, and picks the strongroom lock (seed ${ROGUE_SEED})`,
  { timeout: 120000 },
  async () => {
    const [{ sheet: vex }] = rogueLibrary().characters;
    const played = journey(
      quay,
      vex,
      ROGUE_SEED,
      [...ROGUE_ROUTE, ["leave", "quay-steps"]],
      { browser: true },
    );
    assert.equal(played.state.endingId, "out-with-the-guild-gold");
    // The input library is the one the handoff gives the owner.
    assert.deepEqual(
      JSON.parse(await readFile(VEX_LIBRARY, "utf8")),
      JSON.parse(JSON.stringify(rogueLibrary())),
    );
    const directory = await mkdtemp(join(tmpdir(), "issue-311-rogue-"));
    const libraryPath = join(directory, "characters.json");
    await copyFile(VEX_LIBRARY, libraryPath);
    const { page, close } = await open(libraryPath, ROGUE_SEED);
    try {
      await page
        .locator("#characters button")
        .filter({ hasText: "Vex" })
        .click();
      assert.match(
        await text(page.locator("#adventure-choices")),
        /The Counting-House on Mallow Quay\nStart\nLevels 3–4\nHard\n/u,
      );
      await startAdventure(page, "mallow-counting-house");
      const seen = [];
      for (const step of ROGUE_ROUTE) {
        await click(page, step);
        seen.push(await lastEntry(page));
        if (step[0] === "ambush") {
          await fight(page);
        }
      }
      const said = (pattern) =>
        assert.ok(
          seen.some((entry) => pattern.test(entry)),
          `${pattern} in:\n${seen.join("\n---\n")}`,
        );
      said(/Reaction roll: 2d6 \(3 \+ 1\) − 1 Charisma = 3: unfriendly\./u);
      said(
        /Persuasion check: d20 16 − 1 \+ 2 proficiency = 17 against DC 13\. Success\.[^]*now uncertain \(was unfriendly\)/u,
      );
      said(/You pay the toll of 5 gp\.[^]*Purse: 15 gp\./u);
      said(
        /Stealth check: d20 17 \+ 4 \+ 4 proficiency \(Expertise\) = 25 against DC 9\. Success\./u,
      );
      said(
        /You slip out of the Counting Hall unseen, past Soot Goblin\.[^]*halved to 2; you have 19\/21 HP\./u,
      );
      said(/Investigation check: d20 4 − 1 = 3 against DC 13\. Failure\./u);
      said(
        /You spring your ambush: Soot Goblin is surprised and rolls initiative with disadvantage\./u,
      );
      said(
        /Dexterity check with thieves' tools: d20 13 \+ 4 \+ 2 proficiency = 19 against DC 15\. Success\.[^]*You pick the Strongroom Door's lock\./u,
      );
      const ending = await leave(page);
      assert.match(ending, /^Out with the guild's gold\nEscaped with loot\n/u);
      // The goblin's 50, Snikk's peaceful 125 and the ending's 400.
      assert.deepEqual(
        xpOf(played.runtime, played.state).map(([, xp]) => xp),
        [50, 125, 400],
      );
      assert.match(
        ending,
        /\+50 XP[^]*\+125 XP[^]*Out with the guild's gold: \+400 XP/u,
      );

      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.deepEqual([record.sheet.level, record.sheet.xp], [3, 900 + 575]);
      // 20 gp, less the 5 gp toll, with the till's 6 gp and the coffer's 150.
      assert.equal(record.sheet.purse, 2000 - 500 + 600 + 15000);
      assert.deepEqual(
        record.sheet.treasure.map(({ name }) => name),
        TREASURE,
      );
    } finally {
      await close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const FIGHTER_ROUTE = [
  ["examine", "mooring-bollard"],
  ["take", "bollard-potion"],
  ["move", "toll-arch"],
  ["react", "attack"],
  ["move", "counting-hall"],
  ["examine", "smashed-till"],
  ["take", "till-silver"],
  ["break", "strongroom-door"],
  ["break", "strongroom-door", undefined, true],
  ...COFFER,
];
// The handoff's seed for scenario 3: Snikk is indifferent and Ada attacks
// anyway, the goblin surprises her, the first break fails and the second
// succeeds.
const FIGHTER_SEED = 6;

test(
  `increment 15 handoff 3: a Fighter is surprised by the lurking goblin and breaks the strongroom door on a second try (seed ${FIGHTER_SEED})`,
  { timeout: 120000 },
  async () => {
    const [{ sheet: ada }] = levelThreeLibrary().characters;
    const played = journey(
      quay,
      ada,
      FIGHTER_SEED,
      [...FIGHTER_ROUTE, ["leave", "quay-steps"]],
      { browser: true },
    );
    assert.equal(played.state.endingId, "out-with-the-guild-gold");
    const directory = await mkdtemp(join(tmpdir(), "issue-311-fighter-"));
    const libraryPath = join(directory, "characters.json");
    await copyFile(ADA_LIBRARY, libraryPath);
    const { page, close } = await open(libraryPath, FIGHTER_SEED);
    try {
      await page
        .locator("#characters button")
        .filter({ hasText: "Ada" })
        .click();
      await startAdventure(page, "mallow-counting-house");
      const seen = [];
      for (const step of FIGHTER_ROUTE) {
        if (step[0] === "break" && step[3] !== true) {
          // Ada carries no thieves' tools: the lock offers no Pick.
          assert.equal(
            await actionButton(page, "pick", "strongroom-door").count(),
            0,
          );
        }
        await click(page, step);
        seen.push(await lastEntry(page));
        // Attacking Snikk, and first entering the hall, start fights.
        if (step === FIGHTER_ROUTE[3] || step === FIGHTER_ROUTE[4]) {
          await fight(page);
        }
      }
      const said = (pattern) =>
        assert.ok(
          seen.some((entry) => pattern.test(entry)),
          `${pattern} in:\n${seen.join("\n---\n")}`,
        );
      said(/Reaction roll: 2d6 \(6 \+ 4\) − 1 Charisma = 9: indifferent\./u);
      said(
        /Soot Goblin's Stealth check: d20 9 \+ 6 = 15 against your passive Perception 12[^]*you are surprised and roll initiative with disadvantage\./u,
      );
      said(
        /Athletics check, at advantage \(Remarkable Athlete\): d20 2 and 6, keeping 6; 6 \+ 3 \+ 2 proficiency = 11 against DC 17\. Failure\./u,
      );
      said(
        /Another try at the Strongroom Door \(costs 1d4 bludgeoning damage\)\.[^]*you have 4\/28 HP\.[^]*= 24 against DC 17\. Success\.[^]*You break the Strongroom Door open\./u,
      );
      const ending = await leave(page);
      assert.match(ending, /^Out with the guild's gold\nEscaped with loot\n/u);
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      // Snikk's 200, the goblin's 50 and the ending's 400.
      assert.deepEqual(
        [record.sheet.level, record.sheet.xp],
        [3, ada.xp + 650],
      );
      assert.deepEqual(
        record.sheet.treasure.map(({ name }) => name),
        TREASURE,
      );
    } finally {
      await close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
