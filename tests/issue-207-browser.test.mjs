// #207, browser → API → storage: create a Fighter with each starting kit,
// see the kit's AC, attack and damage on the creation screen and the sheet,
// and fight with it against the lone goblin, making the light-weapon
// extra attack with the two kits that hold two light weapons.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  buildCharacter,
  defaultPlacement,
  characterProfile,
  projectCreation,
  rollAbilitySet,
} from "../dist/character-5e.js";
import { FIGHTER_DEFAULT_CHOICES } from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { loneGoblin } from "./fixtures/modules.mjs";
import { launch } from "./fixtures/session-layout.mjs";
import { openCreation, startAdventure } from "./fixtures/browser-journey.mjs";

const KITS = ["mace", "two-daggers", "club-and-dagger"];

/** The dice of a browser's `number`th creation on `seed`. */
const creationDice = (seed, number) =>
  rollAbilitySet(
    createSeededRandom(
      createHash("sha256")
        .update(`5e-ability-rolls:${seed}:${number}`)
        .digest()
        .readUInt32LE(0),
    ),
  );
const choicesFor = (dice, kit) => ({
  ...FIGHTER_DEFAULT_CHOICES,
  placement: defaultPlacement(dice),
  kit,
});

/**
 * A seed on which each kit's character, created in order, survives its first
 * attack on the lone goblin with it still standing, so the extra attack
 * can follow it.
 */
function findSeed() {
  for (let seed = 0; seed < 5000; seed++) {
    const fine = KITS.every((kit, index) => {
      const dice = creationDice(seed, index + 1);
      const runtime = createFifthRuntime(
        loneGoblin,
        buildCharacter("a".repeat(32), "Ada", dice, choicesFor(dice, kit)),
      );
      const random = createSeededRandom(sessionSeed(seed, index + 1));
      let { state } = runtime.handleAction(
        runtime.createSession(),
        { type: "begin" },
        random,
      );
      if (runtime.attackTargets(state).length === 0) {
        return false;
      }
      state = runtime.handleAction(
        state,
        { type: "attack", actorId: "pc", targetId: "goblin" },
        random,
      ).state;
      return (
        state.status === "playing" && state.encounter.outcome === "ongoing"
      );
    });
    if (fine) {
      return seed;
    }
  }
  throw new Error("no seed where every kit gets its extra attack");
}

/** "+5 to hit, 1d6 + 3 bludgeoning" as the page writes an attack. */
const attackText = (attack) =>
  `${attack.bonus >= 0 ? "+" : "−"}${Math.abs(attack.bonus)} to hit, ${attack.damage.dice}d${attack.damage.sides}${attack.damage.modifier === 0 ? "" : ` ${attack.damage.modifier > 0 ? "+" : "−"} ${Math.abs(attack.damage.modifier)}`} ${attack.damage.type}`;

test(
  "a Fighter created with each kit shows its numbers, is saved with its gear and fights with it",
  { timeout: 180000 },
  async () => {
    const seed = findSeed();
    const directory = await mkdtemp(join(tmpdir(), "issue-207-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      adventures: [loneGoblin],
      // Fixtures are engine material, not gated content: the gate is
      // tested in balance-5e.test.mjs (#310).
      qualifies: () => true,
      libraryPath,
      seed,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      for (const [index, kit] of KITS.entries()) {
        const dice = creationDice(seed, index + 1);
        const choices = choicesFor(dice, kit);
        const projection = projectCreation(dice, choices);
        await page.goto(server.url);
        await openCreation(page);

        // Every kit's AC, attack and damage, before choosing one.
        for (const shown of projection.kits) {
          const text = await page
            .locator(`#kit-numbers-${shown.id}`)
            .textContent();
          assert.match(text, new RegExp(`AC ${shown.armorClass};`), shown.id);
          assert.ok(text.includes(attackText(shown.attack)), text);
          if (shown.lightAttack) {
            assert.ok(text.includes(attackText(shown.lightAttack)), text);
          }
        }
        await page.locator(`#kit-${kit}`).check();
        const profile = projection.sheet.profile;
        const preview = page.locator("#preview-body");
        await preview
          .filter({ hasText: `${profile.attack.weapon}: ` })
          .filter({
            hasText: new RegExp(`AC:\\s*${profile.armorClass}(?!\\d)`),
          })
          .waitFor();
        assert.ok(
          (await preview.innerText()).includes(attackText(profile.attack)),
        );
        assert.equal(
          (await preview.innerText()).includes("(extra attack)"),
          profile.lightAttack !== undefined,
          kit,
        );

        const name = `Ada ${index + 1}`;
        await page.locator("#character-name").fill(name);
        await page.locator("#save-character").click();
        await page.locator("#sheet-name").filter({ hasText: name }).waitFor();

        // The library keeps the kit's gear; the sheet shows its numbers.
        const saved = JSON.parse(await readFile(libraryPath, "utf8"));
        const { sheet } = saved.characters.at(-1);
        const expected = buildCharacter(sheet.id, name, dice, choices);
        assert.deepEqual(sheet, expected);
        assert.deepEqual(characterProfile(sheet), profile);
        const body = await page.locator("#sheet-body").innerText();
        assert.match(
          body,
          new RegExp(
            profile.equipment.map(({ name: item }) => item).join(", "),
          ),
        );
        assert.match(body, new RegExp(`AC:\\s*${profile.armorClass}(?!\\d)`));
        assert.ok(body.includes(attackText(profile.attack)), body);

        // Fight with it: attack, then the extra attack with two light weapons.
        await startAdventure(page, "lone-goblin");
        const attack = page.locator(
          '#attack-controls button[data-action="attack"]',
        );
        await attack.waitFor();
        const extra = page.locator(
          '#attack-controls button[data-action="light-attack"]',
        );
        if (profile.lightAttack === undefined) {
          assert.equal(await extra.count(), 0, kit);
        } else {
          assert.equal(await extra.isDisabled(), true);
          assert.match(
            await page.locator("#attack-controls").innerText(),
            /Extra attack Goblin Warrior\s+Attack first/,
          );
        }
        await attack.click();
        await page
          .locator("#log li")
          .last()
          .filter({
            hasText: `${name} attacks Goblin Warrior with ${profile.attack.weapon}`,
          })
          .waitFor();
        if (profile.lightAttack !== undefined) {
          await extra.click();
          await page
            .locator("#log li")
            .last()
            .filter({
              hasText: `with ${profile.lightAttack.weapon} (extra attack)`,
            })
            .waitFor();
        }

        // The session on disk holds the attacks the clicks made.
        const files = await readdir(join(directory, "characters-adventures"));
        const sessions = await Promise.all(
          files.map(async (file) =>
            JSON.parse(
              await readFile(
                join(directory, "characters-adventures", file),
                "utf8",
              ),
            ),
          ),
        );
        const session = sessions.find(
          ({ character }) => character.id === sheet.id,
        );
        assert.deepEqual(session.character.equipment, sheet.equipment);
        assert.deepEqual(
          session.transitions
            .filter(({ source }) => source === "click")
            .map(({ action }) => action.type),
          profile.lightAttack === undefined
            ? ["attack"]
            : ["attack", "light-attack"],
        );
      }
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
