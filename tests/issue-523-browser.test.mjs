// #523, browser → API: one column per job. The character on the left; in the
// centre the room with, pinned under it, the box to tell the Dungeon Master
// what Ada does, and, in a fight, the fight's controls above the room, and
// the ending card when the adventure is over; on the right the history
// alone, at the panel's full height. The DM box stays on screen whatever the
// room's length, nothing scrolls sideways, and Tab runs left, centre, right.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { loneGoblin, ratTunnels } from "./fixtures/modules.mjs";
import {
  clickAction,
  createAndStart,
  fightTurn,
  settled,
  text,
} from "./fixtures/browser-journey.mjs";
import {
  assertNoSideScroll,
  firstFighter,
  launch,
  narratingDm,
} from "./fixtures/session-layout.mjs";

const WIDTHS = [
  { width: 1880, height: 1000 },
  { width: 1280, height: 760 },
  { width: 900, height: 560 },
];

/** A lone goblin seed where Ada wins by attacking every turn. */
function victorySeed() {
  for (let seed = 0; seed < 5000; seed++) {
    const runtime = createFifthRuntime(loneGoblin, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    let state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    let turns = 0;
    while (state.status === "playing") {
      const action =
        runtime.attackTargets(state).length > 0
          ? { type: "attack", actorId: "pc", targetId: "goblin" }
          : { type: "end-turn", actorId: "pc" };
      const next = runtime.handleAction(state, action, random);
      if (next.rejection) {
        break;
      }
      state = next.state;
      turns++;
    }
    // At least two of Ada's turns, so the fight is seen under way first.
    if (state.status === "victory" && turns >= 3) {
      return seed;
    }
  }
  throw new Error("no lone goblin seed where Ada wins");
}

/**
 * Where the play panel's parts sit: each region's box, and what the
 * history column holds.
 */
const geometry = (page) =>
  page.evaluate(() => {
    const box = (id) => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      };
    };
    return {
      height: window.innerHeight,
      wide: window.innerWidth >= 1500,
      layout: box("session-layout"),
      status: box("session-status"),
      character: box("session-character"),
      main: box("session-main"),
      scene: box("session-scene"),
      composer: box("session-composer"),
      send: box("send-message"),
      history: box("session-history"),
      log: box("log"),
      historyHolds: [...document.getElementById("session-history").children]
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => node.id),
      historyNext:
        document.getElementById("session-history").nextElementSibling?.id,
    };
  });

/**
 * The columns at every width: the history alone on the right at the
 * panel's full height, the DM box at the bottom of the centre on screen, the
 * character to the left of (or, narrower, above) the scene.
 */
async function assertColumns(page, when) {
  for (const viewport of WIDTHS) {
    await page.setViewportSize(viewport);
    const at = `${when} at ${viewport.width}`;
    await assertNoSideScroll(page, `${at}: no horizontal scroll`);
    const shown = await geometry(page);
    const where = JSON.stringify(shown);
    // Right: the history, alone and full height, the last region.
    assert.deepEqual(shown.historyHolds, ["history-title", "log"], at);
    assert.equal(shown.historyNext, undefined, `${at}: history is last`);
    assert.ok(
      Math.abs(shown.history.top - shown.layout.top) <= 1 &&
        Math.abs(shown.history.bottom - shown.layout.bottom) <= 1,
      `${at}: history at full height ${where}`,
    );
    assert.ok(
      shown.log.bottom >= shown.layout.bottom - 2 &&
        shown.log.height > shown.layout.height / 2,
      `${at}: the log fills the history ${where}`,
    );
    assert.ok(
      shown.history.left >= shown.scene.right &&
        shown.history.left >= shown.composer.right,
      `${at}: history right of the centre ${where}`,
    );
    // Centre: the DM box under the scene, at the panel's foot, on screen.
    // The scene scrolls in its own column from 1500 px, narrower in the
    // first column's scroll area.
    assert.ok(
      shown.composer.top >= (shown.wide ? shown.scene : shown.main).bottom - 1,
      `${at}: DM box under the scene ${where}`,
    );
    assert.ok(
      Math.abs(shown.composer.bottom - shown.layout.bottom) <= 1 &&
        shown.composer.bottom <= shown.height &&
        shown.send.bottom <= shown.height &&
        shown.composer.height > 0,
      `${at}: DM box on screen at the foot ${where}`,
    );
    assert.ok(
      Math.abs(shown.composer.left - shown.scene.left) <= 1,
      `${at}: DM box in the scene's column ${where}`,
    );
    // Left: the character beside the scene from 1500 px; narrower, its
    // status strip above the scene in the same column.
    if (shown.wide) {
      assert.ok(
        shown.character.right <= shown.scene.left &&
          Math.abs(shown.character.bottom - shown.layout.bottom) <= 1,
        `${at}: character column left, full height ${where}`,
      );
    } else {
      assert.ok(
        Math.abs(shown.status.left - shown.scene.left) <= 1 &&
          shown.status.bottom <= shown.scene.top + 1,
        `${at}: status above the scene ${where}`,
      );
    }
  }
  await page.setViewportSize(WIDTHS[0]);
}

/** Where `id`'s box sits against the scene's column and the room. */
const placeInCentre = (page, id) =>
  page.evaluate((id) => {
    const node = document.getElementById(id);
    const rect = node.getBoundingClientRect();
    const scene = document
      .getElementById("session-scene")
      .getBoundingClientRect();
    const room = document.getElementById("room").getBoundingClientRect();
    return {
      inScene: node.closest("#session-scene") !== null,
      shown: rect.height > 0,
      inColumn: rect.left >= scene.left - 1 && rect.right <= scene.right + 1,
      aboveRoom: rect.bottom <= room.top + 1,
    };
  }, id);

/**
 * The regions Tab visits from the adventure title, left to right, each
 * once; inside the scene, its parts top to bottom.
 */
async function tabOrder(page) {
  await page.locator("#adventure-title").focus();
  const regions = [];
  const parts = [];
  for (let step = 0; step < 80; step++) {
    await page.keyboard.press("Tab");
    const at = await page.evaluate(() => {
      const node = document.activeElement;
      return {
        region: node.closest(
          "#session-character, #session-scene, #session-composer, #session-history",
        )?.id,
        part: node.closest("#encounter, #session-actions, #room")?.id,
      };
    });
    if (!at.region) {
      break;
    }
    if (regions.at(-1) !== at.region) {
      regions.push(at.region);
    }
    if (at.part && parts.at(-1) !== at.part) {
      parts.push(at.part);
    }
  }
  return { regions, parts };
}

/**
 * Whether the first element matching `selector` is on screen without
 * scrolling: inside the window and its column's scroll area.
 */
const inView = (page, selector) =>
  page.evaluate((selector) => {
    const node = document.querySelector(selector);
    const rect = node.getBoundingClientRect();
    let port = node.parentElement;
    while (port && !/auto|scroll/u.test(getComputedStyle(port).overflowY)) {
      port = port.parentElement;
    }
    const area = port.getBoundingClientRect();
    return (
      rect.height > 0 &&
      rect.top >= Math.max(0, area.top) - 1 &&
      rect.bottom <= Math.min(window.innerHeight, area.bottom) + 1
    );
  }, selector);

const COLUMNS = [
  "session-character",
  "session-scene",
  "session-composer",
  "session-history",
];

test(
  "exploring: the DM box sits under the room and the history fills the right column",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-523-explore-"));
    const server = await startFifthBrowserServer({
      adventures: [ratTunnels],
      qualifies: () => true,
      libraryPath: join(directory, "characters.json"),
      seed: 0,
      dmModel: narratingDm(),
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport: WIDTHS[0] });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "rat-tunnels");
      await assertColumns(page, "exploring");
      assert.deepEqual((await tabOrder(page)).regions, COLUMNS);

      // A long room: the DM box stays on screen, the room scrolls above it.
      await page.evaluate(() => {
        const long = document.createElement("p");
        long.textContent = " Water drips.".repeat(400);
        document.getElementById("room-alarm").before(long);
      });
      await assertColumns(page, "a long room");

      // Telling the DM still answers in the history, followed to the end.
      await settled(page, async () => {
        await page.locator("#message").fill("I listen at the stair");
        await page.locator("#message").press("Enter");
      });
      assert.match(
        await text(page.locator("#log li:last-child")),
        /I listen at the stair/u,
      );

      // Going on from the foot of a scrolled room into a fight shows the
      // centre from its top, the fight's controls on screen.
      await page.setViewportSize(WIDTHS[2]);
      await page.evaluate(() => {
        for (const id of ["session-main", "session-scene"]) {
          const area = document.getElementById(id);
          area.scrollTop = area.scrollHeight;
        }
      });
      await clickAction(page, "move", "rat-cellar");
      await page.locator("#encounter button.attack").first().waitFor();
      assert.equal(
        await inView(page, "#encounter button.attack"),
        true,
        "Attack on screen after going on",
      );
      await assertColumns(page, "fighting the rats");
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "fighting: the fight's controls top the centre column, then the ending card",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-523-fight-"));
    const server = await startFifthBrowserServer({
      adventures: [loneGoblin],
      qualifies: () => true,
      libraryPath: join(directory, "characters.json"),
      seed: victorySeed(),
      dmModel: narratingDm(),
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport: WIDTHS[0] });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "lone-goblin");
      await page.locator("#encounter button.attack").first().waitFor();

      // The fight panel (#525) opens the centre, its cards then its
      // footer, then the room; Tab follows the same order.
      for (const viewport of WIDTHS) {
        await page.setViewportSize(viewport);
        for (const id of ["encounter", "foe-cards", "fight-foot"]) {
          assert.deepEqual(
            await placeInCentre(page, id),
            { inScene: true, shown: true, inColumn: true, aboveRoom: true },
            `${id} at ${viewport.width}`,
          );
        }
        assert.ok(
          await page.evaluate(
            () =>
              document.getElementById("session-actions").getBoundingClientRect()
                .bottom <=
              document.getElementById("encounter").getBoundingClientRect().top +
                1,
          ),
          `controls above the Fight section at ${viewport.width}`,
        );
        assert.equal(
          await inView(page, "#encounter button.attack"),
          true,
          `Attack on screen at ${viewport.width}`,
        );
      }
      await page.setViewportSize(WIDTHS[0]);
      await assertColumns(page, "fighting");
      const order = await tabOrder(page);
      assert.deepEqual(order.regions, COLUMNS);
      // The cellar's cards offer nothing in the fight, so the room may have
      // no stop; if it has, it comes last.
      assert.deepEqual(
        order.parts,
        ["encounter", "room"].slice(0, Math.max(1, order.parts.length)),
      );

      // The controls work as before, until the fight is won.
      while (!(await page.locator("#ending").isVisible())) {
        await fightTurn(page);
      }

      // The ending card in the centre, above the room, its button working.
      for (const viewport of WIDTHS) {
        await page.setViewportSize(viewport);
        assert.deepEqual(
          await placeInCentre(page, "ending"),
          { inScene: true, shown: true, inColumn: true, aboveRoom: true },
          `ending at ${viewport.width}`,
        );
      }
      await assertColumns(page, "the ending");
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "ending-title",
      );
      await page.locator("#ending-next").click();
      await page.locator("#sheet").waitFor({ state: "visible" });
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
