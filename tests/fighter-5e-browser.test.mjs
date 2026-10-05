import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { request } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { CharacterLibrary } from "../dist/character-library.js";
import {
  ABILITIES,
  buildFighter,
  defaultPlacement,
  fighterProfile,
  keptTotal,
} from "../dist/fighter-5e.js";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

// The page shows the creation screen only after rendering the rolls it
// fetched, so wait for it before reading them. Each row's Roll cell shows
// the dice placed on it (#184).
const shownRolls = async (page) => {
  await page.locator("#creation").waitFor({ state: "visible" });
  return page
    .locator("#ability-rows .dice .visually-hidden")
    .evaluateAll((items) => items.map((item) => item.textContent));
};

const post = (page, path, body) =>
  page.evaluate(
    async ([path, body]) => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
    [path, body],
  );

test(
  "the rolled dice survive reloads, restarts and backing out, then make a saved Fighter",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "fighter-5e-browser-"));
    const libraryPath = join(directory, "characters.json");
    let server = await startFifthBrowserServer({ libraryPath, seed: 42 });
    const browser = await launch();
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await page.locator("#no-characters").waitFor();
      await page.locator("#open-creation").click();
      await page.locator("#creation").waitFor();
      const shown = await shownRolls(page);
      assert.equal(shown.length, 6);
      // Every die is shown once, in its row, the dropped one marked.
      assert.match(shown[0], /^Dice \d( dropped)?(, \d( dropped)?){3}$/);
      assert.ok(shown.every((label) => label.split("dropped").length === 2));
      const stored = JSON.parse(await readFile(libraryPath, "utf8"));
      const dice = stored.pendingCreation.dice;
      assert.equal(dice.length, 6);
      assert.equal(await page.locator("#creation .die").count(), 24);
      assert.equal(await page.locator("#creation .die.dropped").count(), 6);
      const placed = defaultPlacement(dice);
      assert.deepEqual(
        shown.map((label) => label.replace(/ dropped/, "")),
        ABILITIES.map((ability) => `Dice ${dice[placed[ability]].join(", ")}`),
      );

      // Reload, then back out and reopen: the same dice.
      await page.reload();
      assert.deepEqual(await shownRolls(page), shown);
      await page.locator("#close-creation").click();
      await page
        .locator("#open-creation")
        .filter({ hasText: "Continue" })
        .click();
      assert.deepEqual(await shownRolls(page), shown);

      // Restart, even with another seed: the same dice.
      await server.close();
      server = await startFifthBrowserServer({ libraryPath, seed: 7 });
      await page.goto(server.url);
      await page.locator("#open-creation").click();
      assert.deepEqual(await shownRolls(page), shown);

      // No request yields a different set while the creation is pending.
      for (let attempt = 0; attempt < 3; attempt++) {
        const again = await post(page, "/api/5e/creation", {});
        assert.equal(again.status, 200);
        assert.deepEqual(
          again.body.pendingCreation.rolls.map(({ dice }) => dice),
          dice,
        );
      }
      for (const body of [{ reroll: true }, { revision: "0".repeat(32) }]) {
        assert.equal((await post(page, "/api/5e/creation", body)).status, 409);
      }
      const forged = await post(page, "/api/5e/characters", {
        revision: (await post(page, "/api/5e/creation", {})).body.revision,
        name: "Cheat",
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
        level: 3,
      });
      assert.equal(forged.status, 409);
      assert.deepEqual(
        JSON.parse(await readFile(libraryPath, "utf8")).pendingCreation.dice,
        dice,
      );

      // The best roll starts on Strength (#163). Put Intelligence's roll
      // there using the keyboard; the two swap.
      const placement = { ...defaultPlacement(dice) };
      const best = dice
        .map((roll, index) => [keptTotal(roll), index])
        .sort((a, b) => b[0] - a[0] || a[1] - b[1])[0][1];
      assert.equal(placement.strength, best);
      const strength = page.locator("#place-strength");
      assert.equal(await strength.inputValue(), String(best));
      await strength.focus();
      await strength.selectOption(String(placement.intelligence));
      assert.equal(
        await page
          .locator("#place-strength")
          .evaluate((node) => node === document.activeElement),
        true,
      );
      [placement.strength, placement.intelligence] = [
        placement.intelligence,
        placement.strength,
      ];
      assert.equal(
        await page.locator("#place-intelligence").inputValue(),
        String(best),
      );

      // An illegal increase cannot be entered (#162). A skill error shows
      // beside the skills and blocks saving.
      await page.locator("#skill-perception").uncheck();
      await page
        .locator("#skills-error")
        .filter({ hasText: "Choose 2 skills" })
        .waitFor();
      assert.equal(await page.locator("#save-character").isDisabled(), true);
      await page.locator("#skill-survival").press("Space");
      await page.locator("#style-great-weapon-fighting").check();

      const choices = {
        placement,
        increase: { strength: 2, constitution: 1 },
        skills: ["athletics", "survival"],
        fightingStyle: "great-weapon-fighting",
      };
      const expected = buildFighter("0".repeat(32), "Preview", dice, choices);
      const profile = fighterProfile(expected);
      const preview = page.locator("#preview-body");
      await preview
        .filter({ hasText: new RegExp(`AC:\\s*${profile.armorClass}`) })
        .filter({
          hasText: new RegExp(`HP:\\s*${profile.maxHp}/${profile.maxHp}`),
        })
        .filter({ hasText: "Survival" })
        .waitFor();
      const text = await preview.innerText();
      assert.match(text, /Proficiency bonus:\s*\+2/);
      assert.match(
        text,
        new RegExp(
          `Strength\\s+${expected.abilities.strength}\\s+[+-]\\d+\\s+[+-]\\d+ \\(proficient\\)`,
        ),
      );
      assert.match(text, /Second Wind/);
      assert.match(text, /Weapon Mastery: Sap/);
      assert.match(text, /1d6/);

      // Save with Enter from the name field.
      await page.locator("#character-name").fill("Ada");
      await page.locator("#character-name").press("Enter");
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      const saved = JSON.parse(await readFile(libraryPath, "utf8"));
      assert.equal(saved.pendingCreation, undefined);
      assert.equal(saved.characters.length, 1);
      const sheet = saved.characters[0].sheet;
      assert.deepEqual(sheet.abilities, expected.abilities);
      assert.equal(sheet.level, 1);
      assert.equal(sheet.xp, 0);
      assert.equal(sheet.hp, profile.maxHp);
      assert.match(
        await page.locator("#sheet-body").innerText(),
        /0 XP \(level 2 at 300\)/,
      );

      // The sheet reads back after a restart; the next creation is new dice.
      await server.close();
      server = await startFifthBrowserServer({ libraryPath, seed: 42 });
      await page.goto(server.url);
      await page
        .locator("#characters button")
        .filter({ hasText: "Ada" })
        .click();
      assert.match(
        await page.locator("#sheet-body").innerText(),
        new RegExp(`AC:\\s*${profile.armorClass}`),
      );
      await page.locator(`#breadcrumb a[data-view="library"]`).click();
      await page.locator("#open-creation").click();
      assert.notDeepEqual(await shownRolls(page), shown);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "the creation screen fits a phone and works from the keyboard",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "fighter-5e-phone-"));
    const server = await startFifthBrowserServer({
      libraryPath: join(directory, "characters.json"),
      seed: 3,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 360, height: 740 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await page.locator("#no-characters").waitFor();
      // Skip link, then the create button.
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "open-creation",
      );
      await page.keyboard.press("Enter");
      await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "creation-title",
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "no horizontal scroll at phone width",
      );
      // Every control is reachable by Tab.
      const reached = new Set();
      for (let step = 0; step < 40; step++) {
        await page.keyboard.press("Tab");
        reached.add(await page.evaluate(() => document.activeElement.id));
      }
      for (const id of [
        "place-strength",
        "increase-charisma",
        "skill-athletics",
        "character-name",
        "save-character",
        "close-creation",
      ]) {
        assert.ok(reached.has(id), `${id} is reachable`);
      }
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("a pre-5e library is refused under --5e and left byte-identical", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fighter-5e-refusal-"));
  try {
    const libraryPath = join(directory, "characters.json");
    const old = new CharacterLibrary(libraryPath);
    await old.create("Ada", "balanced", (await old.read()).revision);
    const before = await readFile(libraryPath);
    await assert.rejects(
      startFifthBrowserServer({ libraryPath, seed: 1 }),
      /pre-5e character library.*Move it aside/,
    );
    const launched = spawnSync(
      process.execPath,
      [
        "dist/browser-cli.js",
        "--5e",
        "--seed",
        "1",
        "--characters",
        libraryPath,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.equal(launched.status, 2);
    assert.ok(launched.stderr.includes(libraryPath));
    assert.match(
      launched.stderr,
      /pre-5e character library \(format version 1\).*Move it aside/,
    );
    assert.deepEqual(await readFile(libraryPath), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the 5e server rejects other hosts and cross-origin posts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fighter-5e-origin-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({ libraryPath, seed: 1 });
  const { port } = new URL(server.url);
  const send = (headers, method = "POST") =>
    new Promise((resolve, reject) => {
      const outgoing = request(
        { host: "127.0.0.1", port, path: "/api/5e/creation", method, headers },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        },
      );
      outgoing.on("error", reject);
      outgoing.end(method === "POST" ? "{}" : undefined);
    });
  try {
    const host = `127.0.0.1:${port}`;
    assert.equal(await send({ host: "evil.test" }, "GET"), 403);
    assert.equal(await send({ host, origin: "http://evil.test" }), 403);
    assert.equal(
      await send({ host, origin: server.url, "sec-fetch-site": "cross-site" }),
      403,
    );
    await assert.rejects(readFile(libraryPath), { code: "ENOENT" });
    assert.equal(await send({ host, origin: server.url }), 200);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "a character is deleted only by typing its name, and the pending dice survive",
  { timeout: 60000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "fighter-5e-delete-"));
    const libraryPath = join(directory, "characters.json");
    let server = await startFifthBrowserServer({ libraryPath, seed: 5 });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 360, height: 740 },
    });
    page.setDefaultTimeout(5000);
    const dialog = page.locator("#delete-dialog");
    const openAdaDelete = async () => {
      await page
        .locator("#characters button")
        .filter({ hasText: "Ada" })
        .click();
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      await page.locator("#delete-character").click();
      await dialog.waitFor({ state: "visible" });
    };
    const focused = () => page.evaluate(() => document.activeElement.id);
    try {
      // Save two characters and start a third creation, all in the page.
      await page.goto(server.url);
      for (const name of ["Ada", "Bram"]) {
        await page.locator("#open-creation").click();
        await page
          .locator("#preview-body")
          .filter({ hasText: "AC:" })
          .waitFor();
        await page.locator("#character-name").fill(name);
        await page.locator("#character-name").press("Enter");
        await page.locator("#sheet-name").filter({ hasText: name }).waitFor();
        await page.locator(`#breadcrumb a[data-view="library"]`).click();
      }
      await page.locator("#open-creation").click();
      const pendingRolls = await shownRolls(page);
      await page.locator("#close-creation").click();
      const initial = JSON.parse(await readFile(libraryPath, "utf8"));
      const { pendingCreation: pending } = initial;
      const bram = JSON.stringify(initial.characters[1]);
      assert.equal(initial.characters[1].sheet.name, "Bram");

      await openAdaDelete();
      assert.equal(await focused(), "delete-confirm-name");
      assert.match(await dialog.innerText(), /permanent/i);
      assert.match(await dialog.innerText(), /no undo/i);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "no horizontal scroll at phone width",
      );
      const box = await dialog.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 360, "dialog fits");

      // Only the exact name enables Delete.
      const confirm = page.locator("#confirm-delete");
      const input = page.locator("#delete-confirm-name");
      assert.equal(await confirm.isDisabled(), true);
      for (const wrong of ["ada", "Ada ", " Ada", "Ad"]) {
        await input.fill(wrong);
        assert.equal(await confirm.isDisabled(), true, `"${wrong}"`);
      }
      const before = await readFile(libraryPath);

      // Escape cancels and returns focus to the Delete control.
      await input.fill("Ada");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await focused(), "delete-character");
      // Cancel does too, and reopening starts empty.
      await page.keyboard.press("Enter");
      await dialog.waitFor({ state: "visible" });
      assert.equal(await input.inputValue(), "");
      await page.locator("#cancel-delete").click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await focused(), "delete-character");
      assert.deepEqual(await readFile(libraryPath), before);

      // Forged and replayed requests change nothing.
      const { revision, characters } = await page.evaluate(() =>
        fetch("/api/5e/library").then((r) => r.json()),
      );
      const ada = characters.find(({ sheet }) => sheet.name === "Ada").sheet;
      for (const body of [
        { revision, characterId: ada.id, name: "ada" },
        { revision, characterId: ada.id, name: "Ada", force: true },
        { revision, characterId: ada.id },
        { revision: "0".repeat(32), characterId: ada.id, name: "Ada" },
        { revision, characterId: "f".repeat(32), name: "Ada" },
      ]) {
        const result = await post(page, "/api/5e/characters/delete", body);
        assert.equal(result.status, 409, JSON.stringify(body));
      }
      assert.match(
        (
          await post(page, "/api/5e/characters/delete", {
            revision: "0".repeat(32),
            characterId: ada.id,
            name: "Ada",
          })
        ).body.error,
        /refresh before retrying/,
      );
      assert.deepEqual(await readFile(libraryPath), before);

      // Delete for real from the keyboard.
      await page.locator("#delete-character").focus();
      await page.keyboard.press("Enter");
      await input.fill("Ada");
      await input.press("Enter");
      await dialog.waitFor({ state: "hidden" });
      await page.locator("#library").waitFor({ state: "visible" });
      await page.locator("#feedback").filter({ hasText: "Ada" }).waitFor();
      assert.deepEqual(
        await page.locator("#characters strong").allInnerTexts(),
        ["Bram"],
      );
      const replayed = await post(page, "/api/5e/characters/delete", {
        revision,
        characterId: ada.id,
        name: "Ada",
      });
      assert.equal(replayed.status, 409);

      // Reload and restart: Ada is gone, Bram intact, the same dice pending.
      await page.reload();
      await page.locator("#characters strong").first().waitFor();
      assert.deepEqual(
        await page.locator("#characters strong").allInnerTexts(),
        ["Bram"],
      );
      await server.close();
      server = await startFifthBrowserServer({ libraryPath, seed: 9 });
      await page.goto(server.url);
      await page
        .locator("#characters button")
        .filter({ hasText: "Bram" })
        .click();
      await page.locator("#sheet-name").filter({ hasText: "Bram" }).waitFor();
      await page.locator(`#breadcrumb a[data-view="library"]`).click();
      await page
        .locator("#open-creation")
        .filter({ hasText: "Continue" })
        .click();
      assert.deepEqual(await shownRolls(page), pendingRolls);
      const stored = JSON.parse(await readFile(libraryPath, "utf8"));
      assert.deepEqual(stored.pendingCreation, pending);
      assert.deepEqual(
        stored.characters.map((record) => JSON.stringify(record)),
        [bram],
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
