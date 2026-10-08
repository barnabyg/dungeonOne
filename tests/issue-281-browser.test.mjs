// #281, browser → API → storage: a feature's graded check. A success
// reveals the silver ring, which is taken and kept on escape; a failure by 5
// or more drops stones on the character, and the damage is still there after
// a reload.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { clickAction, createAndStart } from "./fixtures/browser-journey.mjs";
import {
  assertNoSideScroll,
  firstFighter,
  launch,
} from "./fixtures/session-layout.mjs";
import { readAda, sessionFile } from "./fixtures/save-files.mjs";
import { gradedCellar } from "./fixtures/modules.mjs";

const EXAMINE = { type: "examine", targetId: "rubble-heap" };

/** The band examining the heap rolls first thing on `seed`. */
function bandOn(seed) {
  const runtime = createFifthRuntime(gradedCellar, firstFighter(seed));
  const random = createSeededRandom(sessionSeed(seed, 1));
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  return runtime.handleAction(begun, EXAMINE, random).state.checks[0].band;
}

const seedFor = (wanted) => {
  for (let seed = 0; seed < 500; seed++) {
    if (wanted(bandOn(seed))) {
      return seed;
    }
  }
  throw new Error("no seed rolls the band");
};

const compact = (page) =>
  page
    .locator("#log li")
    .last()
    .locator(".compact")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent));

async function play(seed, journey) {
  const directory = await mkdtemp(join(tmpdir(), "issue-281-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({
    adventures: [gradedCellar],
    libraryPath,
    seed,
    qualifies: () => true,
  });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
  page.setDefaultTimeout(5000);
  try {
    await createAndStart(page, server.url, "graded-cellar");
    await journey(page, { directory, libraryPath });
    await assertNoSideScroll(page, "no horizontal scroll at phone width");
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test(
  "a success reveals the ring, which is taken and kept on escape",
  { timeout: 120000 },
  async () => {
    await play(
      seedFor((band) => band === "success"),
      async (page, { libraryPath }) => {
        await clickAction(page, "examine", "rubble-heap");
        const [line] = await compact(page);
        assert.match(line, /^Ada Perception check Success d20 \d+/);
        assert.match(
          await page.locator("#log li").last().textContent(),
          /You find the Silver Ring\./,
        );
        assert.match(
          await page.locator("#room-items").innerText(),
          /Silver Ring/,
        );
        await clickAction(page, "take", "silver-ring");
        await page.locator("#leave-controls button").click();
        await page.locator("#confirm-leave").click();
        await page.locator("#ending").waitFor({ state: "visible" });
        assert.equal(
          await page.locator("#ending-title").textContent(),
          "Out with the ring",
        );
        const ada = await readAda(libraryPath);
        assert.deepEqual(
          ada.sheet.treasure.map(({ id }) => id),
          ["graded-cellar/silver-ring"],
        );
      },
    );
  },
);

test(
  "a failure by 5 or more hurts, and the damage stays after a reload",
  { timeout: 120000 },
  async () => {
    await play(
      seedFor((band) => band === "failure-by-5"),
      async (page, { directory }) => {
        await clickAction(page, "examine", "rubble-heap");
        const [check, damage] = await compact(page);
        assert.match(check, /^Ada Perception check Failure by 5\+ d20 \d+/);
        assert.match(
          damage,
          /^Rubble Heap → Ada \d bludgeoning \(d6 \d\) → \d+\/\d+ HP$/,
        );
        assert.match(
          await page.locator("#log li").last().textContent(),
          /stones crash down onto your hands/,
        );
        const { state, character } = await sessionFile(directory);
        assert.ok(state.character.hp < character.hp);
        const hp = await page.locator("#character-hp").textContent();
        assert.match(hp, new RegExp(`${state.character.hp}/`));
        const log = await page.locator("#log").textContent();
        await page.reload();
        await page.locator("#adventure").waitFor({ state: "visible" });
        assert.equal(await page.locator("#character-hp").textContent(), hp);
        assert.equal(await page.locator("#log").textContent(), log);
        assert.doesNotMatch(
          await page.locator("#room").innerText(),
          /Silver Ring/,
        );
      },
    );
  },
);
