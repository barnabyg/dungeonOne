// #402, browser → API → storage: Ada topples the Leaning Statue onto the
// Scarred Rat in the Statue Cellar's fight. The Fight section's "Use the
// room" row offers the statue against each rat, by each approach; toppling
// it by Athletics rolls the check once, the saved session holds the use,
// and after a reload the statue is spent.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  clickAction,
  createAndStart,
  settled,
} from "./fixtures/browser-journey.mjs";
import { ratTunnels, statueCellar } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

test("Ada topples the statue onto a rat, and it stays spent after a reload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-402-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [statueCellar, ratTunnels],
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
  const row = page.locator(".action-row[data-row=room]");
  const topple = row.locator(
    'button.act[data-action="use-feature"][data-feature="leaning-statue"][data-target="scarred-rat"][data-approach="athletics"]',
  );
  try {
    await createAndStart(page, server.url, "statue-cellar");
    // Out of a fight, the statue offers nothing to use.
    assert.equal(await row.count(), 0);

    await clickAction(page, "move", "rat-cellar");
    await topple.waitFor({ state: "visible" });
    // The row names the feature, each opponent and each approach.
    assert.equal(await row.locator(".row-label").textContent(), "Use the room");
    assert.deepEqual(
      await row
        .locator("button.act")
        .evaluateAll((buttons) =>
          buttons.map((b) => [b.dataset.target, b.dataset.approach]),
        ),
      [
        ["scarred-rat", "athletics"],
        ["scarred-rat", "dexterity"],
        ["giant-rat", "athletics"],
        ["giant-rat", "dexterity"],
      ],
    );
    assert.equal(
      await topple.textContent(),
      "Use Leaning Statue against Scarred Rat with Athletics",
    );
    assert.equal(await topple.isEnabled(), true);

    await settled(page, () => topple.click());
    const log = await page.locator("#log").textContent();
    assert.match(log, /You use the Leaning Statue against Scarred Rat\./u);
    assert.match(log, /Athletics check: d20 \d+ \+ \d+ \+ 2 proficiency/u);
    const saved = (await sessionFile(directory)).state;
    assert.equal(saved.fightActions.length, 1);
    const [use] = saved.fightActions;
    assert.equal(use.featureId, "leaning-statue");
    assert.equal(use.encounterId, "cellar-rat");
    assert.equal(use.targetId, "scarred-rat");
    // On this seed the check fails and the fight goes on.
    assert.equal(use.band, "failure");
    const spent = async () => {
      // While the fight goes on, the statue stays in the row, spent.
      assert.equal(await row.count(), 1);
      for (const button of await row.locator("button.act").all()) {
        assert.equal(await button.isDisabled(), true);
      }
      assert.match(await row.textContent(), /Already used/u);
    };
    await spent();

    // A reload keeps the use, and the statue stays spent.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    assert.deepEqual(
      (await sessionFile(directory)).state.fightActions,
      saved.fightActions,
    );
    await spent();
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
