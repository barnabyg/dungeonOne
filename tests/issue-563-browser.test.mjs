// #563, browser → API: the map pop-up marks a visited rest site, names the
// mark and lists it in the key. The mark stays on the room once Ada has left
// it, and clears the room's name. With the long rest setting off there is no
// mark and no key entry.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { clickAction, createAndStart } from "./fixtures/browser-journey.mjs";
import { restingTunnelsFile, room } from "./fixtures/modules.mjs";
import { launch } from "./fixtures/session-layout.mjs";

/** The resting tunnels, with a name long enough to reach the mark's corner. */
const quiet = validateModule(
  (() => {
    const module = restingTunnelsFile();
    room(module, "alcove").name =
      "Alcove of Long-Forgotten Pilgrims' Offerings";
    return module;
  })(),
);
const MARK = "#map-canvas .map-mark.rest";
const KEY = "Rest site (long rest)";

async function journey(run) {
  const directory = await mkdtemp(join(tmpdir(), "issue-563-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [quiet],
    // Fixtures are engine material, not gated content.
    qualifies: () => true,
    libraryPath: join(directory, "characters.json"),
    seed: 1,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
  });
  page.setDefaultTimeout(5000);
  try {
    await run(page, server.url);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

const key = (page) => page.locator("#map-key li").allInnerTexts();

test(
  "a visited rest site is marked on the map, and in its key",
  { timeout: 120000 },
  () =>
    journey(async (page, url) => {
      await createAndStart(page, url, "resting-tunnels");

      // Not yet visited, the alcove is not marked, though the key lists the mark.
      await page.locator("#open-map").click();
      assert.equal(await page.locator(MARK).count(), 0);
      assert.ok((await key(page)).some((entry) => entry.includes(KEY)));
      await page.locator("#close-map").click();

      await clickAction(page, "move", "alcove");
      await page.locator("#open-map").click();
      const mark = page.locator(`.map-room[data-room='alcove'] .map-mark.rest`);
      assert.equal(await mark.getAttribute("role"), "img");
      assert.equal(await mark.getAttribute("aria-label"), "Rest site");
      assert.equal(await mark.getAttribute("title"), "Rest site");
      assert.equal(await page.locator(MARK).count(), 1);

      // The mark clears the room's name and "You are here".
      const clear = await page
        .locator(".map-room[data-room='alcove']")
        .evaluate((box) => {
          const { left } = box
            .querySelector(".map-mark.rest")
            .getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(box.querySelector("button"));
          return [...range.getClientRects()].every(
            ({ right }) => right <= left,
          );
        });
      assert.equal(clear, true);
      await page.locator("#close-map").click();

      // It stays once she has left the room.
      await clickAction(page, "move", "stair-foot");
      await page.locator("#open-map").click();
      assert.equal(await mark.count(), 1);
    }),
);

test(
  "with the long rest setting off the map has no mark and no key entry",
  { timeout: 120000 },
  () =>
    journey(async (page, url) => {
      await page.goto(url);
      await page.locator("#open-settings").click();
      await page.locator("#setting-longRest-off").check();
      await page.locator("#feedback").filter({ hasText: "Saved." }).waitFor();

      await createAndStart(page, url, "resting-tunnels");
      await clickAction(page, "move", "alcove");
      await page.locator("#open-map").click();
      assert.equal(await page.locator(MARK).count(), 0);
      assert.equal(
        (await key(page)).some((entry) => entry.includes(KEY)),
        false,
      );
    }),
);
