// #256: on a phone the sticky dock's scroll padding covers its whole height,
// even when that height is fractional, so a focused control scrolled into
// view never sits under the dock. At desktop width the dock isn't sticky and
// adds no padding.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { ratTunnels } from "./fixtures/modules.mjs";
import {
  explore,
  launch,
  layout,
  narratingDm,
} from "./fixtures/session-layout.mjs";

const CARRIED_EXAMINE =
  '#inventory button[data-action="examine"][data-target="healing-potion"]';

/** Ada starts the rat tunnels and picks up the healing potion. */
async function carryPotion(page, url) {
  await page.goto(url);
  await page.locator("#open-creation").click();
  await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
  await page.locator("#character-name").fill("Ada");
  await page.locator("#save-character").click();
  await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
  await page.locator('.start-adventure[data-adventure="rat-tunnels"]').click();
  await page.locator("#adventure").waitFor({ state: "visible" });
  await page.locator("#log li").first().waitFor();
  await explore(page, "move", "alcove");
  await explore(page, "examine", "iron-chest");
  await explore(page, "take", "healing-potion");
}

/** The page's dock padding once the dock's resize has been measured. */
const dockPadding = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve(
              getComputedStyle(document.documentElement).getPropertyValue(
                "--session-dock-height",
              ),
            ),
          ),
        );
      }),
  );

async function withSession(viewport, play) {
  const directory = await mkdtemp(join(tmpdir(), "issue-256-"));
  const server = await startFifthBrowserServer({
    adventures: [ratTunnels],
    qualifies: () => true,
    libraryPath: join(directory, "characters.json"),
    seed: 0,
    dmModel: narratingDm(),
  });
  const browser = await launch();
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(5000);
  try {
    await carryPotion(page, server.url);
    await play(page);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test(
  "a focused carried item clears a dock whose height rounds down (375px)",
  { timeout: 60000 },
  () =>
    withSession({ width: 375, height: 812 }, async (page) => {
      // Give the dock a height 0.4 px past a whole pixel, as wider fonts or
      // wrapped rows can, so rounding it to a whole pixel comes up short.
      const height = await page.evaluate(() => {
        const dock = document.getElementById("session-dock");
        const whole = Math.floor(dock.getBoundingClientRect().height) + 1;
        dock.style.boxSizing = "border-box";
        dock.style.height = `${whole + 0.4}px`;
        return dock.getBoundingClientRect().height;
      });
      assert.ok(height % 1 > 0.3, `dock height ${height} is fractional`);
      assert.ok(
        parseFloat(await dockPadding(page)) >= height,
        "the scroll padding covers the whole dock",
      );

      // Scrolled up from below the dock, the carried item's Examine stops at
      // the padding's edge. Focus leaves a button there alone, since the
      // browser counts it as in view, so the edge must be clear of the dock.
      await page.evaluate((selector) => {
        window.scrollTo(0, 0);
        document.querySelector(selector).scrollIntoView({ block: "nearest" });
      }, CARRIED_EXAMINE);
      await page.locator(CARRIED_EXAMINE).focus();
      const shown = await layout(page);
      assert.equal(shown.focus, "Examine");
      assert.equal(shown.focusShown, true, "focused Examine clears the dock");
    }),
);

test(
  "the dock adds no scroll padding where it isn't sticky (1280px)",
  { timeout: 60000 },
  () =>
    withSession({ width: 1280, height: 850 }, async (page) => {
      assert.equal(
        await page.evaluate(
          () =>
            getComputedStyle(document.getElementById("session-dock")).position,
        ),
        "static",
      );
      assert.equal(await dockPadding(page), "0px");
    }),
);
