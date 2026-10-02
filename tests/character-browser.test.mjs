import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startBrowserServer } from "../dist/browser-server.js";

test(
  "browser creates standalone characters, cancels selection and resumes a selected sheet",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "character-browser-"));
    const options = {
      savePath: join(directory, "legacy.json"),
      libraryPath: join(directory, "characters.json"),
      contentVersion: "11",
      seed: 42,
      apiKey: "",
    };
    let server = await startBrowserServer(options);
    const browser = await chromium.launch({
      channel: "msedge",
      headless: true,
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(4000);
    try {
      await page.goto(server.url);
      await page.locator("#open-characters").click();
      await page.locator("#show-create-character").click();
      await page.locator("#character-name").fill("Ada");
      assert.match(
        await page.locator("#preset-scores").innerText(),
        /strength: 14 \(\+1\)/,
      );
      assert.match(
        await page.locator("#preset-scores").innerText(),
        /HP 19\/19/,
      );
      assert.match(
        await page.locator("#preset-scores").innerText(),
        /AC 16.*Attack \+3.*Damage 1d8 \+1.*Initiative \+0/,
      );
      await page.locator("#create-character button[type=submit]").click();
      await page
        .locator("#library-feedback")
        .filter({ hasText: "Character saved" })
        .waitFor();
      const standalone = JSON.parse(
        await readFile(options.libraryPath, "utf8"),
      );
      assert.equal(standalone.characters[0].sheet.name, "Ada");
      assert.equal(standalone.sessions.length, 0);
      await page.locator("#close-characters").click();
      await server.close();
      server = await startBrowserServer(options);
      await page.goto(server.url);
      await page.locator("#open-characters").click();
      await page
        .locator("#library-characters button")
        .filter({ hasText: "Ada" })
        .click();
      await page.locator("#show-create-character").click();
      await page.locator("#character-name").fill("Bram");
      await page.locator("#character-preset").selectOption("stout");
      assert.match(
        await page.locator("#preset-scores").innerText(),
        /HP 20\/20/,
      );
      assert.match(
        await page.locator("#preset-scores").innerText(),
        /AC 15.*Attack \+4.*Initiative -1/,
      );
      assert.equal(
        JSON.parse(await readFile(options.libraryPath, "utf8")).characters
          .length,
        1,
      );
      await page.locator("#create-character button[type=submit]").click();
      await page
        .locator("#library-sheet-name")
        .filter({ hasText: "Bram" })
        .waitFor();
      assert.match(
        await page.locator("#library-sheet-abilities").innerText(),
        /strength: 16 \(\+2\)/,
      );
      await page
        .locator("#library-adventures button")
        .filter({ hasText: "Start Hollow" })
        .click();
      await page.locator("#character-library").waitFor({ state: "hidden" });
      await page.locator("#open-character").click();
      assert.match(
        await page.locator("#information-body").innerText(),
        /HP: 20 \/ 20/,
      );
      const before = await (await fetch(server.url + "/api/state")).json();
      await server.close();
      server = await startBrowserServer(options);
      const after = await (await fetch(server.url + "/api/state")).json();
      assert.deepEqual(after.character, before.character);
      assert.equal(after.generation, before.generation);
      assert.equal(
        JSON.parse(await readFile(options.libraryPath, "utf8")).characters
          .length,
        2,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
