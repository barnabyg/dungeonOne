// #340, browser → API → storage: create a Wizard on the creation screen
// (its cantrips, spellbook and prepared spells), change its prepared spells
// in the library, only from its spellbook; cast Mage Armor before the first
// fight and Sleep in it; take a short rest whose Arcane Recovery regains a
// slot; win and settle.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  buildCharacter,
  characterProfile,
  defaultPlacement,
  rollAbilitySet,
} from "../dist/character-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import {
  clickAction,
  fight,
  settled,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { ratTunnels } from "./fixtures/modules.mjs";
import { readAda } from "./fixtures/save-files.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

// Magic Missile out of the spellbook, Thunderwave in, and prepared.
const SPELLBOOK = [
  "shield",
  "mage-armor",
  "sleep",
  "burning-hands",
  "chromatic-orb",
  "thunderwave",
];
const CREATED = ["shield", "mage-armor", "sleep", "thunderwave"];
// Then, in the library, Burning Hands in place of Shield.
const PREPARED = ["mage-armor", "sleep", "thunderwave", "burning-hands"];

/** The Wizard a server on `seed` first creates, with `prepared`. */
function firstWizard(seed, prepared = CREATED) {
  const stream = createHash("sha256")
    .update(`5e-ability-rolls:${seed}:1`)
    .digest()
    .readUInt32LE(0);
  const dice = rollAbilitySet(createSeededRandom(stream));
  return buildCharacter(
    "a".repeat(32),
    "Vela",
    dice,
    {
      ...WIZARD.defaults,
      spellbook: SPELLBOOK,
      spells: { cantrips: WIZARD.defaults.spells.cantrips, prepared },
      placement: defaultPlacement(dice, WIZARD),
    },
    "wizard",
  );
}

/**
 * Plays the journey on `seed`'s first session as the page does: Mage Armor
 * in the first room; Sleep at the rat on the first turn of the cellar's
 * fight, then the first attack offered or End turn; a short rest after it;
 * the den's fight. Whether it wins, with Arcane Recovery's slot.
 */
function wins(seed) {
  const runtime = createFifthRuntime(ratTunnels, firstWizard(seed, PREPARED));
  const random = createSeededRandom(sessionSeed(seed, 1));
  let recovered = false;
  const step = (state, action) => {
    const result = runtime.handleAction(state, action, random);
    assert.equal(result.rejection, undefined, result.rejection?.reason);
    recovered ||= result.events.some(({ type }) => type === "arcane-recovery");
    return result.state;
  };
  const cast = (state, id) =>
    runtime
      .projectActions(state)
      .find(
        ({ action, available, spell }) =>
          action === "cast" && available && spell.id === id,
      );
  let state = step(runtime.createSession(), { type: "begin" });
  state = step(state, runtime.actionOf(cast(state, "mage-armor")));
  let slept = false;
  for (const destinationId of ["rat-cellar", "den"]) {
    state = step(state, { type: "move", destinationId });
    while (
      state.status === "playing" &&
      state.encounter?.outcome === "ongoing"
    ) {
      const sleep = cast(state, "sleep");
      if (!slept && sleep !== undefined) {
        slept = true;
        state = step(state, runtime.actionOf(sleep));
        continue;
      }
      const attack = runtime
        .projectActions(state)
        .find(({ action, available }) => action === "attack" && available);
      state = step(
        state,
        attack === undefined
          ? { type: "end-turn", actorId: "pc" }
          : runtime.actionOf(attack),
      );
    }
    if (destinationId === "rat-cellar") {
      const rest = runtime
        .projectActions(state)
        .find(({ action, available }) => action === "rest" && available);
      if (state.status !== "playing" || rest === undefined) {
        return false;
      }
      state = step(state, runtime.actionOf(rest));
    }
  }
  return state.status === "victory" && slept && recovered;
}

const seed = (() => {
  for (let candidate = 0; candidate < 500; candidate++) {
    if (wins(candidate)) {
      return candidate;
    }
  }
  throw new Error("no seed below 500 wins with Sleep and Arcane Recovery");
})();

async function post(url, path, body) {
  const response = await fetch(url + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: url },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

/** The saved sessions in `directory`. */
async function sessionFiles(directory) {
  const folder = join(directory, "characters-adventures");
  const names = (await readdir(folder)).filter((file) =>
    file.endsWith(".json"),
  );
  return Promise.all(
    names.map(async (name) =>
      JSON.parse(await readFile(join(folder, name), "utf8")),
    ),
  );
}

const castNamed = async (page, label) => {
  await page.locator("#cast-spell").selectOption({ label });
  await settled(page, () =>
    page.locator("button.act[data-action=cast]").click(),
  );
};

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 375, height: 812 },
]) {
  test(
    `create a Wizard with its spellbook, cast Mage Armor and Sleep, recover a slot on a short rest, settle (${viewport.width}px, seed ${seed})`,
    { timeout: 180000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-340-browser-"));
      const libraryPath = join(directory, "characters.json");
      const server = await startFifthBrowserServer({
        libraryPath,
        seed,
        adventures: [ratTunnels],
        qualifies: () => true,
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(8000);
      try {
        await page.goto(server.url);
        await page.locator("#open-creation").click();
        await page
          .locator("#preview-body")
          .filter({ hasText: "AC:" })
          .waitFor();
        assert.deepEqual(
          await page
            .locator("#class-fields input")
            .evaluateAll((radios) => radios.map(({ id }) => id)),
          ["class-fighter", "class-rogue", "class-cleric", "class-wizard"],
        );
        await page.locator("#class-wizard").check();
        await page
          .locator("#preview-body")
          .filter({ hasText: "Spell save DC" })
          .waitFor();
        assert.match(
          await text(page.locator("#class-hint")),
          /Wizard: d6 hit die; Intelligence and Wisdom saving throws\./u,
        );
        assert.equal(await page.locator("#masteries").isHidden(), true);
        assert.equal(await page.locator("#spellbook-group").isVisible(), true);
        assert.equal(
          await page.locator("#spells-count").innerText(),
          "Cantrips 3 of 3 chosen; spellbook 6 of 6 chosen; prepared spells 4 of 4 chosen",
        );
        // Only spells in the spellbook can be prepared.
        assert.equal(await page.locator("#prepare-thunderwave").count(), 0);
        // Taking Magic Missile out of the spellbook unprepares it.
        await page.locator("#spellbook-magic-missile").uncheck();
        await page
          .locator("#spells-error")
          .filter({
            hasText:
              "Choose 3 cantrips, 6 spells for your spellbook and 4 of them to prepare; 3, 5 and 3 chosen.",
          })
          .waitFor();
        assert.equal(await page.locator("#prepare-magic-missile").count(), 0);
        assert.equal(await page.locator("#save-character").isDisabled(), true);
        await page.locator("#spellbook-thunderwave").check();
        await page.locator("#prepare-thunderwave").check();
        await page
          .locator("#spells-error:empty")
          .waitFor({ state: "attached" });
        await assertNoSideScroll(page, "the Wizard's creation screen", {
          wideFont: true,
        });
        await page.locator("#character-name").fill("Vela");
        await page.locator("#save-character").click();
        await page.locator("#sheet-name").filter({ hasText: "Vela" }).waitFor();
        const expected = firstWizard(seed);
        const sheetText = await text(page.locator("#sheet-body"));
        assert.match(sheetText, /^Level 1 Wizard/u);
        const { spellcasting } = characterProfile(expected);
        assert.ok(
          sheetText.includes(
            `Spell attack +${spellcasting.attackBonus} · Spell save DC ${spellcasting.saveDc} · Intelligence · Spell slots: 2 1st-level.`,
          ),
          sheetText,
        );
        assert.deepEqual(
          await page
            .locator("#sheet-body #sheet-spellbook li strong")
            .allTextContents(),
          [
            "Shield. ",
            "Mage Armor. ",
            "Sleep. ",
            "Burning Hands. ",
            "Chromatic Orb. ",
            "Thunderwave. ",
          ],
        );
        assert.match(sheetText, /Ritual Adept\. Omitted/u);
        assert.match(sheetText, /Arcane Recovery\./u);
        // Storage holds the Wizard exactly as the engine builds it.
        const created = await readAda(libraryPath);
        assert.deepEqual(
          { ...created.sheet, id: expected.id },
          { ...expected, name: "Vela" },
        );

        // Between adventures, prepared spells change on the sheet, from the
        // spellbook only.
        assert.equal(await page.locator("#prepared-magic-missile").count(), 0);
        await page.locator("#prepared-shield").uncheck();
        await page.locator("#prepared-burning-hands").check();
        await page.locator("#save-prepared").click();
        await page
          .locator("#feedback")
          .filter({ hasText: "Vela's prepared spells are changed." })
          .waitFor();
        assert.deepEqual(
          (await readAda(libraryPath)).sheet.spells.prepared,
          PREPARED,
        );
        const library = JSON.parse(await readFile(libraryPath, "utf8"));
        const outside = await post(
          server.url,
          "/api/5e/characters/prepare-spells",
          {
            revision: library.revision,
            characterId: library.characters[0].sheet.id,
            prepared: ["magic-missile", "mage-armor", "sleep", "thunderwave"],
          },
        );
        assert.equal(outside.status, 409);
        assert.equal(
          outside.body.error,
          "A Wizard prepares only spells in its spellbook.",
        );

        await page.locator("#sheet-name").filter({ hasText: "Vela" }).waitFor();
        await startAdventure(page, "rat-tunnels");
        // Mage Armor before the first fight: AC 13 + Dexterity.
        await castNamed(page, "Mage Armor (1st-level slot)");
        assert.match(
          await text(page.locator("#log li.newest")),
          /You cast Mage Armor on yourself with a 1st-level spell slot \(1 of 2 left\)\.\nMage Armor takes hold on you: base AC 13 \+ Dexterity while wearing no armour, until a long rest or the adventure's end\./u,
        );
        await clickAction(page, "move", "rat-cellar");
        await page.locator("#cast-spell").waitFor();
        await castNamed(page, "Sleep (1st-level slot)");
        assert.match(
          await text(page.locator("#log")),
          /You cast Sleep at Giant Rat with a 1st-level spell slot \(0 of 2 left\)\.\nGiant Rat makes a Wisdom saving throw against Sleep/u,
        );
        await fight(page);
        // A short rest: Arcane Recovery regains a slot.
        await settled(page, () =>
          page.locator("#rest-controls button.act").click(),
        );
        assert.match(
          await text(page.locator("#log li.newest")),
          /Arcane Recovery: you regain a 1st-level spell slot \(1 of 2 left\)\. It comes back with a long rest\./u,
        );
        if (viewport.width === 375) {
          await assertNoSideScroll(page, "the Wizard's exploring bar", {
            wideFont: true,
          });
        }
        await clickAction(page, "move", "den");
        await fight(page);
        await page.locator("#ending").waitFor({ state: "visible" });
        assert.match(await text(page.locator("#ending")), /Victory/iu);
        const settledRecord = await readAda(libraryPath);
        assert.equal(settledRecord.session, undefined);
        assert.ok(settledRecord.sheet.xp > 0);
        assert.equal(settledRecord.sheet.level, 1);
        assert.deepEqual(settledRecord.sheet.spellbook, SPELLBOOK);
        assert.deepEqual(settledRecord.sheet.spells.prepared, PREPARED);
        // The saved session spent Arcane Recovery and kept the slot.
        const [ended] = await sessionFiles(directory);
        assert.equal(ended.state.character.featureUses["arcane-recovery"], 0);
        assert.equal(ended.state.character.featureUses["spell-slots-1"], 1);
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
