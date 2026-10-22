// #485, browser → API → storage: a Wizard's spells sound by family when
// cast, a cantrip at half the volume of a levelled spell, and the cast's
// sound plays before the attack it makes.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { defaultPlacement } from "../dist/character-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import {
  chooseSpell,
  clickAction,
  settled,
  startAdventure,
} from "./fixtures/browser-journey.mjs";
import { ratTunnels } from "./fixtures/modules.mjs";
import { launch } from "./fixtures/session-layout.mjs";

/** The sounds the page has asked for since it loaded. */
const requested = (page) => page.evaluate(() => window.requestedSounds);

/**
 * A stand-in for the browser's Audio, installed before the page loads:
 * each play is recorded in window.playedSounds with its volume, and ends
 * at once.
 */
function recordPlays() {
  window.playedSounds = [];
  window.Audio = class {
    constructor(src) {
      this.src = src;
      this.onended = null;
      this.volume = 1;
    }

    play() {
      window.playedSounds.push({ src: this.src, volume: this.volume });
      setTimeout(() => this.onended?.(), 0);
      return Promise.resolve();
    }

    pause() {}
  };
}

/** Casts the spell the bar names `label`, and returns the sounds asked for. */
async function castNamed(page, label) {
  const before = (await requested(page)).length;
  await page.locator("#cast-spell").selectOption({ label });
  await settled(page, () =>
    page.locator("button.act[data-action=cast]").click(),
  );
  return (await requested(page)).slice(before);
}

test(
  "Mage Armor sounds as a buff and Fire Bolt as fire at half the volume, before its attack",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-485-browser-"));
    const libraryPath = join(directory, "characters.json");
    const library = new FifthCharacterLibrary(libraryPath, 0);
    const started = await library.startCreation();
    await library.create(
      "Vela",
      {
        ...WIZARD.defaults,
        placement: defaultPlacement(started.pendingCreation.dice, WIZARD),
      },
      started.revision,
      "wizard",
    );
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [ratTunnels],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(8000);
    await page.addInitScript(recordPlays);
    try {
      await page.goto(server.url);
      await page.locator("#characters .open-character").first().click();
      await page.locator("#sheet-name").filter({ hasText: "Vela" }).waitFor();
      await startAdventure(page, "rat-tunnels");

      assert.deepEqual(await castNamed(page, "Mage Armor (1st-level slot)"), [
        "spell-buff",
      ]);
      await clickAction(page, "move", "rat-cellar");
      // Fire Bolt at the rat, from the attack chooser (#526).
      await page.locator("#foe-cards button.act").first().waitFor();
      const before = (await requested(page)).length;
      await chooseSpell(page, "fire-bolt");
      await settled(page, () =>
        page.locator("#foe-cards button.act[data-action=cast]").click(),
      );
      const bolt = (await requested(page)).slice(before);
      assert.equal(bolt[0], "spell-fire-cantrip");
      assert.ok(
        ["hit-fire", "critical", "miss"].includes(bolt[1]),
        bolt.join(),
      );

      await page.waitForFunction(() =>
        window.playedSounds.some(({ src }) => src === "/sounds/spell-fire.wav"),
      );
      const played = await page.evaluate(() => window.playedSounds);
      const volume = (src) => played.find((one) => one.src === src).volume;
      assert.equal(volume("/sounds/spell-buff.wav"), 0.5);
      assert.equal(volume("/sounds/spell-fire.wav"), 0.25);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
