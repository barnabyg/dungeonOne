// #214: exploring actions in an aligned, one-thing-per-row layout. Each
// thing's name sits in a shared column on its own row, its verb buttons start
// at the same x on every row, and every verb button is the same width, so the
// same verb lines up from row to row. Names longer than their column wrap
// rather than pushing the buttons out of line, and each name is level with
// its first button even when a disabled button's reason makes the row taller.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { ratlessTunnels } from "./fixtures/modules.mjs";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

async function start(page, url, adventureId) {
  await page.goto(url);
  await page.locator("#open-creation").click();
  await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
  await page.locator("#character-name").fill("Ada");
  await page.locator("#save-character").click();
  await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
  await page
    .locator(`.start-adventure[data-adventure="${adventureId}"]`)
    .click();
  await page.locator("#adventure").waitFor({ state: "visible" });
  await page.locator("#log li").first().waitFor();
}

/** Each thing row's box, its name's box and its verb buttons' boxes. */
const rows = (page) =>
  page.locator("#explore-controls .thing-actions").evaluateAll((things) =>
    things.map((thing) => {
      const box = (node) => {
        const { left, right, top, bottom, width } =
          node.getBoundingClientRect();
        return { left, right, top, bottom, width };
      };
      return {
        name: thing.querySelector(".thing-name").textContent,
        row: box(thing),
        label: box(thing.querySelector(".thing-name")),
        buttons: [...thing.querySelectorAll("button")].map(box),
      };
    }),
  );

/** Checks the layout rules of #214 against the current action bar. */
async function assertAligned(page) {
  const things = await rows(page);
  assert.ok(things.length >= 2, JSON.stringify(things));
  const names = things.map(({ name }) => name).join(", ");
  // One thing per row: no two rows share any vertical space.
  for (let index = 1; index < things.length; index++) {
    assert.ok(
      things[index].row.top >= things[index - 1].row.bottom - 0.5,
      `${things[index].name} shares a row with ${things[index - 1].name}`,
    );
  }
  // Names share a left edge, and every row's first button starts at one x,
  // to the right of every name.
  const lefts = new Set(things.map(({ label }) => Math.round(label.left)));
  assert.equal(lefts.size, 1, names);
  const starts = new Set(
    things.map(({ buttons }) => Math.round(buttons[0].left)),
  );
  assert.equal(starts.size, 1, names);
  const start = [...starts][0];
  for (const { name, label, buttons } of things) {
    assert.ok(label.right <= start, `${name} runs into its buttons`);
    // A name sits level with its first button, not centred on the row.
    assert.ok(
      label.top >= buttons[0].top && label.top < buttons[0].bottom,
      `${name} is not level with its first button`,
    );
  }
  // Every verb button is the same width.
  const widths = new Set(
    things.flatMap(({ buttons }) =>
      buttons.map(({ width }) => Math.round(width)),
    ),
  );
  assert.equal(widths.size, 1, [...widths].join(", "));
}

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `exploring actions line up, one thing per row (${viewport.width}px)`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-214-"));
      const server = await startFifthBrowserServer({
        adventures: [ratlessTunnels],
        libraryPath: join(directory, "characters.json"),
        seed: 0,
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await start(page, server.url, "quiet-tunnels");
        const act = async (name) => {
          const count = await page.locator("#log li").count();
          await page.getByRole("button", { name, exact: true }).click();
          await page.waitForFunction(
            (seen) => document.querySelectorAll("#log li").length > seen,
            count,
          );
        };

        // The stair: two exits and a feature, with "Go" beside "Examine".
        await assertAligned(page);

        // The alcove after taking the potion: a disabled Drink with its
        // reason, beside rows with different verbs and name lengths.
        await act("Go to Alcove");
        await act("Examine Iron-Bound Chest");
        await act("Take Potion of Healing");
        await assertAligned(page);
        assert.equal(
          await page
            .getByRole("button", {
              name: "Drink Potion of Healing",
              exact: true,
            })
            .textContent(),
          "Drink",
        );

        // No horizontal scroll, even with a wide font as CI's Linux one is.
        assert.ok(
          await page.evaluate(() => {
            for (const node of document.querySelectorAll("*")) {
              node.style.fontFamily = "Verdana, sans-serif";
            }
            return document.documentElement.scrollWidth <= window.innerWidth;
          }),
          "no horizontal scroll",
        );
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
