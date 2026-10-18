// #510, browser → storage: the Settings page's sound on/off and volume and
// the header's mute button and slider stay in step, live and across reloads,
// and a mute from the Settings page applies at once to the adventure under
// way; with sound off for the launch the page says so and has no sound
// controls. The DM model is listed at its default, gpt-6-luna.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { obstacleYard } from "./fixtures/modules.mjs";
import {
  createFighter,
  settled,
  startAdventure,
} from "./fixtures/browser-journey.mjs";
import { launch, narratingDm } from "./fixtures/session-layout.mjs";

const serve = (libraryPath, options = {}) =>
  startFifthBrowserServer({
    libraryPath,
    seed: 0,
    adventures: [obstacleYard],
    qualifies: () => true,
    dmModel: narratingDm(),
    ...options,
  });

async function withPage(work) {
  const directory = await mkdtemp(join(tmpdir(), "issue-510-browser-"));
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
  });
  page.setDefaultTimeout(8000);
  try {
    await work(page, join(directory, "characters.json"));
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
}

/** Opens the Settings page from the header and waits for its settings. */
async function openSettings(page) {
  await page.locator("#open-settings").click();
  await page.locator("#settings-title").waitFor();
  await page.locator("#setting-dmModel").waitFor();
}

test(
  "the Settings page's sound and the header's stay in step, live and across reloads, and a mute there applies at once",
  { timeout: 120000 },
  () =>
    withPage(async (page, libraryPath) => {
      const server = await serve(libraryPath);
      try {
        const fetched = [];
        page.on("request", (request) => {
          if (new URL(request.url()).pathname.startsWith("/sounds/")) {
            fetched.push(request.url());
          }
        });
        await page.goto(server.url);
        await openSettings(page);
        const mute = page.locator("#sound-mute");
        const volume = page.locator("#sound-volume");
        const soundOn = page.locator("#settings-sound-on");
        const pageVolume = page.locator("#settings-sound-volume");
        const shown = page.locator("#settings-sound-volume-value");
        assert.equal(
          await page.locator("#settings-sound legend").textContent(),
          "Sound",
        );
        // On at a moderate volume to begin with, as in the header.
        assert.equal(await soundOn.isChecked(), true);
        assert.equal(await pageVolume.inputValue(), "50");
        assert.equal(await shown.textContent(), "50%");
        // The DM model, listed at its default.
        const model = page.locator("#setting-dmModel-gpt-6-luna");
        assert.equal(await model.isChecked(), true);
        assert.equal(
          (await page.locator("label", { has: model }).textContent()).trim(),
          "gpt-6-luna Default",
        );

        // The Settings page changes the header's controls, and back.
        await soundOn.uncheck();
        await pageVolume.fill("30");
        assert.equal(await mute.getAttribute("aria-pressed"), "true");
        assert.equal(await volume.inputValue(), "30");
        assert.equal(await shown.textContent(), "30%");
        await mute.click();
        await volume.fill("70");
        assert.equal(await soundOn.isChecked(), true);
        assert.equal(await pageVolume.inputValue(), "70");
        assert.equal(await shown.textContent(), "70%");

        // Kept by the browser, not the settings file.
        await soundOn.uncheck();
        await page.reload();
        await page.locator("#setting-dmModel").waitFor();
        assert.equal(await soundOn.isChecked(), false);
        assert.equal(await pageVolume.inputValue(), "70");
        assert.equal(await mute.getAttribute("aria-pressed"), "true");
        assert.equal(await volume.inputValue(), "70");

        // During an adventure a change there applies at once: muted on the
        // Settings page, the next answer fetches no sound.
        await page.goto(server.url);
        await createFighter(page);
        await startAdventure(page, "obstacle-yard");
        await openSettings(page);
        assert.equal(
          await page.locator("#settings-in-progress").isVisible(),
          true,
        );
        await soundOn.check();
        assert.equal(await mute.getAttribute("aria-pressed"), "false");
        await soundOn.uncheck();
        await page.goBack();
        await page.locator("#action-bar").waitFor();
        await settled(page, () =>
          page
            .locator(
              '#action-bar button[data-target="crumbling-wall"][data-approach="athletics"]',
            )
            .click(),
        );
        assert.deepEqual(await page.evaluate(() => window.requestedSounds), [
          "dice",
          "success",
        ]);
        assert.deepEqual(fetched, []);
      } finally {
        await server.close();
      }
    }),
);

test(
  "with sound off for the launch, the Settings page says so and has no sound controls",
  { timeout: 120000 },
  () =>
    withPage(async (page, libraryPath) => {
      const server = await serve(libraryPath, { sound: false });
      try {
        await page.goto(server.url);
        await openSettings(page);
        assert.equal(
          await page.locator("#settings-sound-text").textContent(),
          "Sound is off for this launch. To have sound, restart the game without --no-sound.",
        );
        assert.equal(
          await page.locator("#settings input[type=checkbox]").count(),
          0,
        );
        assert.equal(await page.locator("input[type=range]").count(), 0);
        assert.equal(await page.locator("#sound-controls").count(), 0);
      } finally {
        await server.close();
      }
    }),
);
