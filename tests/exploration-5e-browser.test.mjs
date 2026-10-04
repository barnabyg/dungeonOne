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

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

const adventure = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "smugglers-cellar",
);
// The creation screen's default choices.
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

const WALK = [
  { type: "move", destinationId: "alcove" },
  { type: "examine", targetId: "iron-chest" },
  { type: "take", itemId: "healing-potion" },
  { type: "move", destinationId: "stair-foot" },
  { type: "move", destinationId: "rat-cellar" },
];
const ATTACK = { type: "attack", actorId: "pc", targetId: "giant-rat" };
const END_TURN = { type: "end-turn", actorId: "pc" };
const DRINK = { type: "use-item", itemId: "healing-potion" };

/**
 * Plays the journey on `seed` as the browser test does: the walk, then
 * attacks (or End turn once the action is spent) until the rat fight ends,
 * then the potion. Returns each action's dice and the final state.
 */
function simulate(seed) {
  const runtime = createFifthRuntime(adventure, firstFighter(seed));
  const source = createSeededRandom(sessionSeed(seed, 1));
  const drawn = [];
  const random = {
    roll(sides) {
      const value = source.roll(sides);
      drawn.at(-1).push({ sides, value });
      return value;
    },
  };
  const run = (state, action) => {
    drawn.push([]);
    const result = runtime.handleAction(state, action, random);
    assert.equal(result.rejection, undefined, result.rejection?.reason);
    return result.state;
  };
  let state = run(runtime.createSession(), { type: "begin" });
  for (const action of WALK) {
    state = run(state, action);
  }
  while (state.status === "playing" && state.encounter.outcome === "ongoing") {
    state = run(
      state,
      runtime.attackTargets(state).length > 0 ? ATTACK : END_TURN,
    );
  }
  const hurt = state.status === "playing" ? state.character.hp : undefined;
  if (hurt !== undefined && hurt < runtime.projectRoom(state).character.maxHp) {
    state = run(state, DRINK);
  }
  return { drawn, state, hurt };
}

/** A seed where Ada wins the rat fight hurt, so the potion heals her. */
function findSeed() {
  for (let seed = 0; seed < 5000; seed++) {
    const run = simulate(seed);
    if (run.state.inventory?.length === 0 && run.state.usedItemIds.length) {
      return seed;
    }
  }
  throw new Error("no seed for the exploring journey");
}

/** A scripted AI DM that answers "search the chest" by examining it. */
function examiningDm() {
  return {
    async respond(request) {
      return request.toolResults.length === 0
        ? {
            toolCalls: [
              {
                id: "call-1",
                name: "examine",
                argumentsJson: JSON.stringify({ target: "iron-chest" }),
              },
            ],
          }
        : { text: "Unreachable: the engine writes examine replies." };
    },
  };
}

/** What the room and encounter panels and the log show. */
const screen = (page) =>
  page.evaluate(() => ({
    room: document.getElementById("room").innerText,
    encounterHidden: document.getElementById("encounter").hidden,
    rows: [...document.querySelectorAll("#initiative-rows tr")].map(
      (row) => row.textContent,
    ),
    log: document.getElementById("log").textContent,
  }));

/** Clicks a room button and waits for its result card. */
async function explore(page, action, target) {
  const count = await page.locator("#log li").count();
  await page
    .locator(`#room button[data-action="${action}"][data-target="${target}"]`)
    .click();
  await page.waitForFunction(
    (seen) => document.querySelectorAll("#log li").length > seen,
    count,
  );
}

/** Clicks the first Attack button, or End turn once the action is spent. */
async function clickNext(page) {
  const count = await page.locator("#log li").count();
  const attack = page.locator("#attack-controls button.attack");
  await (
    (await attack.count()) > 0
      ? attack.first()
      : page.locator('#feature-controls button[data-action="end-turn"]')
  ).click();
  await page.waitForFunction(
    (seen) => document.querySelectorAll("#log li").length > seen,
    count,
  );
}

const sessionFile = async (directory) => {
  const folder = join(directory, "characters-adventures");
  const [name] = await readdir(folder);
  return JSON.parse(await readFile(join(folder, name), "utf8"));
};

test(
  "walk the cellar, search the chest by typing, take the potion, drink it after a fight, and resume exactly",
  { timeout: 120000 },
  async () => {
    const seed = findSeed();
    const expected = simulate(seed);
    const directory = await mkdtemp(join(tmpdir(), "exploration-5e-"));
    const libraryPath = join(directory, "characters.json");
    let server = await startFifthBrowserServer({
      libraryPath,
      seed,
      dmModel: examiningDm(),
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 360, height: 740 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await page.locator("#open-creation").click();
      await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
      await page.locator("#character-name").fill("Ada");
      await page.locator("#save-character").click();
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      await page
        .locator('.start-adventure[data-adventure="smugglers-cellar"]')
        .click();
      await page.locator("#adventure").waitFor({ state: "visible" });

      // A quiet start room: exits and a feature, no fight.
      let shown = await screen(page);
      assert.equal(shown.encounterHidden, true);
      assert.match(shown.room, /^Foot of the Stair\n/);
      assert.match(shown.room, /Your HP: (\d+)\/\1/);
      assert.match(shown.room, /Go to Alcove/);
      assert.match(shown.room, /Go to Rat-Gnawed Cellar/);
      assert.match(shown.room, /Examine Rusted Lantern/);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "no horizontal scroll at phone width",
      );

      await explore(page, "move", "alcove");
      shown = await screen(page);
      assert.match(shown.room, /^Alcove\n/);
      // The potion is hidden until the chest is searched.
      assert.doesNotMatch(shown.room, /Potion of Healing/);

      // A typed search, through the AI DM's examine tool.
      await page.locator("#message").fill("search the chest");
      await page.locator("#send-message").click();
      await page
        .locator("#log li")
        .last()
        .filter({ hasText: "You find the Potion of Healing." })
        .waitFor();
      assert.match(
        await page.locator("#log li").last().textContent(),
        /^You: search the chestIron-Bound Chest: /,
      );
      shown = await screen(page);
      assert.match(shown.room, /You found: Under a mouldy blanket/);
      assert.match(shown.room, /Take Potion of Healing/);

      await explore(page, "take", "healing-potion");
      shown = await screen(page);
      assert.match(
        shown.room,
        /You carry\n+Potion of Healing — A stoppered vial/,
      );
      assert.match(shown.room, /Items here\n+None\./);
      // Full health: nothing to drink yet.
      assert.doesNotMatch(shown.room, /Drink Potion of Healing/);

      await explore(page, "move", "stair-foot");
      await explore(page, "move", "rat-cellar");
      shown = await screen(page);
      assert.equal(shown.encounterHidden, false);
      assert.ok(shown.rows.some((row) => /Giant Rat/.test(row)));
      assert.doesNotMatch(shown.room, /Go to/);

      while (
        (await page.locator("#turn").textContent()) !== "The fight is over."
      ) {
        await clickNext(page);
      }
      assert.match(
        await page.locator("#log").textContent(),
        /The fight is over\./,
      );
      shown = await screen(page);
      assert.match(shown.room, new RegExp(`Your HP: ${expected.hurt}/`));
      assert.match(shown.room, /Go to Smugglers' Den/);

      // Reload after the fight: the same screen, from the saved session.
      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await screen(page), shown);

      await explore(page, "use", "healing-potion");
      shown = await screen(page);
      assert.match(
        await page.locator("#log li").last().textContent(),
        /You drink the Potion of Healing: \d \+ \d \+ 2 = \d+; you regain \d+ HP/,
      );
      assert.match(shown.room, /You carry\n+None\./);
      assert.match(
        shown.room,
        new RegExp(`Your HP: ${expected.state.character.hp}/`),
      );

      // Restart (even with another seed): the same screen.
      await server.close();
      server = await startFifthBrowserServer({
        libraryPath,
        seed: seed + 1,
        dmModel: examiningDm(),
      });
      await page.goto(
        `${server.url}/#adventure-${(await sessionFile(directory)).id}`,
      );
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await screen(page), shown);

      // Every die matches an uninterrupted engine run on the same seed.
      const file = await sessionFile(directory);
      assert.deepEqual(
        file.transitions.map(({ rolls }) => rolls),
        expected.drawn,
      );
      assert.deepEqual(file.state, expected.state);
      assert.equal(file.transitions[2].source, "message");
      assert.deepEqual(file.transitions[2].action, {
        type: "examine",
        targetId: "iron-chest",
      });

      // Still no horizontal scroll at phone width with a wide font, as CI's
      // Linux fallback font is wider than Windows'.
      assert.ok(
        await page.evaluate(() => {
          for (const node of document.querySelectorAll("*")) {
            node.style.fontFamily = "Verdana, sans-serif";
          }
          return document.documentElement.scrollWidth <= window.innerWidth;
        }),
        "no horizontal scroll at phone width with a wide font",
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
