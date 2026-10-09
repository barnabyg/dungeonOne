// #306, browser → API → storage: create a Rogue on the creation screen (its
// Expertise and kits, no Fighting Style), see its sheet, play the rat
// tunnels, land a Sneak Attack, win and settle into the library.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  buildCharacter,
  defaultPlacement,
  rollAbilitySet,
} from "../dist/character-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { ROGUE } from "../dist/rogue-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import {
  clickAction,
  fight,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { ratTunnels } from "./fixtures/modules.mjs";
import { readAda } from "./fixtures/save-files.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

const ROUTE = ["rat-cellar", "den"];

/** The Rogue a server on `seed` first creates with the default choices. */
function firstRogue(seed) {
  const stream = createHash("sha256")
    .update(`5e-ability-rolls:${seed}:1`)
    .digest()
    .readUInt32LE(0);
  const dice = rollAbilitySet(createSeededRandom(stream));
  return buildCharacter(
    "a".repeat(32),
    "Vex",
    dice,
    { ...ROGUE.defaults, placement: defaultPlacement(dice, ROGUE) },
    "rogue",
  );
}

/**
 * Plays the route on `seed`'s first browser session as `fight` in
 * browser-journey.mjs clicks: the first attack button (the attack, then the
 * Light extra attack), or End turn. How it ends, and how many Sneak Attacks
 * landed.
 */
function play(seed) {
  const sheet = firstRogue(seed);
  const runtime = createFifthRuntime(ratTunnels, sheet);
  const random = createSeededRandom(sessionSeed(seed, 1));
  let sneakAttacks = 0;
  const step = (state, action) => {
    const result = runtime.handleAction(state, action, random);
    sneakAttacks += (result.events ?? []).filter(
      (event) => event.type === "attack" && event.sneakAttack !== undefined,
    ).length;
    return result.state;
  };
  let state = step(runtime.createSession(), { type: "begin" });
  for (const destinationId of ROUTE) {
    if (state.status !== "playing") {
      break;
    }
    state = step(state, { type: "move", destinationId });
    while (
      state.status === "playing" &&
      state.encounter?.outcome === "ongoing"
    ) {
      const views = runtime.projectActions(state);
      const attack = ["attack", "light-attack"]
        .map((kind) =>
          views.find(({ action, available }) => action === kind && available),
        )
        .find((view) => view !== undefined);
      state = step(
        state,
        attack === undefined
          ? { type: "end-turn", actorId: "pc" }
          : {
              type: attack.action,
              actorId: "pc",
              targetId: attack.target.id,
            },
      );
    }
  }
  return { status: state.status, sneakAttacks, sheet };
}

const seed = (() => {
  for (let candidate = 0; candidate < 300; candidate++) {
    const { status, sneakAttacks } = play(candidate);
    if (status === "victory" && sneakAttacks > 0) {
      return candidate;
    }
  }
  throw new Error("no seed below 300 wins with a Sneak Attack");
})();

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 375, height: 812 },
]) {
  test(
    `create a Rogue, land a Sneak Attack, win and keep the XP (${viewport.width}px, seed ${seed})`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-306-browser-"));
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
        // The Fighter comes first; choosing the Rogue starts afresh from its
        // defaults: four skills, two with Expertise, its kits, no style.
        assert.equal(await page.locator("#class-fighter").isChecked(), true);
        assert.equal(await page.locator("#expertise").isHidden(), true);
        await page.locator("#class-rogue").check();
        await page
          .locator("#preview-body")
          .filter({ hasText: "Sneak Attack" })
          .waitFor();
        assert.match(
          await text(page.locator("#class-hint")),
          /Rogue: d8 hit die; Dexterity and Intelligence saving throws\./u,
        );
        assert.equal(await page.locator("#styles").isHidden(), true);
        assert.equal(await page.locator("#skill-fields input").count(), 10);
        assert.equal(
          await page.locator("#skills-count").innerText(),
          "4 of 4 chosen",
        );
        assert.equal(
          await page.locator("#expertise-count").innerText(),
          "2 of 2 chosen",
        );
        assert.deepEqual(
          await page
            .locator("#expertise-fields input:checked")
            .evaluateAll((boxes) => boxes.map(({ id }) => id)),
          ["expertise-perception", "expertise-stealth"],
        );
        assert.match(
          await text(page.locator("#kit-fields")),
          /Shortsword, dagger and leather\nLeather armour, Shortsword, Dagger, Thieves' tools \(47 gp\)/u,
        );
        // Unticking a skill drops its Expertise until another is chosen.
        await page.locator("#skill-stealth").uncheck();
        await page
          .locator("#expertise-error")
          .filter({ hasText: "Choose 2 skills for Expertise; 1 chosen." })
          .waitFor();
        assert.equal(await page.locator("#save-character").isDisabled(), true);
        await page.locator("#skill-stealth").check();
        await page.locator("#expertise-stealth").check();
        await page.locator("#expertise-error:empty").waitFor({
          state: "attached",
        });
        await assertNoSideScroll(page, "the Rogue's creation screen", {
          wideFont: true,
        });

        await page.locator("#character-name").fill("Vex");
        await page.locator("#save-character").click();
        await page.locator("#sheet-name").filter({ hasText: "Vex" }).waitFor();
        const sheetText = await text(page.locator("#sheet-body"));
        assert.match(sheetText, /^Level 1 Rogue/u);
        assert.match(sheetText, /Stealth \+\d+ \(Expertise\)/u);
        assert.match(sheetText, /Tools: Thieves' tools\./u);
        assert.match(sheetText, /Sneak Attack\. Once per turn/u);
        assert.doesNotMatch(sheetText, /Fighting Style/u);
        // Storage holds the Rogue exactly as the engine builds it.
        const created = await readAda(libraryPath);
        const expected = play(seed).sheet;
        assert.deepEqual(
          { ...created.sheet, id: expected.id },
          { ...expected, name: "Vex" },
        );

        await startAdventure(page, "rat-tunnels");
        for (const destinationId of ROUTE) {
          await clickAction(page, "move", destinationId);
          await fight(page);
        }
        const log = await text(page.locator("#log"));
        assert.match(
          log,
          /Vex attacks [^\n]+ at advantage \(Vex\)[^\n]+ \+ Sneak Attack \d+ = \d+ piercing/u,
        );
        await page.locator("#ending").waitFor({ state: "visible" });
        assert.match(await text(page.locator("#ending")), /Victory/iu);

        // The library settles the Rogue: no session, the XP credited.
        const record = await readAda(libraryPath);
        assert.equal(record.session, undefined);
        assert.equal(record.sheet.class, "rogue");
        assert.ok(record.sheet.xp > 0);
        assert.deepEqual(record.sheet.expertise, ["perception", "stealth"]);
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
