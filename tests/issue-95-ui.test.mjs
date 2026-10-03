// Fixes for the first issue 95 playtest
// (docs/acceptance/issue-95-sessions/player-01.md): click options and the
// character-mode page explain themselves in plain language.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadAdventure } from "../dist/adventure-loader.js";
import { chromium } from "playwright";
import { browserActions } from "../dist/browser-actions.js";
import { BROWSER_START_VERSION } from "../dist/browser-releases.js";
import { startBrowserServer } from "../dist/browser-server.js";
import { createCharacter } from "../dist/character-rules.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { SaveSession } from "../dist/save.js";
import { launchScriptedServer } from "./fixtures/scripted-server-process.mjs";

const adventure = async (file) =>
  loadAdventure(
    await readFile(
      fileURLToPath(new URL(`../adventures/${file}`, import.meta.url)),
    ),
  ).adventure;

async function withSession(file, commands, body) {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-95-ui-"));
  try {
    const runtime = createDataRuntime(
      await adventure(file),
      createCharacter("Ada", "balanced"),
    );
    const session = await SaveSession.start(
      join(directory, "save.json"),
      runtime,
      0,
    );
    for (const command of commands) {
      await session.commit(command, runtime.parseCommand(command));
    }
    await body(browserActions(session, "test"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const V13 = "hollow-beacon-examine.json";

test("character mode: a person you are not fighting offers no Attack click", () =>
  withSession(V13, [], (actions) => {
    const iona = actions.filter(({ contextId }) => contextId === "npc:iona");
    assert.ok(iona.length > 0);
    assert.ok(!iona.some(({ call }) => call.name === "attack"));
  }));

test("character mode: an ability check is offered as a plain one-try roll", () =>
  withSession(V13, [], (actions) => {
    const check = actions.find(
      ({ call }) =>
        call.name === "check_ability" &&
        JSON.parse(call.argumentsJson).checkId === "read-beacon",
    );
    assert.equal(check.label, "Roll Wisdom");
    // The message the AI receives is unchanged.
    assert.equal(check.message, "Try the wisdom check at beacon lamp");
    assert.doesNotMatch(check.stakes, /DC|pending|preserves|once per/);
    assert.match(check.stakes, /d20/);
    assert.match(check.stakes, /12 or more/);
    assert.match(check.stakes, /one try/i);
    assert.match(check.stakes, /20 XP/);
  }));

test("character mode: a route with a fight on arrival names the route", () =>
  withSession(V13, [], (actions) => {
    const ridge = actions.find(
      ({ call }) =>
        call.name === "move" &&
        JSON.parse(call.argumentsJson).destinationId === "ridge-trail",
    );
    assert.match(ridge.stakes, /reach Ridge Trail,/);
    assert.match(ridge.stakes, /fight/);
    assert.doesNotMatch(ridge.stakes, /Combat on arrival/);
  }));

test("character mode: the opponent you are fighting can still be attacked by click", () =>
  withSession(
    V13,
    [
      "move valley-road",
      "move ridge-shelter",
      "move drainage-walk",
      "move beacon-tower",
      "attack vey",
    ],
    (actions) => {
      assert.ok(
        actions.some(
          ({ call }) =>
            call.name === "attack" &&
            JSON.parse(call.argumentsJson).opponent_id === "vey",
        ),
      );
    },
  ));

test("--legacy content keeps its released options", () =>
  withSession("hollow-beacon-finale.json", [], (actions) => {
    assert.ok(
      actions.some(
        ({ contextId, call }) =>
          contextId === "npc:iona" && call.name === "attack",
      ),
    );
  }));

test(
  "a real browser shows a welcome, a structured library, a disabled empty save, XP and the story opening",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-95-page-"));
    const server = await startBrowserServer({
      contentVersion: BROWSER_START_VERSION,
      libraryPath: join(directory, "characters.json"),
      savePath: join(directory, "unused-slot.json"),
      seed: 0,
      apiKey: "offline",
      dmModel: {
        respond() {
          throw new Error("No provider call is expected.");
        },
      },
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
    try {
      await page.goto(server.url);
      await page
        .locator("#conversation")
        .filter({ hasText: "Getting started" })
        .waitFor();
      assert.equal(
        await page.locator("#scene-title").innerText(),
        "Welcome to Dungeon One",
      );
      assert.equal(
        await page.locator("#open-characters").innerText(),
        "Adventures",
      );
      assert.equal(
        await page.locator("#open-character").innerText(),
        "Character sheet",
      );

      await page.locator("#open-characters").click();
      assert.equal(
        await page.locator("#close-characters").innerText(),
        "Close",
      );
      // The library renders after its fetch; wait rather than read at once.
      await page
        .locator("#library-sessions")
        .filter({ hasText: "None yet" })
        .waitFor();
      // With no characters yet, the creation form is already open.
      await page.locator("#character-name").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#show-create-character").isHidden(),
        true,
      );
      assert.equal(await page.locator("#save-character").isDisabled(), true);
      // The form says why some abilities have a modifier, and an average
      // score shows none.
      const form = await page.locator("#create-character").innerText();
      assert.match(
        form,
        /Scores of 13 or more give a bonus, 8 or less a penalty; 9 to 12 are average/,
      );
      assert.match(form, /Strength 14 \(\+1\) · Dexterity 12 · /);
      assert.doesNotMatch(form, /\(\+0\)/);
      await page.locator("#character-name").fill("   ");
      assert.equal(await page.locator("#save-character").isDisabled(), true);
      await page.locator("#character-name").fill("Tess");
      assert.equal(await page.locator("#save-character").isDisabled(), false);
      await page.locator("#save-character").click();
      await page
        .locator("#library-feedback")
        .filter({ hasText: "Character saved" })
        .waitFor();
      // The new character is selected and its adventures are listed.
      assert.equal(
        await page
          .locator("#library-characters button[aria-pressed=true]")
          .innerText(),
        "Tess\nFighter level 1 · XP 0 · Ready for an adventure",
      );
      await page
        .locator("#library-adventures button")
        .filter({ hasText: "Start Hollow" })
        .click();
      await page.locator("#character-library").waitFor({ state: "hidden" });

      assert.match(
        await page.locator("#active-character-details").innerText(),
        /Level 1 · XP 0 \/ 1,000 for level 2/,
      );
      const opening = page.locator("#conversation .opening");
      assert.equal(await opening.locator("h4").innerText(), "The story so far");
      assert.equal(
        await opening.locator("p").innerText(),
        (await (await fetch(server.url + "/api/state")).json()).introduction,
      );
      assert.equal(
        await page.locator("#scene-reading summary").innerText(),
        "More about this place",
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("character mode: a single-approach topic is labelled by its own words, without 'Persuade:'", () =>
  withSession("hollow-beacon-story.json", [], (actions) => {
    const iona = actions
      .filter(({ contextId }) => contextId === "npc:iona")
      .map(({ label }) => label);
    assert.ok(iona.includes("Ask what's wrong with the beacon"));
    assert.ok(!iona.some((label) => label.startsWith("Persuade:")));
  }));

test(
  "in a fight the opponent's name and HP sit in the header beside yours",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-95-fight-"));
    const server = await launchScriptedServer({
      savePath: join(directory, "unused-slot.json"),
      seed: 0,
      libraryPath: join(directory, "characters.json"),
    });
    const browser = await chromium.launch(
      process.platform === "win32"
        ? { channel: "msedge", headless: true }
        : { headless: true },
    );
    const page = await browser.newPage();
    page.setDefaultTimeout(8000);
    try {
      const post = async (path, body) =>
        (
          await fetch(server.url + path, {
            method: "POST",
            headers: { Origin: server.url, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        ).json();
      let library = await (await fetch(server.url + "/api/characters")).json();
      library = (
        await post("/api/characters/create", {
          name: "Ada",
          preset: "balanced",
          revision: library.revision,
        })
      ).library;
      await post("/api/characters/play", {
        characterId: library.characters[0].sheet.id,
        adventureId: "hollow-beacon",
        revision: library.revision,
        confirmed: true,
      });
      await page.goto(server.url);
      assert.equal(await page.locator("#opponent-status").isHidden(), true);
      await page
        .locator("#exits button")
        .filter({ hasText: "Ridge Trail" })
        .click();
      await page.locator("#opponent-status").waitFor({ state: "visible" });
      assert.equal(
        await page.locator("#opponent-name").innerText(),
        "Ridge raider",
      );
      assert.match(
        await page.locator("#opponent-hp").innerText(),
        /^\d+ \/ 14 HP$/,
      );
    } finally {
      await browser.close();
      await server.stop();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
