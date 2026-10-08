// #304, browser → API → storage: Bea goes into the Wary Tunnels' cellar,
// where the rat's reaction roll lands friendly. The reaction card shows the
// roll, her Charisma modifier, the band and the one option offered; she
// passes peacefully, goes on to the den and leaves. The ending and the
// library credit the encounter's peaceful XP.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { launch } from "./fixtures/session-layout.mjs";
import {
  actionButton,
  clickAction,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { BEA, beaLibrary } from "./fixtures/charismatic-fighter.mjs";
import { firstJourney } from "./fixtures/module-journey.mjs";
import { waryTunnels } from "./fixtures/modules.mjs";
import { readAda } from "./fixtures/save-files.mjs";

const ROUTE = [
  ["move", "rat-cellar"],
  ["react", "let-pass"],
  ["move", "den"],
];

// A seed where the rat's reaction to Bea is friendly.
const { seed, state } = firstJourney(
  waryTunnels,
  BEA,
  [...ROUTE, ["leave", "den"]],
  ({ status, reactions }) =>
    status === "escaped" && reactions[0]?.roll.band === "friendly",
  { browser: true },
);

test(
  `a friendly rat lets Bea pass, and she keeps its peaceful XP (seed ${seed})`,
  { timeout: 120000 },
  async () => {
    assert.deepEqual(state.peacefulEncounterIds, ["cellar-rat"]);
    const directory = await mkdtemp(join(tmpdir(), "issue-304-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, JSON.stringify(beaLibrary()));
    const server = await startFifthBrowserServer({
      libraryPath,
      seed,
      adventures: [waryTunnels],
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
        .filter({ hasText: "Bea" })
        .click();
      await startAdventure(page, "wary-tunnels");

      await clickAction(page, ...ROUTE[0]);
      const card = await text(page.locator("#log li").last());
      assert.match(
        card,
        /Giant Rat sees you\. Reaction roll: 2d6 \(\d \+ \d\) \+ 3 Charisma = 1[2-5]: friendly\. The rat sniffs at your boots and wanders off\. You may pass peacefully\./u,
      );
      // The compact line: the band, the dice and the Charisma modifier.
      assert.match(
        card,
        /Bea Reaction roll Friendly d6 \d, d6 \d \+ 3 Cha = 1[2-5]/u,
      );
      // Only the band's option is offered: no attack, no going on.
      assert.equal(
        await actionButton(page, "react", "let-pass").isEnabled(),
        true,
      );
      assert.equal(await actionButton(page, "react", "attack").count(), 0);
      assert.equal(await actionButton(page, "move", "den").count(), 0);
      assert.equal(await page.locator("#initiative-rows tr").count(), 0);

      await clickAction(page, ...ROUTE[1]);
      assert.match(
        await text(page.locator("#log li").last()),
        /Giant Rat lets you pass: the encounter ends peacefully\./u,
      );
      await clickAction(page, ...ROUTE[2]);
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      const ending = await text(page.locator("#ending"));
      assert.match(ending, /^Out through the den\n/u);
      assert.ok(
        ending.includes("Parted peacefully with the Giant Rat: +15 XP"),
        ending,
      );
      assert.ok(!ending.includes("Defeated"), ending);

      // Storage credits the peaceful XP under the encounter's award, once.
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.name, "Bea");
      assert.equal(record.sheet.xp, BEA.xp + 15);
      assert.deepEqual(record.sheet.xpAwards, [
        "wary-tunnels/encounter/cellar-rat",
      ]);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
