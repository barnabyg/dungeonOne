// #350, browser → API → storage: the increment 16 player handoff
// (docs/acceptance/increment-16-release.md), each scenario on its own
// library and seed, in The Hollow Chantry:
// - Scenario 1: the level-3 Fighter Ada takes the sexton's key, unlocks the
//   grille, beats the ghoul in the ossuary for the founder's +1 Mace, wields
//   it and lays the Risen Prior to rest. She can't read the Cure Wounds
//   scroll she finds.
// - Scenario 2: the level-3 Wizard Vela tries a long rest in the vestry and
//   the restless dead interrupt it; her second long rest restores her. She
//   reads the ward with Arcana, takes the priests' stair, casts Magic
//   Missile from the scroll she finds there and wins.
// - Scenario 3: the level-3 Cleric Mira turns the Dead Sexton, reads the
//   vestry's Cure Wounds scroll, takes a short rest, then goes down through
//   the grille with the sexton's key and wins.
// The library file holds what each ending says.
import assert from "node:assert/strict";
import test from "node:test";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { levelThreeLibrary } from "../dist/test-fighter-5e.js";
import { settled, startAdventure, text } from "./fixtures/browser-journey.mjs";
import { libraryOf, miraAt3, velaAt3 } from "./fixtures/level-3-casters.mjs";
import { journey } from "./fixtures/module-journey.mjs";
import { readAda } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

const input = (path) =>
  fileURLToPath(new URL(`../docs/acceptance/inputs/${path}`, import.meta.url));
const ADA_LIBRARY = input("increment-13/level-3-ada.json");
const MIRA_LIBRARY = input("increment-16/level-3-mira.json");
const VELA_LIBRARY = input("increment-16/level-3-vela.json");

const chantry = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "hollow-chantry",
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

/** The button for a route step, as the handoff lists it. */
function button(page, [action, target, approach]) {
  if (action === "long-rest") {
    return page.locator("#long-rest-controls button.act");
  }
  if (action === "rest") {
    return page.locator("#rest-controls button.act");
  }
  // A scroll's step names its spell, not an approach.
  const way = approach === undefined || action === "read" ? "" : approach;
  return page
    .locator(
      `button.act[data-action="${action}"][data-target="${target}"]` +
        (way === "" ? "" : `[data-approach="${way}"]`),
    )
    .first();
}

/** Whether a fight is on: the turn line names a round. */
const fighting = async (page) =>
  ((await page.locator("#turn").textContent()) ?? "").startsWith("Round");

/** The cantrip each caster casts by the handoff's rule. */
const CANTRIPS = { cleric: "Sacred Flame", wizard: "Fire Bolt" };

/**
 * One fight turn by the handoff's rule for `who`, the clicks a `journey`
 * with the same chooser makes: take a hit a reaction could answer; Mira
 * turns undead while both uses are left; Vela uses a scroll she holds
 * from the Items row; a caster chooses her cantrip and presses Cast; otherwise attack,
 * or end the turn.
 */
async function fightTurn(page, who) {
  const enabled = async (locator) =>
    (await locator.count()) > 0 && (await locator.first().isEnabled());
  const takeHit = page.locator('button.act[data-action="take-hit"]');
  const turn = page.locator('button.act[data-action="turn-undead"]');
  const cast = page.locator("button.act[data-action=cast]");
  const use = page.locator("button.act[data-action=cast-item]");
  const attack = page.locator("#attack-controls button.attack:enabled");
  if (await enabled(takeHit)) {
    return settled(page, () => takeHit.first().click());
  }
  // Channel Divinity's uses show on its row (#392).
  const uses = page.locator(
    '.action-row[data-row="channel-divinity"] .row-uses',
  );
  if (
    who === "cleric" &&
    (await enabled(turn)) &&
    (await uses.innerText()) === "2 of 2 left"
  ) {
    return settled(page, () => turn.first().click());
  }
  // A scroll's or wand's casts are the Items row's choice (#392).
  if (who === "wizard" && (await enabled(use))) {
    return settled(page, () => use.first().click());
  }
  if (who !== "fighter" && (await page.locator("#cast-spell").count()) > 0) {
    const label = `${CANTRIPS[who]} (cantrip)`;
    if (
      (await page.locator("#cast-spell option", { hasText: label }).count()) > 0
    ) {
      await page.locator("#cast-spell").selectOption({ label });
      if (await enabled(cast)) {
        return settled(page, () => cast.first().click());
      }
    }
  }
  if ((await attack.count()) > 0) {
    return settled(page, () => attack.first().click());
  }
  return settled(page, () =>
    page.locator('#feature-controls button[data-action="end-turn"]').click(),
  );
}

/** The character's HP as the status strip shows it, "13/28". */
const hp = async (page) =>
  /\d+\/\d+/u.exec(await page.locator("#character-hp").textContent())[0];

/**
 * Clicks each step of `route`, fighting each fight a step starts to its
 * end by `who`'s rule, and pushes the HP each fight ends at onto `ends`;
 * returns the history's text.
 */
async function play(page, route, who, ends = []) {
  for (const step of route) {
    await settled(page, () => button(page, step).click());
    let fought = false;
    while (await fighting(page)) {
      fought = true;
      await fightTurn(page, who);
    }
    if (fought) {
      ends.push(await hp(page));
    }
  }
  return text(page.locator("#log"));
}

/** The ending card's text, once the adventure is over. */
async function ending(page) {
  await page.locator("#ending").waitFor({ state: "visible" });
  return text(page.locator("#ending"));
}

/** Writes the history to DUNGEON_ONE_HANDOFF_LOG's folder, when set. */
async function keep(name, log) {
  const folder = process.env.DUNGEON_ONE_HANDOFF_LOG;
  if (folder !== undefined) {
    await writeFile(join(folder, `${name}.txt`), log);
  }
}

/** Asserts `log` says each of `quoted`, in order. */
function says(log, quoted) {
  let from = 0;
  for (const pattern of quoted) {
    const found = pattern.exec(log.slice(from));
    assert.ok(found, `${pattern} after:\n${log.slice(from)}`);
    from += found.index + found[0].length;
  }
}

const NAVE = [
  ["move", "nave"],
  ["examine", "altar"],
  ["take", "altar-potion"],
  ["take", "altar-second-potion"],
  ["examine", "sexton-pew"],
  ["take", "sexton-key"],
];

const FIGHTER_ROUTE = [
  ...NAVE,
  ["move", "vestry"],
  ["examine", "vestment-press"],
  ["take", "vestry-scroll"],
  ["take", "vestry-potion"],
  ["move", "nave"],
  ["unlock", "iron-grille"],
  ["move", "sexton-stair"],
  ["examine", "sexton-box"],
  ["take", "burial-fees"],
  ["take", "sexton-potion"],
  ["move", "ossuary"],
  ["examine", "founders-tomb"],
  ["take", "founders-mace"],
  ["take", "jet-brooch"],
  ["take", "founders-garnet"],
  ["swap", "mace-plus-1"],
  ["move", "sexton-stair"],
  ["move", "undercroft"],
];
// The handoff's seed for scenario 1: Ada wins every fight by the rule.
const FIGHTER_SEED = 0;

test(
  `increment 16 handoff 1: a Fighter goes down through the grille, wins the founder's +1 Mace and lays the prior to rest (seed ${FIGHTER_SEED})`,
  { timeout: 180000 },
  async () => {
    const [{ sheet: ada }] = levelThreeLibrary().characters;
    const played = journey(chantry, ada, FIGHTER_SEED, FIGHTER_ROUTE, {
      browser: true,
    });
    assert.equal(played.state.endingId, "chantry-at-rest");
    const directory = await mkdtemp(join(tmpdir(), "issue-350-fighter-"));
    const libraryPath = join(directory, "characters.json");
    await copyFile(ADA_LIBRARY, libraryPath);
    const { page, close } = await open(libraryPath, FIGHTER_SEED);
    try {
      await page
        .locator("#characters button")
        .filter({ hasText: "Ada" })
        .click();
      assert.match(
        await text(page.locator("#adventure-choices")),
        /The Hollow Chantry\nStart\nLevel 3\nMedium\n/u,
      );
      await startAdventure(page, "hollow-chantry");
      const ends = [];
      const log = await play(page, FIGHTER_ROUTE, "fighter", ends);
      // The HP Ada ends each fight at: nave, pit, ossuary, undercroft.
      assert.deepEqual(ends, ["28/28", "23/28", "13/28", "13/28"]);
      await keep("fighter", log);
      says(log, [
        /In the coat's pocket is a heavy iron key on a loop of twine\. You find the Sexton's Key\./u,
        /You unlock the Iron Grille with the Sexton's Key\./u,
        /Initiative: Ghoul 20 \+ 2 = 22; Ada/u,
        /Ada makes a Constitution saving throw against being paralysed: 14 \+ 4 = 18 against DC 10\. Success\./u,
        /Ghoul is defeated\./u,
        /You take the Founder's Mace and stow it\./u,
        /You stow the mace and wield the \+1 mace\. AC 14; \+1 Mace \+6 to hit, 1d6 \+ 4 bludgeoning\./u,
        /Ada attacks Risen Prior with \+1 Mace: 18 \+ 6 = 24 against AC 8\. Hit\. Damage 4 \+ 4 = 8 bludgeoning/u,
        /Risen Prior is defeated\./u,
      ]);
      // A Fighter carries the Cure Wounds scroll but can't read it.
      assert.equal(
        await page
          .locator(
            'button.act[data-action="read"][data-target="hollow-chantry/vestry-scroll"]:enabled',
          )
          .count(),
        0,
      );
      assert.match(await ending(page), /^The chantry at rest\n/u);
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      // The four fights' 350 and the ending's 400.
      assert.deepEqual(
        [record.sheet.level, record.sheet.xp],
        [3, ada.xp + 750],
      );
      assert.ok(record.sheet.equipment.includes("mace-plus-1"));
      assert.deepEqual(
        record.sheet.treasure.map(({ name }) => name),
        ["Jet Brooch", "Founder's Garnet"],
      );
      // She keeps the scroll she can't read.
      assert.deepEqual(
        record.sheet.magicItems.map(({ scroll }) => scroll),
        ["cure-wounds"],
      );
    } finally {
      await close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const WIZARD_ROUTE = [
  ["move", "nave"],
  ["move", "vestry"],
  ["long-rest"],
  ["long-rest"],
  ["move", "nave"],
  ["examine", "warding-sigils", "arcana"],
  ["move", "priests-stair"],
  ["examine", "lamp-niche"],
  ["take", "niche-scroll"],
  ["take", "niche-azurite"],
  ["move", "priors-cell"],
  ["move", "undercroft"],
];
/** An available cast of `spellId` among `views`. */
const casting = (views, spellId) =>
  views.find(
    ({ action, available, spell }) =>
      action === "cast" && available && spell.id === spellId,
  );
/** Vela casts from a scroll she holds, or else Fire Bolt. */
const fromScroll = (views) =>
  views.find(
    ({ action, available, spell }) =>
      action === "cast" && available && spell.item,
  ) ?? casting(views, "fire-bolt");
// The handoff's seed for scenario 2: the restless dead interrupt Vela's
// first long rest, the ward yields to Arcana and she wins every fight.
const WIZARD_SEED = 17;

test(
  `increment 16 handoff 2: a Wizard's rest is interrupted, she reads the ward and casts Magic Missile from a scroll (seed ${WIZARD_SEED})`,
  { timeout: 180000 },
  async () => {
    const sheet = velaAt3();
    const played = journey(chantry, sheet, WIZARD_SEED, WIZARD_ROUTE, {
      browser: true,
      cast: fromScroll,
    });
    assert.equal(played.state.endingId, "chantry-at-rest");
    // The input library is the one the handoff gives the owner.
    assert.deepEqual(
      JSON.parse(await readFile(VELA_LIBRARY, "utf8")),
      JSON.parse(JSON.stringify(libraryOf(sheet))),
    );
    const directory = await mkdtemp(join(tmpdir(), "issue-350-wizard-"));
    const libraryPath = join(directory, "characters.json");
    await copyFile(VELA_LIBRARY, libraryPath);
    const { page, close } = await open(libraryPath, WIZARD_SEED);
    try {
      await page
        .locator("#characters button")
        .filter({ hasText: "Vela" })
        .click();
      await startAdventure(page, "hollow-chantry");
      const ends = [];
      await play(page, WIZARD_ROUTE.slice(0, 2), "wizard", ends);
      assert.match(
        await page.locator("#long-rest-summary").textContent(),
        /^This is a safe place to rest\. Long rests: 1 of 1 left in this adventure/u,
      );
      const log = await play(page, WIZARD_ROUTE.slice(2), "wizard", ends);
      // Nave, the restless dead, the Prior's Cell, the undercroft.
      assert.deepEqual(ends, ["14/20", "7/20", "6/20", "6/20"]);
      await keep("wizard", log);
      says(log, [
        /Dead Sexton is defeated\./u,
        /You keep watch as you rest: d100 16, 25 or less: the Wandering Corpse comes upon you\. Your long rest is interrupted and restores nothing\./u,
        /Wandering Corpse is defeated\./u,
        /You take a long rest: you regain 13 HP \(20\/20 HP\) and 0 hit dice \(3 of 3 d6 left\)\. Long rests: 0 of 1 left in this adventure\./u,
        /Arcana check: d20 7 \+ 3 \+ 4 proficiency \(Expertise\) = 14 against DC 13\. Success\./u,
        /The way to the Priests' Stair is open\./u,
        /You take the Rolled Parchment\./u,
        /You cast Magic Missile at Prior's Guard from the Spell Scroll \(Magic Missile\), which is used up\./u,
        /Magic Missile: 3 missiles hit Prior's Guard\. Damage 4 \+ 2 \+ 3 \+ 3 = 12 force; Prior's Guard has 1\/13 HP\./u,
        /Risen Prior is defeated\./u,
      ]);
      assert.match(await ending(page), /^The chantry at rest\n/u);
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      // The Dead Sexton's, the Wandering Corpse's, the Prior's Guard's and
      // the Risen Prior's 50 each, and the ending's 400.
      assert.deepEqual(
        [record.sheet.level, record.sheet.xp],
        [3, sheet.xp + 600],
      );
      // The scroll was read: Vela keeps none.
      assert.deepEqual(record.sheet.magicItems, []);
    } finally {
      await close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const CLERIC_ROUTE = [
  ["move", "nave"],
  ["move", "vestry"],
  ["examine", "vestment-press"],
  ["take", "vestry-scroll"],
  ["take", "vestry-potion"],
  ["read", "hollow-chantry/vestry-scroll", "cure-wounds"],
  ["rest", 3],
  ["move", "nave"],
  ["examine", "sexton-pew"],
  ["take", "sexton-key"],
  ["unlock", "iron-grille"],
  ["move", "sexton-stair"],
  ["move", "undercroft"],
];
/** Mira turns undead with both uses left, or else casts Sacred Flame. */
const turnFirst = (views, state) =>
  views.find(
    ({ action, available }) =>
      action === "turn-undead" &&
      available &&
      state.character.featureUses["channel-divinity"] === 2,
  ) ?? casting(views, "sacred-flame");
// The handoff's seed for scenario 3: Mira is hurt enough after the nave to
// read the scroll and rest, and wins every fight.
const CLERIC_SEED = 59;

test(
  `increment 16 handoff 3: a Cleric turns undead, reads a Cure Wounds scroll and takes a short rest (seed ${CLERIC_SEED})`,
  { timeout: 180000 },
  async () => {
    const sheet = miraAt3();
    const played = journey(chantry, sheet, CLERIC_SEED, CLERIC_ROUTE, {
      browser: true,
      cast: turnFirst,
    });
    assert.equal(played.state.endingId, "chantry-at-rest");
    assert.deepEqual(
      JSON.parse(await readFile(MIRA_LIBRARY, "utf8")),
      JSON.parse(JSON.stringify(libraryOf(sheet))),
    );
    const directory = await mkdtemp(join(tmpdir(), "issue-350-cleric-"));
    const libraryPath = join(directory, "characters.json");
    await copyFile(MIRA_LIBRARY, libraryPath);
    const { page, close } = await open(libraryPath, CLERIC_SEED);
    try {
      await page
        .locator("#characters button")
        .filter({ hasText: "Mira" })
        .click();
      await startAdventure(page, "hollow-chantry");
      const ends = [];
      const log = await play(page, CLERIC_ROUTE, "cleric", ends);
      // Nave, pit, undercroft.
      assert.deepEqual(ends, ["3/24", "24/24", "15/24"]);
      await keep("cleric", log);
      says(log, [
        /You present a holy symbol: Turn Undead reaches Dead Sexton\. 1 use of Channel Divinity left\./u,
        /Dead Sexton makes a Wisdom saving throw against Turn Undead: 12 \+ 0 = 12 against DC 13\. Failure\./u,
        /Turn Undead ends on Dead Sexton: it is attacked\./u,
        /Dead Sexton is defeated\./u,
        /You cast Cure Wounds on yourself from the Spell Scroll \(Cure Wounds\), which is used up\./u,
        /Cure Wounds: 6 \+ 2 \+ 3 = 11; you regain 11 HP and have 14\/24 HP\./u,
        /You keep watch as you rest: d100 74, over 25: nothing disturbs you\./u,
        /You take a short rest and spend 2 hit dice \(1 of 3 d8 left\)\. Short rests: 1 of 2 left in this adventure\./u,
        /Channel Divinity regains 1 use \(2 of 2 left\)\./u,
        /You present a holy symbol: Turn Undead reaches Charnel Corpse\./u,
        /Risen Prior is defeated\./u,
      ]);
      assert.match(await ending(page), /^The chantry at rest\n/u);
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      // The three fights' 150 and the ending's 400.
      assert.deepEqual(
        [record.sheet.level, record.sheet.xp],
        [3, sheet.xp + 550],
      );
    } finally {
      await close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
