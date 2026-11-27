// Browser → API → storage: the scenarios of the four-module release handoff
// (docs/acceptance/four-module-release.md), each on its own library
// (tests/fixtures/libraries/) and seed, one per shipped module at a level of
// the career:
// - Scenario 1: a level-1 Fighter created in the browser beats Nib and
//   Snagtooth in the Bramblecote Cider House, takes the strongroom key from
//   Wick when he surrenders, empties the Pells' strongroom and leaves by the
//   river door at level 2.
// - Scenario 2 (#601, the reliever): the level-2 Fighter Ada fetches the
//   goblin up the Abandoned Delve's old well, reads the lord's order in the
//   tomb, refuses the Castellan's deal, holds him with the garrison's oath
//   and kills him, pays the dead at the muster bell and leaves by the gate
//   at level 3.
// - Scenario 2b (#601, the robber): the level-2 Rogue Vex takes a garrison
//   badge from the storeroom, walks past the posts, comes to terms with
//   Mags, takes the Castellan's deal and climbs out with the chest at
//   level 3, without a fight.
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
  clickAction,
  createFighter,
  settled,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { journey } from "./fixtures/module-journey.mjs";
import { readAda, sessionFile } from "./fixtures/save-files.mjs";
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
async function open(libraryPath, seed, roomNarrator) {
  const server = await startFifthBrowserServer({
    libraryPath,
    seed,
    roomNarrator,
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

/**
 * The button for a route step, as the handoff lists it: a step's third
 * part is the item a `use` uses, or else the approach of a check (#601);
 * a `use-feature` step names the feature, the opponent and the approach.
 */
function button(page, [action, target, item, approach]) {
  if (action === "use") {
    return page.locator(
      `button.act[data-action="use-on"][data-target="${target}"][data-item="${item}"]`,
    );
  }
  if (action === "use-feature") {
    return page.locator(
      `button.act[data-action="use-feature"][data-target="${item}"][data-feature="${target}"][data-approach="${approach}"]`,
    );
  }
  return page
    .locator(
      `button.act[data-action="${action}"][data-target="${target}"]${
        item === undefined ? "" : `[data-approach="${item}"]`
      }`,
    )
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
    page.locator("#encounter button.attack"),
    page.locator('button.act[data-action="light-attack"]'),
  ]) {
    if ((await choice.count()) > 0 && (await choice.first().isEnabled())) {
      return settled(page, () => choice.first().click());
    }
  }
  return clickAction(page, "end-turn");
}

/** The character's HP as the status strip shows it, "13/28". */
const hp = async (page) =>
  /\d+\/\d+/u.exec(await page.locator("#character-hp").textContent())[0];

/**
 * Clicks each step of `route` but a closing `leave`, fighting each fight a
 * step starts to its end by the handoff's rule, and returns the HP each
 * fight ended at; a `leave` is answered Yes. A fight is left for a
 * `use-feature` step after the one that starts it (#601), which opens it.
 */
async function play(page, route) {
  const ends = [];
  for (const [index, step] of route.entries()) {
    if (step[0] === "leave") {
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      continue;
    }
    await settled(page, () => button(page, step).click());
    if (route[index + 1]?.[0] === "use-feature") {
      continue;
    }
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

for (const outcome of ["narrated", "failed", "player acted"]) {
  test(
    `Lane Gate first impression: ${outcome}`,
    { timeout: 90_000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "lane-gate-"));
      const reply = Promise.withResolvers();
      const requests = [];
      const { page, close } = await open(
        join(directory, "characters.json"),
        outcome === "failed" ? 4 : CIDER_SEED,
        (facts) => {
          requests.push(facts);
          return facts.room === "Lane Gate"
            ? reply.promise
            : Promise.resolve("You arrive in the farmhouse kitchen.");
        },
      );
      try {
        await createFighter(page);
        await startAdventure(page, "bramblecote-cider-house");
        const opening = page.locator("#log [data-arrival]").first();
        const authored = await text(opening);
        assert.match(authored, /windfall apples/u);
        assert.equal(requests.length, 1);
        assert.deepEqual(Object.keys(requests[0]).sort(), [
          "description",
          "focus",
          "room",
        ]);
        assert.deepEqual(Object.keys(requests[0].focus).sort(), [
          "description",
          "name",
        ]);
        assert.equal(
          requests[0].focus.name,
          outcome === "failed" ? "Widow Ressa Pell" : "Cart Ruts",
        );
        assert.doesNotMatch(
          JSON.stringify(requests[0]),
          /small bare feet|spare key|behind the pendulum/iu,
        );
        const settledOpening = page.waitForResponse((response) =>
          response.url().endsWith("/api/5e/session/arrival"),
        );
        if (outcome === "player acted") {
          await clickAction(page, "examine", "cart-ruts");
        }
        if (outcome === "failed") {
          reply.reject(new Error("provider unavailable"));
        } else {
          reply.resolve("Soft apples scent the lane beside the muddy ruts.");
        }
        await settledOpening;
        if (outcome === "narrated") {
          await opening.filter({ hasText: "Soft apples scent" }).waitFor();
        }
        const first = await text(opening);
        if (outcome !== "narrated") {
          assert.equal(first, authored);
        }
        if (outcome === "narrated") {
          await clickAction(page, "move", "kitchen");
          await page
            .locator("#log li")
            .last()
            .filter({ hasText: "You arrive in the farmhouse kitchen." })
            .waitFor();
          await clickAction(page, "move", "lane-gate");
          const revisit = await text(page.locator("#log li").last());
          assert.match(revisit, /You’re back/u);
          assert.doesNotMatch(revisit, /small bare feet/u);
        }
        if (outcome !== "player acted") {
          await clickAction(page, "examine", "cart-ruts");
        }
        assert.match(
          await text(page.locator("#log li").last()),
          /small bare feet/u,
        );
        await clickAction(page, "move", "kitchen");
        await clickAction(page, "move", "lane-gate");
        const revisit = await text(page.locator("#log li").last());
        assert.match(revisit, /You’re back/u);
        assert.match(revisit, /small bare feet/u);
        const file = await sessionFile(directory);
        assert.equal(file.transitions.length, outcome === "narrated" ? 6 : 4);
        assert.ok(first.includes(file.history[0].cards[0].text));
        await page.reload();
        await opening.waitFor();
        assert.equal(await text(opening), first);
        assert.deepEqual(
          requests.map(({ room }) => room),
          ["Lane Gate", "Kitchen"],
        );
      } finally {
        reply.resolve("");
        await close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}

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
      /You take the Pell Savings and put 25 gp in your purse\./u,
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
      [2, 400, 2500],
    );
    assert.deepEqual(
      record.sheet.treasure.map(({ name }) => name),
      ["Pell Christening Cup"],
    );
  },
);

const RELIEVER_SEED = 0;

// #601, The Unrelieved Watch: the reliever takes up with the goblin, reads
// the lord's order, refuses the Castellan and pays the dead.
test(
  `four-module handoff 2: a level-2 Fighter relieves the Abandoned Delve's watch and leaves by the gate at level 3 (seed ${RELIEVER_SEED})`,
  { timeout: 240000 },
  async () => {
    const data = libraryAt(2);
    const { log, card, ends, record } = await scenario({
      name: "delve-reliever",
      moduleId: "abandoned-delve",
      seed: RELIEVER_SEED,
      library: { path: "level-2-ada.json", data },
      start: [20, 14],
      route: [
        ["move", "gate-hall"],
        ["examine", "standing-orders"],
        ["move", "porters-lodge"],
        ["examine", "peg-rail"],
        ["take", "coil-of-rope"],
        ["talk", "the-garrison"],
        ["move", "gate-hall"],
        ["move", "guard-post"],
        ["move", "dry-well"],
        ["use", "well-head", "coil-of-rope"],
        ["talk", "the-woman"],
        ["talk", "the-tomb"],
        ["talk", "the-bell"],
        ["move", "well-bottom"],
        ["move", "flooded-cistern"],
        ["move", "ossuary"],
        ["react", "attack"],
        ["move", "lords-tomb"],
        ["examine", "sarcophagus-lid", "investigation"],
        ["take", "death-mask"],
        ["take", "grave-coins"],
        ["move", "ossuary"],
        ["move", "shaft-bottom"],
        ["talk", "the-relief"],
        ["talk", "his-offer"],
        ["move", "shrine"],
        ["examine", "altar"],
        ["take", "bronze-key"],
        ["examine", "offering-box"],
        ["move", "shaft-bottom"],
        // Refusing the deal: the door, not the grille.
        ["unlock", "vault-door"],
        ["move", "vault"],
        ["use-feature", "iron-chest", "ghoul", "religion"],
        ["examine", "ghoul"],
        ["take", "pay-roll"],
        ["examine", "iron-chest"],
        ["take", "coin-chest"],
        ["take", "vault-garnet"],
        ["move", "shaft-bottom"],
        ["move", "ossuary"],
        ["move", "flooded-cistern"],
        ["move", "well-bottom"],
        ["move", "dry-well"],
        ["move", "guard-post"],
        ["move", "gate-hall"],
        ["use", "muster-bell", "pay-roll"],
        ["move", "broken-gate"],
        ["leave", "broken-gate"],
      ],
      endingId: "the-watch-stands-down",
    });
    // The zombie, Mags, then the Castellan, after the tomb's ward (3).
    assert.deepEqual(ends, ["20/20", "20/20", "17/20"]);
    says(log, [
      /Standing Orders: [^\n]*The watch is relieved when the lord's order is read at the muster bell and each man has his pay in his hand\./u,
      /You take the Coil of Rope\./u,
      /Hedda the Pedlar: "Forty men, told to hold till they were relieved\./u,
      /finds no badge there, and it comes at you with its fists\./u,
      /Zombie is defeated\./u,
      /You use the Coil of Rope on the Well Head\./u,
      /The way to the Well Bottom is open\./u,
      /Goblin: "Mags\. I showed her the way in for a fee/u,
      /Goblin: "The old lord's box opens if you press the carved hand on its side\./u,
      /Goblin: "The big bell in the hall is what they're waiting for\./u,
      /Mags Corrow sees you\. Reaction roll: [^\n]* = 8: uncertain\./u,
      /You attack Mags Corrow\./u,
      /Mags Corrow is defeated\./u,
      /Crowned-Skull Ward: [^\n]*wail fills your head\./u,
      /read this at the muster bell: the watch is relieved\. Pay each man what he is owed from the vault, by the roll, and let them go\./u,
      /Voice at the Grille: "I have it by heart\./u,
      /Voice at the Grille: "The chaplain's key opens this door/u,
      /I have turned the key on him and on the men's pay together/u,
      /You unlock the Vault Door with the Bronze Key\./u,
      /"I kept it," it says, and springs\./u,
      /You use the Iron Chest against Castellan\./u,
      /Castellan is paralysed by Ada's Iron Chest: [^\n]* for 3 turns\./u,
      /Castellan is defeated\./u,
      /You take the Pay Roll\./u,
      /You take the Garrison's Pay and put 45 gp in your purse\./u,
      /You use the Pay Roll on the Muster Bell, paying 22 gp 5 sp\./u,
      /tell them, in the old lord's name, that the watch is relieved\./u,
      /The Pay Roll is used up\./u,
      /The watch stands down\./u,
    ]);
    assert.match(card, /^The watch stands down\nVictory\n/u);
    assert.ok(
      card.includes(
        "Defeated Zombie: +50 XP\nDefeated Mags Corrow: +25 XP\nDefeated Castellan: +200 XP\nThe watch stands down: +600 XP",
      ),
      card,
    );
    assert.match(card, /Level up: Ada is now level 3/u);
    assert.equal(record.session, undefined);
    // 7 gp of grave coins and the chest's 45 gp, less the 22 gp 5 sp paid out.
    assert.deepEqual(
      [record.sheet.level, record.sheet.xp, record.sheet.purse],
      [3, 1175, 2950],
    );
    assert.deepEqual(
      record.sheet.treasure.map(({ name }) => name),
      ["Silver Death Mask", "Garnet"],
    );
  },
);

const ROBBER_SEED = 3;

// #601: the robber wears a badge past the posts, comes to terms with Mags
// and takes the Castellan's deal. No fight is fought.
test(
  `four-module handoff 2b: a level-2 Rogue walks past the Abandoned Delve's posts with a badge, takes the Castellan's deal and climbs out with the chest at level 3 (seed ${ROBBER_SEED})`,
  { timeout: 240000 },
  async () => {
    const data = levelTwoVex();
    const { log, card, ends, record } = await scenario({
      name: "delve-robber",
      moduleId: "abandoned-delve",
      seed: ROBBER_SEED,
      library: { path: "level-2-vex.json", data },
      start: [15, 15],
      route: [
        ["move", "gate-hall"],
        ["examine", "standing-orders"],
        ["force", "swollen-door"],
        ["move", "storeroom"],
        ["examine", "old-barrel"],
        ["take", "garrison-badge"],
        ["move", "gate-hall"],
        ["move", "barracks"],
        ["examine", "footlocker"],
        ["take", "soldiers-pay"],
        ["move", "gate-hall"],
        ["move", "guard-post"],
        ["examine", "overturned-table"],
        ["take", "guard-purse"],
        ["move", "dry-well"],
        ["search", "dry-well"],
        ["disarm", "loose-step", "thieves-tools"],
        ["move", "shrine"],
        ["examine", "altar"],
        ["take", "bronze-key"],
        ["move", "shaft-bottom"],
        ["react", "toll"],
        ["move", "ossuary"],
        ["talk", "the-badge"],
        ["talk", "the-voice"],
        ["move", "shaft-bottom"],
        ["talk", "his-offer"],
        ["use", "door-grille", "bronze-key"],
        ["unlock", "vault-door"],
        ["move", "vault"],
        ["examine", "iron-chest"],
        ["take", "coin-chest"],
        ["take", "vault-garnet"],
        ["move", "shaft-bottom"],
        ["leave", "shaft-bottom"],
      ],
      endingId: "out-with-the-loot",
    });
    assert.deepEqual(ends, []);
    assert.doesNotMatch(log, /Initiative/u);
    says(log, [
      /No one passes a post who does not wear the garrison's badge\./u,
      /You force the Swollen Door open\./u,
      /The alarm is raised by forcing the Swollen Door \(success\)\./u,
      /You take the Garrison Badge\./u,
      // With a badge the skeletons stand aside, and their words go (#621).
      /Barracks — Rows of collapsed bunks, and a footlocker at the far end\.\n/u,
      /You take the Soldier's Silver and put 2 gp 5 sp in your purse\./u,
      /Guard Post — [^\n]*A dead guard stands at its post/u,
      /You take the Guard's Purse and put 1 gp 8 sp in your purse\./u,
      /You find a Loose Step on the way to the Shrine/u,
      /You disarm the Loose Step\./u,
      /You take the Bronze Key\./u,
      /Mags Corrow sees you\. Reaction roll: [^\n]* = 6: uncertain\./u,
      /You pay the toll of 2 gp\./u,
      /Mags Corrow lets you pass: the encounter ends peacefully\./u,
      /Mags Corrow: "The dead look for one thing: a tin badge with a tower on it/u,
      /Mags Corrow: "There's something behind the bronze door that talks\./u,
      /Voice at the Grille: "The chaplain's key opens this door/u,
      /You use the Bronze Key on the Door Grille\./u,
      /Something thin in the rags of a steward's gown slips out with a roll of parchment under its arm/u,
      /You unlock the Vault Door with the Bronze Key\./u,
      /You take the Garrison's Pay and put 45 gp in your purse\./u,
      /Out with the garrison's pay\./u,
    ]);
    assert.match(card, /^Out with the garrison's pay\nEscaped with loot\n/u);
    assert.ok(
      card.includes(
        "Parted peacefully with Mags Corrow: +25 XP\nOut with the garrison's pay: +600 XP",
      ),
      card,
    );
    assert.match(card, /Level up: Vex is now level 3/u);
    assert.equal(record.session, undefined);
    // 2 gp 5 sp, 1 gp 8 sp and the chest's 45 gp, less Mags's 2 gp.
    assert.deepEqual(
      [record.sheet.level, record.sheet.xp, record.sheet.purse],
      [3, 925, 4730],
    );
    assert.deepEqual(
      record.sheet.treasure.map(({ name }) => name),
      ["Garnet"],
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
      /The strongbox holds a gilded seal, a bag of gold and a slim wand of pale wood\./u,
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

// 190 before the kennel yard's beasts lay in wait (#556).
const LODGE_SEED = 0;

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
    assert.deepEqual(ends, ["36/44"]);
    says(log, [
      // The beasts lie in wait (#556): Ada is surprised.
      /Kennel Mastiff's Stealth check: d20 12 \+ 2 = 14 against your passive Perception 13 \(10 \+ 0 Wisdom \+ 3 proficiency\)\. Success: you did not notice them, and you are surprised/u,
      /Kennel Mastiff is defeated\./u,
      /Hesk's Hound checks morale as the first of its side falls: a Wisdom saving throw, 18 \+ 1 = 19 against DC 6\. Success: it stands its ground\./u,
      /Hesk's Hound is defeated\./u,
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
