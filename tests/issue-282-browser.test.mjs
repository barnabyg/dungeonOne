// #282, browser → API → storage: a failed force brings the ceiling down
// across a doorway, the room's exits show the way closed, and after a
// reload and a restart the passage is still closed.
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
import { sessionFile } from "./fixtures/save-files.mjs";
import { shiftingOssuary } from "./fixtures/modules.mjs";

/** Whether forcing the rotten door, first thing in the hall, fails on `seed`. */
function forceFails(seed) {
  const runtime = createFifthRuntime(shiftingOssuary, firstFighter(seed));
  const random = createSeededRandom(sessionSeed(seed, 1));
  let state = runtime.createSession();
  for (const action of [
    { type: "begin" },
    { type: "move", destinationId: "bone-hall" },
    { type: "force", doorId: "rotten-door" },
  ]) {
    state = runtime.handleAction(state, action, random).state;
  }
  return state.openedDoorIds.length === 0;
}

const shown = (page) =>
  page.evaluate(() => ({
    exits: document.getElementById("exits").innerText,
    go: [...document.querySelectorAll('button[data-action="move"]')].map(
      (button) =>
        button.getAttribute("aria-label") +
        (button.disabled
          ? " " +
            document.getElementById(button.getAttribute("aria-describedby"))
              .textContent
          : ""),
    ),
    log: document.getElementById("log").textContent,
  }));

test(
  "a failed check closes a passage, and it stays closed after a reload and a restart",
  { timeout: 120000 },
  async () => {
    let seed = 0;
    while (!forceFails(seed)) {
      seed += 1;
    }
    const directory = await mkdtemp(join(tmpdir(), "issue-282-"));
    const libraryPath = join(directory, "characters.json");
    const options = {
      adventures: [shiftingOssuary],
      libraryPath,
      qualifies: () => true,
    };
    let server = await startFifthBrowserServer({ ...options, seed });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 360, height: 740 },
    });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "shifting-ossuary");
      await clickAction(page, "move", "bone-hall");
      let screen = await shown(page);
      assert.doesNotMatch(screen.exits, /The way is closed/);
      assert.ok(screen.go.includes("Go to Side Crypt Door shut"));

      await clickAction(page, "force", "rotten-door");
      assert.match(
        await page.locator("#log li").last().textContent(),
        /The sagging frame gives way.*The way to the Side Crypt is closed\./,
      );
      screen = await shown(page);
      assert.match(
        screen.exits,
        /Side Crypt — A low door\.\n+The way is closed\.$/,
      );
      assert.ok(screen.go.includes("Go to Side Crypt Way closed"));
      assert.equal(
        await page.locator('button[data-target="rotten-door"]').count(),
        0,
      );

      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await shown(page), screen);

      await server.close();
      server = await startFifthBrowserServer({ ...options, seed: seed + 1 });
      const file = await sessionFile(directory);
      await page.goto(`${server.url}/#adventure-${file.id}`);
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await shown(page), screen);
      assert.deepEqual(file.state.checks, [
        { id: "force:rotten-door", band: "failure" },
      ]);
      await assertNoSideScroll(page, "no horizontal scroll at phone width");
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
