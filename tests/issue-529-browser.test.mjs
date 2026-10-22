// #529, browser → API: each new turn shows from its top. After an action or
// a reply, the history rests with the turn's first entry midway down its
// view, older entries above it and empty space under a short turn; a turn
// too tall for the lower half rests higher so all of it shows, and one
// taller than the view rests just under the top. A reader scrolled up to
// older entries is not moved (#221), focus goes to the turn's first entry,
// and a reload shows the latest turn the same way. Nothing scrolls sideways.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { ratTunnels } from "./fixtures/modules.mjs";
import {
  clickAction,
  createAndStart,
  settled,
} from "./fixtures/browser-journey.mjs";
import {
  assertNoSideScroll,
  launch,
  narratingDm,
  say,
} from "./fixtures/session-layout.mjs";

const WIDTHS = [
  { width: 1880, height: 1000 },
  { width: 1280, height: 760 },
  { width: 900, height: 560 },
];

const room = (id) => ratTunnels.rooms.find((each) => each.id === id);

const nextFrame = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );

/**
 * Where the newest entry, the turn, sits in the log's view: its top, its
 * height and the view's, whether an older entry shows above it, its first
 * line, and whether it has focus.
 */
const turnView = async (page) => {
  await nextFrame(page);
  return page.evaluate(() => {
    const log = document.getElementById("log");
    const port = log.getBoundingClientRect();
    const entries = [...log.children];
    const box = entries.at(-1).getBoundingClientRect();
    return {
      top: Math.round(box.top - port.top),
      height: Math.round(box.height),
      view: log.clientHeight,
      olderShown:
        entries.length > 1 &&
        entries.at(-2).getBoundingClientRect().bottom > port.top + 1,
      firstLine: entries.at(-1).innerText.trim().split("\n")[0],
      focused: document.activeElement === entries.at(-1),
      scrollTop: log.scrollTop,
    };
  });
};

/**
 * Asserts the turn rests where it should: its start midway down the view,
 * higher so all of it fits, but never nearer the top than 8 px; with older
 * entries above it whenever it rests clear of the top.
 */
function assertRests(view, label) {
  const at = Math.max(8, Math.min(view.view / 2, view.view - view.height - 8));
  assert.ok(
    Math.abs(view.top - at) <= 2,
    `${label}: rests at ${view.top}, not ${at} (${JSON.stringify(view)})`,
  );
  if (at > 40) {
    assert.equal(view.olderShown, true, `${label}: older entries above`);
  }
}

/**
 * The "What happened" panel (owner feedback on #529): framed, in the top
 * half of the history column, with the title and the log inside it and
 * nothing under it.
 */
const panel = (page) =>
  page.evaluate(() => {
    const column = document.getElementById("session-history");
    const frame = document.getElementById("history-panel");
    const outer = column.getBoundingClientRect();
    const box = frame.getBoundingClientRect();
    const style = getComputedStyle(frame);
    return {
      half: Math.abs(box.height - outer.height / 2) <= 2,
      atTop: Math.abs(box.top - outer.top) <= 2,
      border:
        style.borderTopStyle + " " + Number.parseFloat(style.borderTopWidth),
      holds: ["history-title", "log"].every((id) =>
        frame.contains(document.getElementById(id)),
      ),
      alone: column.children.length === 1,
    };
  });

/**
 * Scrolls the log to `top`, as a reader would, and waits for its event; a
 * log already there fires none.
 */
const scrollLog = (page, top) =>
  page.locator("#log").evaluate(
    (log, top) =>
      new Promise((resolve) => {
        const was = log.scrollTop;
        log.addEventListener("scroll", resolve, { once: true });
        log.scrollTop = top === "end" ? log.scrollHeight : top;
        if (log.scrollTop === was) {
          resolve();
        }
      }),
    top,
  );

test(
  "each new turn shows from its top, at every width and after a reload",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-529-"));
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
      const stair = room("stair-foot");
      const alcove = room("alcove");

      // The opening, the only entry, starts at the top of the view.
      const opening = await turnView(page);
      assert.equal(opening.top, 0);
      assert.ok(opening.firstLine.startsWith(stair.name), opening.firstLine);

      // In a history too short to scroll, the turn sits where it falls,
      // above the middle, under the opening.
      await say(page, "I wait and listen");
      const short = await turnView(page);
      assert.ok(short.top < short.view / 2, `short history: ${short.top}`);
      assert.equal(short.olderShown, true, "short history: opening above");
      assert.equal(short.scrollTop, 0);

      // A history long enough to scroll at every width.
      for (let turn = 0; turn < 8; turn += 1) {
        await say(page, `I wait and listen, turn ${turn + 1}`);
      }

      let here = stair;
      for (const viewport of WIDTHS) {
        await page.setViewportSize(viewport);
        const label = `${viewport.width}×${viewport.height}`;
        // Resized narrower, its entries re-wrapped, the last turn rests
        // again: the window resizing is not the reader scrolling away.
        assertRests(await turnView(page), `${label} resized`);
        assert.deepEqual(
          await panel(page),
          {
            half: true,
            atTop: true,
            border: "solid 1",
            holds: true,
            alone: true,
          },
          `${label}: the panel`,
        );
        // Moving: the arrival, its first line the room's name, rests with
        // focus on it.
        here = here === stair ? alcove : stair;
        await clickAction(page, "move", here.id);
        const arrived = await turnView(page);
        assertRests(arrived, `${label} arrival`);
        assert.ok(arrived.firstLine.startsWith(here.name), arrived.firstLine);
        assert.equal(arrived.focused, true, `${label}: focus on the arrival`);

        // A typed message and its reply: the message first.
        await say(page, `I look around, at ${viewport.width}`);
        const said = await turnView(page);
        assertRests(said, `${label} message`);
        assert.equal(
          said.firstLine,
          `You: I look around, at ${viewport.width}`,
        );
        await assertNoSideScroll(page, `${label}: no side scroll`);
      }

      // A turn taller than the column shows its start just under the top of
      // the view, resized or not.
      await page
        .locator("#log > li")
        .last()
        .evaluate((entry) => {
          entry.style.minHeight = "2000px";
        });
      await page.setViewportSize(WIDTHS[1]);
      const tall = await turnView(page);
      assertRests(tall, "tall turn");
      assert.ok(Math.abs(tall.top - 8) <= 2, `tall turn: ${tall.top}`);
      await page
        .locator("#log > li")
        .last()
        .evaluate((entry) => {
          entry.removeAttribute("style");
        });

      // A reader scrolled up a little from a short turn, to the entries
      // just before it, stays where they are (#221).
      const nearly = (await turnView(page)).scrollTop - 100;
      await scrollLog(page, nearly);
      // Sent without say(), which expects the newest entry on screen.
      await settled(page, async () => {
        await page.locator("#message").fill("I listen again");
        await page.locator("#message").press("Enter");
      });
      assert.equal((await turnView(page)).scrollTop, nearly, "near place kept");

      // So does one scrolled right up to the oldest entries, while focus
      // stays on the clicked button.
      assert.equal(here, alcove);
      await scrollLog(page, 0);
      await clickAction(page, "examine", "iron-chest");
      assert.equal((await turnView(page)).scrollTop, 0, "place kept");
      // Focus moving to the turn, as the clicked button goes, takes the
      // reader there: focus is never off screen.
      here = stair;
      await clickAction(page, "move", here.id);
      const taken = await turnView(page);
      assertRests(taken, "taken to the turn");
      assert.equal(taken.focused, true, "focus on the turn");

      // Back on the latest turn, the next one rests as before.
      await scrollLog(page, "end");
      await say(page, "I catch my breath");
      const again = await turnView(page);
      assertRests(again, "following again");

      // A reload shows the latest turn resting likewise.
      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      await page.locator("#log > li").first().waitFor();
      const reloaded = await turnView(page);
      assertRests(reloaded, "reload");
      await assertNoSideScroll(page, "no side scroll after a reload");
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
