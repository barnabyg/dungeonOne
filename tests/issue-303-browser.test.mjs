// #303, browser → API → storage: Ada walks into the Lurking Tunnels' cellar,
// where the Giant Rat lies in wait and wins its Stealth check. The card says
// who hid, the roll and the passive Perception it beat; the initiative table
// tags Ada surprised; the saved session keeps the card, and a reload shows
// it again.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { libraryAt, testFighterAt } from "../dist/test-fighter-5e.js";
import { launch } from "./fixtures/session-layout.mjs";
import {
  clickAction,
  fight,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { firstJourney } from "./fixtures/module-journey.mjs";
import { lurkingTunnels } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";

const ROUTE = [["move", "rat-cellar"]];
const sheet = testFighterAt(1);
const SURPRISE =
  /Giant Rat is lying in wait in the Rat-Gnawed Cellar\. Giant Rat's Stealth check: d20 \d+ \+ 4 = \d+ against your passive Perception 12 \(10 \+ 0 Wisdom \+ 2 proficiency\)\. Success: you did not notice it, and you are surprised and roll initiative with disadvantage\./u;

// A seed where the rat hides from Ada and she still beats it.
const { seed } = firstJourney(
  lurkingTunnels,
  sheet,
  ROUTE,
  ({ status, lurks }) =>
    status === "playing" && lurks.length === 1 && lurks[0].roll.success,
  { browser: true },
);

test(
  `the lurking rat surprises Ada, and the card says why (seed ${seed})`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-303-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, JSON.stringify(libraryAt(1)));
    let server = await startFifthBrowserServer({
      libraryPath,
      seed,
      adventures: [lurkingTunnels],
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
      await startAdventure(page, "lurking-tunnels");

      await clickAction(page, ...ROUTE[0]);
      const card = await text(page.locator("#log li").last());
      assert.match(card, SURPRISE);
      // The initiative table tags Ada, not the rat, as surprised.
      const surprised = page.locator("#initiative-rows tr", {
        has: page.locator(".tag.surprised"),
      });
      assert.equal(await surprised.count(), 1);
      assert.match(await text(surprised), /Ada/u);
      await fight(page);

      // Storage keeps the remembered roll and the card.
      const saved = await sessionFile(directory);
      assert.equal(saved.state.lurks.length, 1);
      assert.equal(saved.state.lurks[0].encounterId, "cellar-rat");
      assert.equal(saved.state.lurks[0].roll.success, true);
      assert.match(JSON.stringify(saved), /you are surprised and roll/u);

      // Restarting shows the same card from the saved session.
      await server.close();
      server = await startFifthBrowserServer({
        libraryPath,
        seed: seed + 1,
        adventures: [lurkingTunnels],
        qualifies: () => true,
      });
      await page.goto(`${server.url}/#adventure-${saved.id}`);
      await page.locator("#adventure").waitFor({ state: "visible" });
      const log = await text(page.locator("#log"));
      assert.match(log, SURPRISE);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
