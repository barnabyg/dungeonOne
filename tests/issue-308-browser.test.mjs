// #308, browser → API → storage: a level-5 Rogue from the library fights
// the goblin trio. It takes Steady Aim, chooses Cunning Strike's Trip and
// knocks a goblin prone, answers a goblin's hit with Uncanny Dodge, wins and
// settles back into the library with its XP.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import {
  applyLevelChoice,
  characterProfile,
  levelForXp,
  validateCharacter,
} from "../dist/character-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, sessionSeed } from "../dist/session-5e.js";
import {
  actionButton,
  settled,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { goblinTrio } from "./fixtures/modules.mjs";
import { thief } from "./fixtures/playthroughs.mjs";
import { readAda, sessionFile } from "./fixtures/save-files.mjs";
import {
  assertNoSideScroll,
  assertTogether,
  launch,
  layout,
} from "./fixtures/session-layout.mjs";

/** The level-3 Thief raised to level 5, with +2 Dexterity at level 4. */
const VEX = (() => {
  const xp = 6500;
  const raised = { ...thief(), xp, level: levelForXp(xp) };
  const sheet = validateCharacter({
    ...raised,
    hp: characterProfile(raised).maxHp,
  });
  return applyLevelChoice(sheet, { increase: { dexterity: 2 } });
})();

/**
 * The fight click the test makes: Uncanny Dodge whenever a hit waits, else
 * Steady Aim while it is enabled, else the first attack Trip goes with,
 * else the first enabled attack (the attack, then the Nick extra attack),
 * else End turn.
 */
function choose(views) {
  const enabled = (kind) =>
    views.find(
      ({ action, available, cunningStrike }) =>
        action === kind && available && cunningStrike === undefined,
    );
  return (
    enabled("uncanny-dodge") ??
    enabled("steady-aim") ??
    views.find(({ cunningStrike }) => cunningStrike?.id === "trip") ??
    enabled("attack") ??
    enabled("light-attack") ??
    enabled("end-turn")
  );
}

/**
 * Plays `seed`'s first browser session with those clicks: how it ends,
 * how many goblins Trip knocked prone and how many hits Uncanny Dodge
 * halved.
 */
function play(seed) {
  const runtime = createFifthRuntime(goblinTrio, VEX);
  const random = createSeededRandom(sessionSeed(seed, 1));
  const seen = { tripped: 0, dodged: 0 };
  const step = (state, action) => {
    const result = runtime.handleAction(state, action, random);
    for (const event of result.events ?? []) {
      if (
        event.type === "condition" &&
        event.source === "Cunning Strike (Trip)"
      ) {
        seen.tripped += 1;
      }
      if (event.type === "attack" && event.uncannyDodge !== undefined) {
        seen.dodged += 1;
      }
    }
    return result.state;
  };
  let state = step(runtime.createSession(), { type: "begin" });
  for (
    let turn = 0;
    turn < 200 &&
    state.status === "playing" &&
    state.encounter?.outcome === "ongoing";
    turn++
  ) {
    state = step(
      state,
      runtime.actionOf(choose(runtime.projectActions(state))),
    );
  }
  return { status: state.status, ...seen };
}

const seed = (() => {
  for (let candidate = 0; candidate < 300; candidate++) {
    const { status, tripped, dodged } = play(candidate);
    if (status === "victory" && tripped > 0 && dodged > 0) {
      return candidate;
    }
  }
  throw new Error("no seed below 300 wins with a Trip and an Uncanny Dodge");
})();

/** Takes one fight click as `choose` does, and waits for its entry. */
async function fightClick(page, checkLayout) {
  const enabled = (selector) => page.locator(`${selector}:enabled`);
  const dodge = enabled(
    '#feature-controls button[data-action="uncanny-dodge"]',
  );
  const aim = enabled('#feature-controls button[data-action="steady-aim"]');
  const strike = page.locator("#cunning-strike");
  const attack = enabled("#attack-controls button.attack");
  if ((await dodge.count()) > 0) {
    // The hit waits: only the two answers are offered, both on screen.
    assert.equal(await page.locator("#action-bar button.act").count(), 2);
    assert.match(await page.locator("#turn").textContent(), /hits you\./u);
    await checkLayout("the waiting hit");
    await settled(page, () => dodge.click());
    return "dodged";
  }
  if ((await aim.count()) > 0) {
    await settled(page, () => aim.click());
    return "aimed";
  }
  if (
    (await strike.count()) > 0 &&
    (await strike.locator('option[value="trip"]').count()) > 0
  ) {
    await strike.selectOption("trip");
    await checkLayout("the Cunning Strike choice");
    await settled(page, () => attack.first().click());
    return "struck";
  }
  await settled(page, async () => {
    if ((await attack.count()) > 0) {
      await attack.first().click();
    } else {
      await page
        .locator('#feature-controls button[data-action="end-turn"]')
        .click();
    }
  });
  return "plain";
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 375, height: 812 },
]) {
  test(
    `a level-5 Rogue trips a goblin with Cunning Strike and halves a hit with Uncanny Dodge (${viewport.width}px, seed ${seed})`,
    { timeout: 180000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-308-browser-"));
      const libraryPath = join(directory, "characters.json");
      await writeFile(
        libraryPath,
        JSON.stringify({
          kind: "dungeon-one-characters",
          formatVersion: FIFTH_LIBRARY_FORMAT,
          revision: "0".repeat(32),
          creationsStarted: 1,
          sessionsStarted: 0,
          characters: [{ sheet: VEX, revision: 1 }],
        }),
      );
      const server = await startFifthBrowserServer({
        libraryPath,
        seed,
        adventures: [goblinTrio],
        qualifies: () => true,
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(8000);
      // At phone width nothing scrolls sideways, in CI's wider font too, and
      // the waiting hit's two answers sit on screen with the newest entry.
      const checkLayout = async (label) => {
        if (viewport.width > 400) {
          return;
        }
        if (label === "the waiting hit") {
          await assertTogether(page, label);
        }
        await assertNoSideScroll(page, label, { wideFont: true });
        // In the wider font, every offered control is still on screen.
        assert.deepEqual((await layout(page)).hiddenButtons, [], label);
      };
      try {
        await page.goto(server.url);
        await page
          .locator("#characters button")
          .filter({ hasText: "Vex" })
          .click();
        const sheetText = await text(page.locator("#sheet-body"));
        assert.match(sheetText, /^Level 5 Rogue/u);
        assert.match(sheetText, /Cunning Strike\. When you deal Sneak Attack/u);
        assert.match(sheetText, /Uncanny Dodge\. Reaction/u);
        assert.match(sheetText, /extra 3d6 damage/u);

        await startAdventure(page, "goblin-trio");
        const clicks = new Set();
        let saved;
        for (
          let turn = 0;
          turn < 200 &&
          (await page.locator("#turn").textContent()) !== "The fight is over.";
          turn++
        ) {
          clicks.add(await fightClick(page, checkLayout));
          // The save records both as the clicks made them.
          if (
            saved === undefined &&
            clicks.has("dodged") &&
            clicks.has("struck")
          ) {
            saved = await sessionFile(directory);
          }
        }
        assert.ok(saved !== undefined, [...clicks].join());
        assert.equal(saved.formatVersion, FIFTH_SESSION_FORMAT);
        const recorded = JSON.stringify(saved.transitions);
        assert.match(recorded, /"cunningStrike":"trip"/u);
        assert.match(recorded, /"type":"uncanny-dodge"/u);

        const log = await text(page.locator("#log"));
        assert.match(
          log,
          /Vex attacks Goblin [^\n]+ \(Cunning Strike: Trip, \d Sneak Attack di(e|ce) forgone\)/u,
        );
        assert.match(
          log,
          /Goblin [^\n]+ is knocked prone by Vex's Cunning Strike \(Trip\)/u,
        );
        assert.match(
          log,
          /Before its damage is rolled, Vex can use Uncanny Dodge to halve it, or take the hit\./u,
        );
        assert.match(
          log,
          /Vex uses Uncanny Dodge from Goblin [^\n]+, halved to \d+ by Uncanny Dodge; Vex has \d+\/\d+ HP\./u,
        );
        await page.locator("#ending").waitFor({ state: "visible" });
        assert.match(await text(page.locator("#ending")), /Victory/iu);

        // The library settles the Rogue: no session, the XP credited.
        const record = await readAda(libraryPath);
        assert.equal(record.session, undefined);
        assert.equal(record.sheet.class, "rogue");
        assert.ok(record.sheet.xp > VEX.xp);
        assert.equal(await actionButton(page, "uncanny-dodge").count(), 0);
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}

test(
  "a level-4 Rogue chooses its Ability Score Improvement alone on the sheet, and is saved",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-308-level-"));
    const libraryPath = join(directory, "characters.json");
    const xp = 2700;
    const raised = { ...thief(), xp, level: levelForXp(xp) };
    const owing = validateCharacter({
      ...raised,
      hp: characterProfile(raised).maxHp,
    });
    await writeFile(
      libraryPath,
      JSON.stringify({
        kind: "dungeon-one-characters",
        formatVersion: FIFTH_LIBRARY_FORMAT,
        revision: "0".repeat(32),
        creationsStarted: 1,
        sessionsStarted: 0,
        characters: [{ sheet: owing, revision: 1 }],
      }),
    );
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [goblinTrio],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(8000);
    try {
      await page.goto(server.url);
      await page
        .locator("#characters button")
        .filter({ hasText: "Vex" })
        .click();
      await page.locator("#level-choice").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#level-choice-title").textContent(),
        "Level 4: choose an Ability Score Improvement",
      );
      assert.equal(await page.locator("#new-mastery").isHidden(), true);
      const lines = await page
        .locator("#level-up-changes li")
        .allTextContents();
      assert.equal(
        lines[0],
        "Hit points 21 → 27 (+5 + Constitution modifier).",
      );
      assert.equal(lines.at(-1), "It is needed before the next adventure.");
      assert.match(
        await page.locator(".level-choice-notice").textContent(),
        /^Choose Vex's level 4 Ability Score Improvement above/u,
      );
      await page.locator("#asi-mode-two").check();
      await page.locator("#asi-dexterity").check();
      await page.locator("#confirm-level-choice:enabled").click();
      await page.locator("#level-choice").waitFor({ state: "hidden" });
      assert.equal(
        await page.locator("#feedback").textContent(),
        "Vex's level choices are saved: +2 Dexterity.",
      );
      await page
        .locator('.start-adventure[data-adventure="goblin-trio"]')
        .waitFor();
      const record = await readAda(libraryPath);
      assert.deepEqual(record.sheet.abilityScoreImprovements, [
        { dexterity: 2 },
      ]);
      assert.equal(
        record.sheet.abilities.dexterity,
        owing.abilities.dexterity + 2,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
