import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultPlacement } from "../dist/character-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FifthSession, sessionSeed } from "../dist/session-5e.js";
import { TEST_CASTER_CLASS } from "../dist/test-caster-class-5e.js";
import { goblinTrio } from "./fixtures/modules.mjs";
import { settled, text } from "./fixtures/browser-journey.mjs";
import {
  assertNoSideScroll,
  launch,
  widenFont,
} from "./fixtures/session-layout.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";

// #338: choosing several targets for an area spell in the browser, with the
// test-only caster, Sage, from a fixture library: Burning Hands catches at
// most two of the goblin trio. Through the API to the saved session.

/** A library holding Sage, preparing Burning Hands; Sage's sheet. */
async function sageLibrary(path) {
  const library = new FifthCharacterLibrary(path, 7);
  const started = await library.startCreation();
  const data = await library.create(
    "Sage",
    {
      ...TEST_CASTER_CLASS.defaults,
      spells: {
        cantrips: ["fire-bolt", "sacred-flame"],
        prepared: ["burning-hands", "magic-missile", "cure-wounds"],
      },
      placement: defaultPlacement(
        started.pendingCreation.dice,
        TEST_CASTER_CLASS,
      ),
    },
    started.revision,
    "test-caster",
  );
  return data.characters[0].sheet;
}

/** The first browser seed whose first session of `sheet` opens on Sage's turn. */
function sagesTurnSeed(sheet) {
  for (let seed = 0; seed < 500; seed++) {
    const { state } = FifthSession.begin(
      sessionSeed(seed, 1),
      goblinTrio,
      sheet,
    );
    if (state.encounter?.order[state.encounter.turn].combatantId === "pc") {
      return seed;
    }
  }
  throw new Error("no seed");
}

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `Burning Hands at two goblins chosen from three, at ${viewport.width} px`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-338-"));
      const libraryPath = join(directory, "characters.json");
      const sheet = await sageLibrary(libraryPath);
      const server = await startFifthBrowserServer({
        adventures: [goblinTrio],
        // Fixtures are engine material, not gated content.
        qualifies: () => true,
        libraryPath,
        seed: sagesTurnSeed(sheet),
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await page.goto(server.url);
        await page.locator("#characters .open-character").first().click();
        await page
          .locator('.start-adventure[data-adventure="goblin-trio"]')
          .click();
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#log li").first().waitFor();
        await page
          .locator("#cast-spell")
          .selectOption({ label: "Burning Hands (1st-level slot)" });
        const boxes = page.locator("#cast-targets input[type=checkbox]");
        assert.equal(await boxes.count(), 3);
        assert.equal(
          await page.locator("#cast-targets").getAttribute("aria-label"),
          "Targets, up to 2",
        );
        // The first two are ticked; the third can't be until one is not.
        const ticked = async () =>
          boxes.evaluateAll((inputs) =>
            inputs.map((input) =>
              input.checked ? "on" : input.disabled ? "off, disabled" : "off",
            ),
          );
        assert.deepEqual(await ticked(), ["on", "on", "off, disabled"]);
        const ids = await boxes.evaluateAll((inputs) =>
          inputs.map(({ value }) => value),
        );
        await boxes.nth(0).uncheck();
        assert.deepEqual(await ticked(), ["off", "on", "off"]);
        await boxes.nth(2).check();
        assert.deepEqual(await ticked(), ["off, disabled", "on", "on"]);
        if (viewport.width === 375) {
          await widenFont(page);
          await assertNoSideScroll(page);
        }
        // With none ticked, Cast waits for a target.
        await boxes.nth(1).uncheck();
        await boxes.nth(2).uncheck();
        assert.equal(
          await page.locator("button.act[data-action=cast]").isDisabled(),
          true,
        );
        assert.equal(
          await page.locator("#cast-reason").textContent(),
          "Choose a target",
        );
        await boxes.nth(1).check();
        await boxes.nth(2).check();
        await settled(page, () =>
          page.locator("button.act[data-action=cast]").click(),
        );
        const card = await text(
          page.locator("#log li").filter({ hasText: "You cast Burning Hands" }),
        );
        assert.match(
          card,
          /You cast Burning Hands at Goblin [^\n]+ and Goblin [^\n]+ with a 1st-level spell slot \(1 of 2 left\)\.\nBurning Hands: damage \d+ \+ \d+ \+ \d+ = \d+ fire, and each of its 2 targets saves against it\./u,
        );
        const file = await sessionFile(directory);
        const cast = file.transitions.find(
          ({ action }) => action.type === "cast",
        );
        assert.deepEqual(cast.action.targetIds, [ids[1], ids[2]]);
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
