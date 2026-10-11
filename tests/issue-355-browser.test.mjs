// #355, browser → API → storage: Bea meets the Wary Tunnels' cellar rat,
// whose reaction roll lands friendly. The session is saved with the reaction
// card; reloading the page and restarting the server load it again from
// storage, the card still shows, and she lets the rat pass and leaves.
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
const { seed } = firstJourney(
  waryTunnels,
  BEA,
  [...ROUTE, ["leave", "den"]],
  ({ status, reactions }) =>
    status === "escaped" && reactions[0]?.roll.band === "friendly",
  { browser: true },
);

const REACTION_CARD =
  /Giant Rat sees you\. Reaction roll: 2d6 \(\d \+ \d\) \+ 3 Charisma = 1[2-5]: friendly\./u;

test(
  `a session holding the rat's reaction roll survives a reload and a restart (seed ${seed})`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-355-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, JSON.stringify(beaLibrary()));
    const serve = (serverSeed) =>
      startFifthBrowserServer({
        libraryPath,
        seed: serverSeed,
        adventures: [waryTunnels],
        qualifies: () => true,
      });
    let server = await serve(seed);
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
      assert.match(card, REACTION_CARD);

      // Reload: the same card and the band's one option.
      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.equal(await text(page.locator("#log li").last()), card);

      // Restart (with another seed): the session loads from its file.
      await server.close();
      server = await serve(seed + 1);
      const { session } = await readAda(libraryPath);
      assert.ok(session, "Bea is still on the adventure");
      await page.goto(`${server.url}/#adventure-${session.id}`);
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.equal(await text(page.locator("#log li").last()), card);
      assert.equal(
        await actionButton(page, "react", "let-pass").isEnabled(),
        true,
      );

      // The adventure continues: she lets the rat pass and leaves.
      await clickAction(page, ...ROUTE[1]);
      assert.match(
        await text(page.locator("#log li").last()),
        /Giant Rat lets you pass: the encounter ends peacefully\./u,
      );
      await clickAction(page, ...ROUTE[2]);
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.ok(
        (await text(page.locator("#ending"))).includes(
          "Parted peacefully with the Giant Rat: +15 XP",
        ),
      );
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.xp, BEA.xp + 15);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
