import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
import { characterAtLevel } from "../dist/balance-5e.js";
import { libraryOf } from "./fixtures/level-3-casters.mjs";
import { FEATURE_USES_RULE } from "../dist/class-5e.js";
import {
  openCreation,
  saveFighter,
  startAdventure,
} from "./fixtures/browser-journey.mjs";

/** How many times `rule` appears in `text`. */
const count = (text, rule) => text.split(rule).length - 1;

const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];

const fighter = () =>
  buildCharacter("a".repeat(32), "Ada", DICE, {
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
  });

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
      assert.equal(count(await sheet.innerText(), FEATURE_USES_RULE), 0);
      await sheet.getByText("How resting works", { exact: true }).click();
      assert.equal(count(await sheet.innerText(), FEATURE_USES_RULE), 1);

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

test("a level-5 Cleric can scan every feature in one viewport and open the rules and dice (#577)", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sheet-features-"));
  const libraryPath = join(directory, "characters.json");
  const cleric = characterAtLevel(
    DICE,
    5,
    undefined,
    false,
    undefined,
    "cleric",
  );
  await writeFile(libraryPath, JSON.stringify(libraryOf(cleric)));
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: 0,
    adventures: [loneGoblin],
    qualifies: () => true,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 950 },
  });
  page.setDefaultTimeout(8000);
  try {
    await page.goto(server.url);
    await page.locator("#characters .open-character").click();
    const features = page.getByRole("region", { name: "Features" });
    await features.waitFor();
    assert.ok((await features.boundingBox()).height <= 950);
    assert.equal(await features.locator("details[open]").count(), 0);
    const channel = features.getByText(
      /Channel Divinity\. 2 uses; a short rest restores one, a long rest all\./u,
    );
    assert.equal(await channel.isVisible(), true);
    assert.doesNotMatch(await features.innerText(), /Each is a Magic action/u);
    await channel.click();
    assert.match(await features.innerText(), /Each is a Magic action/u);
    const sheet = page.locator("#sheet");
    const closed = await sheet.innerText();
    assert.equal(count(closed, "Cure Wounds"), 1);
    assert.equal(count(closed, "Bestow Curse"), 1);
    assert.doesNotMatch(closed, /Rolled: Strength/u);
    await sheet.getByText("Ability rolls", { exact: true }).click();
    assert.match(await sheet.innerText(), /Rolled: Strength/u);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

const RULE =
  "A short rest restores some spent uses, at most twice an adventure, and a long rest at a rest site restores them all; a rest between adventures restores them all and every hit point.";
// Long rests arrived in #335; uses no longer stay spent.
const STALE = /stay spent|return after the adventure/i;

test("Second Wind and Action Surge give their uses, the rule apart (#166, #431)", () => {
  assert.equal(FEATURE_USES_RULE, RULE);
  const sheet = fighter();
  const raised = { ...sheet, level: levelForXp(300), xp: 300 };
  const second = validateCharacter({
    ...raised,
    hp: characterProfile(raised).maxHp,
  });
  const text = (id) =>
    characterProfile(second).features.find((feature) => feature.id === id).text;
  assert.equal(
    text("second-wind"),
    "Bonus action: regain 1d10 + 2 HP. 2 uses.",
  );
  assert.equal(
    text("action-surge"),
    "Take one additional action on your turn, except Magic. 1 use.",
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

      // The creation preview states the rule as the sheet does (#431).
      const preview = page.locator("#preview-body");
      await preview.filter({ hasText: "AC:" }).waitFor();
      const previewText = await preview.innerText();
      assert.ok(previewText.includes(RULE), previewText);
      assert.doesNotMatch(previewText, STALE);

      await saveFighter(page);
      await page
        .locator("#sheet")
        .getByText("How resting works", { exact: true })
        .click();
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

      // A fight leaves the rule to the sheet (#431).
      await startAdventure(page, "lone-goblin");
      assert.ok(!(await page.locator("#adventure").innerText()).includes(RULE));
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
