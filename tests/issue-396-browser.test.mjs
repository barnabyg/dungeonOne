// #396, browser → API → storage: Ada flees the Bolt-Hole Cellar's fight.
// The Fight section offers a Flee control by each usable way out, saying
// whose attacks it draws; the shut Sagging Door offers none. Fleeing saves
// the session in the stair foot with the fight left behind; after a reload,
// going back meets the same fight again.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  actionButton,
  openFlee,
  clickAction,
  createAndStart,
} from "./fixtures/browser-journey.mjs";
import { fleeingCellar, ratTunnels } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

test("Ada flees a fight, reloads, and meets it again on going back", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-396-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [fleeingCellar, ratTunnels],
    // Fixtures are engine material, not gated content.
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
    await createAndStart(page, server.url, "fleeing-cellar");
    await clickAction(page, "move", "rat-cellar");
    const flee = actionButton(page, "flee", "stair-foot");
    // Flee (#525) opens a menu: one control by each usable way, under the
    // attacks drawn.
    assert.equal(await page.locator("#flee-toggle").innerText(), "Flee ▾");
    assert.equal(
      await page.locator("#flee-toggle").getAttribute("aria-label"),
      "Flee",
    );
    await openFlee(page);
    const row = page.locator("#flee-menu");
    assert.deepEqual(
      await row
        .locator("button.act")
        .evaluateAll((buttons) => buttons.map((b) => b.dataset.target)),
      ["stair-foot", "den", "sump"],
    );
    // Each button names its room; its accessible name says it all.
    assert.equal(await flee.textContent(), "↩North: Foot of the Stair");
    assert.equal(
      await flee.getAttribute("aria-label"),
      "Flee north to Foot of the Stair (the way you came)",
    );
    const drawn = row.locator("#flee-attacks");
    assert.match(
      await drawn.textContent(),
      /^Draws attacks from (Giant Rat and Zombie|Zombie and Giant Rat)$/u,
    );
    assert.match(await flee.getAttribute("aria-describedby"), /flee-attacks/u);
    const before = await sessionFile(directory);
    assert.equal(before.state.roomId, "rat-cellar");
    const opponents = before.state.encounter.combatants
      .filter(({ side }) => side === "opponents")
      .map(({ id, hp }) => [id, hp]);

    await clickAction(page, "flee", "stair-foot");
    assert.equal(
      await page.locator("#room-title").textContent(),
      "Foot of the Stair",
    );
    const fled = await sessionFile(directory);
    assert.equal(fled.state.status, "playing");
    assert.equal(fled.state.roomId, "stair-foot");
    assert.equal(fled.state.encounter, undefined);
    assert.equal(fled.state.moves, 2);
    assert.match(
      await page.locator("#log").textContent(),
      /You get away from the Rat-Gnawed Cellar into the Foot of the Stair/u,
    );

    // A reload keeps Ada in the stair foot; going back meets the fight.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    assert.equal(
      await page.locator("#room-title").textContent(),
      "Foot of the Stair",
    );
    await clickAction(page, "move", "rat-cellar");
    const back = await sessionFile(directory);
    assert.equal(back.state.roomId, "rat-cellar");
    assert.deepEqual(
      back.state.encounter.combatants
        .filter(({ side }) => side === "opponents")
        .map(({ id }) => id),
      opponents.map(([id]) => id),
    );
    // Each opponent stands with the hit points it had when Ada fled.
    for (const [id, hp] of opponents) {
      const met = back.state.encounter.combatants.find(
        (entrant) => entrant.id === id,
      );
      assert.equal(met.hp, hp, id);
    }
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
