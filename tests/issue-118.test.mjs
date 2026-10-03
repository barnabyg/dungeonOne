import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startBrowserServer } from "../dist/browser-server.js";

// Seed 1's ability stream: the first set has Dexterity 8, below the Fighter
// minimums; the reroll is 12/12/12/10/14/15.
const SECOND_ROLL = {
  strength: [6, 3, 3],
  dexterity: [6, 4, 2],
  constitution: [6, 2, 4],
  intelligence: [5, 4, 1],
  wisdom: [3, 5, 6],
  charisma: [5, 5, 5],
};

test(
  "browser rolls 3d6 in order, rerolls only the whole set and saves the shown dice (#118)",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-118-"));
    const options = {
      savePath: join(directory, "legacy.json"),
      libraryPath: join(directory, "characters.json"),
      contentVersion: "11",
      seed: 1,
      apiKey: "",
    };
    const server = await startBrowserServer(options);
    // Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
    const browser = await chromium.launch(
      process.platform === "win32"
        ? { channel: "msedge", headless: true }
        : { headless: true },
    );
    const page = await browser.newPage();
    page.setDefaultTimeout(4000);
    const post = (action, body) =>
      page.evaluate(
        async ([action, body]) => {
          const library = await (await fetch("/api/characters")).json();
          const response = await fetch("/api/characters/" + action, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, revision: library.revision }),
          });
          return { status: response.status, body: await response.json() };
        },
        [action, body],
      );
    try {
      await page.goto(server.url);
      await page.locator("#open-characters").click();
      await page.locator("#character-name").fill("Ada");
      await page.locator("#character-preset").selectOption("roll");
      const scores = page.locator("#preset-scores");
      const roll = page.locator("#roll-abilities");
      const save = page.locator("#save-character");
      assert.match(await scores.innerText(), /reroll the whole set/);
      assert.equal(await roll.innerText(), "Roll 3d6 for every ability");
      assert.equal(await save.isDisabled(), true);

      await roll.click();
      await page.locator("#roll-abilities", { hasText: "Reroll" }).waitFor();
      assert.match(await scores.innerText(), /Dexterity 2\+3\+3/);
      assert.match(await scores.innerText(), /Below the Fighter minimums/);
      assert.equal(await save.isDisabled(), true);
      // A below-minimum set cannot be saved even by a direct request.
      const below = await post("create", { name: "Low", rollId: 1 });
      assert.equal(below.status, 409);
      assert.match(below.body.error, /Fighter minimums/);

      await roll.click();
      await scores.filter({ hasText: "Strength 6+3+3" }).waitFor();
      // The superseded set can no longer be saved.
      const stale = await post("create", { name: "Low", rollId: 1 });
      assert.equal(stale.status, 409);
      assert.match(stale.body.error, /no longer current/);
      assert.match(
        await scores.innerText(),
        /Strength 6\+3\+3 · Dexterity 6\+4\+2/,
      );
      assert.match(await scores.innerText(), /HP 18\/18/);
      assert.match(await scores.innerText(), /Strength 12 · Dexterity 12/);
      assert.equal(await roll.innerText(), "Reroll all abilities");

      // Submitted scores are refused; only the server's pending set is saved.
      const forged = await post("create", {
        name: "Forged",
        abilities: { strength: 18 },
      });
      assert.equal(forged.status, 409);
      assert.equal(
        (
          await page.evaluate(() =>
            fetch("/api/characters").then((r) => r.json()),
          )
        ).characters.length,
        0,
      );

      await save.click();
      await page
        .locator("#library-feedback")
        .filter({ hasText: "Character saved" })
        .waitFor();
      const [saved] = JSON.parse(
        await readFile(options.libraryPath, "utf8"),
      ).characters;
      assert.equal(saved.sheet.rulesVersion, "fighter-rules-v2");
      assert.deepEqual(saved.sheet.abilityRolls, SECOND_ROLL);
      assert.equal(saved.sheet.abilities.wisdom, 14);
      assert.match(
        await page.locator("#library-sheet-abilities").innerText(),
        /Rolled 3d6 in order: Strength 6\+3\+3/,
      );
      // Saving spends the roll; the next rolled character needs a new one.
      const reused = await post("create", { name: "Again", rollId: 2 });
      assert.equal(reused.status, 409);
      assert.match(reused.body.error, /no longer current/);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
