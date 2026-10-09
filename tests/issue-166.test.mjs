import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { launch } from "./fixtures/session-layout.mjs";
import { loneGoblin } from "./fixtures/modules.mjs";
import {
  buildCharacter,
  characterProfile,
  levelForXp,
  validateCharacter,
} from "../dist/character-5e.js";
import { FEATURE_USES_RULE } from "../dist/class-5e.js";
import { saveFighter, startAdventure } from "./fixtures/browser-journey.mjs";

const RULE =
  "Spent uses stay spent for the rest of the adventure; a rest between adventures restores them and every hit point.";
const STALE = /short rest|long rest|return after the adventure/i;

test("Second Wind and Action Surge state the rule that applies now (#166)", () => {
  assert.equal(FEATURE_USES_RULE, RULE);
  const sheet = buildCharacter(
    "a".repeat(32),
    "Ada",
    [
      [6, 5, 4, 1],
      [5, 5, 4, 2],
      [3, 6, 4, 2],
      [4, 4, 4, 4],
      [1, 3, 3, 4],
      [2, 2, 4, 2],
    ],
    {
      placement: {
        strength: 0,
        dexterity: 1,
        constitution: 2,
        intelligence: 3,
        wisdom: 4,
        charisma: 5,
      },
      increase: { strength: 2, constitution: 1 },
      skills: ["athletics", "perception"],
      fightingStyle: "defense",
      kit: "mace",
      masteries: ["dagger", "mace", "shortsword"],
    },
  );
  const raised = { ...sheet, level: levelForXp(300), xp: 300 };
  const second = validateCharacter({
    ...raised,
    hp: characterProfile(raised).maxHp,
  });
  const text = (id) =>
    characterProfile(second).features.find((feature) => feature.id === id).text;
  assert.equal(
    text("second-wind"),
    `Bonus action: regain 1d10 + 2 HP. 2 uses. ${RULE}`,
  );
  assert.equal(
    text("action-surge"),
    `Take one additional action on your turn, except Magic. 1 use. ${RULE}`,
  );
});

test(
  "creation, delete and fight copy is short and uses the same feature words (#166)",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-166-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      adventures: [loneGoblin],
      // Fixtures are engine material, not gated content: the gate is
      // tested in balance-5e.test.mjs (#310).
      qualifies: () => true,
      libraryPath,
      seed: 0,
    });
    const browser = await launch();
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await page.locator("#open-creation").click();
      await page.locator("#creation").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#creation-title ~ p.hint").innerText(),
        "Rolled once. No rerolls. Choose a class, place the six rolls on your abilities in any order, then make your other choices.",
      );

      // The creation preview gives Second Wind the sheet's words.
      const preview = page.locator("#preview-body");
      await preview.filter({ hasText: "AC:" }).waitFor();
      const previewText = await preview.innerText();
      assert.ok(previewText.includes(RULE), previewText);
      assert.doesNotMatch(previewText, STALE);

      await saveFighter(page);
      const sheetText = await page.locator("#sheet").innerText();
      assert.ok(sheetText.includes(RULE), sheetText);
      assert.doesNotMatch(sheetText, STALE);

      // The delete confirmation leaves out the pending creation.
      await page.locator("#delete-character").click();
      const warning = await page.locator("#delete-warning").innerText();
      assert.equal(
        warning,
        "Deleting is permanent. There is no undo, archive or recycle bin.",
      );
      await page.locator("#delete-dialog").press("Escape");

      // In a fight the same rule sits under the initiative table (#155).
      await startAdventure(page, "lone-goblin");
      const rule = await page.locator("#feature-rule").textContent();
      assert.equal(rule, RULE);
      assert.doesNotMatch(
        await page.locator("#session-status").textContent(),
        STALE,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
