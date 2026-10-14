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
  levelUpChanges,
  validateCharacter,
} from "../dist/character-5e.js";
import { FEATURE_USES_RULE } from "../dist/class-5e.js";
import {
  openCreation,
  saveFighter,
  startAdventure,
} from "./fixtures/browser-journey.mjs";

/** How many times `rule` appears in `text`. */
const count = (text, rule) => text.split(rule).length - 1;

const fighter = () =>
  buildCharacter(
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

test("the level-up card's features leave the feature-uses rule to the sheet (#431)", () => {
  const first = fighter();
  const raised = { ...first, level: levelForXp(300), xp: 300 };
  const second = validateCharacter({
    ...raised,
    hp: characterProfile(raised).maxHp,
  });
  // The level-up card lists the new features with the sheet's words.
  const gained = levelUpChanges(first, second).features;
  assert.ok(gained.some(({ id }) => id === "action-surge"));
  for (const feature of gained) {
    assert.ok(!feature.text.includes(FEATURE_USES_RULE), feature.text);
  }
});

test(
  "the sheet states the rule once and a fight does not (#431)",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-431-"));
    const server = await startFifthBrowserServer({
      adventures: [loneGoblin],
      // Fixtures are engine material, not gated content: the gate is
      // tested in balance-5e.test.mjs (#310).
      qualifies: () => true,
      libraryPath: join(directory, "characters.json"),
      seed: 0,
    });
    const browser = await launch();
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await openCreation(page);
      // A Rogue has no limited-use feature at level 1, so no rule.
      await page.locator("#class-rogue").check();
      const preview = page.locator("#preview-body");
      await preview.filter({ hasText: "Sneak Attack" }).waitFor();
      assert.equal(count(await preview.innerText(), FEATURE_USES_RULE), 0);
      assert.equal(await preview.locator(".feature-uses-rule").count(), 0);

      // The Fighter's Second Wind has uses: the rule follows the features.
      await page.locator("#class-fighter").check();
      await preview.filter({ hasText: "Second Wind" }).waitFor();
      assert.equal(count(await preview.innerText(), FEATURE_USES_RULE), 1);
      await saveFighter(page);
      const sheet = page.locator("#sheet");
      assert.equal(count(await sheet.innerText(), FEATURE_USES_RULE), 1);
      assert.equal(
        await sheet.locator(".features + .feature-uses-rule").innerText(),
        FEATURE_USES_RULE,
      );

      await startAdventure(page, "lone-goblin");
      assert.equal(await page.locator("#encounter").isVisible(), true);
      assert.equal(await page.locator("#feature-rule").count(), 0);
      assert.equal(
        count(await page.locator("#adventure").innerText(), FEATURE_USES_RULE),
        0,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
