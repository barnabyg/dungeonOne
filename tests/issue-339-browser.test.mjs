// #339, browser → API → storage: create a Thaumaturge Cleric on the
// creation screen (its Divine Order, cantrips and prepared spells), change
// its prepared spells in the library, cast Guiding Bolt in a fight, heal
// with Cure Wounds outside one, win and settle; the next adventure starts
// with every spell slot. Prepared spells can't change during an adventure.
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
import { CLERIC } from "../dist/cleric-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import {
  chooseSpell,
  clickAction,
  fight,
  settled,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { ratTunnels } from "./fixtures/modules.mjs";
import { readAda } from "./fixtures/save-files.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";
import { endTurnOrFall } from "./fixtures/last-stand.mjs";

const CANTRIPS = ["sacred-flame", "guidance", "resistance", "thaumaturgy"];
const PREPARED = [
  "cure-wounds",
  "guiding-bolt",
  "healing-word",
  "shield-of-faith",
];

/** The Thaumaturge a server on `seed` first creates, with `PREPARED`. */
function firstCleric(seed) {
  const stream = createHash("sha256")
    .update(`5e-ability-rolls:${seed}:1`)
    .digest()
    .readUInt32LE(0);
  const dice = rollAbilitySet(createSeededRandom(stream));
  return buildCharacter(
    "a".repeat(32),
    "Mira",
    dice,
    {
      ...CLERIC.defaults,
      divineOrder: "thaumaturge",
      spells: { cantrips: CANTRIPS, prepared: PREPARED },
      placement: defaultPlacement(dice, CLERIC),
    },
    "cleric",
  );
}

/**
 * Plays the journey on `seed`'s first session as the page does: Guiding
 * Bolt at the first foe on the first turn of the cellar's fight, then the
 * first attack offered or End turn; Cure Wounds between the fights. Whether
 * it wins with Guiding Bolt's hit and the healing.
 */
function wins(seed) {
  const runtime = createFifthRuntime(ratTunnels, firstCleric(seed));
  const random = createSeededRandom(sessionSeed(seed, 1));
  let guided = false;
  let healed = false;
  const step = (state, action) => {
    const result = runtime.handleAction(state, action, random);
    assert.equal(result.rejection, undefined, result.rejection?.reason);
    guided ||= result.events.some(
      (event) => event.type === "attack" && event.weapon === "Guiding Bolt",
    );
    healed ||= result.events.some(({ type }) => type === "spell-healing");
    return result.state;
  };
  let state = step(runtime.createSession(), { type: "begin" });
  let cast = false;
  for (const destinationId of ["rat-cellar", "den"]) {
    state = step(state, { type: "move", destinationId });
    while (
      state.status === "playing" &&
      state.encounter?.outcome === "ongoing"
    ) {
      const views = runtime.projectActions(state);
      const bolt = views.find(
        ({ action, available, spell }) =>
          action === "cast" && available && spell.id === "guiding-bolt",
      );
      if (!cast && bolt !== undefined) {
        cast = true;
        state = step(state, runtime.actionOf(bolt));
        continue;
      }
      const attack = views.find(
        ({ action, available }) => action === "attack" && available,
      );
      state = step(
        state,
        attack === undefined ? endTurnOrFall(state) : runtime.actionOf(attack),
      );
    }
    if (destinationId === "rat-cellar") {
      const cure = runtime
        .projectActions(state)
        .find(
          ({ action, available, spell }) =>
            action === "cast" && available && spell.id === "cure-wounds",
        );
      if (state.status !== "playing" || cure === undefined) {
        return false;
      }
      state = step(state, runtime.actionOf(cure));
    }
  }
  return state.status === "victory" && guided && healed;
}

const seed = (() => {
  for (let candidate = 0; candidate < 500; candidate++) {
    if (wins(candidate)) {
      return candidate;
    }
  }
  throw new Error("no seed below 500 wins with Guiding Bolt and Cure Wounds");
})();

async function post(url, path, body) {
  const response = await fetch(url + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: url },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

/** The saved sessions in `directory`, newest last by their transitions. */
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

const viewport = { width: 1280, height: 900 };
test(
  `create a Cleric, cast in a fight, heal outside one, settle, and start again with every slot (${viewport.width}px, seed ${seed})`,
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-339-browser-"));
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
      await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
      // Creation offers the Fighter, the Rogue, the Cleric and the Wizard.
      assert.deepEqual(
        await page
          .locator("#class-fields input")
          .evaluateAll((radios) => radios.map(({ id }) => id)),
        ["class-fighter", "class-rogue", "class-cleric", "class-wizard"],
      );
      assert.equal(await page.locator("#spells").isHidden(), true);
      await page.locator("#class-cleric").check();
      await page
        .locator("#preview-body")
        .filter({ hasText: "Spell save DC" })
        .waitFor();
      assert.match(
        await text(page.locator("#class-hint")),
        /Cleric: d8 hit die; Wisdom and Charisma saving throws\./u,
      );
      assert.equal(await page.locator("#masteries").isHidden(), true);
      assert.equal(await page.locator("#order-protector").isChecked(), true);
      assert.equal(
        await page.locator("#spells-count").innerText(),
        "Cantrips 3 of 3 chosen; prepared spells 4 of 4 chosen",
      );
      assert.match(
        await text(page.locator("#prepared-fields")),
        /Guiding Bolt\nranged spell attack, 4d6 radiant; a hit gives the next attack roll on the target advantage/u,
      );
      // A Thaumaturge knows a fourth cantrip.
      await page.locator("#order-thaumaturge").check();
      await page
        .locator("#spells-error")
        .filter({
          hasText: "Choose 4 cantrips and 4 spells to prepare; 3 and 4 chosen.",
        })
        .waitFor();
      assert.equal(await page.locator("#save-character").isDisabled(), true);
      await page.locator("#cantrip-thaumaturgy").check();
      await page.locator("#spells-error:empty").waitFor({ state: "attached" });
      await page.locator("#prepare-bless").uncheck();
      await page.locator("#prepare-shield-of-faith").check();
      await assertNoSideScroll(page, "the Cleric's creation screen", {
        wideFont: true,
      });
      await page.locator("#character-name").fill("Mira");
      await page.locator("#save-character").click();
      await page.locator("#sheet-name").filter({ hasText: "Mira" }).waitFor();
      const expected = firstCleric(seed);
      const sheetText = await text(page.locator("#sheet-body"));
      assert.match(sheetText, /^Level 1 Cleric/u);
      const { spellcasting } = characterProfile(expected);
      assert.ok(
        sheetText.includes(
          `Spell attack +${spellcasting.attackBonus} · Spell save DC ${spellcasting.saveDc} · Wisdom · Spell slots: 2 1st-level.`,
        ),
        sheetText,
      );
      assert.match(
        sheetText,
        /Thaumaturgy\. flavour only: no effect in play\./u,
      );
      assert.match(sheetText, /Divine Order: Thaumaturge\./u);
      // Storage holds the Cleric exactly as the engine builds it.
      const created = await readAda(libraryPath);
      assert.deepEqual(
        { ...created.sheet, id: expected.id },
        { ...expected, name: "Mira" },
      );

      // Between adventures, prepared spells change on the sheet.
      await page.locator("#prepared-shield-of-faith").uncheck();
      await page.locator("#prepared-bless").check();
      await page.locator("#save-prepared").click();
      await page
        .locator("#feedback")
        .filter({ hasText: "Mira's prepared spells are changed." })
        .waitFor();
      assert.deepEqual((await readAda(libraryPath)).sheet.spells.prepared, [
        "cure-wounds",
        "guiding-bolt",
        "healing-word",
        "bless",
      ]);
      // ...and back, as the journey was searched with them.
      await page.locator("#prepared-bless").uncheck();
      await page.locator("#prepared-shield-of-faith").check();
      // The sheet redraws with the change saved: nothing left to save.
      // The button is disabled while the save is in flight too, so wait
      // for the save's response. Polling the library file instead holds it
      // open, and on Windows the server's rename over it then fails.
      const saved = page.waitForResponse((response) =>
        response.url().endsWith("/api/5e/characters/prepare-spells"),
      );
      await page.locator("#save-prepared").click();
      assert.equal((await saved).status(), 200);
      await page.locator("#save-prepared:disabled").waitFor();
      await page.locator("#prepared-shield-of-faith:checked").waitFor();
      assert.deepEqual((await readAda(libraryPath)).sheet.spells.prepared, [
        "cure-wounds",
        "guiding-bolt",
        "healing-word",
        "shield-of-faith",
      ]);

      await startAdventure(page, "rat-tunnels");
      // During the adventure the library refuses a change.
      const during = JSON.parse(await readFile(libraryPath, "utf8"));
      const refused = await post(
        server.url,
        "/api/5e/characters/prepare-spells",
        {
          revision: during.revision,
          characterId: during.characters[0].sheet.id,
          prepared: ["bless", "cure-wounds", "guiding-bolt", "healing-word"],
        },
      );
      assert.equal(refused.status, 409);
      assert.equal(
        refused.body.error,
        "Mira is on an adventure: prepared spells change only between adventures.",
      );

      await clickAction(page, "move", "rat-cellar");
      // The attack chooser (#526) offers the spells cast at the rat, the
      // Cast choice those on Mira; never Thaumaturgy.
      const chips = page.locator("#chooser-chips .chip-name");
      await chips.first().waitFor();
      const offered = [
        ...(await chips.allTextContents()),
        ...(await page.locator("#cast-spell option").allTextContents()),
      ];
      assert.ok(offered.includes("Guiding Bolt"), offered);
      assert.ok(offered.includes("Sacred Flame"), offered);
      assert.ok(offered.includes("Resistance against piercing"), offered);
      assert.ok(!offered.some((name) => /Thaumaturgy/u.test(name)), offered);
      await chooseSpell(page, "guiding-bolt");
      await settled(page, () =>
        page.locator("#foe-cards button.act[data-action=cast]").click(),
      );
      assert.match(
        await text(page.locator("#log")),
        /You cast Guiding Bolt at Giant Rat with a 1st-level spell slot \(1 of 2 left\)\./u,
      );
      await fight(page);
      // Outside the fight: Cure Wounds on yourself.
      await page
        .locator("#cast-spell")
        .selectOption({ label: "Cure Wounds (1st-level slot)" });
      await settled(page, () =>
        page.locator("button.act[data-action=cast]").click(),
      );
      assert.match(
        await text(page.locator("#log li.newest")),
        /You cast Cure Wounds on yourself with a 1st-level spell slot \(0 of 2 left\)\./u,
      );
      await clickAction(page, "move", "den");
      await fight(page);
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.match(await text(page.locator("#ending")), /Victory/iu);
      const settledRecord = await readAda(libraryPath);
      assert.equal(settledRecord.session, undefined);
      assert.ok(settledRecord.sheet.xp > 0);
      assert.equal(settledRecord.sheet.level, 1);

      // The next adventure starts with both slots.
      await page.locator("#ending-next").click();
      await page.locator("#sheet-name").filter({ hasText: "Mira" }).waitFor();
      await startAdventure(page, "rat-tunnels");
      const sessions = await sessionFiles(directory);
      const fresh = sessions.find(({ state }) => state.status === "playing");
      assert.equal(fresh.state.character.featureUses["spell-slots-1"], 2);
      const ended = sessions.find(({ state }) => state.status !== "playing");
      assert.equal(ended.state.character.featureUses["spell-slots-1"], 0);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
