// #529, browser → API: each new turn shows from its top. After an action or
// a reply, the history rests with the turn's first entry at the top of its
// view, older entries scrolled up out of sight and empty space under a short
// turn; a taller turn shows its start. A reader scrolled up to older entries
// is not moved (#221), focus goes to the turn's first entry, and a reload
// shows the latest turn from its top. Nothing scrolls sideways.
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
 * Where the newest entry, the turn, sits in the log's view: its top and
 * the space under it, whether every older entry is out of sight above, its
 * first line, and whether it has focus.
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
      below: Math.round(port.bottom - box.bottom),
      olderHidden: entries
        .slice(0, -1)
        .every((entry) => entry.getBoundingClientRect().bottom <= port.top + 1),
      firstLine: entries.at(-1).innerText.trim().split("\n")[0],
      focused: document.activeElement === entries.at(-1),
      scrollTop: log.scrollTop,
    };
  });
};

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

      // In a history shorter than the column, the turn still rests at the
      // top, the opening scrolled out of sight above it.
      await say(page, "I wait and listen");
      const short = await turnView(page);
      assert.ok(Math.abs(short.top) <= 2, `short history: ${short.top}`);
      assert.equal(short.olderHidden, true, "short history: older hidden");

      // A history long enough to scroll at every width.
      for (let turn = 0; turn < 8; turn += 1) {
        await say(page, `I wait and listen, turn ${turn + 1}`);
      }

      let here = stair;
      for (const viewport of WIDTHS) {
        await page.setViewportSize(viewport);
        const label = `${viewport.width}×${viewport.height}`;
        // Moving: the arrival's first line, the room's name, at the top,
        // older entries out of sight, focus on the arrival.
        here = here === stair ? alcove : stair;
        await clickAction(page, "move", here.id);
        const arrived = await turnView(page);
        assert.ok(Math.abs(arrived.top) <= 2, `${label}: ${arrived.top}`);
        assert.ok(arrived.firstLine.startsWith(here.name), arrived.firstLine);
        assert.equal(arrived.olderHidden, true, `${label}: older hidden`);
        assert.equal(arrived.focused, true, `${label}: focus on the arrival`);
        // A short turn leaves space under it rather than older entries.
        assert.ok(arrived.below > 40, `${label}: ${arrived.below} px below`);

        // A typed message and its reply: the message at the top.
        await say(page, `I look around, at ${viewport.width}`);
        const said = await turnView(page);
        assert.ok(Math.abs(said.top) <= 2, `${label}: ${said.top}`);
        assert.equal(
          said.firstLine,
          `You: I look around, at ${viewport.width}`,
        );
        assert.equal(said.olderHidden, true, `${label}: older hidden`);
        await assertNoSideScroll(page, `${label}: no side scroll`);
      }

      // A turn taller than the column shows its start, resized or not.
      await page
        .locator("#log > li")
        .last()
        .evaluate((entry) => {
          entry.style.minHeight = "2000px";
        });
      await page.setViewportSize(WIDTHS[1]);
      const tall = await turnView(page);
      assert.ok(Math.abs(tall.top) <= 2, `tall turn: ${tall.top}`);
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
      assert.ok(Math.abs(taken.top) <= 2, `taken to the turn: ${taken.top}`);
      assert.equal(taken.focused, true, "focus on the turn");

      // Back on the latest turn, the next one shows from its top again.
      await scrollLog(page, "end");
      await say(page, "I catch my breath");
      const again = await turnView(page);
      assert.ok(Math.abs(again.top) <= 2, `following again: ${again.top}`);

      // A reload shows the latest turn from its top.
      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      await page.locator("#log > li").first().waitFor();
      const reloaded = await turnView(page);
      assert.ok(Math.abs(reloaded.top) <= 2, `reload: ${reloaded.top}`);
      assert.equal(reloaded.olderHidden, true, "reload: older hidden");
      await assertNoSideScroll(page, "no side scroll after a reload");
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
