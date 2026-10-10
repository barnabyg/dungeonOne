// #341, browser → API → storage: a Cleric's level-up cards for levels 2
// and 3 on the ending screen (new features, slots, always-prepared and new
// spells, and the spells to prepare), the sheet holding the next adventure
// until they are prepared; and Turn Undead in a fight against undead, then
// leaving the room while every foe is turned (D13).
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
import { CLERIC } from "../dist/cleric-5e.js";
import { currentCombatant, everyFoeTurned } from "../dist/encounter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
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
 * The rat tunnels, levels 1–3, with a Zombie and a Ghoul in the cellar and
 * the stair foot an exit whose escape ending gives 1 XP.
 */
const tunnels = (() => {
  const module = moduleFile("rat-tunnels");
  module.id = "turning-tunnels";
  module.recommendedLevels = { min: 1, max: 3 };
  module.rooms.find(({ id }) => id === "stair-foot").exit = true;
  module.endings.push({
    id: "climbed-out",
    kind: "escape-without-loot",
    title: "Back up the stair",
    text: "You climb back out into the daylight.",
    xp: 1,
  });
  module.encounters.find(({ id }) => id === "cellar-rat").opponents = [
    { id: "zombie", monster: "zombie", description: "A shambling zombie." },
    { id: "ghoul", monster: "ghoul", description: "A grey-skinned ghoul." },
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
/** Mira one XP short of level 2, and of level 3 with five spells prepared. */
const nearTwo = earn(mira, 299, "far");
const nearThree = withOwedChoices(earn(mira, 899, "far"));
/** Mira at level 3 with every spell prepared. */
const atThree = withOwedChoices(earn(nearThree, 1, "near"));

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

/** Leaves the adventure from the stair foot and waits for the ending. */
async function leaveTunnels(page) {
  await actionButton(page, "leave", "stair-foot").click();
  await page.locator("#confirm-leave").click();
  await page.locator("#ending").waitFor({ state: "visible" });
}

const listed = async (page, selector) =>
  (await page.locator(`${selector} summary`).allTextContents()).map((name) =>
    name.trim(),
  );

test(
  "the level-up cards for a Cleric's levels 2 and 3, and the spells they leave to prepare",
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-341-browser-"));
    let server;
    const browser = await launch();
    try {
      // Level 2: Channel Divinity, a third slot, one more spell.
      let libraryPath = await libraryWith(directory, nearTwo);
      server = await startFifthBrowserServer({
        libraryPath,
        seed: 0,
        adventures: [tunnels],
        qualifies: () => true,
      });
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      page.setDefaultTimeout(8000);
      await openMira(page, server.url);
      await startAdventure(page, "turning-tunnels");
      await leaveTunnels(page);
      assert.equal(
        await page.locator("#level-up-title").innerText(),
        "Level up: Mira is now level 2",
      );
      assert.deepEqual(await listed(page, "#level-up-features"), [
        "Channel Divinity",
      ]);
      await page.locator("#level-up-features summary").first().click();
      assert.match(
        await text(page.locator("#level-up-features")),
        /Divine Spark: roll 1d8 \+ 3 \(Wisdom\)/u,
      );
      assert.equal(
        await page.locator("#level-up-slots").innerText(),
        "Spell slots: 2 1st-level → 3 1st-level. Prepared spells: 4 → 5.",
      );
      assert.equal(
        await page.locator("#level-up-prepare").innerText(),
        "Prepare 1 more spell on Mira's sheet before the next adventure.",
      );
      // The sheet holds the next adventure until the spell is prepared.
      await page.locator("#ending-next").click();
      await page.locator("#sheet-name").filter({ hasText: "Mira" }).waitFor();
      assert.equal(
        await page.locator("#prepare-owed").innerText(),
        "Level 2 lets you prepare 1 more: choose it before the next adventure.",
      );
      assert.equal(
        await page.locator(".start-adventure").count(),
        0,
        "no adventure can start",
      );
      assert.match(
        await text(page.locator("#adventure-choices")),
        /Prepare 1 more spell above before starting another adventure\./u,
      );
      await page.locator("#prepared-shield-of-faith").check();
      await page.locator("#save-prepared").click();
      await page
        .locator('.start-adventure[data-adventure="turning-tunnels"]')
        .waitFor();
      assert.deepEqual((await readAda(libraryPath)).sheet.spells.prepared, [
        ...CLERIC.defaults.spells.prepared,
        "shield-of-faith",
      ]);
      await server.close();

      // Level 3: the Life Domain, 2nd-level slots and spells.
      await rm(join(directory, "characters-adventures"), {
        recursive: true,
        force: true,
      });
      libraryPath = await libraryWith(directory, nearThree);
      server = await startFifthBrowserServer({
        libraryPath,
        seed: 0,
        adventures: [tunnels],
        qualifies: () => true,
      });
      await openMira(page, server.url);
      await startAdventure(page, "turning-tunnels");
      await leaveTunnels(page);
      assert.equal(
        await page.locator("#level-up-title").innerText(),
        "Level up: Mira is now level 3",
      );
      assert.deepEqual(await listed(page, "#level-up-features"), [
        "Life Domain: Life Domain Spells",
        "Life Domain: Disciple of Life",
        "Life Domain: Preserve Life",
      ]);
      assert.equal(
        await page.locator("#level-up-slots").innerText(),
        "Spell slots: 3 1st-level → 4 1st-level, 2 2nd-level. Prepared spells: 5 → 6.",
      );
      assert.deepEqual(await listed(page, "#level-up-always"), [
        "Aid",
        "Bless",
        "Cure Wounds",
        "Lesser Restoration",
      ]);
      assert.deepEqual(await listed(page, "#level-up-spells"), [
        "Spiritual Weapon",
        "Hold Person",
        "Protection from Poison",
        "Prayer of Healing",
      ]);
      await page.locator("#level-up-spells summary").nth(1).click();
      assert.match(
        await text(page.locator("#level-up-spells")),
        /humanoid only: Wisdom save or paralysed/u,
      );
      assert.equal(
        await page.locator("#level-up-prepare").innerText(),
        "Prepare 3 more spells on Mira's sheet before the next adventure.",
      );
      await page.locator("#ending-next").click();
      await page.locator("#sheet-name").filter({ hasText: "Mira" }).waitFor();
      // The domain's spells are listed, never offered to prepare.
      assert.match(
        await text(page.locator("#sheet-always-prepared")),
        /Aid\. \+5 maximum and current hit points/u,
      );
      assert.equal(await page.locator("#prepared-bless").count(), 0);
      for (const id of ["shield-of-faith", "spiritual-weapon", "hold-person"]) {
        await page.locator(`#prepared-${id}`).check();
      }
      await page.locator("#save-prepared").click();
      await page
        .locator('.start-adventure[data-adventure="turning-tunnels"]')
        .waitFor();
      assert.deepEqual((await readAda(libraryPath)).sheet.spells.prepared, [
        "guiding-bolt",
        "healing-word",
        "inflict-wounds",
        "shield-of-faith",
        "spiritual-weapon",
        "hold-person",
      ]);
    } finally {
      await browser.close();
      await server?.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

/**
 * A browser seed whose first session, after going down to the cellar, gives
 * Mira her turn with both undead failing Turn Undead's saves.
 */
const turningSeed = (() => {
  for (let seed = 0; seed < 500; seed++) {
    const runtime = createFifthRuntime(tunnels, atThree);
    const random = createSeededRandom(sessionSeed(seed, 1));
    let state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    state = runtime.handleAction(
      state,
      { type: "move", destinationId: "rat-cellar" },
      random,
    ).state;
    if (
      state.status !== "playing" ||
      currentCombatant(state.encounter)?.id !== "pc"
    ) {
      continue;
    }
    const turned = runtime.handleAction(
      state,
      { type: "turn-undead", actorId: "pc" },
      random,
    );
    if (everyFoeTurned(turned.state.encounter, "pc")) {
      return seed;
    }
  }
  throw new Error("no seed below 500 turns both undead on Mira's first turn");
})();

test(
  `Turn Undead turns a Zombie and a Ghoul, and Mira leaves them turned (375px, seed ${turningSeed})`,
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-341-browser-"));
    const libraryPath = await libraryWith(directory, atThree);
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: turningSeed,
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
      await startAdventure(page, "turning-tunnels");
      await clickAction(page, "move", "rat-cellar");
      const turn = actionButton(page, "turn-undead");
      await turn.waitFor();
      assert.equal(
        (await turn.innerText()).trim(),
        "Turn Undead (2 of 2 left)",
      );
      // Divine Spark is chosen with its target and mode.
      assert.deepEqual(
        await page.locator("#spark-choice option").allTextContents(),
        [
          "Zombie: radiant damage",
          "Zombie: necrotic damage",
          "Ghoul: radiant damage",
          "Ghoul: necrotic damage",
        ],
      );
      await assertNoSideScroll(page, "the Cleric's fight bar", {
        wideFont: true,
      });
      await settled(page, () => turn.click());
      assert.match(
        await text(page.locator("#log")),
        /Turn Undead reaches Zombie and Ghoul\. 1 use of Channel Divinity left\./u,
      );
      assert.match(
        await text(page.locator("#log")),
        /Zombie is frightened by Mira's Turn Undead/u,
      );
      // Every foe turned: the way back up is open.
      await clickAction(page, "move", "stair-foot");
      assert.match(
        await text(page.locator("#log")),
        /You leave the Rat-Gnawed Cellar with the Zombie and the Ghoul still turned\./u,
      );
      const folder = join(directory, "characters-adventures");
      const [name] = (await readdir(folder)).filter((file) =>
        file.endsWith(".json"),
      );
      const saved = JSON.parse(await readFile(join(folder, name), "utf8"));
      assert.equal(saved.state.roomId, "stair-foot");
      assert.equal(saved.state.encounter, undefined);
      assert.equal(saved.state.character.featureUses["channel-divinity"], 1);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
