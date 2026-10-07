// #238, browser → API → storage: in the burial hall a goblin loses its nerve
// and surrenders. The initiative table tags it Surrendered and offers no body
// for it; once the fight is won it kneels in the room. Ada asks it for mercy,
// takes the ring it offers and escapes; the ending, the stored sheet and the
// sheet page show the ring, half the captive's XP and the XP for sparing it.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  GOBLINS,
  mercyOf,
  ringOf,
  SPARED_XP,
  surrenderingGoblins,
  surrenderSeed,
} from "./fixtures/surrendering-goblins.mjs";
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
  "a goblin surrenders; Ada asks it for mercy, takes its ring and escapes with it",
  { timeout: 120000 },
  async () => {
    const { seed, state: expected } = surrenderSeed();
    assert.deepEqual(expected.fledOpponents, []);
    const [{ opponentId: captive, engaged }] = expected.surrenderedOpponents;
    assert.equal(engaged, true);
    const fallen = GOBLINS.filter((id) => id !== captive);
    const captiveName = `Goblin ${captive.slice(-1)}`;
    const ringName = `Stolen Ring ${captive.slice(-1)}`;
    const directory = await mkdtemp(join(tmpdir(), "issue-238-browser-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      seed,
      libraryPath,
      adventures: [surrenderingGoblins],
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
        .locator(`.start-adventure[data-adventure="${surrenderingGoblins.id}"]`)
        .click();
      await page.locator("#adventure").waitFor({ state: "visible" });

      await click(page, "move", "burial-hall");
      await fight(page);
      const log = await text(page.locator("#log"));
      assert.match(
        log,
        new RegExp(
          `${captiveName} checks morale [^.]+: a Wisdom saving throw, \\d+ − 1 = -?\\d+ against DC 8\\. Failure: it will surrender on its turn\\.`,
          "u",
        ),
      );
      assert.match(
        log,
        new RegExp(`${captiveName} throws down its arms and surrenders\\.`),
      );
      const row = page.locator(
        `#initiative-rows tr[data-combatant="${captive}"]`,
      );
      assert.match(await row.textContent(), /Surrendered/);
      // Only the fallen leave bodies; the captive is there to talk to.
      assert.equal(
        await page.locator(`button.act[data-action="examine"]`).count(),
        fallen.length,
      );
      assert.equal(
        await page
          .locator(
            `button.act[data-action="examine"][data-target="${captive}"]`,
          )
          .count(),
        0,
      );
      // Its ring is not offered until it is asked for mercy.
      assert.equal(
        await page
          .locator(
            `button.act[data-action="take"][data-target="${ringOf(captive)}"]`,
          )
          .count(),
        0,
      );
      await click(page, "talk", mercyOf(captive));
      assert.match(
        await text(page.locator("#log li").last()),
        new RegExp(
          `${captiveName}: Spare me! Take it, take the ring! ${captiveName} offers you the ${ringName}\\.`,
        ),
      );
      await click(page, "take", ringOf(captive));

      await click(page, "move", "barrow-mouth");
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      const ending = await text(page.locator("#ending"));
      const names = fallen.map((id) => `Goblin ${id.slice(-1)}`);
      // It attacked Ada before it yielded: half its 25 XP, and the XP for
      // sparing it.
      const fightXp = 25 * fallen.length + 12 + SPARED_XP;
      assert.match(
        ending,
        new RegExp(
          `Defeated ${names.join(" and ")}; spared the ${captiveName}: \\+${fightXp} XP\\n`,
        ),
      );
      assert.match(
        ending,
        new RegExp(`Treasure kept\\n${ringName} \\(25 gp\\)\\.`),
      );

      // Storage: the ring is kept and found once; all the XP is credited.
      const xp = fightXp + 250;
      const [record] = JSON.parse(
        await readFile(libraryPath, "utf8"),
      ).characters;
      assert.equal(record.session, undefined);
      assert.equal(record.sheet.xp, xp);
      assert.deepEqual(record.sheet.finds, [
        `${surrenderingGoblins.id}/${ringOf(captive)}`,
      ]);
      assert.deepEqual(
        record.sheet.treasure.map(({ name }) => name),
        [ringName],
      );
      await page.locator("#ending-next").click();
      await page.locator("#sheet").waitFor({ state: "visible" });
      const sheet = await text(page.locator("#sheet-body"));
      assert.match(sheet, new RegExp(`· ${xp} XP `));
      assert.match(sheet, new RegExp(`Treasure\\n${ringName}`));
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
