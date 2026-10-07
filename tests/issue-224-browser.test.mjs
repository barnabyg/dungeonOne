// #224, browser → API → storage: a Strength 5 character (75 lb) carrying a
// stowed shield and dagger finds chain mail behind the barrow's lintel. Taking
// it is refused as too heavy; dropping the dagger makes room, it takes the
// mail at exactly its capacity, escapes, and the sheet and the saved library
// keep the gear and show the weight.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { buildFighter, validateFighter } from "../dist/fighter-5e.js";
import { barrowFile, room } from "./fixtures/armoury-barrow.mjs";
import { assertTogether, launch } from "./fixtures/session-layout.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";

// Chain mail is uncommon, found only in modules for level 3 and up (#239).
const mailed = {
  ...structuredClone(barrowFile),
  recommendedLevels: { min: 1, max: 3 },
};
room(mailed, "barrow-mouth").items.push({
  id: "lintel-mail",
  name: "Chain Mail",
  description: "An old chain mail, still serviceable.",
  kind: "gear",
  gear: "chain-mail",
  hiddenIn: "scratched-lintel",
});
const barrow = validateModule(mailed);

// Str 5 (75 lb): leather and mace (14 lb), and a shield and dagger stowed (7 lb).
const sheet = validateFighter({
  ...buildFighter(
    "b".repeat(32),
    "Wren",
    [
      [6, 6, 4, 1],
      [4, 4, 4, 1],
      [4, 4, 4, 1],
      [3, 3, 3, 1],
      [3, 3, 3, 1],
      [2, 2, 1, 1],
    ],
    {
      placement: {
        strength: 5,
        dexterity: 1,
        constitution: 0,
        intelligence: 3,
        wisdom: 4,
        charisma: 2,
      },
      increase: { constitution: 2, intelligence: 1 },
      skills: ["athletics", "perception"],
      fightingStyle: "defense",
      kit: "mace",
      masteries: ["dagger", "mace", "shortsword"],
    },
  ),
  stowed: ["shield", "dagger"],
});

/** Clicks an action control and waits for its result card. */
async function click(page, action, target) {
  const count = await page.locator("#log li").count();
  await page
    .locator(`button.act[data-action="${action}"][data-target="${target}"]`)
    .click();
  await page.waitForFunction(
    (seen) => document.querySelectorAll("#log li").length > seen,
    count,
  );
  await assertTogether(page, `${action} ${target}`);
}

const newest = (page) => page.locator("#log li").last().innerText();
const carrying = (page) => page.locator("#carrying").textContent();

test(
  "a weak character is refused chain mail, drops a dagger, takes it and escapes: the sheet keeps it and shows the weight",
  { timeout: 120000 },
  async () => {
    assert.equal(sheet.abilities.strength, 5);
    const directory = await mkdtemp(join(tmpdir(), "issue-224-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(
      libraryPath,
      JSON.stringify({
        kind: "dungeon-one-characters",
        formatVersion: FIFTH_LIBRARY_FORMAT,
        revision: "1".repeat(32),
        creationsStarted: 1,
        sessionsStarted: 0,
        characters: [{ sheet, revision: 1 }],
      }),
    );
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [barrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(`${server.url}#character-${sheet.id}`);
      await page.locator("#sheet-name").filter({ hasText: "Wren" }).waitFor();
      assert.match(
        await page.locator("#sheet-body").innerText(),
        /Carrying:\s*21 of 75 lb/,
      );

      await page
        .locator('.start-adventure[data-adventure="robbers-barrow"]')
        .click();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.equal(
        await carrying(page),
        "Carrying 21 lb of the 75 lb your Strength allows.",
      );

      await click(page, "examine", "scratched-lintel");
      const takeMail = page.locator(
        'button.act[data-action="take"][data-target="lintel-mail"]',
      );
      assert.equal(await takeMail.isDisabled(), true);
      assert.equal(
        await page
          .locator(`#${await takeMail.getAttribute("aria-describedby")}`)
          .textContent(),
        "Too heavy",
      );

      // Dropping the dagger makes room for the mail, at exactly 75 lb.
      await click(page, "drop", "dagger");
      assert.equal(
        await carrying(page),
        "Carrying 20 lb of the 75 lb your Strength allows.",
      );
      await click(page, "take", "lintel-mail");
      assert.equal(await newest(page), "You take the Chain Mail and stow it.");
      assert.equal(
        await carrying(page),
        "Carrying 75 lb of the 75 lb your Strength allows.",
      );
      // The dagger can't come back now.
      assert.equal(
        await page
          .locator(
            'button.act[data-action="take"][data-target="dropped:dagger"]',
          )
          .isDisabled(),
        true,
      );

      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      await page.locator("#ending-next").click();
      await page.locator("#sheet-name").filter({ hasText: "Wren" }).waitFor();
      const body = await page.locator("#sheet-body").innerText();
      assert.match(body, /Carried: Shield, Chain mail/);
      assert.match(body, /Carrying:\s*75 of 75 lb/);

      const saved = JSON.parse(await readFile(libraryPath, "utf8"))
        .characters[0].sheet;
      assert.deepEqual(saved.equipment, ["leather", "mace"]);
      assert.deepEqual(saved.stowed, ["shield", "chain-mail"]);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
