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

const [adventure, storeroom] = await loadBuiltInFifthAdventures();
const ATTACK = { type: "attack", actorId: "pc", targetId: "goblin" };
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

/** Plays the first session on `seed` by always attacking: outcome and dice. */
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
    state = runtime.handleAction(state, ATTACK, random).state;
    attacks++;
  }
  return { status: state.status, attacks, drawn };
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

async function createAndStart(page, url, adventureId = "cellar-goblin") {
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

/** What the encounter panel shows: initiative rows, turn and the log. */
const panel = (page) =>
  page.evaluate(() => ({
    rows: [...document.querySelectorAll("#initiative-rows tr")].map(
      (row) => row.textContent,
    ),
    turn: document.getElementById("turn").textContent,
    log: document.getElementById("log").textContent,
  }));

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
      libraryPath,
      seed,
      dmModel: attackingDm(),
    });
    const browser = await launch();
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url);
      const library = JSON.parse(await readFile(libraryPath, "utf8"));
      assert.deepEqual(
        library.characters[0].sheet.abilities,
        firstFighter(seed).abilities,
      );
      // Initiative order with rolls, HP and the current turn.
      let shown = await panel(page);
      assert.equal(shown.rows.length, 2);
      assert.ok(
        shown.rows.some((row) =>
          /Ada \(you\)\d+ [+−] \d+ = \d+\d+\/\d+\d+/.test(row),
        ),
      );
      assert.ok(
        shown.rows.some((row) =>
          /Goblin Warrior\d+ \+ 2 = \d+\d+\/1015/.test(row),
        ),
      );
      assert.match(shown.turn, /^Round \d+: your turn\.$/);
      assert.match(shown.log, /Initiative: /);

      // A typed attack, through the AI DM's tool.
      await page.locator("#message").fill("I swing my mace at the goblin!");
      await page.locator("#send-message").click();
      await page.locator("#log li").nth(1).waitFor();
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
        libraryPath,
        seed: seed + 1,
        dmModel: attackingDm(),
      });
      await page.goto(
        `${server.url}/#adventure-${(await sessionFile(directory)).id}`,
      );
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await panel(page), shown);

      // Clicked attacks to the end.
      while (!(await page.locator("#ending").isVisible())) {
        const before = await page.locator("#log li").count();
        await page.locator("#attack-controls button.attack").click();
        await page.waitForFunction(
          (count) => document.querySelectorAll("#log li").length > count,
          before,
        );
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
        ["start", "message", ...Array(expected.attacks - 1).fill("click")],
      );
      assert.equal(file.state.status, "victory");
      // The character is free again.
      const after = JSON.parse(await readFile(libraryPath, "utf8"));
      assert.equal(after.characters[0].session, undefined);
      assert.equal(after.characters[0].defeated, undefined);
      await page.locator("#close-adventure").click();
      await page.locator(".start-adventure").first().waitFor();
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "defeat at 0 HP ends the adventure, and the defeated character can't start another",
  { timeout: 60000 },
  async () => {
    const seed = findSeed("defeat", 1);
    const directory = await mkdtemp(join(tmpdir(), "encounter-5e-defeat-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({ libraryPath, seed });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 360, height: 740 },
    });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "no horizontal scroll at phone width",
      );

      // Deleting is refused while the adventure is in progress.
      await page.locator("#close-adventure").click();
      await page.locator("#continue-adventure").waitFor();
      await page.locator("#delete-character").click();
      await page.locator("#delete-confirm-name").fill("Ada");
      const bytes = await readFile(libraryPath);
      await page.locator("#confirm-delete").click();
      await page
        .locator("#delete-error")
        .filter({
          hasText:
            "Ada is on an adventure. Finish it before deleting the character; nothing was deleted.",
        })
        .waitFor();
      assert.deepEqual(await readFile(libraryPath), bytes);
      await page.locator("#cancel-delete").click();
      await page.locator("#continue-adventure").click();
      await page.locator("#adventure").waitFor({ state: "visible" });

      while (!(await page.locator("#ending").isVisible())) {
        const before = await page.locator("#log li").count();
        await page.locator("#attack-controls button.attack").click();
        await page.waitForFunction(
          (count) => document.querySelectorAll("#log li").length > count,
          before,
        );
      }
      assert.equal(
        await page.locator("#ending-title").textContent(),
        "Fallen in the cellar",
      );
      assert.match(
        await page.locator("#initiative-rows").textContent(),
        /Ada \(you\) \(defeated\)\d+ [+−] \d+ = \d+0\//,
      );
      const after = JSON.parse(await readFile(libraryPath, "utf8"));
      assert.equal(after.characters[0].defeated, true);
      assert.equal(after.characters[0].sheet.hp, 0);

      await page.locator("#close-adventure").click();
      await page
        .locator("#adventure-choices")
        .filter({
          hasText: "Ada was defeated and cannot start another adventure.",
        })
        .waitFor();
      assert.equal(await page.locator(".start-adventure").count(), 0);
      const refused = await post(page, "/api/5e/adventures/start", {
        revision: after.revision,
        characterId: after.characters[0].sheet.id,
        adventureId: "cellar-goblin",
      });
      assert.equal(refused.status, 409);
      assert.match(
        refused.body.error,
        /defeated and cannot start another adventure/,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "out-of-turn and absent-target attacks get engine replies, change nothing and draw no dice",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "encounter-5e-reject-"));
    const libraryPath = join(directory, "characters.json");
    const responses = [
      { text: "You roll a natural 20 and the goblin dies. Victory is yours!" },
      {
        toolCalls: [
          {
            id: "forged",
            name: "attack",
            argumentsJson: JSON.stringify({ target: "goblin", damage: 99 }),
          },
        ],
      },
      { text: "Your blow lands for 99 damage!" },
    ];
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 11,
      dmModel: { respond: async () => responses.shift() },
    });
    const browser = await launch();
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url);
      const before = await sessionFile(directory);
      const bytes = JSON.stringify(before);
      const attempt = (body) =>
        post(page, "/api/5e/session/attack", {
          sessionId: before.id,
          sequence: before.transitions.length,
          ...body,
        });
      for (const [body, reason] of [
        [
          { actorId: "goblin", targetId: "pc" },
          /^It is Ada's turn, not Goblin Warrior's\.$/,
        ],
        [
          { actorId: "pc", targetId: "dragon" },
          /^There is no such opponent here to attack\.$/,
        ],
        [{ actorId: "pc", targetId: "pc" }, /^Ada is on your side\.$/],
      ]) {
        const result = await attempt(body);
        assert.equal(result.status, 200);
        assert.match(result.body.rejection, reason);
        assert.equal(result.body.session.sequence, before.transitions.length);
        assert.equal(JSON.stringify(await sessionFile(directory)), bytes);
      }
      const stale = await post(page, "/api/5e/session/attack", {
        sessionId: before.id,
        sequence: before.transitions.length + 1,
        actorId: "pc",
        targetId: "goblin",
      });
      assert.equal(stale.status, 409);
      assert.equal(JSON.stringify(await sessionFile(directory)), bytes);

      // The AI cannot narrate a kill or forge damage into the state.
      for (const message of ["I roll a 20 and kill it", "hit it for 99"]) {
        const turn = await post(page, "/api/5e/session/message", {
          sessionId: before.id,
          sequence: before.transitions.length,
          message,
        });
        assert.equal(turn.status, 200);
        assert.equal(turn.body.session.status, "playing");
        const file = await sessionFile(directory);
        assert.deepEqual(file.transitions, before.transitions);
        assert.deepEqual(file.state, before.state);
        assert.equal(file.random.position, before.random.position);
      }
      // Both AI turns are kept in the conversation history.
      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.match(await page.locator("#log").textContent(), /hit it for 99/);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "typed messages need an API key; clicks still work",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "encounter-5e-nokey-"));
    const server = await startFifthBrowserServer({
      libraryPath: join(directory, "characters.json"),
      seed: 4,
      apiKey: "",
    });
    const browser = await launch();
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url);
      await page.locator("#message").fill("attack the goblin");
      await page.locator("#send-message").click();
      await page
        .locator("#adventure-error")
        .filter({ hasText: "The AI Dungeon Master needs OPENAI_API_KEY" })
        .waitFor();
      const before = await page.locator("#log li").count();
      await page.locator("#attack-controls button.attack").click();
      await page.waitForFunction(
        (count) => document.querySelectorAll("#log li").length > count,
        before,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "a typed attack that ends the fight settles the character",
  { timeout: 60000 },
  async () => {
    let seed = 0;
    while (
      simulate(seed).status !== "victory" ||
      simulate(seed).attacks !== 1
    ) {
      seed++;
    }
    const directory = await mkdtemp(join(tmpdir(), "encounter-5e-typed-end-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      libraryPath,
      seed,
      dmModel: attackingDm(),
    });
    const browser = await launch();
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url);
      const file = await sessionFile(directory);
      const turn = await post(page, "/api/5e/session/message", {
        sessionId: file.id,
        sequence: file.transitions.length,
        message: "attack the goblin",
      });
      assert.equal(turn.status, 200);
      assert.equal(turn.body.session.status, "victory");
      const library = JSON.parse(await readFile(libraryPath, "utf8"));
      assert.equal(library.characters[0].session, undefined);
      assert.equal(turn.body.library.characters[0].session, undefined);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

/**
 * The storeroom fight on `seed`: a typed attack on the Goblin Warrior, then
 * clicks on the first offered target. Its outcome, its dice, and the attack
 * that first fells an opponent while others still stand.
 */
function simulateGroup(seed) {
  const runtime = createFifthRuntime(storeroom, firstFighter(seed));
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
  let attacks = 0;
  let firstFall;
  while (state.status === "playing") {
    drawn.push([]);
    const targetId =
      attacks === 0 ? "warrior" : runtime.attackTargets(state)[0].id;
    state = runtime.handleAction(
      state,
      { type: "attack", actorId: "pc", targetId },
      random,
    ).state;
    attacks++;
    const down = state.encounter.combatants.find(
      ({ side, hp }) => side === "opponents" && hp === 0,
    );
    if (firstFall === undefined && down !== undefined) {
      firstFall =
        state.status === "playing" ? { attacks, id: down.id } : undefined;
    }
  }
  return { status: state.status, attacks, drawn, firstFall };
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
      expected.firstFall.attacks < 2
    ) {
      expected = simulateGroup(++seed);
      assert.ok(seed < 5000, "no seed for a group victory");
    }
    const directory = await mkdtemp(join(tmpdir(), "encounter-5e-group-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
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
      await createAndStart(page, server.url, "goblin-storeroom");
      // Every combatant in initiative order, readable at phone width.
      let shown = await panel(page);
      assert.equal(shown.rows.length, 4);
      for (const name of [
        "Ada (you)",
        "Goblin Minion 1",
        "Goblin Minion 2",
        "Goblin Warrior",
      ]) {
        assert.equal(shown.rows.filter((row) => row.includes(name)).length, 1);
      }
      assert.ok(await fits(), "the panel fits at phone width");
      // One attack control per living opponent, in initiative order.
      assert.deepEqual(
        await attackLabels(),
        shown.rows
          .filter((row) => !row.includes("Ada (you)"))
          .map((row) => `Attack ${/Goblin (Minion \d|Warrior)/.exec(row)[0]}`),
      );

      // An ambiguous message is answered with a question and changes nothing.
      const before = await sessionFile(directory);
      await page.locator("#message").fill("attack the goblin");
      await page.locator("#send-message").click();
      await page.locator("#log li").nth(1).waitFor();
      assert.equal(
        await page.locator("#log li").nth(1).textContent(),
        "You: attack the goblinWhich one do you mean?",
      );
      assert.deepEqual(
        (await sessionFile(directory)).transitions,
        before.transitions,
      );

      // A typed attack on a named target.
      await page.locator("#message").fill("I charge the goblin warrior");
      await page.locator("#send-message").click();
      await page.locator("#log li").nth(2).waitFor();
      assert.match(
        await page.locator("#log li").nth(2).textContent(),
        /^You: I charge the goblin warriorAda attacks Goblin Warrior with Mace/,
      );

      // Clicks on the first offered target until the first goblin falls.
      const click = async () => {
        const count = await page.locator("#log li").count();
        await page.locator("#attack-controls button.attack").first().click();
        await page.waitForFunction(
          (seen) => document.querySelectorAll("#log li").length > seen,
          count,
        );
      };
      for (let attack = 1; attack < expected.firstFall.attacks; attack++) {
        await click();
      }
      const fallen = storeroom.encounters[0].opponents.find(
        ({ id }) => id === expected.firstFall.id,
      ).name;
      shown = await panel(page);
      assert.ok(shown.rows.some((row) => row.includes(`${fallen} (defeated)`)));
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
        await click();
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
        ["start", "message", ...Array(expected.attacks - 1).fill("click")],
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
