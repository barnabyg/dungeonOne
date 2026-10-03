import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { CharacterCareer } from "../dist/character-career.js";
import { SaveSession } from "../dist/save.js";
import { startBrowserServer } from "../dist/browser-server.js";
import { browserActions } from "../dist/browser-actions.js";
import { createCharacter } from "../dist/character-rules.js";
import { beaconExamine, commandCall } from "./fixtures/character-journeys.mjs";

test(
  "the browser shows treasure found, kept on completion and carried in the library (#119)",
  { timeout: 90000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-119-browser-"));
    const career = new CharacterCareer(join(directory, "characters.json"));
    // A scripted DM that selects the offered action the player typed.
    const model = {
      async respond(request) {
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
        const action = browserActions(session, "treasure").find(
          ({ message }) => message === request.playerInput,
        );
        return action
          ? { toolCalls: [{ id: "treasure-action", ...action.call }] }
          : { text: "Choose an offered action." };
      },
    };
    // Seed 42: a level 1 balanced Fighter beats the ridge raider.
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
    async function offered(command) {
      const expected = commandCall(command);
      const action = (await view()).actions.find(
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
      return result.cards.map(({ text }) => text).join(" ");
    }
    const characterPanel = async () => {
      await page.locator("#open-character").click();
      const text = await page.locator("#information-body").innerText();
      await page.locator("#close-information").click();
      return text;
    };
    try {
      await page.goto(server.url);
      await page.locator("#open-characters").click();
      await page.locator("#character-name").fill("Ada");
      await page.locator("#create-character button[type=submit]").click();
      await page
        .locator("#library-feedback")
        .filter({ hasText: "Character saved" })
        .waitFor();
      assert.match(
        await page.locator("#library-sheet-treasure").innerText(),
        /Treasure: nothing yet/,
      );
      await page
        .locator("#library-adventures button")
        .filter({ hasText: "Start Hollow" })
        .click();
      await page.locator("#character-library").waitFor({ state: "hidden" });

      let cards = await offered("move ridge-trail");
      while ((await view()).scene.combatStatus !== "No active combat.") {
        cards += await offered("attack ridge-raider");
      }
      // Defeating the raider awards nothing; its belongings hold the loot.
      assert.doesNotMatch(cards, /silver/);
      assert.match(
        await offered("examine supply-sack"),
        /The raider's purse holds 4 silver, and you take it\./,
      );
      assert.match(
        await characterPanel(),
        /Found this adventure: 4 silver — yours if you finish alive/,
      );
      assert.match(
        await offered("take healing-draught"),
        /You can keep the healing draught/,
      );
      await offered("move watch-yard");
      let completion = "";
      for (const command of beaconExamine) {
        completion = await offered(command);
      }
      assert.match(completion, /The tower runner presses 10 silver/);
      assert.match(completion, /Treasure kept: 14 silver, healing draught\./);
      assert.match(await characterPanel(), /Silver: 14/);

      await page.locator("#open-characters").click();
      await page.locator("#character-library").waitFor({ state: "visible" });
      await page
        .locator("#library-sheet-treasure")
        .filter({ hasText: "Treasure: 14 silver, healing draught" })
        .waitFor();
      assert.match(
        await page.locator("#library-characters").innerText(),
        /14 silver/,
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("the library marks older characters as unable to carry treasure and never lists drops (#119)", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-119-api-"));
  const libraryPath = join(directory, "characters.json");
  const sheet = createCharacter("Bram", "stout", "b".repeat(32));
  await writeFile(
    libraryPath,
    JSON.stringify({
      kind: "dungeon-one-characters",
      formatVersion: 1,
      revision: "1".repeat(32),
      characters: [
        {
          sheet,
          revision: 1,
          availability: "ready",
          earnedRewards: [],
          acceptedReceipts: [],
        },
      ],
      sessions: [],
    }),
  );
  const server = await startBrowserServer({
    contentVersion: "11",
    libraryPath,
    savePath: join(directory, "legacy.json"),
    seed: 0,
    apiKey: "",
  });
  try {
    const library = await (await fetch(server.url + "/api/characters")).json();
    assert.equal(library.characters[0].sheet.rulesVersion, "fighter-rules-v1");
    assert.equal("treasure" in library.characters[0], false);
    assert.ok(library.adventures.length > 0);
    for (const adventure of library.adventures) {
      assert.equal("treasure" in adventure, false, adventure.id);
    }
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
