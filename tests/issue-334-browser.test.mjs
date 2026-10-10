import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { ratTunnels } from "./fixtures/modules.mjs";
import {
  clickAction,
  createAndStart,
  fight,
  settled,
  text,
} from "./fixtures/browser-journey.mjs";
import {
  assertNoSideScroll,
  launch,
  widenFont,
} from "./fixtures/session-layout.mjs";
import { readAda, sessionFile } from "./fixtures/save-files.mjs";

// #334: a short rest from the room panel, through the API to the saved
// session; abandoning the adventure afterwards leaves the character exactly
// as it started.

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `a short rest after a fight spends a hit die, and abandoning undoes it, at ${viewport.width} px`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-334-"));
      const libraryPath = join(directory, "characters.json");
      const server = await startFifthBrowserServer({
        adventures: [ratTunnels],
        // Fixtures are engine material, not gated content: the gate is
        // tested in balance-5e.test.mjs (#310).
        qualifies: () => true,
        libraryPath,
        // Ada leaves the rat's fight at 7 of 13 HP.
        seed: 1,
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await createAndStart(page, server.url, "rat-tunnels");
        const before = (await readAda(libraryPath)).sheet;
        const rest = page.locator("#rest-controls button.act");
        // Fresh, there is nothing to rest for: what is left shows, with no
        // Rest.
        assert.equal(await page.locator("#rest-group").isVisible(), true);
        assert.equal(await rest.count(), 0);
        assert.equal(
          await page.locator("#rest-summary").textContent(),
          "Short rests: 2 of 2 left in this adventure. Hit dice: 1 of 1 d10 left; each heals its roll + your Constitution modifier, and you stop spending them at full HP.",
        );
        // No rest in a fight.
        await clickAction(page, "move", "rat-cellar");
        assert.equal(await page.locator("#rest-group").isVisible(), false);
        await fight(page);
        assert.match(
          await page.locator("#character-hp").textContent(),
          /^HP 7 of 13,/u,
        );
        assert.equal(await rest.isEnabled(), true);
        // With every Second Wind left, a rest spends its one hit die.
        const dice = page.locator("#rest-dice");
        assert.deepEqual(await dice.locator("option").allTextContents(), ["1"]);
        await settled(page, () => rest.click());
        const card = await text(page.locator("#log li.newest"));
        assert.match(
          card,
          /You take a short rest and spend 1 hit die \(0 of 1 d10 left\)\. Short rests: 1 of 2 left in this adventure\./u,
        );
        // The die shows on the card, as rolled.
        const healed = card.match(
          /You spend a hit die: d10 (\d+) \+ (\d+) = \d+; you regain (\d+) HP and have (\d+)\/13 HP\./u,
        );
        assert.ok(healed, card);
        const hp = Number(healed[4]);
        assert.equal(hp, 7 + Number(healed[3]));
        assert.equal(
          await page
            .locator("#log li.newest .roll.healing .roll-die")
            .first()
            .textContent(),
          `d10 ${healed[1]}`,
        );
        assert.match(
          await page.locator("#character-hp").textContent(),
          new RegExp(`^HP ${hp} of 13,`, "u"),
        );
        // Nothing is left to spend or recover, so Rest goes.
        assert.equal(await rest.count(), 0);
        assert.match(
          await page.locator("#rest-summary").textContent(),
          /^Short rests: 1 of 2 left in this adventure. Hit dice: 0 of 1 d10 left;/u,
        );
        const file = await sessionFile(directory);
        assert.equal(file.state.shortRests, 1);
        assert.equal(file.state.character.hitDice, 0);
        assert.equal(file.state.character.hp, hp);
        assert.deepEqual(file.transitions.at(-1).action, {
          type: "rest",
          hitDice: 1,
        });
        if (viewport.width === 375) {
          // CI's Linux fallback font is wider than Windows'.
          await widenFont(page);
          await assertNoSideScroll(page);
        }
        // Abandoning leaves the character exactly as it started.
        await page.locator('#breadcrumb a[data-view="sheet"]').click();
        await page.locator("#abandon-adventure").click();
        await page.locator("#confirm-abandon").click();
        await page
          .locator("#feedback")
          .filter({ hasText: "Ada abandoned The Rat Tunnels." })
          .waitFor();
        const record = await readAda(libraryPath);
        assert.equal(record.session, undefined);
        assert.deepEqual(record.sheet, before);
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
