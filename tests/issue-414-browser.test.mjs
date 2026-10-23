// Browser → API → storage: two level-3 journeys through The Coldwater
// Weirgate, each on its own library (tests/fixtures/libraries/) and seed:
// - Scenario 1: the level-3 Fighter Ada beats Sergeant Larrow for the grate
//   key, rings the weir bell by failing to break the grate, unlocks it, and
//   drops the counterweight on Grisk in the gear hall. On the way, the map
//   shows the Toll Hall's record without moving her.
// - Scenario 2: the level-3 Rogue Vex finds the keeper's crank and drains
//   the culvert with it, beats the Lockjaw patrol that wanders into the
//   sluice-house, disengages and flees Old Sullage in the lock chamber, and
//   opens the sluices.
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
import { rogueLibrary } from "../dist/test-rogue-5e.js";
import {
  clickAction,
  settled,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { journey } from "./fixtures/module-journey.mjs";
import { readAda } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

const input = (path) =>
  fileURLToPath(new URL(`./fixtures/libraries/${path}`, import.meta.url));
const ADA_LIBRARY = input("level-3-ada.json");
const VEX_LIBRARY = input("level-3-vex.json");

const weirgate = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "coldwater-weirgate",
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
 * The handoff's special fight actions, as a `journey` chooser: in the Lock
 * Chamber, Disengage, then flee to the Pump Room; with `chain`, in the Gear
 * Hall, drop the counterweight by Athletics while it is offered.
 */
const special = (chain) => (views, state) => {
  if (state.roomId === "lock-chamber") {
    return (
      views.find(
        ({ action, available }) => action === "disengage" && available,
      ) ??
      views.find(
        ({ action, available, target }) =>
          action === "flee" && available && target.id === "pump-room",
      )
    );
  }
  if (chain && state.roomId === "gear-hall") {
    return views.find(
      ({ action, available, feature, approach }) =>
        action === "use-feature" &&
        available &&
        feature.id === "counterweight-chain" &&
        approach?.id === "athletics",
    );
  }
  return undefined;
};

/**
 * One fight turn by the handoff's rule, the clicks a `journey` with the
 * `special` chooser makes: with `chain`, in the Gear Hall, use the
 * Counterweight Chain by Athletics; otherwise attack, make the extra attack
 * with a second light weapon, or end the turn. Vex's flight from the Lock
 * Chamber is clicked by its test, step by step. Neither character has a
 * reaction to answer a hit with at level 3, so no turn offers Take the hit.
 */
async function fightTurn(page, chain) {
  const enabled = async (locator) =>
    (await locator.count()) > 0 && (await locator.first().isEnabled());
  const room = await page.locator("#room-title").textContent();
  const choices = [
    ...(chain && room === "Gear Hall"
      ? [
          page.locator(
            'button.act[data-action="use-feature"][data-feature="counterweight-chain"][data-approach="athletics"]',
          ),
        ]
      : []),
    page.locator("#encounter button.attack"),
    page.locator('button.act[data-action="light-attack"]'),
  ];
  for (const choice of choices) {
    if (await enabled(choice)) {
      return settled(page, () => choice.first().click());
    }
  }
  return settled(page, () =>
    page.locator('#encounter button[data-action="end-turn"]').click(),
  );
}

/** The character's HP as the status strip shows it, "13/28". */
const hp = async (page) =>
  /\d+\/\d+/u.exec(await page.locator("#character-hp").textContent())[0];

/**
 * Clicks each step of `route`, fighting each fight a step starts to its
 * end by the handoff's rule, and pushes the HP each fight ends at onto
 * `ends`; returns the history's text.
 */
async function play(page, route, ends, chain = false) {
  for (const step of route) {
    await settled(page, () => button(page, step).click());
    let fought = false;
    while (await fighting(page)) {
      fought = true;
      await fightTurn(page, chain);
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

/** Opens the map on the floor of `room` and shows its record. */
async function mapRecord(page, room) {
  await page.locator("#open-map").click();
  const box = page.locator(`.map-room[data-room='${room}'] > button`);
  const floors = page.locator("#map-floors button");
  for (let index = 0; (await box.count()) === 0; index += 1) {
    await floors.nth(index).click();
  }
  await box.click();
  const record = await text(page.locator("#map-record"));
  await page.locator("#close-map").click();
  return record;
}

const STAIR_ROUTE = [
  ["move", "toll-hall"],
  ["react", "attack"],
  ["examine", "sergeant-larrow"],
  ["take", "grate-key"],
  ["examine", "toll-chest"],
  ["take", "toll-potion"],
  ["take", "toll-takings"],
  ["move", "stair-head"],
  ["break", "iron-grate"],
  ["unlock", "iron-grate"],
  ["move", "stair-foot"],
  ["examine", "dead-goblin"],
  ["take", "satchel-potion"],
  ["move", "pump-room"],
];
const FIGHTER_ROUTE = [...STAIR_ROUTE, ["move", "gear-hall"]];
// The handoff's seed for scenario 1: the grate's break fails by 5 or more,
// and Ada wins both fights by the rule.
const FIGHTER_SEED = 129;

test(
  `increment 17 handoff 1: a Fighter rings the weir bell at the grate, checks the map and drops the counterweight on Grisk (seed ${FIGHTER_SEED})`,
  { timeout: 180000 },
  async () => {
    const [{ sheet: ada }] = levelThreeLibrary().characters;
    const played = journey(weirgate, ada, FIGHTER_SEED, FIGHTER_ROUTE, {
      browser: true,
      cast: special(true),
    });
    assert.equal(played.state.endingId, "sluices-open");
    assert.deepEqual(
      JSON.parse(await readFile(ADA_LIBRARY, "utf8")),
      JSON.parse(JSON.stringify(levelThreeLibrary())),
    );
    const directory = await mkdtemp(join(tmpdir(), "issue-414-fighter-"));
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
        /The Coldwater Weirgate\nStart\nLevels 3–4\nMedium\n/u,
      );
      await startAdventure(page, "coldwater-weirgate");
      const ends = [];
      await play(page, STAIR_ROUTE, ends);
      // The map, in the Pump Room: choosing the Toll Hall, a floor up,
      // shows its record without moving her.
      assert.equal(
        await mapRecord(page, "toll-hall"),
        [
          "Toll Hall",
          "Fight with Sergeant Larrow: won.",
          "Toll Chest: Under the day's takings lies a stoppered vial of red liquid.",
          "Sergeant Larrow's body: Grate Key and Sergeant Larrow's Coins",
        ].join("\n"),
      );
      assert.equal(
        await page.locator("#room-title").textContent(),
        "Pump Room",
      );
      // Once the bell has rung, every room says the alarm is raised; its
      // words were told once, in the break's result.
      assert.equal(
        await page.locator("#room-alarm").textContent(),
        "The alarm is raised.",
      );
      const log = await play(page, FIGHTER_ROUTE.slice(-1), ends, true);
      // The HP Ada ends each fight at: the Toll Hall, the Gear Hall.
      assert.deepEqual(ends, ["28/28", "18/28"]);
      await keep("fighter", log);
      says(log, [
        /Sergeant Larrow sees you\. Reaction roll: 2d6 \(2 \+ 4\) − 1 Charisma = 5: unfriendly\./u,
        /Sergeant Larrow is defeated\./u,
        /You find the Grate Key and Sergeant Larrow's Coins\./u,
        /Athletics check, at advantage \(Remarkable Athlete\): d20 3 and 4, keeping 4; 4 \+ 3 \+ 2 proficiency = 9 against DC 15\. Failure by 5 or more\./u,
        /The grate clangs against its frame, and the noise rings up through the keep\./u,
        /The alarm is raised by breaking down the Iron Grate \(failure by 5 or more\)\. The weir bell is clanging; boots drum on the wall-walk above\./u,
        /You unlock the Iron Grate with the Grate Key\./u,
        /The Bell-Wire Deadfall deals 1 \+ 1 = 2 bludgeoning; you have 26\/28 HP\./u,
        /The alarm carries through the dark: d100 21, over 15: nothing stirs\./u,
        /Initiative: Grisk 16 \+ 2 = 18; Ada/u,
        /Grisk attacks Ada with Scimitar: 11 \+ 4 = 15 against AC 14\. Hit\. Damage 6 \+ 2 = 8 slashing; Ada has 18\/28 HP\./u,
        /You use the Counterweight Chain against Grisk\./u,
        /Athletics check, at advantage \(Remarkable Athlete\): d20 20 and 20, keeping 20; 20 \+ 3 \+ 2 proficiency = 25 against DC 13\. Success by 5 or more\./u,
        /The Counterweight Chain hits Grisk\. Damage 5 \+ 4 \+ 0 = 9 bludgeoning; Grisk has 12\/21 HP\./u,
        /Grisk is knocked prone by Ada's Counterweight Chain/u,
        /Grisk is defeated\./u,
      ]);
      assert.match(await ending(page), /^The sluices open\nVictory\n/u);
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      // Larrow's 25, Grisk's 200 and the ending's 1,800 (500 until #443).
      assert.deepEqual(
        [record.sheet.level, record.sheet.xp],
        [4, ada.xp + 2025],
      );
      // The Day's Takings (20 gp until #443).
      assert.equal(record.sheet.purse, ada.purse + 4500);
    } finally {
      await close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const ROGUE_ROUTE = [
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
  ["move", "lock-chamber"],
  ["move", "gear-hall"],
];
// The step into the Lock Chamber, where Vex flees Old Sullage.
const INTO_THE_LOCK = ROGUE_ROUTE.length - 2;
// The handoff's seed for scenario 2: the Lockjaw patrol wanders into the
// sluice-house, and Vex wins every fight she stays in by the rule.
const ROGUE_SEED = 152;

test(
  `increment 17 handoff 2: a Rogue drains the culvert, meets a wandering patrol, flees the ogre and opens the sluices (seed ${ROGUE_SEED})`,
  { timeout: 180000 },
  async () => {
    const [{ sheet: vex }] = rogueLibrary().characters;
    const played = journey(weirgate, vex, ROGUE_SEED, ROGUE_ROUTE, {
      browser: true,
      cast: special(false),
    });
    assert.equal(played.state.endingId, "sluices-open");
    assert.deepEqual(
      JSON.parse(await readFile(VEX_LIBRARY, "utf8")),
      JSON.parse(JSON.stringify(rogueLibrary())),
    );
    const directory = await mkdtemp(join(tmpdir(), "issue-414-rogue-"));
    const libraryPath = join(directory, "characters.json");
    await copyFile(VEX_LIBRARY, libraryPath);
    const { page, close } = await open(libraryPath, ROGUE_SEED);
    try {
      await page
        .locator("#characters button")
        .filter({ hasText: "Vex" })
        .click();
      await startAdventure(page, "coldwater-weirgate");
      const ends = [];
      await play(page, ROGUE_ROUTE.slice(0, INTO_THE_LOCK), ends);
      // Old Sullage wakes in the Lock Chamber. Fleeing would draw its attack
      // until Vex disengages.
      await settled(page, () =>
        button(page, ROGUE_ROUTE[INTO_THE_LOCK]).click(),
      );
      const drawn = page.locator("#flee-attacks");
      assert.equal(
        await drawn.textContent(),
        "Draws an attack from Old Sullage",
      );
      await settled(page, () =>
        page.locator('button.act[data-action="disengage"]').click(),
      );
      assert.equal(await drawn.textContent(), "Draws no attacks");
      // From Flee's menu (#525).
      await clickAction(page, "flee", "pump-room");
      assert.equal(
        await page.locator("#room-title").textContent(),
        "Pump Room",
      );
      const log = await play(page, ROGUE_ROUTE.slice(INTO_THE_LOCK + 1), ends);
      // The Lockjaw patrol and Grisk.
      assert.deepEqual(ends, ["21/21", "21/21"]);
      await keep("rogue", log);
      says(log, [
        /Behind the charts hangs an iron crank with a square socket, worn bright with use\. You find the Windlass Crank\./u,
        /You listen as you go: d100 2, 15 or less: Patrolling Bandit and Patrol Bandit come upon you\./u,
        /Patrol Bandit is defeated\./u,
        /Patrolling Bandit is defeated\./u,
        /You use the Windlass Crank on the Drain Gear\. The crank fits the socket\./u,
        /The way to the Drain Mouth is open\./u,
        /Initiative: Old Sullage 11 − 1 = 10; Vex 4 \+ 4 = 8\./u,
        /Old Sullage attacks Vex with Greatclub: 7 \+ 6 = 13 against AC 15\. Miss\./u,
        /You disengage: fleeing this turn draws no attacks\./u,
        /You flee, disengaged: no foe gets an attack on you as you go\./u,
        /You get away from the Lock Chamber into the Pump Room, leaving Old Sullage behind\. The fight is unresolved:/u,
        /Grisk is defeated\./u,
      ]);
      assert.match(await ending(page), /^The sluices open\nVictory\n/u);
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      // The patrol's 50, Grisk's 200 and the ending's 1,800 (500 until
      // #443); nothing for the ogre she fled.
      assert.deepEqual(
        [record.sheet.level, record.sheet.xp],
        [4, vex.xp + 2050],
      );
    } finally {
      await close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
