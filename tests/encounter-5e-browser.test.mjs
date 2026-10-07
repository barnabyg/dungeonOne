import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {} from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import {
  goblinBand as band,
  loneGoblin as adventure,
} from "./fixtures/modules.mjs";
import { createAndStart } from "./fixtures/browser-journey.mjs";
import { firstFighter } from "./fixtures/session-layout.mjs";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

// The lone goblin's one-room fight and the goblin band's group fight.
const ADVENTURES = [adventure, band];
const ATTACK = { type: "attack", actorId: "pc", targetId: "goblin" };
const END_TURN = { type: "end-turn", actorId: "pc" };
/**
 * Plays the first session on `seed` by attacking, or ending the turn once
 * the action is spent: the outcome, the attacks and each action's dice.
 */
function simulate(seed) {
  const runtime = createFifthRuntime(adventure, firstFighter(seed));
  const drawn = [];
  const source = createSeededRandom(sessionSeed(seed, 1));
  const random = {
    roll(sides) {
      const value = source.roll(sides);
      drawn.at(-1).push({ sides, value });
      return value;
    },
  };
  drawn.push([]);
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  let attacks = 0;
  while (state.status === "playing") {
    drawn.push([]);
    const action = runtime.attackTargets(state).length > 0 ? ATTACK : END_TURN;
    state = runtime.handleAction(state, action, random).state;
    attacks += action === ATTACK ? 1 : 0;
  }
  return { status: state.status, attacks, drawn };
}

/**
 * Clicks the first Attack button, or End turn once the action is spent, and
 * waits for the result card.
 */
async function clickNext(page) {
  const count = await page.locator("#log li").count();
  const attack = page.locator("#attack-controls button.attack:enabled");
  await (
    (await attack.count()) > 0
      ? attack.first()
      : page.locator('#feature-controls button[data-action="end-turn"]')
  ).click();
  await page.waitForFunction(
    (seen) =>
      document.querySelectorAll("#log li:not([data-pending])").length > seen,
    count,
  );
}

function findSeed(wanted, minimumAttacks) {
  for (let seed = 0; seed < 5000; seed++) {
    const run = simulate(seed);
    if (run.status === wanted && run.attacks >= minimumAttacks) {
      return seed;
    }
  }
  throw new Error(`no seed for ${wanted}`);
}

/** A scripted AI DM that answers every message by attacking the goblin. */
function attackingDm() {
  let calls = 0;
  return {
    async respond(request) {
      return request.toolResults.length === 0
        ? {
            toolCalls: [
              {
                id: `call-${++calls}`,
                name: "attack",
                argumentsJson: JSON.stringify({ target: "goblin" }),
              },
            ],
          }
        : { text: "Unreachable: the engine writes attack replies." };
    },
  };
}

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

/** What the encounter panel shows: initiative rows, turn and the log. */
const panel = (page) =>
  page.evaluate(() => ({
    rows: [...document.querySelectorAll("#initiative-rows tr")].map(
      (row) => row.textContent,
    ),
    turn: document.getElementById("turn").textContent,
    log: document.getElementById("log").textContent,
  }));

/** What the status strip's resources say to a screen reader (#155). */
const resources = (page) =>
  page
    .locator("#resources li .visually-hidden")
    .allTextContents()
    .then((words) => words.join("; "));

const sessionFile = async (directory) => {
  const folder = join(directory, "characters-adventures");
  const [name] = await readdir(folder);
  return JSON.parse(await readFile(join(folder, name), "utf8"));
};

test(
  "a typed and clicked fight survives a reload and a restart, and ends in victory",
  { timeout: 90000 },
  async () => {
    const seed = findSeed("victory", 3);
    const expected = simulate(seed);
    const directory = await mkdtemp(join(tmpdir(), "encounter-5e-victory-"));
    const libraryPath = join(directory, "characters.json");
    let server = await startFifthBrowserServer({
      adventures: ADVENTURES,
      libraryPath,
      seed,
      dmModel: attackingDm(),
    });
    const browser = await launch();
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "lone-goblin");
      const library = JSON.parse(await readFile(libraryPath, "utf8"));
      assert.deepEqual(
        library.characters[0].sheet.abilities,
        firstFighter(seed).abilities,
      );
      // Initiative order with totals, HP and the current turn.
      let shown = await panel(page);
      assert.equal(shown.rows.length, 2);
      assert.ok(
        shown.rows.some((row) => /Ada \(you\)( Now)?\d+\d+\/\d+\d+/.test(row)),
      );
      assert.ok(
        shown.rows.some((row) => /Goblin Warrior( Now)?\d+\d+\/1015/.test(row)),
      );
      assert.match(shown.turn, /^Round \d+: your turn\.$/);
      assert.match(shown.log, /Initiative: /);

      // A typed attack, through the AI DM's tool.
      await page.locator("#message").fill("I swing my mace at the goblin!");
      await page.locator("#send-message").click();
      await page.locator("#log li:not([data-pending])").nth(1).waitFor();
      assert.match(
        await page.locator("#log li").nth(1).textContent(),
        /^You: I swing my mace at the goblin!Ada attacks Goblin Warrior with Mace/,
      );

      // Reload mid-fight: the same panel, from the saved session.
      shown = await panel(page);
      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await panel(page), shown);

      // Restart (even with another seed): the same panel, then the same dice.
      await server.close();
      server = await startFifthBrowserServer({
        adventures: ADVENTURES,
        libraryPath,
        seed: seed + 1,
        dmModel: attackingDm(),
      });
      await page.goto(
        `${server.url}/#adventure-${(await sessionFile(directory)).id}`,
      );
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await panel(page), shown);

      // Clicked attacks (and ends of turn) to the end.
      while (!(await page.locator("#ending").isVisible())) {
        await clickNext(page);
      }
      assert.equal(
        await page.locator("#ending-title").textContent(),
        "The cellar is clear",
      );
      assert.equal(await page.locator("#attack-controls button").count(), 0);
      assert.ok(await page.locator("#send-message").isDisabled());

      // Every die matches an uninterrupted engine run on the same seed.
      const file = await sessionFile(directory);
      assert.deepEqual(
        file.transitions.map(({ rolls }) => rolls),
        expected.drawn,
      );
      assert.deepEqual(
        file.transitions.map(({ source }) => source),
        ["start", "message", ...Array(expected.drawn.length - 2).fill("click")],
      );
      assert.equal(file.state.status, "victory");
      // The character is free again.
      const after = JSON.parse(await readFile(libraryPath, "utf8"));
      assert.equal(after.characters[0].session, undefined);
      assert.equal(after.characters[0].defeated, undefined);
      await page.locator(`#breadcrumb a[data-view="sheet"]`).click();
      await page.locator(".start-adventure").first().waitFor();
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

/**
 * The goblin band's fight on `seed`: a typed attack on the Goblin Warrior, then
 * clicks on the first offered target, or End turn once the action is spent.
 * Its outcome, its dice, and the player action that first fells an opponent
 * while others still stand.
 */
function simulateGroup(seed) {
  const runtime = createFifthRuntime(band, firstFighter(seed));
  const source = createSeededRandom(sessionSeed(seed, 1));
  const drawn = [[]];
  const random = {
    roll(sides) {
      const value = source.roll(sides);
      drawn.at(-1).push({ sides, value });
      return value;
    },
  };
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  let steps = 0;
  let firstFall;
  while (state.status === "playing") {
    drawn.push([]);
    const targets = runtime.attackTargets(state);
    const action =
      targets.length === 0
        ? END_TURN
        : {
            type: "attack",
            actorId: "pc",
            targetId: steps === 0 ? "warrior" : targets[0].id,
          };
    state = runtime.handleAction(state, action, random).state;
    steps++;
    const down = state.encounter.combatants.find(
      ({ side, hp }) => side === "opponents" && hp === 0,
    );
    if (firstFall === undefined && down !== undefined) {
      firstFall =
        state.status === "playing" ? { steps, id: down.id } : undefined;
    }
  }
  return { status: state.status, drawn, firstFall };
}

/**
 * A scripted AI DM that attacks the offered target the message names, and
 * asks which one when it names none or several.
 */
function targetingDm() {
  let calls = 0;
  return {
    async respond(request) {
      if (request.toolResults.length > 0) {
        return { text: "Unreachable: the engine writes attack replies." };
      }
      const tool = request.tools.find(({ name }) => name === "attack");
      const offered = [
        ...tool.description.matchAll(/([a-z0-9-]+) \(([^)]+)\)/g),
      ].map(([, id, name]) => ({ id, name: name.toLowerCase() }));
      const said = request.playerInput.toLowerCase();
      const named = offered.filter(({ name }) => said.includes(name));
      return named.length === 1
        ? {
            toolCalls: [
              {
                id: `call-${++calls}`,
                name: "attack",
                argumentsJson: JSON.stringify({ target: named[0].id }),
              },
            ],
          }
        : { text: "Which one do you mean?" };
    },
  };
}

test(
  "a group fight with clicked and typed targets survives a reload, refuses a defeated target and ends",
  { timeout: 90000 },
  async () => {
    let seed = 0;
    let expected = simulateGroup(seed);
    while (
      expected.status !== "victory" ||
      expected.firstFall === undefined ||
      expected.firstFall.steps < 2
    ) {
      expected = simulateGroup(++seed);
      assert.ok(seed < 5000, "no seed for a group victory");
    }
    const directory = await mkdtemp(join(tmpdir(), "encounter-5e-group-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      adventures: ADVENTURES,
      libraryPath,
      seed,
      dmModel: targetingDm(),
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 360, height: 740 },
    });
    page.setDefaultTimeout(5000);
    // No page scroll, and no scroll inside the initiative table either.
    const fits = () =>
      page.evaluate(() => {
        const table = document.getElementById("initiative");
        return (
          document.documentElement.scrollWidth <= window.innerWidth &&
          table.scrollWidth <= table.parentElement.clientWidth
        );
      });
    const attackLabels = () =>
      page.locator("#attack-controls button.attack").allTextContents();
    try {
      await createAndStart(page, server.url, "goblin-band");
      // Every combatant in initiative order, readable at phone width.
      let shown = await panel(page);
      assert.equal(shown.rows.length, 3);
      for (const name of ["Ada (you)", "Goblin Minion", "Goblin Warrior"]) {
        assert.equal(shown.rows.filter((row) => row.includes(name)).length, 1);
      }
      assert.ok(await fits(), "the panel fits at phone width");
      // One attack control per living opponent, in initiative order.
      assert.deepEqual(
        await attackLabels(),
        shown.rows
          .filter((row) => !row.includes("Ada (you)"))
          .map((row) => `Attack ${/Goblin (Minion|Warrior)/.exec(row)[0]}`),
      );

      // An ambiguous message gets the DM's reply and changes nothing.
      const before = await sessionFile(directory);
      await page.locator("#message").fill("attack the goblin");
      await page.locator("#send-message").click();
      await page.locator("#log li:not([data-pending])").nth(1).waitFor();
      assert.deepEqual(
        (await sessionFile(directory)).transitions,
        before.transitions,
      );

      // A typed attack on a named target.
      await page.locator("#message").fill("I charge the goblin warrior");
      await page.locator("#send-message").click();
      await page.locator("#log li:not([data-pending])").nth(2).waitFor();
      assert.match(
        await page.locator("#log li").nth(2).textContent(),
        /^You: I charge the goblin warriorAda attacks Goblin Warrior with Mace/,
      );

      // Clicks on the first offered target until the first goblin falls.
      for (let step = 1; step < expected.firstFall.steps; step++) {
        await clickNext(page);
      }
      const fallen = band.encounters[0].opponents.find(
        ({ id }) => id === expected.firstFall.id,
      ).name;
      shown = await panel(page);
      assert.ok(shown.rows.some((row) => row.includes(`${fallen} Defeated`)));
      assert.match(shown.turn, /^Round \d+: your turn\.$/);
      assert.ok(!(await attackLabels()).includes(`Attack ${fallen}`));
      assert.ok(await fits(), "the panel still fits with a defeated row");

      // Attacking the fallen goblin is refused, draws nothing, saves nothing.
      const file = await sessionFile(directory);
      const refused = await post(page, "/api/5e/session/attack", {
        sessionId: file.id,
        sequence: file.transitions.length,
        actorId: "pc",
        targetId: expected.firstFall.id,
      });
      assert.equal(refused.body.rejection, `${fallen} is already defeated.`);
      assert.equal(
        JSON.stringify(await sessionFile(directory)),
        JSON.stringify(file),
      );

      // Reload mid-fight: the same panel, from the saved session.
      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await panel(page), shown);

      while (!(await page.locator("#ending").isVisible())) {
        await clickNext(page);
      }
      assert.equal(
        await page.locator("#ending-title").textContent(),
        "The storeroom is clear",
      );
      // Every die matches an uninterrupted engine run on the same seed.
      const finished = await sessionFile(directory);
      assert.deepEqual(
        finished.transitions.map(({ rolls }) => rolls),
        expected.drawn,
      );
      assert.deepEqual(
        finished.transitions.map(({ source }) => source),
        ["start", "message", ...Array(expected.drawn.length - 2).fill("click")],
      );
      const library = JSON.parse(await readFile(libraryPath, "utf8"));
      assert.equal(library.characters[0].session, undefined);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const SECOND_WIND = { type: "second-wind", actorId: "pc" };

/**
 * The first session on `seed`, played by clicks: Second Wind whenever it is
 * offered, else an attack, else End turn. Each action and its dice.
 */
function simulateFeatures(seed) {
  const runtime = createFifthRuntime(adventure, firstFighter(seed));
  const source = createSeededRandom(sessionSeed(seed, 1));
  const drawn = [[]];
  const random = {
    roll(sides) {
      const value = source.roll(sides);
      drawn.at(-1).push({ sides, value });
      return value;
    },
  };
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  const actions = [];
  while (state.status === "playing") {
    drawn.push([]);
    const options = runtime.projectFight(state).turn.options;
    const action = options.includes("second-wind")
      ? SECOND_WIND
      : options.includes("attack")
        ? ATTACK
        : END_TURN;
    state = runtime.handleAction(state, action, random).state;
    actions.push(action.type);
  }
  return { status: state.status, actions, drawn };
}

test(
  "Second Wind by click: its button, compact healing line, a restart and the saved session",
  { timeout: 90000 },
  async () => {
    // A fight where Ada heals with Second Wind.
    let seed = 0;
    let expected = simulateFeatures(seed);
    while (!expected.actions.includes("second-wind")) {
      expected = simulateFeatures(++seed);
      assert.ok(seed < 5000, "no seed with Second Wind");
    }
    const directory = await mkdtemp(join(tmpdir(), "encounter-5e-features-"));
    const libraryPath = join(directory, "characters.json");
    let server = await startFifthBrowserServer({
      adventures: ADVENTURES,
      libraryPath,
      seed,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 360, height: 740 },
    });
    page.setDefaultTimeout(5000);
    const feature = (action) =>
      page.locator(`#feature-controls button[data-action="${action}"]:enabled`);
    try {
      await createAndStart(page, server.url, "lone-goblin");
      // At full health there is no Second Wind to click.
      assert.equal(await feature("second-wind").count(), 0);
      let usedSecondWind = false;
      while (!(await page.locator("#ending").isVisible())) {
        const count = await page.locator("#log li").count();
        if ((await feature("second-wind").count()) > 0) {
          assert.equal(
            await feature("second-wind").textContent(),
            `Second Wind (${usedSecondWind ? 1 : 2} of 2 left)`,
          );
          await feature("second-wind").click();
          await page.waitForFunction(
            (seen) =>
              document.querySelectorAll("#log li:not([data-pending])").length >
              seen,
            count,
          );
          if (!usedSecondWind) {
            usedSecondWind = true;
            assert.match(
              await page.locator("#log li").last().textContent(),
              /^Ada uses Second Wind: \d+ \+ 1 = \d+; Ada regains \d+ HP and has \d+\/\d+ HP\. 1 use left\./,
            );
            // Shown compactly (#186): the healing in bold, its die beside it.
            assert.match(
              await page
                .locator("#log li")
                .last()
                .locator(".compact")
                .first()
                .textContent(),
              /^Ada heals \d+ \(d10 \d+ \+ 1\) → \d+\/\d+ HP$/,
            );
            assert.equal(
              await page
                .locator("#log li")
                .last()
                .locator(".compact .roll.healing strong")
                .count(),
              1,
            );
            // Reload and restart: the same spent use and the same panel.
            const shown = await panel(page);
            await server.close();
            server = await startFifthBrowserServer({
              adventures: ADVENTURES,
              libraryPath,
              seed: seed + 1,
            });
            await page.goto(
              `${server.url}/#adventure-${(await sessionFile(directory)).id}`,
            );
            await page.locator("#adventure").waitFor({ state: "visible" });
            assert.deepEqual(await panel(page), shown);
            // The spent use survives the restart (#155's strip).
            assert.equal(
              await resources(page),
              "Action: available; Bonus action: used; Reaction: available; Second Wind: 1 of 2 uses left",
            );
          }
        } else {
          await clickNext(page);
        }
      }
      // Storage holds every click, with dice matching the engine run.
      const file = await sessionFile(directory);
      assert.deepEqual(
        file.transitions.map(({ action }) => action.type),
        ["begin", ...expected.actions],
      );
      assert.deepEqual(
        file.transitions.map(({ rolls }) => rolls),
        expected.drawn,
      );
      assert.equal(file.state.status, expected.status);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
