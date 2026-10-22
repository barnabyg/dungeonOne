// Browser → API → storage: the scenarios of the four-module release handoff
// (docs/acceptance/four-module-release.md), each on its own library
// (tests/fixtures/libraries/) and seed, one per shipped module at a level of
// the career:
// - Scenario 1: a level-1 Fighter created in the browser beats Nib and
//   Snagtooth in the Bramblecote Cider House, takes the strongroom key from
//   Wick when he surrenders, empties the Pells' strongroom and leaves by the
//   river door at level 2.
// - Scenario 2: the level-2 Rogue Vex lowers the porter's rope down the
//   Abandoned Delve's old well, frees the goblin and asks it about the tomb,
//   beats Mags in the ossuary and climbs out of the shaft at level 3.
// - Scenario 3: the level-4 Fighter Ada (4,100 XP) wins the Coldwater
//   Weirgate's salt pork from Brindle, drains the culvert with the crank,
//   lures Old Sullage away with the pork, takes the wand and beats Grisk.
// - Scenario 4: the level-5 Fighter Ada wins the Thornwood Lodge's kennel
//   yard, feeds the bear through the serving hatch, takes the King's Hanger
//   from the hall without a fight and walks out.
// The library file holds what each ending says.
import assert from "node:assert/strict";
import test from "node:test";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { characterProfile } from "../dist/character-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { levelFourCareerLibrary, libraryAt } from "../dist/test-fighter-5e.js";
import { rogueLibrary, testRogueAt } from "../dist/test-rogue-5e.js";
import {
  createFighter,
  settled,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { journey } from "./fixtures/module-journey.mjs";
import { readAda } from "./fixtures/save-files.mjs";
import { firstFighter, launch } from "./fixtures/session-layout.mjs";

const input = (path) =>
  fileURLToPath(new URL(`./fixtures/libraries/${path}`, import.meta.url));

const modules = new Map(
  (await loadBuiltInFifthAdventures()).map((module) => [module.id, module]),
);

/**
 * A library holding only Vex at level 2, as in
 * tests/fixtures/libraries/level-2-vex.json. Regenerate the file
 * from this when the library format changes.
 */
const levelTwoVex = () => ({
  ...rogueLibrary(),
  characters: [{ sheet: testRogueAt(2), revision: 1 }],
});

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
function button(page, [action, target, item]) {
  if (action === "use") {
    return page.locator(
      `button.act[data-action="use-on"][data-target="${target}"][data-item="${item}"]`,
    );
  }
  return page
    .locator(`button.act[data-action="${action}"][data-target="${target}"]`)
    .first();
}

/** Whether a fight is on: the turn line names a round. */
const fighting = async (page) =>
  ((await page.locator("#turn").textContent()) ?? "").startsWith("Round");

/**
 * One fight turn by the handoff's rule, as `journey` with `browser` plays
 * it: the first enabled Attack button, then the extra attack with a second
 * light weapon, then End turn. No character here has a reaction to answer a
 * hit with, so no turn offers Take the hit.
 */
async function ruleTurn(page) {
  for (const choice of [
    page.locator("#attack-controls button.attack"),
    page.locator('button.act[data-action="light-attack"]'),
  ]) {
    if ((await choice.count()) > 0 && (await choice.first().isEnabled())) {
      return settled(page, () => choice.first().click());
    }
  }
  return settled(page, () =>
    page.locator('#feature-controls button[data-action="end-turn"]').click(),
  );
}

/** The character's HP as the status strip shows it, "13/28". */
const hp = async (page) =>
  /\d+\/\d+/u.exec(await page.locator("#character-hp").textContent())[0];

/**
 * Clicks each step of `route` but a closing `leave`, fighting each fight a
 * step starts to its end by the handoff's rule, and returns the HP each
 * fight ended at; a `leave` is answered Yes.
 */
async function play(page, route) {
  const ends = [];
  for (const step of route) {
    if (step[0] === "leave") {
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      continue;
    }
    await settled(page, () => button(page, step).click());
    let fought = false;
    while (await fighting(page)) {
      fought = true;
      await ruleTurn(page);
    }
    if (fought) {
      ends.push(await hp(page));
    }
  }
  return ends;
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

/**
 * Plays one scenario: checks the character starts with the handoff's
 * `[maxHp, armorClass]`, the engine journey reaches `endingId` on `seed`
 * and the input library is the generator's, then plays `route` in the
 * browser from a copy of the input (or, without one, the Fighter `sheet`
 * created there) and returns the page's history, ending, fight-end HP and
 * the saved record.
 */
async function scenario({
  name,
  moduleId,
  seed,
  library,
  sheet = library.data.characters[0].sheet,
  start,
  route,
  endingId,
}) {
  const { maxHp, armorClass } = characterProfile(sheet);
  assert.deepEqual([maxHp, armorClass], start);
  const module = modules.get(moduleId);
  const played = journey(module, sheet, seed, route, { browser: true });
  assert.equal(played.state.endingId, endingId);
  const directory = await mkdtemp(join(tmpdir(), `issue-448-${name}-`));
  const libraryPath = join(directory, "characters.json");
  if (library !== undefined) {
    assert.deepEqual(
      JSON.parse(await readFile(input(library.path), "utf8")),
      JSON.parse(JSON.stringify(library.data)),
    );
    await copyFile(input(library.path), libraryPath);
  }
  const { page, close } = await open(libraryPath, seed);
  try {
    if (library === undefined) {
      await createFighter(page);
    } else {
      await page
        .locator("#characters button")
        .filter({ hasText: sheet.name })
        .click();
    }
    const choices = await text(page.locator("#adventure-choices"));
    await startAdventure(page, moduleId);
    const ends = await play(page, route);
    const card = await ending(page);
    const log = await text(page.locator("#log"));
    await keep(name, log);
    return {
      choices,
      log,
      card,
      ends,
      record: await readAda(libraryPath),
    };
  } finally {
    await close();
    await rm(directory, { recursive: true, force: true });
  }
}

const CIDER_SEED = 138;

test(
  `four-module handoff 1: a new Fighter takes Wick's key in the Bramblecote Cider House and leaves with the Pells' goods (seed ${CIDER_SEED})`,
  { timeout: 180000 },
  async () => {
    const ada = firstFighter(CIDER_SEED);
    const { choices, log, card, ends, record } = await scenario({
      name: "cider",
      moduleId: "bramblecote-cider-house",
      seed: CIDER_SEED,
      sheet: ada,
      start: [13, 14],
      route: [
        ["move", "kitchen"],
        ["move", "press-house"],
        ["move", "hayloft"],
        ["talk", "the-key"],
        ["take", "strongroom-key"],
        ["move", "press-house"],
        ["move", "cellar-stair"],
        ["move", "cask-gallery"],
        ["unlock", "strongroom-door"],
        ["move", "pell-strongroom"],
        ["examine", "iron-chest"],
        ["take", "christening-cup"],
        ["take", "pell-savings"],
        ["move", "cask-gallery"],
        ["move", "river-door"],
        ["leave", "river-door"],
      ],
      endingId: "out-with-the-pells-goods",
    });
    assert.match(
      choices,
      /^The Bramblecote Cider House\nStart\nLevel 1\nMedium\n.*\nThe Abandoned Delve\nStart\nLevel 2\nMedium\n.*\nThe Coldwater Weirgate\nStart\nLevels 3–4\nMedium\n.*\nThe Thornwood Lodge\nStart\nLevels 4–5\nHard\n/u,
    );
    // Nib, then Snagtooth and Wick.
    assert.deepEqual(ends, ["13/13", "13/13"]);
    says(log, [
      /Nib is defeated\./u,
      /Ada attacks Snagtooth with Mace: [^\n]*Snagtooth has 0\/10 HP\./u,
      /Snagtooth is defeated\./u,
      /Wick checks morale as the first of its side falls: a Wisdom saving throw, 6 − 1 = 5 against DC 8\. Failure: it will surrender on its turn\./u,
      /Wick throws down its arms and surrenders\./u,
      /Wick offers you the Strongroom Key\./u,
      /You unlock the Strongroom Door with the Strongroom Key\./u,
      /You take the Pell Savings and put 30 gp in your purse\./u,
    ]);
    assert.match(card, /^Out with the Pells' goods\nEscaped with loot\n/u);
    assert.ok(
      card.includes(
        "Defeated Nib: +25 XP\nDefeated Snagtooth; spared Wick: +75 XP\nOut with the Pells' goods: +300 XP",
      ),
      card,
    );
    // One blow fells Snagtooth.
    assert.equal(log.match(/Ada attacks Snagtooth/gu).length, 1);
    assert.match(
      card,
      /Level up: Ada is now level 2\nHit points 13 → 22\. New features:\nAction Surge\n.*\nTactical Mind\n/u,
    );
    assert.equal(record.session, undefined);
    assert.deepEqual(
      [record.sheet.level, record.sheet.xp, record.sheet.purse],
      [2, 400, 3000],
    );
    assert.deepEqual(
      record.sheet.treasure.map(({ name }) => name),
      ["Pell Christening Cup"],
    );
  },
);

const DELVE_SEED = 190;

test(
  `four-module handoff 2: a level-2 Rogue goes down the Abandoned Delve's well, beats Mags and climbs out at level 3 (seed ${DELVE_SEED})`,
  { timeout: 180000 },
  async () => {
    const data = levelTwoVex();
    const { log, card, ends, record } = await scenario({
      name: "delve",
      moduleId: "abandoned-delve",
      seed: DELVE_SEED,
      library: { path: "level-2-vex.json", data },
      start: [15, 15],
      route: [
        ["move", "gate-hall"],
        ["move", "porters-lodge"],
        ["examine", "peg-rail"],
        ["take", "coil-of-rope"],
        ["move", "gate-hall"],
        ["move", "guard-post"],
        ["move", "dry-well"],
        ["use", "well-head", "coil-of-rope"],
        ["talk", "the-woman"],
        ["talk", "the-tomb"],
        ["move", "well-bottom"],
        ["examine", "silted-floor"],
        ["take", "wishing-coins"],
        ["move", "flooded-cistern"],
        ["examine", "drowned-delver"],
        ["take", "delvers-jasper"],
        ["move", "ossuary"],
        ["examine", "mags-satchel"],
        ["take", "satchel-gold"],
        ["take", "satchel-turquoise"],
        ["move", "shaft-bottom"],
        ["leave", "shaft-bottom"],
      ],
      endingId: "out-with-the-loot",
    });
    // The zombie, then Mags.
    assert.deepEqual(ends, ["15/15", "15/15"]);
    says(log, [
      /You take the Coil of Rope\./u,
      /Undead Fortitude: [^\n]*Failure: Zombie stays down\./u,
      /Zombie is defeated\./u,
      /You use the Coil of Rope on the Well Head\./u,
      /The Coil of Rope is used up\./u,
      /The way to the Well Bottom is open\./u,
      /Goblin: "One came down the shaft rope yesterday\. Mags, she called herself\./u,
      /Goblin: "The old lord's box opens if you press the carved hand on its side\./u,
      /Mags Corrow is defeated\./u,
      /Out with the loot\./u,
    ]);
    assert.match(card, /^Out with the loot\nEscaped with loot\n/u);
    assert.ok(
      card.includes(
        "Defeated Zombie: +50 XP\nDefeated Mags Corrow: +25 XP\nOut with the loot: +600 XP",
      ),
      card,
    );
    assert.match(card, /Level up: Vex is now level 3/u);
    assert.equal(record.session, undefined);
    assert.deepEqual(
      [record.sheet.level, record.sheet.xp, record.sheet.purse],
      [3, 975, 2100],
    );
    assert.deepEqual(
      record.sheet.treasure.map(({ name }) => name),
      ["Jasper", "Turquoise"],
    );
  },
);

const WEIRGATE_SEED = 188;

test(
  `four-module handoff 3: a level-4 Fighter lures the Coldwater Weirgate's ogre with salt pork, takes the wand and beats Grisk (seed ${WEIRGATE_SEED})`,
  { timeout: 180000 },
  async () => {
    const data = levelFourCareerLibrary();
    const { log, card, ends, record } = await scenario({
      name: "weirgate",
      moduleId: "coldwater-weirgate",
      seed: WEIRGATE_SEED,
      library: { path: "level-4-ada-4100-xp.json", data },
      start: [36, 14],
      route: [
        ["move", "barge-yard"],
        ["move", "kennel-larder"],
        ["examine", "meat-hooks"],
        ["take", "salt-pork"],
        ["move", "barge-yard"],
        ["move", "keepers-office"],
        ["examine", "chart-cupboard"],
        ["take", "windlass-crank"],
        ["move", "barge-yard"],
        ["move", "sluice-house"],
        ["use", "drain-gear", "windlass-crank"],
        ["move", "drain-mouth"],
        ["move", "outfall"],
        ["move", "pump-room"],
        ["use", "feeding-hatch", "salt-pork"],
        ["move", "lock-chamber"],
        ["examine", "guild-strongbox"],
        ["take", "guild-wand"],
        ["move", "pump-room"],
        ["move", "gear-hall"],
      ],
      endingId: "sluices-open",
    });
    // Brindle, then Grisk; the lured ogre is never fought.
    assert.deepEqual(ends, ["32/36", "32/36"]);
    says(log, [
      /Brindle is lying in wait in the Kennel Larder\..*you are surprised/u,
      /Brindle is defeated\./u,
      /You take the Side of Salt Pork\./u,
      /You use the Windlass Crank on the Drain Gear\./u,
      /The way to the Drain Mouth is open\./u,
      /something huge snores beneath it\./u,
      /You use the Side of Salt Pork on the Feeding Hatch\. [^\n]*Heavy steps drag after it toward the spillway/u,
      /The Side of Salt Pork is used up\./u,
      /Lock Chamber — /u,
      /You find the Gilded Guild Seal, Strongbox Gold and Wand of Magic Missiles\./u,
      /You take the Wand of Magic Missiles\./u,
      /Grisk is defeated\./u,
    ]);
    assert.doesNotMatch(log, /Old Sullage attacks/u);
    assert.match(card, /^The sluices open\nVictory\n/u);
    assert.ok(
      card.includes(
        "Defeated Brindle: +50 XP\nDefeated Grisk: +200 XP\nThe sluices open: +1800 XP",
      ),
      card,
    );
    assert.equal(record.session, undefined);
    assert.deepEqual([record.sheet.level, record.sheet.xp], [4, 6150]);
    assert.deepEqual(
      record.sheet.magicItems.map(({ wand, charges }) => [wand, charges]),
      [["wand-of-magic-missiles", 7]],
    );
  },
);

const LODGE_SEED = 190;

test(
  `four-module handoff 4: a level-5 Fighter feeds the Thornwood Lodge's bear and walks out with the King's Hanger (seed ${LODGE_SEED})`,
  { timeout: 180000 },
  async () => {
    const data = libraryAt(5);
    const { log, card, ends, record } = await scenario({
      name: "lodge",
      moduleId: "thornwood-lodge",
      seed: LODGE_SEED,
      library: { path: "level-5-ada.json", data },
      start: [44, 14],
      route: [
        ["examine", "woodpile"],
        ["take", "woodpile-potion"],
        ["take", "hooded-lantern"],
        ["move", "kennel-yard"],
        ["examine", "hounds-kennel"],
        ["take", "hunting-cup"],
        ["take", "kennel-gold"],
        ["move", "lodge-kitchen"],
        ["examine", "larder-hooks"],
        ["take", "venison-haunch"],
        ["use", "serving-hatch", "venison-haunch"],
        ["take", "cooks-purse"],
        ["move", "lodge-hall"],
        ["examine", "hall-hearth"],
        ["take", "kings-hanger"],
        ["move", "lodge-kitchen"],
        ["move", "kennel-yard"],
        ["move", "forest-gate"],
        ["leave", "forest-gate"],
      ],
      endingId: "out-with-the-spoils",
    });
    // The kennel yard; the fed bear doesn't fight.
    assert.deepEqual(ends, ["40/44"]);
    says(log, [
      /Hesk's Hound is defeated\./u,
      /Kennel Mastiff checks morale as the first of its side falls: a Wisdom saving throw, 7 \+ 1 = 8 against DC 8\. Success: it stands its ground\./u,
      /Kennel Mastiff is defeated\./u,
      /You use the Haunch of Venison on the Serving Hatch\. You heave the haunch through the hatch\. The bear falls on it with a roar\./u,
      /Lodge Hall — /u,
      /King's Hanger and stow it\./u,
      /Out with the spoils\./u,
    ]);
    assert.match(card, /^Out with the spoils\nEscaped with loot\n/u);
    assert.ok(
      card.includes(
        "Defeated Hesk's Hound and Kennel Mastiff: +225 XP\nOut with the spoils: +3800 XP",
      ),
      card,
    );
    assert.equal(record.session, undefined);
    assert.deepEqual(
      [record.sheet.level, record.sheet.xp, record.sheet.purse],
      [5, 10525, 4500],
    );
    assert.deepEqual(record.sheet.stowed, ["shortsword-plus-1"]);
    assert.deepEqual(
      record.sheet.treasure.map(({ name }) => name),
      ["Gilt Hunting Cup"],
    );
  },
);
