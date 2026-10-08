// #144, browser → API → storage: creation tags each Fighting Style with
// whether it applies to the kit chosen, the sheet says whether the saved
// character's style applies, and a Great Weapon Fighting hit shows each die
// as rolled and, for a 1 or 2, that it counts as 3.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { buildCharacter, validateCharacter } from "../dist/character-5e.js";
import { FIGHTER_DEFAULT_CHOICES } from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { launch } from "./fixtures/session-layout.mjs";
import { loneGoblin } from "./fixtures/modules.mjs";
import { saveFighter, startAdventure } from "./fixtures/browser-journey.mjs";

test(
  "creation and the sheet say whether the Fighting Style applies with the kit",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-144-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      adventures: [loneGoblin],
      libraryPath,
      seed: 0,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await page.locator("#open-creation").click();
      const tag = (id) => page.locator(`#style-use-${id}`);
      await tag("defense")
        .filter({ hasText: "Applies with this kit" })
        .waitFor();
      // The mace kit: leather armour, one one-handed weapon.
      assert.equal(
        await tag("great-weapon-fighting").textContent(),
        "No effect with this kit",
      );
      assert.equal(
        await tag("two-weapon-fighting").textContent(),
        "No effect with this kit",
      );
      assert.equal(
        await page.locator("#style-note-two-weapon-fighting").textContent(),
        "No effect with the mace: it needs two light weapons.",
      );

      await page.locator("#style-two-weapon-fighting").check();
      await page.locator("#kit-two-daggers").check();
      await tag("two-weapon-fighting")
        .filter({ hasText: "Applies with this kit" })
        .waitFor();
      await saveFighter(page);

      const saved = JSON.parse(await readFile(libraryPath, "utf8"));
      assert.equal(
        saved.characters[0].sheet.fightingStyle,
        "two-weapon-fighting",
      );
      assert.equal(
        await page.locator("#sheet-style-use").innerText(),
        "Fighting Style: Two-Weapon Fighting Applies Applies: the extra attack with the second dagger adds your ability modifier.",
      );
      // Near the top: straight after the summary line.
      assert.equal(
        await page.locator("#sheet-body > :nth-child(2)").getAttribute("id"),
        "sheet-style-use",
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const DICE = [
  [6, 6, 4, 1],
  [4, 4, 4, 1],
  [4, 4, 4, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
  [3, 3, 3, 1],
];
/** Ada with Great Weapon Fighting, holding a found longsword in both hands. */
const sheet = validateCharacter({
  ...buildCharacter("a".repeat(32), "Ada", DICE, {
    ...FIGHTER_DEFAULT_CHOICES,
    placement: {
      strength: 0,
      dexterity: 1,
      constitution: 2,
      intelligence: 3,
      wisdom: 4,
      charisma: 5,
    },
    fightingStyle: "great-weapon-fighting",
  }),
  equipment: ["leather", "longsword"],
});

/** A seed whose first session's first attack hits with a 1 or 2 on the d10. */
function findSeed() {
  for (let seed = 0; seed < 5000; seed++) {
    const runtime = createFifthRuntime(loneGoblin, sheet);
    const random = createSeededRandom(sessionSeed(seed, 1));
    const { state } = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    );
    if (runtime.attackTargets(state).length === 0) {
      continue;
    }
    const { events } = runtime.handleAction(
      state,
      { type: "attack", actorId: "pc", targetId: "goblin" },
      random,
    );
    const attack = events.find(
      ({ type, actorId }) => type === "attack" && actorId === "pc",
    );
    if (attack.hit && !attack.critical && attack.damageRolls[0] < 3) {
      return { seed, roll: attack.damageRolls[0] };
    }
  }
  throw new Error("no seed where the first hit rolls a 1 or 2");
}

test(
  "a Great Weapon Fighting hit shows the die as rolled and that it counts as 3",
  { timeout: 60000 },
  async () => {
    const { seed, roll } = findSeed();
    const directory = await mkdtemp(join(tmpdir(), "issue-144-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(
      libraryPath,
      JSON.stringify({
        kind: "dungeon-one-characters",
        formatVersion: FIFTH_LIBRARY_FORMAT,
        revision: "1".repeat(32),
        creationsStarted: 1,
        sessionsStarted: 0,
        characters: [{ sheet, revision: 1 }],
      }),
    );
    const server = await startFifthBrowserServer({
      adventures: [loneGoblin],
      libraryPath,
      seed,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(`${server.url}#character-${sheet.id}`);
      await page
        .locator("#sheet-style-use")
        .filter({ hasText: "Applies: the longsword is held in two hands." })
        .waitFor();
      await startAdventure(page, "lone-goblin");
      await page
        .locator('#attack-controls button[data-action="attack"]')
        .click();
      const line = page
        .locator("#log li")
        .filter({ hasText: "Ada attacks Goblin Warrior with Longsword" })
        .last();
      await line.waitFor();
      assert.match(
        await line.innerText(),
        new RegExp(`Damage ${roll} \\(counts as 3, Great Weapon Fighting\\)`),
      );
      assert.equal(
        await line.locator(".roll.damage .roll-die.counted").textContent(),
        `d10 ${roll}→3`,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
