// #158: the adventure ending appears where the actions were, styled by its
// kind (victory or defeat, in words and colour), with its heading focused and
// one next step back to the character sheet. The composer is disabled with a
// visible reason, the history stays reviewable, and a reload shows the same
// ending: the server keeps serving an ended session, read-only.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {} from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { loneGoblin } from "./fixtures/modules.mjs";
import { createAndStart } from "./fixtures/browser-journey.mjs";
import { firstFighter } from "./fixtures/session-layout.mjs";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

/** A lone goblin seed where attacking every turn ends in `wanted`. */
function seedFor(wanted) {
  for (let seed = 0; seed < 5000; seed++) {
    const runtime = createFifthRuntime(loneGoblin, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    let state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    while (state.status === "playing") {
      const action =
        runtime.attackTargets(state).length > 0
          ? { type: "attack", actorId: "pc", targetId: "goblin" }
          : { type: "end-turn", actorId: "pc" };
      state = runtime.handleAction(state, action, random).state;
    }
    if (state.status === wanted) {
      return seed;
    }
  }
  throw new Error(`no lone goblin seed ending in ${wanted}`);
}

/** Attacks, or ends the turn once the action is spent, until the ending. */
async function playToTheEnd(page) {
  while (!(await page.locator("#ending").isVisible())) {
    const count = await page.locator("#log li").count();
    const attack = page.locator("#attack-controls button.attack:enabled");
    await (
      (await attack.count()) > 0
        ? attack.first()
        : page.locator('#feature-controls button[data-action="end-turn"]')
    ).click();
    await page.waitForFunction(
      (seen) => document.querySelectorAll("#log li").length > seen,
      count,
    );
  }
  // The page moves focus once the action settles.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(resolve);
      }),
  );
}

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

const sessionFile = async (directory) => {
  const folder = join(directory, "characters-adventures");
  const [name] = await readdir(folder);
  return JSON.parse(await readFile(join(folder, name), "utf8"));
};

/** What the ending shows, where focus is and whether it is on screen. */
const ending = (page) =>
  page.evaluate(() => {
    const box = document.getElementById("ending");
    const rect = box.getBoundingClientRect();
    const title = document
      .getElementById("ending-title")
      .getBoundingClientRect();
    const message = document.getElementById("message");
    const reason = document.getElementById("composer-reason");
    const describedBy = (message.getAttribute("aria-describedby") || "").split(
      " ",
    );
    return {
      kind: box.dataset.kind,
      kindText: document.getElementById("ending-kind").textContent,
      title: document.getElementById("ending-title").textContent,
      consequence: document.getElementById("ending-consequence").textContent,
      next: document.getElementById("ending-next").textContent,
      inActions: box.parentElement.id === "session-actions",
      focused: document.activeElement.id,
      titleOnScreen: title.top >= 0 && title.bottom <= window.innerHeight,
      actionBarHidden: document.getElementById("action-bar").hidden,
      composerDisabled:
        message.disabled && document.getElementById("send-message").disabled,
      reason: reason.offsetParent === null ? "" : reason.textContent,
      reasonLinked: describedBy.includes("composer-reason"),
      border: getComputedStyle(box).borderTopColor,
      kindColour: getComputedStyle(document.getElementById("ending-kind"))
        .color,
      success: getComputedStyle(document.documentElement)
        .getPropertyValue("--color-success")
        .trim(),
      danger: getComputedStyle(document.documentElement)
        .getPropertyValue("--color-danger")
        .trim(),
      width: rect.width,
      fits: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });

/**
 * The status strip's HP as spoken (text outside aria-hidden parts) and as
 * shown (text outside visually-hidden parts), its health, the turn line and
 * the resources it lists (#155).
 */
const statusStrip = (page) =>
  page.evaluate(() => {
    const spoken = (node) =>
      node.nodeType === Node.TEXT_NODE
        ? node.textContent
        : node.getAttribute?.("aria-hidden") === "true"
          ? ""
          : [...node.childNodes].map(spoken).join(" ");
    const seen = (node) =>
      node.nodeType === Node.TEXT_NODE
        ? node.textContent
        : node.classList?.contains("visually-hidden")
          ? ""
          : [...node.childNodes].map(seen).join("");
    const tidy = (text) => text.replace(/\s+/g, " ").trim();
    const hp = document.getElementById("character-hp");
    return {
      hp: tidy(spoken(hp)),
      shown: tidy(seen(hp)),
      health: document.getElementById("status-hp").dataset.health,
      turn: document.getElementById("turn").textContent,
      resources: [...document.querySelectorAll("#resources li")].map(
        (item) => item.dataset.resource,
      ),
      fill: document.getElementById("hp-fill").style.width,
    };
  });

/** A CSS colour token (#rrggbb) as the computed rgb() string. */
const rgb = (hex) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${value >> 16}, ${(value >> 8) & 255}, ${value & 255})`;
};

/** Scrolled to the top, the history shows its oldest entry. */
const historyReviewable = (page) =>
  page.evaluate(() => {
    const log = document.getElementById("log");
    const first = log.querySelector("li");
    log.scrollTop = 0;
    const entry = first.getBoundingClientRect();
    const area = log.getBoundingClientRect();
    return (
      log.offsetParent !== null &&
      log.children.length > 1 &&
      entry.top >= area.top - 1 &&
      entry.top < area.bottom
    );
  });

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `winning the lone goblin fight shows the victory ending in place of the actions (${viewport.width}px)`,
    { timeout: 120000 },
    async () => {
      const seed = seedFor("victory");
      const directory = await mkdtemp(join(tmpdir(), "issue-158-victory-"));
      const libraryPath = join(directory, "characters.json");
      const server = await startFifthBrowserServer({
        adventures: [loneGoblin],
        libraryPath,
        seed,
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await createAndStart(page, server.url, "lone-goblin");
        await playToTheEnd(page);

        const shown = await ending(page);
        assert.equal(shown.kind, "victory");
        assert.equal(shown.kindText, "Victory");
        assert.equal(shown.title, "The cellar is clear");
        assert.equal(shown.consequence, "");
        assert.equal(shown.next, "Back to Ada's sheet");
        assert.ok(shown.inActions, "the ending is in the action region");
        assert.equal(shown.focused, "ending-title");
        assert.ok(shown.titleOnScreen, "the ending heading is on screen");
        assert.ok(shown.actionBarHidden);
        assert.ok(shown.composerDisabled);
        assert.match(shown.reason, /The adventure is over/);
        assert.ok(shown.reasonLinked, "the reason describes the message box");
        assert.equal(shown.border, rgb(shown.success));
        assert.equal(shown.kindColour, rgb(shown.success));
        assert.ok(shown.fits, "no horizontal scroll");
        assert.ok(await historyReviewable(page), "the history stays readable");

        // Storage: the session ended in victory and the character is free.
        const file = await sessionFile(directory);
        assert.equal(file.state.status, "victory");
        const library = JSON.parse(await readFile(libraryPath, "utf8"));
        assert.equal(library.characters[0].session, undefined);

        // API: the ended session stays viewable, with its kind, read-only.
        const viewed = await post(page, "/api/5e/session", {
          sessionId: file.id,
        });
        assert.equal(viewed.status, 200);
        assert.equal(viewed.body.session.status, "victory");
        assert.deepEqual(viewed.body.session.ending, {
          kind: "victory",
          title: "The cellar is clear",
          text: viewed.body.session.ending.text,
          // A victory credits the fight's XP (#133).
          rewards: {
            xp: [{ name: "Defeated the Goblin Warrior", xp: 50 }],
            treasure: [],
            totalXp: 50,
            level: 1,
          },
        });
        assert.equal(library.characters[0].sheet.xp, 50);
        assert.deepEqual(viewed.body.session.actions, []);
        const acted = await post(page, "/api/5e/session/action", {
          sessionId: file.id,
          sequence: file.transitions.length,
          action: "end-turn",
        });
        assert.notEqual(acted.status, 200);
        assert.deepEqual(await sessionFile(directory), file);
        const unknown = await post(page, "/api/5e/session", {
          sessionId: "0".repeat(32),
        });
        assert.notEqual(unknown.status, 200);

        // Reloading shows the same ending, focused.
        await page.reload();
        await page.locator("#ending").waitFor({ state: "visible" });
        const reloaded = await ending(page);
        assert.equal(reloaded.kind, "victory");
        assert.equal(reloaded.title, "The cellar is clear");
        assert.equal(reloaded.focused, "ending-title");
        assert.ok(reloaded.composerDisabled);
        assert.ok(await historyReviewable(page), "the history after a reload");

        // The next step opens the sheet with the adventure choices.
        await page.locator("#ending-next").click();
        await page.locator("#sheet").waitFor({ state: "visible" });
        await page.locator(".start-adventure").first().waitFor();
        assert.equal(
          new URL(page.url()).hash,
          `#character-${library.characters[0].sheet.id}`,
        );
        // Back returns to the same ending.
        await page.goBack();
        await page.locator("#ending").waitFor({ state: "visible" });
        assert.equal((await ending(page)).title, "The cellar is clear");
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}

test(
  "a seeded defeat shows the defeat ending and says it is permanent",
  { timeout: 120000 },
  async () => {
    const seed = seedFor("defeat");
    const directory = await mkdtemp(join(tmpdir(), "issue-158-defeat-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      adventures: [loneGoblin],
      libraryPath,
      seed,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "lone-goblin");
      await playToTheEnd(page);

      const shown = await ending(page);
      assert.equal(shown.kind, "defeat");
      assert.equal(shown.kindText, "Defeat");
      assert.equal(shown.title, "Fallen in the cellar");
      assert.equal(
        shown.consequence,
        "Defeat is permanent: Ada cannot start another adventure.",
      );
      assert.equal(shown.next, "Back to Ada's sheet");
      assert.equal(shown.focused, "ending-title");
      assert.ok(shown.titleOnScreen, "the ending heading is on screen");
      assert.equal(shown.border, rgb(shown.danger));
      assert.equal(shown.kindColour, rgb(shown.danger));
      assert.ok(shown.composerDisabled);
      assert.match(shown.reason, /The adventure is over/);
      assert.equal((await sessionFile(directory)).state.status, "defeat");

      // The status strip shows defeat at 0 HP (#155). No turn is left to
      // take; the feature uses still show.
      const maxHp = firstFighter(seed).hp;
      assert.deepEqual(await statusStrip(page), {
        hp: `HP 0 of ${maxHp}, Defeated`,
        shown: `HP 0/${maxHp} Defeated`,
        health: "down",
        turn: "The fight is over.",
        resources: ["second-wind"],
        fill: "0%",
      });

      await page.reload();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.equal((await ending(page)).kind, "defeat");

      await page.locator("#ending-next").click();
      await page
        .locator("#adventure-choices")
        .filter({
          hasText: "Ada was defeated and cannot start another adventure.",
        })
        .waitFor();
      assert.equal(await page.locator(".start-adventure").count(), 0);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
