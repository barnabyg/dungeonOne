import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { ratTunnels } from "./fixtures/modules.mjs";
import { createAndStart } from "./fixtures/browser-journey.mjs";
import { firstFighter, launch } from "./fixtures/session-layout.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";

// The rat tunnels, with the Giant Rat's fight; the server offers only them.
const adventure = ratTunnels;
const SERVER_OPTIONS = { adventures: [adventure], qualifies: () => true };
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

/** What the status, room and encounter panels and the log show. */
const screen = (page) =>
  page.evaluate(() => ({
    status: document.getElementById("session-status").innerText,
    room: document.getElementById("room").innerText,
    // Each action's accessible name, and the reason it is unavailable (#157),
    // in the action bar and on carried items (#198).
    actions: [...document.querySelectorAll("button.act")]
      .map((button) => {
        const reason = button.getAttribute("aria-describedby");
        return (
          (button.getAttribute("aria-label") || button.textContent) +
          (reason ? " " + document.getElementById(reason).textContent : "")
        );
      })
      .join("\n"),
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
    .locator(`button.act[data-action="${action}"][data-target="${target}"]`)
    .click();
  await page.waitForFunction(
    (seen) => document.querySelectorAll("#log li").length > seen,
    count,
  );
}

/** Clicks the first Attack button, or End turn once the action is spent. */
async function clickNext(page) {
  const count = await page.locator("#log li").count();
  const attack = page.locator("#attack-controls button.attack:enabled");
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

test(
  "walk the tunnels, search the chest by typing, take the potion, drink it after a fight, and resume exactly",
  { timeout: 120000 },
  async () => {
    const seed = findSeed();
    const expected = simulate(seed);
    const directory = await mkdtemp(join(tmpdir(), "exploration-5e-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      ...SERVER_OPTIONS,
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
      await createAndStart(page, server.url, "rat-tunnels");

      // A quiet start room: exits and a feature, no fight.
      let shown = await screen(page);
      assert.equal(shown.encounterHidden, true);
      assert.match(shown.room, /^Foot of the Stair\n/);
      assert.match(shown.status, /HP (\d+)\/\1 /);
      assert.match(shown.actions, /Go to Alcove/);
      assert.match(shown.actions, /Go to Rat-Gnawed Cellar/);
      assert.match(shown.actions, /Examine Rusted Lantern/);
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
      assert.match(shown.actions, /Take Potion of Healing/);

      await explore(page, "take", "healing-potion");
      shown = await screen(page);
      assert.match(
        shown.room,
        // After Ada's own gear (#209).
        /You carry\n[\s\S]*Potion of Healing — A stoppered vial/,
      );
      assert.doesNotMatch(shown.room, /Items here|None\./);
      // Full health: Drink is disabled, with the reason.
      assert.match(shown.actions, /Drink Potion of Healing\s+Full HP/);

      await explore(page, "move", "stair-foot");
      await explore(page, "move", "rat-cellar");
      shown = await screen(page);
      assert.equal(shown.encounterHidden, false);
      assert.ok(shown.rows.some((row) => /Giant Rat/.test(row)));
      assert.doesNotMatch(shown.actions, /Go to/);

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
      assert.match(shown.status, new RegExp(`HP ${expected.hurt}/`));
      assert.match(shown.actions, /Go to Smugglers' Den/);

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
      // Shown compactly (#186), with each die beside the healing.
      assert.match(
        await page.locator("#log li").last().locator(".compact").textContent(),
        /^Ada heals \d+ \(d4 \d \+ d4 \d \+ 2\) → \d+\/\d+ HP$/,
      );
      // The potion is gone; "You carry" keeps only Ada's own gear (#209).
      assert.doesNotMatch(shown.room, /Potion of Healing —|None\./);
      assert.match(shown.room, /You carry\n+Leather armour — Worn\./);
      assert.match(
        shown.status,
        new RegExp(`HP ${expected.state.character.hp}/`),
      );

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
