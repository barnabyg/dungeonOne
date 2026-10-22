// #517, browser → API → storage: Ada explores the Drawn Tunnels. The scene
// column shows the current room's backdrop, faintly, behind its content: the
// upper tunnels' cellar, the alcove's own forest, and the lower tunnels'
// crypt, which stays through the rat's fight and a reload. Text keeps its
// contrast over it, and the layout holds at every width.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { clickAction, createAndStart } from "./fixtures/browser-journey.mjs";
import { backdropTunnels } from "./fixtures/modules.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

/** The backdrops the scene column shows. */
const shown = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#scene-backdrop svg")]
      .filter((svg) => svg.getBoundingClientRect().height > 0)
      .map((svg) => svg.dataset.backdrop),
  );

/**
 * The worst contrast of the room's text and muted text over the backdrop at
 * full strength: the panel's paper blended with the drawing's colour.
 */
const worstContrast = (page) =>
  page.evaluate(() => {
    const rgb = (colour) =>
      colour
        .match(/[\d.]+/gu)
        .slice(0, 3)
        .map(Number);
    const luminance = (channels) => {
      const [r, g, b] = channels.map((value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a, b) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (light + 0.05) / (dark + 0.05);
    };
    const backdrop = getComputedStyle(
      document.getElementById("scene-backdrop"),
    );
    const strength = Number(backdrop.opacity);
    const paper = rgb(
      getComputedStyle(document.getElementById("adventure")).backgroundColor,
    );
    const line = rgb(backdrop.color);
    const behind = paper.map(
      (channel, index) => channel * (1 - strength) + line[index] * strength,
    );
    // Body text, as the room's description was before #524, and a hint.
    const plain = document.createElement("p");
    const muted = document.createElement("p");
    muted.className = "hint";
    document.getElementById("room").append(plain, muted);
    const colours = [
      getComputedStyle(plain).color,
      getComputedStyle(muted).color,
    ];
    plain.remove();
    muted.remove();
    return {
      strength,
      contrast: Math.min(
        ...colours.map((colour) => ratio(rgb(colour), behind)),
      ),
    };
  });

test("the scene column shows the current room's backdrop, faint, behind its content", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-517-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [backdropTunnels],
    // Fixtures are engine material, not gated content.
    qualifies: () => true,
    libraryPath: join(directory, "characters.json"),
    seed: 1,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1880, height: 1000 },
  });
  page.setDefaultTimeout(5000);
  try {
    await createAndStart(page, server.url, "backdrop-tunnels");
    assert.deepEqual(await shown(page), ["cellar"]);
    const backdrop = page.locator("#scene-backdrop");
    assert.equal(await backdrop.getAttribute("aria-hidden"), "true");
    assert.equal(
      await backdrop.evaluate((node) => getComputedStyle(node).pointerEvents),
      "none",
    );
    const { strength, contrast } = await worstContrast(page);
    assert.ok(strength > 0 && strength <= 0.3, `strength ${strength}`);
    assert.ok(contrast >= 4.5, `contrast ${contrast.toFixed(2)}`);
    // It fills the scene's column as seen, scrolled to the top or the foot:
    // the scene from 1500 px wide, the character and scene column narrower.
    const fits = () =>
      page.evaluate(() => {
        const column = document.getElementById(
          window.innerWidth >= 1500 ? "session-scene" : "session-main",
        );
        const filled = () => {
          const seen = column.getBoundingClientRect();
          const drawing = document
            .querySelector("#scene-backdrop svg:not([hidden])")
            .getBoundingClientRect();
          return ["top", "bottom", "left"].every(
            (side) => Math.abs(drawing[side] - seen[side]) <= 1,
          );
        };
        const top = filled();
        column.scrollTop = column.scrollHeight;
        const foot = filled();
        column.scrollTop = 0;
        return top && foot;
      });
    assert.equal(await fits(), true, "the drawing fills the column");

    // The alcove names its own; back in the upper tunnels, the cellar again.
    await clickAction(page, "move", "alcove");
    assert.deepEqual(await shown(page), ["forest"]);
    await clickAction(page, "move", "stair-foot");
    assert.deepEqual(await shown(page), ["cellar"]);
    // The rat's cellar is in the lower tunnels; its fight keeps the crypt.
    await clickAction(page, "move", "rat-cellar");
    assert.equal(await page.locator("#encounter").isVisible(), true);
    assert.deepEqual(await shown(page), ["crypt"]);
    assert.equal(await fits(), true, "in a fight too");

    // A reload shows the same backdrop.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    assert.deepEqual(await shown(page), ["crypt"]);

    // The layout holds at every width.
    for (const viewport of [
      { width: 1280, height: 850 },
      { width: 900, height: 560 },
    ]) {
      await page.setViewportSize(viewport);
      assert.deepEqual(await shown(page), ["crypt"]);
      assert.equal(
        await fits(),
        true,
        `it fills the column at ${viewport.width}`,
      );
      await assertNoSideScroll(
        page,
        `no horizontal scroll at ${viewport.width}`,
      );
    }
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
