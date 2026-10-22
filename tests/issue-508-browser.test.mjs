// #508, browser → API → storage: the Settings page lists the survival
// settings after carrying capacity, each with its default marked. With
// opponent hit points at 150%, no short rests, morale never and fleeing
// drawing no attacks, Ada's fight shows the Giant Rat at 11/11 HP and the
// Zombie at 23/23, its flight draws no attacks, and the rest panel says no
// short rest is left; a reload keeps the adventure's own settings.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { DEFAULT_SETTINGS } from "../dist/settings-5e.js";
import { clickAction, createAndStart } from "./fixtures/browser-journey.mjs";
import { fleeingCellar } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

const choice = (page, id, value) => page.locator(`#setting-${id}-${value}`);

/** Chooses `value` for setting `id` and waits for it to be saved. */
async function choose(page, id, value) {
  const saved = await page.locator("#feedback").textContent();
  await choice(page, id, value).check();
  await page
    .locator("#feedback")
    .filter({ hasNotText: saved ?? "" })
    .filter({ hasText: "Saved." })
    .waitFor();
}

/** "11/11": a foe's HP on its card in the fight panel (#525). */
const hpOf = (page, id) =>
  page
    .locator(`#foe-cards li[data-combatant="${id}"] .card-hp`)
    .evaluate(
      (line) =>
        line.querySelector(".hp-now").textContent +
        "/" +
        /\d+/u.exec(line.querySelector(".hp-max").textContent)[0],
    );

test(
  "the survival settings play in the browser: 150% opponent HP, no short rests, no attacks on fleeing",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-508-browser-"));
    const server = await startFifthBrowserServer({
      adventures: [fleeingCellar],
      qualifies: () => true,
      libraryPath: join(directory, "characters.json"),
      seed: 1,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await page.locator("#open-settings").click();
      await page.locator("#setting-morale").waitFor();
      const legends = await page
        .locator("#settings-list legend")
        .allTextContents();
      const survival = [
        "Short rests per adventure",
        "Long rest at rest sites",
        "Last Stand",
        "Opponent hit points",
        "Wandering encounters",
        "Fleeing draws attacks",
        "Morale",
      ];
      // Its settings come after carrying capacity, in the issue's order.
      assert.deepEqual(
        legends.filter((legend) => survival.includes(legend)),
        survival,
      );
      assert.ok(
        legends.indexOf("Carrying capacity") < legends.indexOf(survival[0]),
      );
      for (const [id, value] of Object.entries(DEFAULT_SETTINGS)) {
        assert.equal(await choice(page, id, value).isChecked(), true, id);
      }
      assert.equal(
        (
          await page
            .locator("label", { has: choice(page, "lastStand", 11) })
            .textContent()
        ).trim(),
        "DC 11 Default",
      );
      await choose(page, "opponentHp", 150);
      await choose(page, "shortRests", 0);
      await choose(page, "morale", "never");
      await choose(page, "fleeAttacks", "off");
      assert.deepEqual(
        JSON.parse(await readFile(join(directory, "settings.json"), "utf8"))
          .settings,
        {
          ...DEFAULT_SETTINGS,
          opponentHp: 150,
          shortRests: 0,
          morale: "never",
          fleeAttacks: "off",
        },
      );

      await createAndStart(page, server.url, "fleeing-cellar");
      // Before the fight: no short rest left (#521 names why).
      assert.match(
        await page.locator("#rest-summary").textContent(),
        /^Short rest 0 of 0 left in this adventure · /u,
      );
      assert.equal(
        await page.locator("#rest-reason").textContent(),
        "No short rests left",
      );
      await clickAction(page, "move", "rat-cellar");
      await page.locator("#flee-toggle").waitFor();
      assert.equal(await hpOf(page, "giant-rat"), "11/11");
      assert.equal(await hpOf(page, "zombie"), "23/23");
      const saved = await sessionFile(directory);
      assert.deepEqual(
        saved.state.encounter.combatants
          .filter(({ side }) => side === "opponents")
          .map(({ morale }) => morale),
        [undefined, undefined],
      );
      assert.equal(
        await page.locator("#flee-attacks").textContent(),
        "Draws no attacks",
      );

      // A reload plays by the adventure's own settings, whatever the file says.
      await page.reload();
      await page.locator("#open-settings").click();
      await page.locator("#setting-morale").waitFor();
      await page.locator("#reset-settings").click();
      await page
        .locator("#feedback")
        .filter({ hasText: "back to its default" })
        .waitFor();
      await page.goBack();
      await page.locator("#flee-toggle").waitFor();
      assert.equal(await hpOf(page, "zombie"), "23/23");
      await clickAction(page, "flee", "stair-foot");
      assert.match(
        await page.locator("#log").textContent(),
        /in this adventure fleeing draws no attacks/u,
      );
      assert.equal(
        await page.locator("#room-title").textContent(),
        "Foot of the Stair",
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
