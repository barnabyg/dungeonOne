// #132, browser → API → storage: force a door, fail and pass checks on
// different seeds, find and disarm a trap or spring it, and talk to a creature
// by clicking and by typing. Each check and saving throw is its own labelled
// roll group in the history, and every die matches an engine run on the seed.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { sealedCrypt } from "./fixtures/modules.mjs";
import { createAndStart, settled } from "./fixtures/browser-journey.mjs";
import { firstFighter, launch } from "./fixtures/session-layout.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";

const crypt = sealedCrypt;

const FORCE = { type: "force", doorId: "swollen-door" };
const TO_HALL = { type: "move", destinationId: "hall" };
const ASK_WARDEN = { type: "talk", topicId: "warden" };
const ASK_KEY = { type: "talk", topicId: "key-whereabouts" };
const SEARCH = { type: "search", roomId: "hall" };
const DISARM = { type: "disarm", trapId: "dart-trap" };
const TO_OFFERINGS = { type: "move", destinationId: "offering-room" };

/**
 * Plays the journey on `seed` as the browser test does: force the door, go
 * to the hall, ask about the warden and (typed) the key, search, disarm a
 * found trap, and go through to the offering room. Returns each action's dice,
 * each check's outcome and the final state.
 */
function simulate(seed) {
  const runtime = createFifthRuntime(crypt, firstFighter(seed));
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
  for (const action of [FORCE, TO_HALL, ASK_WARDEN, ASK_KEY, SEARCH]) {
    state = run(state, action);
  }
  const found = state.foundTrapIds.includes("dart-trap");
  if (found) {
    state = run(state, DISARM);
  }
  const passed = (id) => state.checks.find((entry) => entry.id === id)?.success;
  const outcome = {
    forced: passed("force:swollen-door"),
    found,
    disarmed: passed("disarm:dart-trap") === true,
  };
  state = run(state, TO_OFFERINGS);
  return { drawn, state, ...outcome };
}

/** The first seed whose journey fits `wanted`. */
function findSeed(wanted) {
  for (let seed = 0; seed < 5000; seed++) {
    const run = simulate(seed);
    if (wanted(run)) {
      return seed;
    }
  }
  throw new Error("no seed for the journey");
}

/** A scripted AI DM that answers a question about the key with talk. */
function talkingDm() {
  return {
    async respond(request) {
      return request.toolResults.length === 0
        ? {
            toolCalls: [
              {
                id: "call-1",
                name: "talk",
                argumentsJson: JSON.stringify({ topic: "key-whereabouts" }),
              },
            ],
          }
        : { text: "Unreachable: the engine writes talk replies." };
    },
  };
}

const screen = (page) =>
  page.evaluate(() => ({
    status: document.getElementById("session-status").innerText,
    room: document.getElementById("room").innerText,
    actions: [...document.querySelectorAll("#action-bar button")]
      .map((button) => {
        const reason = button.getAttribute("aria-describedby");
        return (
          (button.getAttribute("aria-label") || button.textContent) +
          (reason ? " " + document.getElementById(reason).textContent : "")
        );
      })
      .join("\n"),
    log: document.getElementById("log").textContent,
  }));

/** Clicks an action-bar button and waits for its settled history entry. */
const click = (page, action, target) =>
  settled(page, () =>
    page
      .locator(
        `#action-bar button[data-action="${action}"][data-target="${target}"]`,
      )
      .click(),
  );

const lastEntry = (page) => page.locator("#log li").last();
/** The compact text of the newest entry's lines that have rolls. */
const compact = (page) =>
  lastEntry(page)
    .locator(".compact")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent));

/**
 * Plays the crypt on `seed` and runs `check` in the offering room. With
 * `reload`, a reload must show the same screen (one variant is enough; the
 * restart on another seed is checked in encounter-5e-browser.test.mjs).
 */
async function play(seed, check, { reload = false } = {}) {
  const expected = simulate(seed);
  const directory = await mkdtemp(join(tmpdir(), "issue-132-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({
    adventures: [crypt],
    libraryPath,
    seed,
    dmModel: talkingDm(),
  });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
  page.setDefaultTimeout(5000);
  try {
    await createAndStart(page, server.url, "sealed-crypt");

    let shown = await screen(page);
    assert.match(shown.actions, /Go to Flooded Cell Door shut/);
    assert.match(shown.actions, /Force Swollen Door/);
    assert.match(shown.actions, /Search Crypt Stair/);
    assert.match(shown.room, /Swollen Door: shut\./);

    await click(page, "force", "swollen-door");
    const [forceLine] = await compact(page);
    assert.match(
      forceLine,
      new RegExp(
        `^Ada Athletics check ${expected.forced ? "Success" : "Failure"} d20 \\d+ [+−] \\d+ \\+ 2 prof = \\d+ vs DC 13$`,
      ),
    );
    shown = await screen(page);
    // An opened door's Force button goes; a failed one says it was tried.
    if (expected.forced) {
      assert.doesNotMatch(shown.actions, /Force Swollen Door/);
    } else {
      assert.match(shown.actions, /Force Swollen Door Already tried/);
    }
    assert.match(
      shown.actions,
      expected.forced ? /Go to Flooded Cell\n/ : /Go to Flooded Cell Door shut/,
    );

    await click(page, "move", "hall");
    await click(page, "talk", "warden");
    assert.match(
      await lastEntry(page).textContent(),
      /Bound Smuggler: "I lifted the sarcophagus lid/,
    );
    // Typed: the AI DM's talk tool, whose check the engine rolls.
    await page
      .locator("#message")
      .fill("Ask the smuggler where the iron key is.");
    await page.locator("#send-message").click();
    await lastEntry(page).filter({ hasText: "Bound Smuggler:" }).waitFor();
    const [keyLine] = await compact(page);
    assert.match(keyLine, /^Ada Persuasion check (Success|Failure) d20 \d+/);
    shown = await screen(page);
    assert.match(
      shown.actions,
      /Talk to Bound Smuggler about the warden Already asked/,
    );
    assert.match(
      shown.actions,
      /Talk to Bound Smuggler about the iron key Already asked/,
    );
    assert.match(shown.room, /About the warden: "I lifted the sarcophagus lid/);

    await click(page, "search", "hall");
    const [searchLine] = await compact(page);
    assert.match(
      searchLine,
      new RegExp(
        `^Ada Perception check ${expected.found ? "Success" : "Failure"} `,
      ),
    );
    shown = await screen(page);
    assert.match(shown.actions, /Search Hall of Niches Already searched/);
    if (expected.found) {
      assert.match(shown.room, /Dart Trap: found, armed\./);
      await click(page, "disarm", "dart-trap");
      assert.match(
        (await compact(page))[0],
        new RegExp(
          `^Ada Dexterity check ${expected.disarmed ? "Success" : "Failure"} `,
        ),
      );
      shown = await screen(page);
      assert.match(
        shown.actions,
        expected.disarmed
          ? /Disarm Dart Trap Trap disarmed/
          : /Disarm Dart Trap Already tried/,
      );
    } else {
      assert.doesNotMatch(shown.room, /Dart Trap/);
      assert.doesNotMatch(shown.actions, /Disarm/);
    }

    await click(page, "move", "offering-room");
    await check(page, expected);

    if (reload) {
      // A reload shows the same screen, from the saved session.
      shown = await screen(page);
      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await screen(page), shown);
    }

    // Every die matches an uninterrupted engine run on the same seed.
    const file = await sessionFile(directory);
    assert.deepEqual(
      file.transitions.map(({ rolls }) => rolls),
      expected.drawn,
    );
    assert.deepEqual(file.state, expected.state);
    assert.deepEqual(
      file.transitions.find(({ source }) => source === "message").action,
      ASK_KEY,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "no horizontal scroll at phone width",
    );
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test(
  "the door holds, the search finds nothing, and the trap springs: a saving throw against its damage",
  { timeout: 120000 },
  async () => {
    const seed = findSeed(
      (run) => !run.forced && !run.found && run.state.status === "playing",
    );
    await play(
      seed,
      async (page, expected) => {
        const lines = await compact(page);
        assert.match(
          lines[0],
          /^Ada Dexterity saving throw (Success|Failure) d20 \d+ [+−] \d+ = \d+ vs DC 12$/,
        );
        assert.match(
          lines[1],
          /^Dart Trap → Ada \d+ piercing \(d4 \d \+ d4 \d(, halved)?\) → \d+\/\d+ HP$/,
        );
        const shown = await screen(page);
        assert.match(
          shown.status,
          new RegExp(`HP ${expected.state.character.hp}/`),
        );
        assert.match(shown.room, /^Offering Room\n/);
        assert.match(shown.room, /Dart Trap: sprung\./);
      },
      { reload: true },
    );
  },
);

test(
  "the door is forced, the trap found and disarmed, and the way through is safe",
  { timeout: 120000 },
  async () => {
    const seed = findSeed((run) => run.forced && run.found && run.disarmed);
    await play(seed, async (page, expected) => {
      assert.deepEqual(await compact(page), []);
      const shown = await screen(page);
      assert.match(shown.room, /^Offering Room\n/);
      assert.match(shown.room, /Dart Trap: disarmed\./);
      assert.equal(expected.state.sprungTrapIds.length, 0);
    });
  },
);
