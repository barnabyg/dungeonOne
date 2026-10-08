// #286, browser → API → storage: a level-3 Fighter crosses 2,700 XP in a
// fight, settles at level 4 and is asked for its Ability Score Improvement
// and fourth weapon mastery. The pending choice survives a reload and blocks
// the next adventure; an improvement past 20 is refused by the server; once
// chosen, the sheet and the library file show the choices.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import {
  buildFighter,
  fighterProfile,
  validateFighter,
} from "../dist/fighter-5e.js";
import {
  TEST_FIGHTER_CHOICES,
  testFighterAt,
} from "../dist/test-fighter-5e.js";
import { clickAction, fight } from "./fixtures/browser-journey.mjs";
import { winBarrowSeed } from "./fixtures/library.mjs";
import { lintelBarrow } from "./fixtures/modules.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

// Ada: Str 17, Dex 14, Con 15, the mace kit; 10 XP short of level 4.
const ada = validateFighter({ ...testFighterAt(3), xp: 2690 });
// Bea: an 18 on Strength, so Str 20 at level 4 with her choice still owed.
const bea = (() => {
  const created = buildFighter(
    "b".repeat(32),
    "Bea",
    [
      [6, 6, 6, 1],
      [5, 5, 4, 1],
      [5, 4, 4, 1],
      [4, 4, 4, 1],
      [3, 3, 4, 1],
      [3, 3, 3, 1],
    ],
    TEST_FIGHTER_CHOICES,
  );
  const raised = { ...created, level: 4, xp: 2700 };
  return validateFighter({ ...raised, hp: fighterProfile(raised).maxHp });
})();

const stored = async (path, id) =>
  JSON.parse(await readFile(path, "utf8")).characters.find(
    ({ sheet }) => sheet.id === id,
  );

/** POSTs `body` to the server from the page, as the page itself would. */
const post = (page, path, body) =>
  page.evaluate(
    async ([path, body]) => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
    [path, body],
  );

test(
  "a level-3 Fighter crosses 2,700 XP, settles, makes its level-4 choices after a reload, and the sheet shows them",
  { timeout: 180000 },
  async () => {
    const seed = winBarrowSeed(lintelBarrow, ada, 1);
    const directory = await mkdtemp(join(tmpdir(), "issue-286-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(
      libraryPath,
      JSON.stringify({
        kind: "dungeon-one-characters",
        formatVersion: FIFTH_LIBRARY_FORMAT,
        revision: "1".repeat(32),
        creationsStarted: 2,
        sessionsStarted: 0,
        characters: [
          { sheet: ada, revision: 1 },
          { sheet: bea, revision: 1 },
        ],
      }),
    );
    const server = await startFifthBrowserServer({
      libraryPath,
      seed,
      adventures: [lintelBarrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(`${server.url}#character-${ada.id}`);
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      assert.equal(await page.locator("#level-choice").isHidden(), true);
      assert.match(
        await page.locator("#sheet-body").innerText(),
        /Level 3 Fighter · 2690 XP \(level 4 at 2700\)/u,
      );

      // Win the barrow's fight and walk out: 50 XP takes Ada to 2,740.
      await page
        .locator('.start-adventure[data-adventure="lintel-barrow"]')
        .click();
      await page.locator("#log li").first().waitFor();
      await clickAction(page, "move", "burial-hall");
      await fight(page);
      await clickAction(page, "move", "barrow-mouth");
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#level-up-title").textContent(),
        "Level up: Ada is now level 4",
      );
      assert.match(
        await page.locator("#level-up").innerText(),
        /Hit points 28 → 36\. Second Wind uses 2 → 3\. New: Ability Score Improvement\. See the sheet for what each does\./u,
      );
      assert.equal(
        await page.locator("#level-up-choices").textContent(),
        "Choose an Ability Score Improvement and a fourth weapon mastery on Ada's sheet before the next adventure.",
      );
      // Settling credited the level and saved the choice as owed.
      let record = await stored(libraryPath, ada.id);
      assert.deepEqual(
        [record.sheet.level, record.sheet.xp, record.sheet.hp],
        [4, 2740, 36],
      );
      assert.deepEqual(record.sheet.abilityScoreImprovements, []);
      assert.equal(record.sheet.weaponMasteries.length, 3);

      // The sheet asks for the choices and offers no adventure.
      await page.locator("#ending-next").click();
      await page.locator("#level-choice").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#level-choice-title").textContent(),
        "Level 4: choose an Ability Score Improvement and a weapon mastery",
      );
      assert.deepEqual(
        await page.locator("#level-up-changes li").allTextContents(),
        [
          "Hit points 28 → 36 (+6 + Constitution modifier).",
          "Second Wind: 3 uses (was 2), healing 1d10 + 4 (was 1d10 + 3).",
          "Weapon Mastery: 4 kinds of weapon (was 3); choose the new one below.",
          "Ability Score Improvement: +2 to one ability score or +1 to two, to a maximum of 20; choose it below.",
          "Both choices are needed before the next adventure.",
        ],
      );
      assert.equal(await page.locator(".start-adventure").count(), 0);
      assert.match(
        await page.locator("#adventure-choices").innerText(),
        /Choose Ada's level 4 Ability Score Improvement and weapon mastery above before starting another adventure\./u,
      );
      const { revision } = JSON.parse(await readFile(libraryPath, "utf8"));
      const refused = await post(page, "/api/5e/adventures/start", {
        revision,
        characterId: ada.id,
        adventureId: "lintel-barrow",
      });
      assert.equal(refused.status, 409);
      assert.match(refused.body.error, /Ada must choose the level 4/u);

      // The choice is still owed after a reload.
      await page.reload();
      await page.locator("#level-choice").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#confirm-level-choice").isDisabled(),
        true,
      );
      // The status follows the preview's answer, so wait for it.
      await page
        .locator("#level-choice-status")
        .filter({ hasText: /^Finish both choices to see what they change\.$/u })
        .waitFor();

      // Bea's Strength is 20: the page won't offer it, and the server refuses it.
      await page.goto(`${server.url}#character-${bea.id}`);
      await page.locator("#sheet-name").filter({ hasText: "Bea" }).waitFor();
      await page.locator("#asi-strength:disabled").waitFor();
      assert.match(
        await page.locator("label:has(#asi-strength)").innerText(),
        /Already 20/u,
      );
      const beaBefore = await readFile(libraryPath, "utf8");
      const past = await post(page, "/api/5e/characters/level-choice", {
        revision: JSON.parse(beaBefore).revision,
        characterId: bea.id,
        increase: { strength: 2 },
        mastery: "longsword",
      });
      assert.equal(past.status, 409);
      assert.equal(
        past.body.error,
        "Strength is 20: an Ability Score Improvement can't raise a score above 20.",
      );
      const split = await post(page, "/api/5e/characters/level-choice", {
        revision: JSON.parse(beaBefore).revision,
        characterId: bea.id,
        increase: { strength: 1, constitution: 1 },
        mastery: "longsword",
      });
      assert.equal(split.status, 409);
      assert.equal(await readFile(libraryPath, "utf8"), beaBefore);

      // Ada takes +2 Strength and the longsword.
      await page.goto(`${server.url}#character-${ada.id}`);
      await page.locator("#level-choice").waitFor({ state: "visible" });
      await page.locator("#asi-strength").check();
      await page
        .locator("label:has(#asi-strength)")
        .filter({ hasText: "Strength 17 → 19 (+4)" })
        .waitFor();
      await page.locator("#new-mastery-longsword").check();
      await page.locator("#confirm-level-choice:enabled").waitFor();
      assert.deepEqual(
        await page.locator("#level-choice-changes li").allTextContents(),
        [
          "Strength 17 → 19 (modifier +3 → +4).",
          "Mace: +5 → +6 to hit, 1d6 + 3 → 1d6 + 4 bludgeoning.",
          "Strength saving throw +5 → +6.",
          "Athletics +5 → +6.",
          "Carrying capacity 255 → 285 lb.",
          "Weapon Mastery: Longsword (Sap): A creature it hits has disadvantage on its next attack roll before the start of your next turn. It applies only while you wield it.",
        ],
      );
      await assertNoSideScroll(page, "the level-up card fits a phone");
      // Switching to +1 to two clears the improvement until two are ticked.
      await page.locator("#asi-mode-split").check();
      await page.locator("#confirm-level-choice:disabled").waitFor();
      // Confirm is disabled at once; the error follows the preview's answer.
      await page
        .locator("#asi-error")
        .filter({ hasText: /^Choose the ability score to improve\.$/u })
        .waitFor();
      await page.locator("#asi-mode-two").check();
      await page.locator("#asi-strength").check();
      await page.locator("#confirm-level-choice:enabled").click();

      await page.locator("#level-choice").waitFor({ state: "hidden" });
      assert.equal(
        await page.locator("#feedback").textContent(),
        "Ada's level choices are saved: +2 Strength, and mastery of the longsword.",
      );
      const sheet = await page.locator("#sheet-body").innerText();
      assert.match(sheet, /Level 4 Fighter · 2740 XP \(level 5 at 6500\) · /u);
      assert.match(sheet, /HP: 36\/36/u);
      assert.match(sheet, /Mace: \+6 to hit, 1d6 \+ 4 bludgeoning, Sap/u);
      assert.match(sheet, /Strength\t19\t\+4\t\+6 \(proficient\)/u);
      assert.match(
        sheet,
        /Weapon Mastery: Dagger, Mace, Shortsword, Longsword\./u,
      );
      assert.match(
        sheet,
        /Ability Score Improvement\. \+2 Strength, to a maximum of 20\./u,
      );
      assert.match(
        sheet,
        /Second Wind\. Bonus action: regain 1d10 \+ 4 HP\. 3 uses\./u,
      );
      assert.match(
        sheet,
        /Background: \+2 Strength, \+1 Constitution\. Ability Score Improvement: \+2 Strength\./u,
      );
      assert.equal(await page.locator(".start-adventure").count(), 1);

      record = await stored(libraryPath, ada.id);
      assert.deepEqual(record.sheet.abilityScoreImprovements, [
        { strength: 2 },
      ]);
      assert.equal(record.sheet.abilities.strength, 19);
      assert.deepEqual(record.sheet.weaponMasteries, [
        "dagger",
        "mace",
        "shortsword",
        "longsword",
      ]);
      assert.equal(record.sheet.hp, 36);
      // It survives a reload, and Bea still owes hers.
      await page.reload();
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      assert.equal(await page.locator("#level-choice").isHidden(), true);
      await page.goto(server.url);
      await page.locator("#characters li").nth(1).waitFor();
      assert.match(
        await page.locator("#characters").innerText(),
        /Bea\s+Level choice to make/u,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
