// #480, browser → API → storage: the reply-ready tone is asked for once per
// reply to the player's action or message, and never for the history shown
// on reloading or rerunning; mute and volume are kept per browser; and with
// sound off no sound controls show and no sound file is fetched.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { lintelBarrow as barrow } from "./fixtures/modules.mjs";
import {
  clickAction,
  createFighter,
  settled,
  startAdventure,
} from "./fixtures/browser-journey.mjs";
import { launch, narratingDm } from "./fixtures/session-layout.mjs";

const serve = (libraryPath, options = {}) =>
  startFifthBrowserServer({
    libraryPath,
    seed: 0,
    adventures: [barrow],
    qualifies: () => true,
    dmModel: narratingDm(),
    ...options,
  });

/** The sounds the page has asked for since it loaded. */
const requested = (page) => page.evaluate(() => window.requestedSounds);

/** Every sound file the page fetches, as it fetches it. */
function soundFetches(page) {
  const fetched = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/sounds/")) {
      fetched.push(pathname);
    }
  });
  return fetched;
}

async function sendMessage(page, message) {
  await page.locator("#message").fill(message);
  await settled(page, () => page.locator("#send-message").click());
  await page.locator("#message:not([disabled])").waitFor();
}

async function withPage(work) {
  const directory = await mkdtemp(join(tmpdir(), "issue-480-browser-"));
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

test(
  "the reply-ready tone is asked for once per reply, never for history shown on reload or rerun",
  { timeout: 120000 },
  () =>
    withPage(async (page, libraryPath) => {
      let server = await serve(libraryPath);
      try {
        const fetched = soundFetches(page);
        await page.goto(server.url);
        await createFighter(page);
        await startAdventure(page, "lintel-barrow");
        // Starting the adventure is not a reply: its opening is silent.
        assert.deepEqual(await requested(page), []);

        const tone = page.waitForRequest((request) =>
          request.url().endsWith("/sounds/reply-ready.wav"),
        );
        await clickAction(page, "examine", "scratched-lintel");
        assert.deepEqual(await requested(page), ["reply-ready"]);
        // The tone's file is fetched to play it.
        await tone;
        assert.deepEqual(fetched, ["/sounds/reply-ready.wav"]);

        await sendMessage(page, "I listen at the barrow mouth.");
        assert.deepEqual(await requested(page), ["reply-ready", "reply-ready"]);

        await page.reload();
        await page.locator("#log li").first().waitFor();
        assert.equal(await page.locator("#log li").count(), 3);
        assert.deepEqual(await requested(page), []);

        // Ctrl+C and rerunning the same command: a new server on the library.
        await server.close();
        server = await serve(libraryPath);
        await page.goto(server.url);
        await page.locator("#characters .continue-adventure").click();
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#log li").nth(2).waitFor();
        assert.deepEqual(await requested(page), []);
      } finally {
        await server.close();
      }
    }),
);

test(
  "mute and volume are kept across reloads, and a muted reply fetches no sound",
  { timeout: 120000 },
  () =>
    withPage(async (page, libraryPath) => {
      const server = await serve(libraryPath);
      try {
        const fetched = soundFetches(page);
        await page.goto(server.url);
        const mute = page.locator("#sound-mute");
        const volume = page.locator("#sound-volume");
        // On every screen, on at a moderate volume to begin with.
        assert.equal(await mute.isVisible(), true);
        assert.equal(
          await page.getByRole("button", { name: "Mute sound" }).count(),
          1,
        );
        assert.equal(await mute.getAttribute("aria-pressed"), "false");
        assert.equal(await volume.inputValue(), "50");

        assert.equal(await mute.getAttribute("title"), "Mute sound");
        await mute.click();
        await volume.fill("20");
        assert.equal(await mute.getAttribute("aria-pressed"), "true");
        assert.equal(await mute.getAttribute("title"), "Unmute sound");
        await page.reload();
        await page.locator("#open-creation").waitFor();
        assert.equal(await mute.getAttribute("aria-pressed"), "true");
        assert.equal(await volume.inputValue(), "20");

        await createFighter(page);
        await startAdventure(page, "lintel-barrow");
        // The header still has them, in one bar, in an adventure.
        assert.equal(await mute.isVisible(), true);
        await clickAction(page, "examine", "scratched-lintel");
        assert.deepEqual(await requested(page), ["reply-ready"]);
        assert.deepEqual(fetched, []);

        await mute.click();
        await page.reload();
        await page.locator("#log li").first().waitFor();
        assert.equal(await mute.getAttribute("aria-pressed"), "false");
        assert.equal(await volume.inputValue(), "20");
      } finally {
        await server.close();
      }
    }),
);

test(
  "with sound off, no sound controls show and no sound file is fetched",
  { timeout: 120000 },
  () =>
    withPage(async (page, libraryPath) => {
      const server = await serve(libraryPath, { sound: false });
      try {
        const fetched = soundFetches(page);
        await page.goto(server.url);
        assert.equal(await page.locator("#sound-controls").count(), 0);
        await createFighter(page);
        await startAdventure(page, "lintel-barrow");
        await clickAction(page, "examine", "scratched-lintel");
        await sendMessage(page, "I listen at the barrow mouth.");
        assert.deepEqual(await requested(page), ["reply-ready", "reply-ready"]);
        assert.deepEqual(fetched, []);
      } finally {
        await server.close();
      }
    }),
);
