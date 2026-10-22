// #430, browser → API: during an adventure the masthead, breadcrumb and the
// adventure's levels and difficulty (not the room, #522) share one compact
// bar, with the objective on a line under it, so little more than about
// 75 px comes before the session layout. The adventure title stays the page's h2 and is focused
// on entry; the other screens get the same bar without the adventure's line.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";
import { startAdventure, text } from "./fixtures/browser-journey.mjs";
import { beaLibrary } from "./fixtures/charismatic-fighter.mjs";
import { goblinYard } from "./fixtures/modules.mjs";

/** Where the bar and the parts it holds sit, and what comes after it. */
const chrome = (page) =>
  page.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector);
      if (node === null || node.getClientRects().length === 0) {
        return null;
      }
      const rect = node.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    };
    return {
      bar: box(".masthead"),
      brand: box(".masthead h1"),
      crumbs: box("#breadcrumb"),
      meta: box("#adventure-meta"),
      objective: box("#adventure-objective"),
      layout: box("#session-layout"),
      headings: [...document.querySelectorAll("h1, h2")]
        .filter((node) => node.closest("[hidden], dialog:not([open])") === null)
        .map((node) => node.tagName + " " + node.textContent),
    };
  });

/**
 * The tops and bottoms of the bar's shown parts, and whether the levels and
 * the current crumb are cut short.
 */
const barRow = (page) =>
  page.evaluate(() => {
    const parts = [...document.querySelector(".masthead").children]
      .filter((node) => node.getClientRects().length > 0)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.id || node.className,
          top: rect.top,
          bottom: rect.bottom,
        };
      });
    const meta = document.querySelector("#adventure-meta");
    const current = document.querySelector("#breadcrumb [aria-current=page]");
    return {
      parts,
      metaClipped: meta.scrollWidth > meta.clientWidth,
      currentTitle: current.title,
    };
  });

// The yard with an objective as long as the longest a shipped module has
// (165 characters), which wraps unless it is kept to one line, and a title
// longer than any shipped module's, which the bar cuts short.
const yard = {
  ...goblinYard,
  title: "The Goblin Yard behind the Old Mill at Crossroads Farm",
  objective:
    "Goblins hold the old inn cellar below the yard, and the landlord's barrels are stuck behind a barricade. Clear the cellar or take what you can, and get out alive.",
};

/** Whether `inner` lies within `outer` from top to bottom. */
const within = (inner, outer) =>
  inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;

for (const viewport of [
  { width: 1880, height: 1000 },
  { width: 1280, height: 850 },
  { width: 900, height: 560 },
]) {
  test(`the adventure's header is one compact bar (${viewport.width} x ${viewport.height} px)`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-430-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, JSON.stringify(beaLibrary()));
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 7,
      adventures: [yard],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(8000);
    try {
      await page.goto(server.url);
      await page
        .locator("#characters button")
        .filter({ hasText: "Bea" })
        .click();
      // The sheet has the bar too, without the adventure's line.
      await page.locator("#sheet-name").filter({ hasText: "Bea" }).waitFor();
      const sheet = await chrome(page);
      assert.equal(sheet.meta, null);
      assert.ok(within(sheet.crumbs, sheet.bar), "breadcrumb in the bar");
      assert.ok(sheet.bar.height <= 56, `sheet bar ${sheet.bar.height}`);

      await startAdventure(page, "goblin-yard");
      const shown = await chrome(page);
      assert.ok(shown.bar.height <= 56, `bar ${shown.bar.height}`);
      for (const part of ["brand", "crumbs", "meta"]) {
        assert.ok(within(shown[part], shown.bar), `${part} in the bar`);
      }
      assert.ok(
        shown.layout.top <= 75 + 1,
        `session layout starts at ${shown.layout.top}`,
      );
      assert.ok(shown.objective.top >= shown.bar.bottom);
      assert.ok(shown.objective.bottom <= shown.layout.top);
      // The objective keeps to one line; its full text is on hover.
      assert.ok(
        shown.objective.height <= 25,
        `objective ${shown.objective.height}`,
      );
      assert.equal(
        await text(page.locator("#adventure-objective")),
        yard.objective,
      );
      assert.equal(
        await page.locator("#adventure-objective").getAttribute("title"),
        yard.objective,
      );
      assert.equal(
        await text(page.locator("#adventure-meta")),
        "Level 1 · Hard",
      );
      // Cut short in a narrow bar, it shows in full on hover (#480).
      assert.equal(
        await page.locator("#adventure-meta").getAttribute("title"),
        await page.locator("#adventure-meta").textContent(),
      );
      assert.equal(
        await text(page.locator("#breadcrumb [aria-current=page]")),
        yard.title,
      );
      // Every part of the bar, the settings button included, sits on one
      // row; a long title is cut short before the levels and difficulty are,
      // and shows in full on hover.
      const row = await barRow(page);
      const [first] = row.parts;
      for (const part of row.parts) {
        assert.ok(
          part.top < first.bottom && part.bottom > first.top,
          `${part.id} on the bar's row: ${JSON.stringify(row.parts)}`,
        );
      }
      assert.equal(row.metaClipped, false, "levels and difficulty in full");
      assert.equal(row.currentTitle, yard.title);
      // Headings stay in order, and the title is the focused h2.
      assert.deepEqual(shown.headings, ["H1 Dungeon One", `H2 ${yard.title}`]);
      assert.deepEqual(
        await page.evaluate(() => ({
          focused: document.activeElement.id,
          tabindex: document.activeElement.getAttribute("tabindex"),
        })),
        { focused: "adventure-title", tabindex: "-1" },
      );
      await assertNoSideScroll(page, "no horizontal scroll");
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
