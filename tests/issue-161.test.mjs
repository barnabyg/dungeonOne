// #161: the session view says whether the AI DM is available. Without it the
// composer is disabled up front with a player notice, and the setup hint goes
// to the launcher's terminal output. A draft belongs to its adventure session.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  FIFTH_DM_SETUP_HINT,
  startFifthBrowserServer,
} from "../dist/browser-5e-server.js";
import { loneGoblin } from "./fixtures/modules.mjs";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

const NOTICE = "Typing to the Dungeon Master is off. Use the buttons.";

/** A scripted AI DM that answers every message with narration. */
const narratingDm = () => ({
  async respond() {
    return { text: "The goblin watches you." };
  },
});

async function api(url, path, body) {
  const response = await fetch(url + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Origin: url },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

/** Creates a Fighter and starts the cellar goblin adventure over the API. */
async function startOverApi(url) {
  let library = (await api(url, "/api/5e/creation", {})).body;
  library = (
    await api(url, "/api/5e/characters", {
      revision: library.revision,
      name: "Ada",
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
      kit: "mace",
      masteries: ["dagger", "mace", "shortsword"],
    })
  ).body;
  const started = await api(url, "/api/5e/adventures/start", {
    revision: library.revision,
    characterId: library.characters[0].sheet.id,
    adventureId: "lone-goblin",
  });
  assert.equal(started.status, 200);
  return started.body.session;
}

async function withServer(options, run) {
  const directory = await mkdtemp(join(tmpdir(), "issue-161-"));
  const server = await startFifthBrowserServer({
    adventures: [loneGoblin],
    libraryPath: join(directory, "characters.json"),
    seed: 4,
    ...options,
  });
  try {
    await run(server);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("without a key the session view says the AI DM is off, and messages are still refused", () =>
  withServer({ apiKey: "  " }, async (server) => {
    assert.equal(server.dmAvailable, false);
    const session = await startOverApi(server.url);
    assert.equal(session.dmAvailable, false);
    const reopened = await api(server.url, "/api/5e/session", {
      sessionId: session.id,
    });
    assert.equal(reopened.body.session.dmAvailable, false);
    const refused = await api(server.url, "/api/5e/session/message", {
      sessionId: session.id,
      sequence: session.sequence,
      message: "attack the goblin",
    });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, NOTICE);
    assert.doesNotMatch(refused.body.error, /OPENAI_API_KEY/);
  }));

test("with a DM model the session view says the AI DM is available", () =>
  withServer({ dmModel: narratingDm() }, async (server) => {
    assert.equal(server.dmAvailable, true);
    const session = await startOverApi(server.url);
    assert.equal(session.dmAvailable, true);
    const sent = await api(server.url, "/api/5e/session/message", {
      sessionId: session.id,
      sequence: session.sequence,
      message: "I look around",
    });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.session.dmAvailable, true);
  }));

test("the launcher's setup hint names the key and the restart", () => {
  assert.match(FIFTH_DM_SETUP_HINT, /OPENAI_API_KEY/);
  assert.match(FIFTH_DM_SETUP_HINT, /restart/i);
  assert.ok(FIFTH_DM_SETUP_HINT.endsWith("\n"));
});

async function createAndStart(page, name) {
  await page.locator("#open-creation").click();
  await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
  await page.locator("#character-name").fill(name);
  await page.locator("#save-character").click();
  await page.locator("#sheet-name").filter({ hasText: name }).waitFor();
  await page.locator('.start-adventure[data-adventure="lone-goblin"]').click();
  await page.locator("#adventure").waitFor({ state: "visible" });
}

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  const size = `${viewport.width}x${viewport.height}`;

  test(`${size}: without a key the composer is disabled with a notice and the buttons work`, () =>
    withServer({ apiKey: "" }, async (server) => {
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await page.goto(server.url);
        await createAndStart(page, "Ada");
        assert.equal(await page.locator("#message").isDisabled(), true);
        assert.equal(await page.locator("#send-message").isDisabled(), true);
        const notice = page.locator("#dm-notice");
        assert.equal(await notice.isVisible(), true);
        assert.equal(await notice.textContent(), NOTICE);
        assert.equal(
          await page.locator("#message").getAttribute("aria-describedby"),
          "dm-notice",
        );
        assert.doesNotMatch(
          await page.locator("#adventure").textContent(),
          /OPENAI_API_KEY/,
        );
        // The buttons still play: an attack adds a result to the history.
        const before = await page.locator("#log li").count();
        await page.locator("#attack-controls button.attack").click();
        await page.waitForFunction(
          (count) => document.querySelectorAll("#log li").length > count,
          before,
        );
        assert.equal(await page.locator("#message").isDisabled(), true);
        assert.equal(await page.locator("#adventure-error").textContent(), "");
      } finally {
        await browser.close();
      }
    }));

  test(`${size}: with the scripted DM the composer is enabled and a draft stays with its session`, () =>
    withServer({ dmModel: narratingDm() }, async (server) => {
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await page.goto(server.url);
        await createAndStart(page, "Ada");
        assert.equal(await page.locator("#message").isEnabled(), true);
        assert.equal(await page.locator("#send-message").isEnabled(), true);
        assert.equal(await page.locator("#dm-notice").isVisible(), false);
        assert.equal(
          await page.locator("#message").getAttribute("aria-describedby"),
          null,
        );
        // A message reaches the DM.
        await page.locator("#message").fill("I look around");
        await page.locator("#send-message").click();
        await page
          .locator("#log")
          .filter({ hasText: "The goblin watches you." })
          .waitFor();

        // Ada's adventure has a draft; Bea's adventure starts empty.
        await page.locator("#message").fill("Ada's unsent plan");
        await page.locator('#breadcrumb a[data-view="library"]').click();
        await createAndStart(page, "Bea");
        assert.equal(await page.locator("#message").inputValue(), "");

        // Bea's draft does not follow the player back into Ada's adventure.
        await page.locator("#message").fill("Bea's unsent plan");
        await page.locator('#breadcrumb a[data-view="library"]').click();
        await page.locator("#characters button", { hasText: "Ada" }).click();
        await page.locator("#continue-adventure").click();
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#adventure-title").waitFor();
        assert.equal(await page.locator("#message").inputValue(), "");
      } finally {
        await browser.close();
      }
    }));
}
