import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { CharacterCareer } from "../dist/character-career.js";
import { SaveSession } from "../dist/save.js";
import { startBrowserServer } from "../dist/browser-server.js";
import { browserActions } from "../dist/browser-actions.js";
import {
  beaconExamine,
  stonebridgePeaceful,
  commandCall,
} from "./fixtures/character-journeys.mjs";

test(
  "the real browser carries a character through two modules, level changes and historical Review",
  { timeout: 90000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "character-ui-journey-"));
    const career = new CharacterCareer(join(directory, "characters.json"));
    let calls = 0;
    const model = {
      async respond(request) {
        calls++;
        if ("reply" in request) {
          return {
            text: JSON.stringify({
              delivery: "steady",
              opening: "none",
              closing: "none",
              factIds: request.reply.approvedFacts.map(({ id }) => id),
            }),
          };
        }
        if (request.toolResults.length) {
          return { text: "Your action is recorded below." };
        }
        const data = await career.library.read();
        const session = await SaveSession.load(
          career.sessionPath(data.selectedSessionId),
        );
        const action = browserActions(session, "journey").find(
          ({ message }) => message === request.playerInput,
        );
        return action
          ? { toolCalls: [{ id: "journey-action", ...action.call }] }
          : { text: "Choose an offered action." };
      },
    };
    const server = await startBrowserServer({
      contentVersion: "11",
      libraryPath: career.library.path,
      savePath: join(directory, "legacy.json"),
      seed: 42,
      apiKey: "offline",
      dmModel: model,
    });
    const browser = await chromium.launch(
      process.platform === "win32"
        ? { channel: "msedge", headless: true }
        : { headless: true },
    );
    const page = await browser.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const view = async () => (await fetch(server.url + "/api/state")).json();
    const library = async () =>
      (await fetch(server.url + "/api/characters")).json();
    async function offered(command) {
      const expected = commandCall(command);
      const before = await view();
      const action = before.actions.find(
        ({ call }) =>
          call.name === expected.name &&
          JSON.stringify(JSON.parse(call.argumentsJson)) ===
            JSON.stringify(expected.arguments),
      );
      assert.ok(action, command + " must be offered");
      const response = page.waitForResponse((result) =>
        result.url().endsWith("/api/turn"),
      );
      await page.locator("#message").fill(action.message);
      await page.locator("#message").press("Enter");
      const result = await (await response).json();
      assert.equal(result.committed, true, command + ": " + result.error);
      await page.waitForFunction(
        () =>
          document.getElementById("conversation").getAttribute("aria-busy") ===
          "false",
      );
      return result;
    }
    async function openLibrary() {
      await page.locator("#open-characters").click();
    }
    try {
      await page.goto(server.url);
      await openLibrary();
      await page.locator("#show-create-character").click();
      await page.locator("#character-name").fill("Ada");
      await page.locator("#create-character button[type=submit]").click();
      await page
        .locator("#library-feedback")
        .filter({ hasText: "Character saved" })
        .waitFor();
      assert.equal(calls, 0);
      assert.equal((await library()).sessions.length, 0);
      await page
        .locator("#library-adventures button")
        .filter({ hasText: "Start Hollow" })
        .click();
      await page.locator("#character-library").waitFor({ state: "hidden" });
      const first = await view();
      await page.locator("#open-character").click();
      assert.match(
        await page.locator("#information-body").innerText(),
        /strength: 14 \(\+1\)/,
      );
      assert.equal(calls, 0);
      await page.locator("#close-information").click();
      let completion;
      for (const command of beaconExamine) {
        completion = await offered(command);
      }
      assert.match(
        completion.cards.map(({ text }) => text).join(" "),
        /Level 1 → 2/,
      );
      assert.equal((await library()).characters[0].sheet.level, 2);
      const savedCareer = await readFile(career.library.path, "utf8");
      const savedFirst = await readFile(
        career.sessionPath((await career.library.read()).sessions[0].id),
        "utf8",
      );
      const completedCalls = calls;
      await page.reload();
      await page.locator("#completion").waitFor({ state: "visible" });
      await page.locator("#open-character").click();
      assert.match(
        await page.locator("#information-body").innerText(),
        /XP: 1000/,
      );
      assert.equal(calls, completedCalls);
      assert.equal(await readFile(career.library.path, "utf8"), savedCareer);
      assert.equal(
        await readFile(
          career.sessionPath((await career.library.read()).sessions[0].id),
          "utf8",
        ),
        savedFirst,
      );
      await openLibrary();
      await page
        .locator("#library-characters button")
        .filter({ hasText: "Ada" })
        .click();
      await page
        .locator("#library-adventures button")
        .filter({ hasText: "Rest between" })
        .click();
      await page
        .locator("#library-adventures button")
        .filter({ hasText: "Start Stonebridge" })
        .waitFor();
      assert.match(
        await page.locator("#library-adventures").innerText(),
        /Recommended levels 2–3/,
      );
      await page
        .locator("#library-adventures button")
        .filter({ hasText: "Start Stonebridge" })
        .click();
      await page.locator("#character-library").waitFor({ state: "hidden" });
      assert.equal((await view()).character.sheet.level, 2);
      for (const command of stonebridgePeaceful) {
        completion = await offered(command);
      }
      assert.match(
        completion.cards.map(({ text }) => text).join(" "),
        /Level 2 → 3/,
      );
      const data = await library();
      assert.equal(data.characters[0].sheet.xp, 2500);
      assert.equal(data.characters[0].sheet.level, 3);
      const advanced = data.characters[0].sheet;
      const stale = await fetch(server.url + "/api/turn", {
        method: "POST",
        headers: { Origin: server.url },
        body: JSON.stringify({
          revision: first.revision,
          message: "Invent another level",
        }),
      });
      assert.equal(stale.status, 409);
      await openLibrary();
      await page
        .locator("#library-sessions button")
        .filter({ hasText: "Hollow" })
        .click();
      await page.locator("#character-library").waitFor({ state: "hidden" });
      assert.equal((await view()).character.sheet.level, 2);
      assert.deepEqual((await library()).characters[0].sheet, advanced);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
