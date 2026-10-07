// #237, browser → API → storage: in the burial hall a goblin loses its nerve
// and flees. The initiative table tags it Fled and offers no body for it. Ada
// searches the bodies of the goblins she cut down, takes their pouches and
// escapes; the ending, the stored sheet and the sheet page credit only the
// defeated goblins' XP and coin.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  fleeingGoblins,
  fleeingSeed,
  GOBLINS,
  pouchOf,
} from "./fixtures/fleeing-goblins.mjs";
import { launch } from "./fixtures/session-layout.mjs";

/** An element's text with its blank lines collapsed. */
const text = async (locator) =>
  (await locator.innerText()).replace(/\n+/gu, "\n");

/** Waits for a new, settled history entry after `run`. */
async function settled(page, run) {
  const count = await page.locator("#log li").count();
  await run();
  await page.waitForFunction(
    (seen) =>
      document.querySelectorAll("#log li:not([data-pending])").length > seen,
    count,
  );
}

const click = (page, action, target) =>
  settled(page, () =>
    page
      .locator(`button.act[data-action="${action}"][data-target="${target}"]`)
      .click(),
  );

/** Attacks the first goblin offered, or ends the turn, until the fight ends. */
async function fight(page) {
  while ((await page.locator("#turn").textContent()) !== "The fight is over.") {
    const attack = page.locator("#attack-controls button.attack:enabled");
    await settled(page, async () =>
      ((await attack.count()) > 0
        ? attack.first()
        : page.locator('#feature-controls button[data-action="end-turn"]')
      ).click(),
    );
  }
}

test(
  "a goblin flees; Ada escapes and keeps only the defeated goblins' XP and coin",
  { timeout: 120000 },
  async () => {
    const { seed, state: expected } = fleeingSeed();
    const [{ opponentId: gone }] = expected.fledOpponents;
    const fallen = GOBLINS.filter((id) => id !== gone);
    const directory = await mkdtemp(join(tmpdir(), "issue-237-browser-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      seed,
      libraryPath,
      adventures: [fleeingGoblins],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(8000);
    try {
      await page.goto(server.url);
      await page.locator("#open-creation").click();
      await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
      await page.locator("#character-name").fill("Ada");
      await page.locator("#save-character").click();
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      await page
        .locator(`.start-adventure[data-adventure="${fleeingGoblins.id}"]`)
        .click();
      await page.locator("#adventure").waitFor({ state: "visible" });

      await click(page, "move", "burial-hall");
      await fight(page);
      const log = await text(page.locator("#log"));
      const goneName = `Goblin ${gone.slice(-1)}`;
      assert.match(
        log,
        new RegExp(
          `${goneName} checks morale with its side at half strength: a Wisdom saving throw, \\d+ − 1 = -?\\d+ against DC 8\\. Failure: it will flee on its turn\\.`,
          "u",
        ),
      );
      assert.match(log, new RegExp(`${goneName} flees the fight\\.`));
      // The initiative table tags the fled goblin; only the fallen leave
      // bodies to search.
      const row = page.locator(`#initiative-rows tr[data-combatant="${gone}"]`);
      assert.match(await row.textContent(), /Fled/);
      assert.equal(
        await page.locator(`button.act[data-action="examine"]`).count(),
        fallen.length,
      );
      assert.equal(
        await page
          .locator(`button.act[data-action="examine"][data-target="${gone}"]`)
          .count(),
        0,
      );

      for (const id of fallen) {
        await click(page, "examine", id);
        await click(page, "take", pouchOf(id));
      }
      await click(page, "move", "barrow-mouth");
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      const ending = await text(page.locator("#ending"));
      const names = fallen.map((id) => `Goblin ${id.slice(-1)}`);
      const goblinXp = 25 * fallen.length;
      assert.match(
        ending,
        new RegExp(`Defeated ${names.join(" and ")}: \\+${goblinXp} XP\\n`),
      );
      assert.doesNotMatch(ending, new RegExp(goneName));
      // Goblin n carries n sp.
      const silver = fallen.reduce((sum, id) => sum + Number(id.slice(-1)), 0);
      assert.match(ending, new RegExp(`Coin found: ${silver} sp\\.`));

      // Storage: only the defeated goblins' XP and pouches.
      const [record] = JSON.parse(
        await readFile(libraryPath, "utf8"),
      ).characters;
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.xp, goblinXp + 250);
      assert.equal(record.sheet.purse, silver * 10);
      assert.deepEqual(
        record.sheet.finds.sort(),
        fallen.map((id) => `${fleeingGoblins.id}/${pouchOf(id)}`).sort(),
      );
      await page.locator("#ending-next").click();
      await page.locator("#sheet").waitFor({ state: "visible" });
      const sheet = await text(page.locator("#sheet-body"));
      assert.match(sheet, new RegExp(`· ${goblinXp + 250} XP `));
      assert.match(sheet, new RegExp(`Purse\\n${silver} sp\\n`));
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
