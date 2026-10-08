// #275, browser → API → storage: the player handoff for each new module. Ada,
// from the handoff's input library at the module's level, finds it in the
// adventure list under its level and difficulty, plays it with the buttons
// alone on a seed found by simulating her clicks, walks out with the loot,
// and the library file holds what the ending says.
import assert from "node:assert/strict";
import test from "node:test";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { libraryAt } from "../dist/test-fighter-5e.js";
import { launch } from "./fixtures/session-layout.mjs";
import {
  clickAction,
  fight,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { firstJourney } from "./fixtures/module-journey.mjs";
import { readAda } from "./fixtures/save-files.mjs";

const input = (path) =>
  fileURLToPath(new URL(`../docs/acceptance/inputs/${path}`, import.meta.url));
const LIBRARIES = {
  2: input("issue-275/level-2-ada.json"),
  3: input("increment-13/level-3-ada.json"),
};

const shipped = await loadBuiltInFifthAdventures();

/**
 * Each module's handoff: the route Ada clicks (each fight fought out as it
 * starts), the card the adventure list shows, and what the ending credits.
 */
const HANDOFFS = [
  {
    id: "shepherds-bothy",
    card: /The Shepherd's Bothy\nStart\nLevel 2\nEasy\n/u,
    route: [
      ["move", "bothy"],
      ["examine", "open-strongbox"],
      ["take", "market-gold"],
      ["take", "enamel-brooch"],
      ["examine", "straw-pallet"],
      ["take", "pallet-sapphire"],
      ["examine", "bothy-bandit"],
      ["take", "bothy-bandit-coins"],
      ["move", "lean-to"],
      ["examine", "peat-stack"],
      ["take", "lean-to-potion"],
      ["take", "bloodstone"],
      ["move", "bothy"],
      ["move", "sheepfold"],
    ],
    ending: "Out with the takings",
    xp: ["Defeated the Moor Bandit: +25 XP", "Out with the takings: +200 XP"],
    treasure: ["Enamelled Brooch", "Pallet Sapphire", "Bloodstone"],
    purse: 6110,
  },
  {
    id: "drowned-chapel",
    card: /The Drowned Chapel\nStart\nLevel 3\nEasy\n/u,
    route: [
      ["move", "flooded-nave"],
      ["examine", "sunken-altar"],
      ["take", "silver-reliquary"],
      ["take", "moss-agate"],
      ["move", "vestry"],
      ["examine", "alms-cupboard"],
      ["take", "parish-alms"],
      ["take", "vestry-potion"],
      ["take", "chrysoprase-fob"],
      ["move", "flooded-nave"],
      ["move", "chapel-porch"],
    ],
    ending: "Out with the chapel silver",
    xp: [
      "Defeated the Drowned Sexton: +50 XP",
      "Out with the chapel silver: +300 XP",
    ],
    treasure: ["Silver Reliquary", "Moss Agate", "Chrysoprase Fob"],
    purse: 6500,
  },
  {
    id: "gravediggers-lodge",
    card: /The Gravedigger's Lodge\nStart\nLevel 2\nHard\n/u,
    route: [
      ["examine", "coffin-rest"],
      ["take", "lychgate-potion"],
      ["take", "lychgate-second-potion"],
      ["move", "dead-house"],
      ["examine", "dragged-coffin"],
      ["take", "mourning-ring"],
      ["take", "jet-cameo"],
      ["take", "grave-tourmaline"],
      ["take", "grave-coin"],
      ["examine", "false-gravedigger"],
      ["take", "false-gravedigger-coins"],
      ["move", "lychgate"],
    ],
    ending: "Out with the grave goods",
    xp: [
      "Defeated False Gravedigger and Risen Corpse: +75 XP",
      "Out with the grave goods: +300 XP",
    ],
    treasure: ["Gold Mourning Ring", "Jet Cameo", "Grave Tourmaline"],
    purse: 4110,
  },
  {
    id: "ravagers-tower",
    card: /The Ravager's Tower\nStart\nLevel 3\nHard\n/u,
    route: [
      ["examine", "dead-pedlar"],
      ["take", "pedlar-potion"],
      ["take", "pedlar-second-potion"],
      ["move", "gnoll-roost"],
      ["examine", "plunder-heap"],
      ["take", "pedlar-cashbox"],
      ["take", "gilt-icon"],
      ["take", "pearl-earrings"],
      ["examine", "tower-gnoll"],
      ["take", "tower-gnoll-coins"],
      ["move", "tower-foot"],
    ],
    ending: "Out with the plunder",
    xp: [
      "Defeated the Gnoll Ravager: +200 XP",
      "Out with the plunder: +400 XP",
    ],
    treasure: ["Gilt-bronze Icon", "Pearl Earrings"],
    purse: 4110,
  },
];

for (const handoff of HANDOFFS) {
  const adventure = shipped.find(({ id }) => id === handoff.id);
  const level = adventure.recommendedLevels.max;
  const [{ sheet }] = libraryAt(level).characters;
  // A seed where Ada's clicks walk the route and out with the loot.
  const { seed } = firstJourney(
    adventure,
    sheet,
    [...handoff.route, ["leave", adventure.startRoomId]],
    ({ status, endingId }) =>
      status === "escaped" && endingId === adventure.endings[0].id,
    { browser: true },
  );

  test(
    `${adventure.title} handoff: a level-${level} Fighter finds it in the list, clears it and walks out with the loot (seed ${seed})`,
    { timeout: 120000 },
    async () => {
      // The input library is the one the handoff gives the owner.
      assert.deepEqual(
        JSON.parse(await readFile(LIBRARIES[level], "utf8")),
        JSON.parse(JSON.stringify(libraryAt(level))),
      );
      const directory = await mkdtemp(join(tmpdir(), "issue-275-browser-"));
      const libraryPath = join(directory, "characters.json");
      await copyFile(LIBRARIES[level], libraryPath);
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
          handoff.card,
        );
        await startAdventure(page, handoff.id);
        const fought = new Set();
        for (const [action, target] of handoff.route) {
          await clickAction(page, action, target);
          // Entering a fight's room starts the fight: fight it out.
          const room = adventure.rooms.find(({ id }) => id === target);
          if (action === "move" && room.encounterId && !fought.has(target)) {
            fought.add(target);
            await fight(page);
          }
        }
        await page.locator("#leave-controls button").click();
        await page.locator("#confirm-leave").click();
        await page.locator("#ending").waitFor({ state: "visible" });
        const ending = await text(page.locator("#ending"));
        assert.match(
          ending,
          new RegExp(`^${handoff.ending}\nEscaped with loot\n`, "u"),
        );
        assert.ok(ending.includes(handoff.xp.join("\n")), ending);

        // Storage holds what the ending says.
        const record = await readAda(libraryPath);
        const earned = handoff.xp.reduce(
          (total, line) => total + Number(line.match(/\+(\d+) XP$/u)[1]),
          0,
        );
        assert.equal(record.session, undefined);
        assert.equal(record.sheet.xp, sheet.xp + earned);
        assert.equal(record.sheet.purse, handoff.purse);
        assert.deepEqual(
          record.sheet.treasure.map(({ name }) => name),
          handoff.treasure,
        );
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
