import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { buildFighter, rollAbilitySet } from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";

// The status strip (#155): HP, health, round, turn and resource pips.

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

const [cellar, storeroom] = await loadBuiltInFifthAdventures();
const DEFAULT_CHOICES = {
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
};

/** The first Fighter a browser on `seed` creates with the default choices. */
function firstFighter(seed) {
  const stream = createHash("sha256")
    .update(`5e-ability-rolls:${seed}:1`)
    .digest()
    .readUInt32LE(0);
  return buildFighter(
    "a".repeat(32),
    "Ada",
    rollAbilitySet(createSeededRandom(stream)),
    DEFAULT_CHOICES,
  );
}

const SECOND_WIND = { type: "second-wind", actorId: "pc" };

/**
 * A storeroom seed where Ada starts her first turn hurt (attack, then Second
 * Wind) and is still hurt on her second (Second Wind, leaving the action).
 */
function storeroomSeed() {
  for (let seed = 0; seed < 5000; seed++) {
    const runtime = createFifthRuntime(storeroom, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    const options = (state) => runtime.projectFight(state).turn?.options ?? [];
    let state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    if (state.status !== "playing" || !options(state).includes("second-wind")) {
      continue;
    }
    const [target] = runtime.attackTargets(state);
    const attack = { type: "attack", actorId: "pc", targetId: target.id };
    state = runtime.handleAction(state, attack, random).state;
    if (!options(state).includes("second-wind")) {
      continue;
    }
    state = runtime.handleAction(state, SECOND_WIND, random).state;
    if (state.status !== "playing" || !options(state).includes("second-wind")) {
      continue;
    }
    return seed;
  }
  throw new Error("no storeroom seed with two hurt turns");
}

/** A cellar seed where attacking every turn ends in defeat. */
function defeatSeed() {
  for (let seed = 0; seed < 5000; seed++) {
    const runtime = createFifthRuntime(cellar, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    let state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    while (state.status === "playing") {
      const action =
        runtime.attackTargets(state).length > 0
          ? { type: "attack", actorId: "pc", targetId: "goblin" }
          : { type: "end-turn", actorId: "pc" };
      state = runtime.handleAction(state, action, random).state;
    }
    if (state.status === "defeat") {
      return seed;
    }
  }
  throw new Error("no cellar seed ending in defeat");
}

async function createAndStart(page, url, adventureId) {
  await page.goto(url);
  await page.locator("#open-creation").click();
  await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
  await page.locator("#character-name").fill("Ada");
  await page.locator("#save-character").click();
  await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
  await page
    .locator(`.start-adventure[data-adventure="${adventureId}"]`)
    .click();
  await page.locator("#adventure").waitFor({ state: "visible" });
}

const sessionFile = async (directory) => {
  const folder = join(directory, "characters-adventures");
  const [name] = await readdir(folder);
  return JSON.parse(await readFile(join(folder, name), "utf8"));
};

/** Clicks a button and waits for its result in the conversation history. */
async function clickAndWait(page, button) {
  const count = await page.locator("#log li").count();
  await button.click();
  await page.waitForFunction(
    (seen) => document.querySelectorAll("#log li").length > seen,
    count,
  );
}

/**
 * What the status strip says to a screen reader (text outside aria-hidden
 * parts), each resource's words, and the filled and empty pips shown.
 */
const status = (page) =>
  page.evaluate(() => {
    const spoken = (node) =>
      node.nodeType === Node.TEXT_NODE
        ? node.textContent
        : node.getAttribute?.("aria-hidden") === "true"
          ? ""
          : [...node.childNodes].map(spoken).join(" ");
    const tidy = (text) => text.replace(/\s+/g, " ").trim();
    const seen = (node) =>
      node.nodeType === Node.TEXT_NODE
        ? node.textContent
        : node.classList?.contains("visually-hidden")
          ? ""
          : [...node.childNodes].map(seen).join("");
    const strip = document.getElementById("session-status");
    return {
      hp: tidy(spoken(document.getElementById("character-hp"))),
      shown: tidy(seen(document.getElementById("character-hp"))),
      health: document.getElementById("status-hp").dataset.health,
      turn: document.getElementById("turn").textContent,
      resources: Object.fromEntries(
        [...strip.querySelectorAll("#resources li")].map((item) => [
          item.dataset.resource,
          {
            words: tidy(spoken(item)),
            pips:
              "●".repeat(item.querySelectorAll(".pip.full").length) +
              "○".repeat(item.querySelectorAll(".pip:not(.full)").length),
          },
        ]),
      ),
    };
  });

/** The rows the strip's parts sit on, by their top edge. */
const stripRows = (page) =>
  page.evaluate(() => {
    const parts = [
      ...document.querySelectorAll(
        "#status-hp, #turn, #resources li, #character-hp .tag",
      ),
    ].filter((node) => node.getBoundingClientRect().height > 0);
    const tops = [];
    for (const node of parts) {
      const { top, bottom } = node.getBoundingClientRect();
      const middle = (top + bottom) / 2;
      if (!tops.some((seen) => Math.abs(seen - middle) < 8)) {
        tops.push(middle);
      }
    }
    return tops.length;
  });

const widen = (page) =>
  page.evaluate(() => {
    for (const node of document.querySelectorAll("*")) {
      node.style.fontFamily = "Verdana, sans-serif";
    }
  });

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `the status strip tracks the action, bonus action and Second Wind through a reload at ${viewport.width} px (#155)`,
    { timeout: 120000 },
    async () => {
      const seed = storeroomSeed();
      const directory = await mkdtemp(join(tmpdir(), "issue-155-"));
      const libraryPath = join(directory, "characters.json");
      const server = await startFifthBrowserServer({ libraryPath, seed });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      const reload = async () => {
        await page.reload();
        await page.locator("#adventure").waitFor({ state: "visible" });
      };
      try {
        await createAndStart(page, server.url, "goblin-storeroom");
        // The prose sentence is gone; the rule stays beside the fight.
        assert.equal(await page.locator("#economy").count(), 0);
        assert.match(
          await page.locator("#feature-rule").textContent(),
          /^Spent uses stay spent/,
        );
        let shown = await status(page);
        const maxHp = firstFighter(seed).hp;
        assert.match(shown.hp, new RegExp(`^HP \\d+ of ${maxHp}, \\w+$`));
        assert.match(shown.shown, new RegExp(`^HP \\d+/${maxHp} \\w+$`));
        assert.match(shown.turn, /^Round 1: your turn\.$/);
        assert.deepEqual(shown.resources, {
          action: { words: "Action: available", pips: "●" },
          "bonus-action": { words: "Bonus action: available", pips: "●" },
          reaction: { words: "Reaction: available", pips: "●" },
          "second-wind": {
            words: "Second Wind: 2 of 2 uses left",
            pips: "●●",
          },
        });
        if (viewport.width === 375) {
          assert.ok((await stripRows(page)) <= 2, "the strip fits two rows");
        }

        // Attacking marks the action used; the bonus action is left.
        await clickAndWait(
          page,
          page.locator("#attack-controls button").first(),
        );
        const attacked = {
          action: { words: "Action: used", pips: "○" },
          "bonus-action": { words: "Bonus action: available", pips: "●" },
          reaction: { words: "Reaction: available", pips: "●" },
          "second-wind": {
            words: "Second Wind: 2 of 2 uses left",
            pips: "●●",
          },
        };
        assert.deepEqual((await status(page)).resources, attacked);
        let file = await sessionFile(directory);
        assert.deepEqual(file.state.encounter.economy, {
          actions: 0,
          maxActions: 1,
          bonusAction: true,
          reaction: true,
        });
        shown = await status(page);
        await reload();
        assert.deepEqual(await status(page), shown);

        // Second Wind ends the first turn; the next starts fresh.
        await clickAndWait(
          page,
          page.locator('#feature-controls button[data-action="second-wind"]'),
        );
        await page
          .locator("#turn")
          .filter({ hasText: /^Round 2: your turn\.$/ })
          .waitFor();
        assert.deepEqual((await status(page)).resources["second-wind"], {
          words: "Second Wind: 1 of 2 uses left",
          pips: "●○",
        });

        // Second Wind takes a use and the bonus action, not the action.
        await clickAndWait(
          page,
          page.locator('#feature-controls button[data-action="second-wind"]'),
        );
        const healed = {
          action: { words: "Action: available", pips: "●" },
          "bonus-action": { words: "Bonus action: used", pips: "○" },
          reaction: { words: "Reaction: available", pips: "●" },
          "second-wind": {
            words: "Second Wind: 0 of 2 uses left",
            pips: "○○",
          },
        };
        assert.deepEqual((await status(page)).resources, healed);
        file = await sessionFile(directory);
        assert.deepEqual(
          file.transitions.map(({ action }) => action.type),
          ["begin", "attack", "second-wind", "second-wind"],
        );
        assert.deepEqual(file.state.encounter.economy, {
          actions: 1,
          maxActions: 1,
          bonusAction: false,
          reaction: true,
        });
        assert.equal(file.state.character.secondWindUses, 0);
        shown = await status(page);
        await reload();
        assert.deepEqual(await status(page), shown);
        // HP and its health come from the saved state.
        const hp = file.state.character.hp;
        assert.equal(shown.hp.startsWith(`HP ${hp} of ${maxHp},`), true);

        if (viewport.width === 375) {
          assert.ok((await stripRows(page)) <= 2, "the strip fits two rows");
          // CI's Linux fallback font is wider than Windows'.
          await widen(page);
          assert.ok(
            (await stripRows(page)) <= 2,
            "the strip fits two rows in a wide font",
          );
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            "no horizontal scroll",
          );
        }
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}

test(
  "at 0 HP the status shows defeat (#155)",
  { timeout: 120000 },
  async () => {
    const seed = defeatSeed();
    const directory = await mkdtemp(join(tmpdir(), "issue-155-defeat-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({ libraryPath, seed });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "cellar-goblin");
      while (!(await page.locator("#ending").isVisible())) {
        const attack = page.locator("#attack-controls button.attack:enabled");
        await clickAndWait(
          page,
          (await attack.count()) > 0
            ? attack.first()
            : page.locator('#feature-controls button[data-action="end-turn"]'),
        );
      }
      const shown = await status(page);
      const maxHp = firstFighter(seed).hp;
      assert.equal(shown.hp, `HP 0 of ${maxHp}, Defeated`);
      assert.equal(shown.shown, `HP 0/${maxHp} Defeated`);
      assert.equal(shown.health, "down");
      assert.equal(shown.turn, "The fight is over.");
      // No turn is left to take; the feature uses still show.
      assert.deepEqual(Object.keys(shown.resources), ["second-wind"]);
      assert.equal(
        await page.locator("#hp-fill").evaluate((node) => node.style.width),
        "0%",
      );
      assert.equal((await sessionFile(directory)).state.status, "defeat");
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
