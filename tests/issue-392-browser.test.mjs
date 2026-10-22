// #392, browser → API: the fight's actions in labelled rows. A level-2
// Cleric facing a zombie sees Cast a spell, Channel Divinity and Weapons, in
// that order and in tab order, under the fight panel's cards and footer
// (#525), whose zombie card's attack names the mace and whose End turn says
// what it leaves unused; Channel Divinity's uses show once; and holding the
// dagger in the other hand, which can't work beside a mace, isn't offered. A
// Fighter's and a Rogue's features take a row of their own in the same
// structure.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { currentCombatant } from "../dist/encounter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { settled, startAdventure } from "./fixtures/browser-journey.mjs";
import { fightRoom } from "./fixtures/modules.mjs";
import { rogueAt5, veteran } from "./fixtures/playthroughs.mjs";
import { launch } from "./fixtures/session-layout.mjs";

const crypt = fightRoom("crypt", "The Crypt", [
  { id: "zombie", monster: "zombie", description: "A shambling zombie." },
]);
const yard = fightRoom("yard", "The Yard", [
  { id: "goblin", monster: "goblin-warrior", description: "A goblin." },
]);

// Kept totals 15, 14, 13, 12, 10, 8: Wisdom 17, Constitution 15.
const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
/** Mira, a level-2 Cleric with a mace in hand and daggers stowed. */
const MIRA = (() => {
  const sheet = buildCharacter(
    "a".repeat(32),
    "Mira",
    DICE,
    { ...CLERIC.defaults, placement: defaultPlacement(DICE, CLERIC) },
    "cleric",
  );
  return withOwedChoices(
    settleCharacter(sheet, {
      possessions: {
        equipment: sheet.equipment,
        stowed: sheet.stowed,
        ammunition: sheet.ammunition,
        treasure: [],
        purse: 0,
        magicItems: [],
      },
      xp: [{ id: "far/ending/out", name: "Out", xp: 300 }],
      finds: [],
      sold: [],
      coin: [],
      gear: [],
    }),
  );
})();

/**
 * Starts `adventure` with `sheet` alone in a fresh library and waits for
 * the character's turn: an enabled attack.
 */
async function fightWith(sheet, adventure, run, seed = 0) {
  const directory = await mkdtemp(join(tmpdir(), "issue-392-browser-"));
  const libraryPath = join(directory, "characters.json");
  await writeFile(
    libraryPath,
    JSON.stringify({
      kind: "dungeon-one-characters",
      formatVersion: FIFTH_LIBRARY_FORMAT,
      revision: "b".repeat(32),
      creationsStarted: 1,
      sessionsStarted: 0,
      characters: [{ sheet, revision: 1 }],
    }),
  );
  const server = await startFifthBrowserServer({
    libraryPath,
    seed,
    adventures: [adventure],
    qualifies: () => true,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
  });
  page.setDefaultTimeout(8000);
  try {
    await page.goto(server.url);
    await page
      .locator("#characters button")
      .filter({ hasText: sheet.name })
      .click();
    await page.locator("#sheet-name").filter({ hasText: sheet.name }).waitFor();
    await startAdventure(page, adventure.id);
    await page.locator("#encounter button.attack:enabled").waitFor();
    await run(page);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

/** The bar's visible rows: each one's key, label and uses, in DOM order. */
const rows = (page) =>
  page.$$eval("#action-bar .action-row", (all) =>
    all
      .filter((row) => row.checkVisibility())
      .map((row) => ({
        row: row.dataset.row,
        label: row.querySelector(".row-name")?.innerText ?? "",
        uses: row.querySelector(".row-uses")?.innerText ?? "",
      })),
  );

/** The attack on `foe`'s card in the fight panel (#525), by its full name. */
const cardAttack = (page, foe) =>
  page
    .locator(`#foe-cards li[data-combatant="${foe}"] button`)
    .getAttribute("aria-label");

/** What End turn says it gives up, and what a screen reader hears for it. */
const endTurnNote = (page) =>
  page.locator('button[data-action="end-turn"]').evaluate((button) => ({
    shown: document.querySelector(".end-note")?.textContent ?? "",
    described: (button.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" "),
  }));

/** The visible button texts in row `key`. */
const buttons = async (page, key) =>
  (
    await page
      .locator(`#action-bar .action-row[data-row="${key}"] button`)
      .allInnerTexts()
  ).map((label) => label.trim());

/**
 * Row `key`'s controls as read on screen: each dropdown as its chosen
 * option, the words between them kept.
 */
const readRow = (page, key) =>
  page.$eval(`.action-row[data-row="${key}"] .row-controls`, (controls) => {
    const copy = controls.cloneNode(true);
    const selects = controls.querySelectorAll("select");
    copy.querySelectorAll("select").forEach((select, index) => {
      select.replaceWith(selects[index].selectedOptions[0].text);
    });
    const words = [];
    const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      words.push(walker.currentNode.textContent.trim());
    }
    return words.filter(Boolean).join(" ");
  });

/**
 * The rows focus passes through, tabbing from the bar's first control to
 * its last: each row's key once, in the order reached.
 */
async function tabRows(page) {
  await page
    .locator("#action-bar button:enabled, #action-bar select")
    .first()
    .focus();
  const seen = [];
  for (let step = 0; step < 40; step++) {
    const row = await page.evaluate(() => {
      const focused = document.activeElement;
      return focused && focused.closest("#action-bar")
        ? (focused.closest(".action-row")?.dataset.row ?? "?")
        : null;
    });
    if (row === null) {
      break;
    }
    if (seen.at(-1) !== row) {
      seen.push(row);
    }
    await page.keyboard.press("Tab");
  }
  return seen;
}

test(
  "a level-2 Cleric's fight actions sit in labelled rows, Channel Divinity's uses once",
  { timeout: 120000 },
  () =>
    fightWith(MIRA, crypt, async (page) => {
      const order = ["cast", "channel-divinity", "weapons"];
      assert.deepEqual(await rows(page), [
        { row: "cast", label: "Cast a spell", uses: "" },
        {
          row: "channel-divinity",
          label: "Channel Divinity",
          uses: "2 of 2 left",
        },
        { row: "weapons", label: "Weapons", uses: "" },
      ]);
      assert.equal(await cardAttack(page, "zombie"), "Attack Zombie with Mace");
      assert.deepEqual(await buttons(page, "channel-divinity"), [
        "Divine Spark",
        "Turn Undead",
      ]);
      // The pool's uses show once, on its row.
      const bar = await page.locator("#action-bar").innerText();
      assert.equal(bar.match(/of 2 left/gu)?.length, 1, bar);
      // A dropdown follows words that name it.
      assert.match(await readRow(page, "cast"), /^\S.* on Zombie Cast$/u);
      assert.equal(
        await readRow(page, "channel-divinity"),
        "Divine Spark on Zombie: radiant damage Turn Undead every undead foe",
      );
      // Each Channel Divinity action has a line of its own, so Turn Undead
      // isn't read as part of Divine Spark's choice; its words say whom it
      // reaches, for a screen reader too.
      const spark = await page
        .locator('button[data-action="divine-spark"]')
        .boundingBox();
      const turn = page.locator('button[data-action="turn-undead"]');
      assert.ok((await turn.boundingBox()).y > spark.y + spark.height);
      assert.equal(
        await turn.evaluate(
          (button) =>
            document.getElementById(button.getAttribute("aria-describedby"))
              ?.textContent,
        ),
        "every undead foe",
      );
      // The mace isn't light: the dagger can only be swapped in.
      assert.deepEqual(await buttons(page, "weapons"), [
        "Swap Mace for Dagger",
      ]);
      assert.equal(
        await page.locator('#action-bar button[data-action="equip"]').count(),
        0,
      );
      assert.deepEqual(
        await page.locator("#end-controls button").allInnerTexts(),
        ["End turn"],
      );
      // End turn says what it gives up, and the fight's first turn says
      // the turn ends by itself.
      const note =
        "Left unused: Attack, Cast a spell, Divine Spark, Turn Undead";
      assert.deepEqual(await endTurnNote(page), {
        shown: note,
        described: note,
      });
      assert.match(
        await page.locator("#log").innerText(),
        /It is your turn\. Your turn ends by itself once nothing is left to do\./u,
      );
      assert.deepEqual(await tabRows(page), order);
      // Swapping says what happened, and the attack then names the dagger.
      await settled(page, () =>
        page.locator('#action-bar button[data-action="swap"]').click(),
      );
      assert.equal(
        await cardAttack(page, "zombie"),
        "Attack Zombie with Dagger",
      );
      // The second dagger can go in the other hand; swapping it for the
      // first would change nothing.
      assert.deepEqual(await buttons(page, "weapons"), [
        "Hold Dagger in your other hand",
        "Swap Dagger for Mace",
      ]);
    }),
);

test(
  "a Fighter's Second Wind sits on its card and Action Surge in a row of its own",
  { timeout: 120000 },
  () =>
    fightWith(veteran(), yard, async (page) => {
      const shown = (await rows(page)).map(({ row, label }) => [row, label]);
      assert.deepEqual(
        shown.filter(([row]) => row !== "weapons"),
        [["fighter", "Fighter features"]],
      );
      assert.deepEqual(
        (await tabRows(page)).filter((row) => row !== "weapons"),
        ["fighter"],
      );
      assert.deepEqual(await buttons(page, "fighter"), [
        "Action Surge (1 of 1 left)",
      ]);
      // Second Wind heals, so it is on the character's card (#525).
      assert.match(
        await page
          .locator('#heal-controls button[data-action="second-wind"]')
          .innerText(),
        /^Second Wind \(2 of 2 left\) 1d10 \+ \d+ · bonus$/u,
      );
      assert.match(
        await cardAttack(page, "goblin"),
        /^Attack Goblin Warrior with /u,
      );
      // After the attack only Action Surge is left: End turn says so.
      assert.equal(
        (await endTurnNote(page)).shown,
        "Left unused: Attack, Action Surge",
      );
      await settled(page, () =>
        page.locator('#encounter button[data-action="attack"]').click(),
      );
      assert.equal(
        (await endTurnNote(page)).shown,
        "Left unused: Action Surge",
      );
    }),
);

test(
  "a Rogue's Hide and Steady Aim share a row, and Cunning Strike heads the foes' cards",
  { timeout: 120000 },
  () =>
    fightWith(rogueAt5(), yard, async (page) => {
      const shown = (await rows(page)).map(({ row, label }) => [row, label]);
      // The dagger's extra attack stays in the Attack row (#525).
      assert.deepEqual(
        shown.filter(([row]) => row !== "weapons"),
        [
          ["attack", "Attack"],
          ["rogue", "Rogue features"],
        ],
      );
      // Cunning Action's Disengage (#396) joins them, refused here: the
      // yard has no way out to flee by.
      assert.deepEqual(await buttons(page, "rogue"), [
        "Hide",
        "Steady Aim",
        "Disengage",
      ]);
      const disengage = page.locator(
        '#action-bar button[data-action="disengage"]',
      );
      assert.equal(await disengage.isDisabled(), true);
      assert.equal(
        await disengage.evaluate(
          (button) =>
            document.getElementById(button.getAttribute("aria-describedby"))
              ?.textContent,
        ),
        "No way out",
      );
      assert.deepEqual(
        (await tabRows(page)).filter((row) => row !== "weapons"),
        // The extra attack waits for the attack, so Tab passes it by.
        ["rogue"],
      );
      // Steady Aim's advantage makes Sneak Attack, and so Cunning Strike,
      // possible: its choice heads the foes' cards (#525), named by its
      // words.
      await settled(page, () =>
        page.locator('#action-bar button[data-action="steady-aim"]').click(),
      );
      const strike = page.locator("#strike-control #cunning-strike");
      await strike.waitFor();
      assert.equal(
        await page
          .locator("#cunning-strike")
          .evaluate((select) =>
            select.labels[0].textContent.trim().startsWith("Cunning Strike"),
          ),
        true,
      );
    }),
);

/**
 * A browser seed where the zombie hurts Mira before her first turn, and
 * after her Sacred Flame the turn goes on with Healing Word to cast.
 */
const hurtSeed = (() => {
  for (let seed = 0; seed < 500; seed++) {
    const runtime = createFifthRuntime(crypt, MIRA);
    const random = createSeededRandom(sessionSeed(seed, 1));
    let state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    const mira = state.encounter?.combatants.find(({ id }) => id === "pc");
    if (
      currentCombatant(state.encounter)?.id !== "pc" ||
      mira.hp === mira.maxHp
    ) {
      continue;
    }
    state = runtime.handleAction(
      state,
      {
        type: "cast",
        actorId: "pc",
        spellId: "sacred-flame",
        targetIds: ["zombie"],
      },
      random,
    ).state;
    if (
      state.encounter?.outcome === "ongoing" &&
      currentCombatant(state.encounter)?.id === "pc"
    ) {
      return seed;
    }
  }
  throw new Error("no seed below 500 hurts Mira before a turn that goes on");
})();

test(
  `with the action spent, the Cast choice moves to the spell left to cast and End turn names it (seed ${hurtSeed})`,
  { timeout: 120000 },
  () =>
    fightWith(
      MIRA,
      crypt,
      async (page) => {
        const spell = page.locator("#cast-spell");
        assert.equal(
          await spell.locator("option:checked").textContent(),
          "Sacred Flame",
        );
        await settled(page, () =>
          page.locator('#action-bar button[data-action="cast"]').click(),
        );
        // Sacred Flame took the action: Healing Word, a bonus action, is
        // what is left, so the choice moves to it and the others say why
        // they can't be cast now.
        assert.match(
          await spell.locator("option:checked").textContent(),
          /^Healing Word /u,
        );
        assert.equal(
          await page
            .locator('#action-bar button[data-action="cast"]')
            .isEnabled(),
          true,
        );
        const sacred = spell.locator("option", { hasText: "Sacred Flame" });
        assert.equal(await sacred.isDisabled(), true);
        assert.equal(await sacred.textContent(), "Sacred Flame — Action used");
        assert.equal(
          await page.locator(".end-note").textContent(),
          "Left unused: Cast a spell: Healing Word",
        );
      },
      hurtSeed,
    ),
);
