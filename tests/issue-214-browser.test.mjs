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
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";
import { ratlessTunnels } from "./fixtures/modules.mjs";
import { createAndStart } from "./fixtures/browser-journey.mjs";

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
        await createAndStart(page, server.url, "quiet-tunnels");
        const act = async (name) => {
          const count = await page.locator("#log li").count();
          await page.getByRole("button", { name, exact: true }).click();
          await page.waitForFunction(
            (seen) => document.querySelectorAll("#log li").length > seen,
            count,
          );
        };

        // Out of a fight there is no room disclosure, and empty lists are
        // left out: the stair has exits and a feature, but no items (#157).
        assert.equal(await page.locator("#room-toggle").isVisible(), false);
        assert.equal(
          await page.locator("#room-items-group").isVisible(),
          false,
        );
        // What Ada carries is always listed: her own gear (#209).
        assert.equal(await page.locator("#inventory-group").isVisible(), true);
        assert.equal(await page.locator("#room-empty").isVisible(), false);
        assert.doesNotMatch(await page.locator("#room").innerText(), /None\./);

        // The stair: two exits and a feature, with "Go" beside "Examine".
        // Each name is shown once, beside its short verbs, and the verbs are
        // named in full (#157).
        await assertAligned(page);
        assert.deepEqual(
          await page
            .locator("#explore-controls .thing-actions")
            .evaluateAll((things) =>
              things.map((thing) => thing.innerText.replace(/\s+/g, " ")),
            ),
          ["Alcove Go", "Rat-Gnawed Cellar Go", "Rusted Lantern Examine"],
        );
        assert.equal(
          await page
            .getByRole("button", {
              name: "Examine Rusted Lantern",
              exact: true,
            })
            .textContent(),
          "Examine",
        );

        // The alcove after taking the potion: a disabled Drink with its
        // reason, beside rows with different verbs and name lengths.
        await act("Go to Alcove");
        await act("Examine Iron-Bound Chest");
        assert.equal(
          await page
            .getByRole("button", {
              name: "Take Potion of Healing",
              exact: true,
            })
            .textContent(),
          "Take",
        );
        await act("Take Potion of Healing");
        await assertAligned(page);
        // Drink is unavailable at full HP: the reason is its description.
        const drink = page.getByRole("button", {
          name: "Drink Potion of Healing",
          exact: true,
        });
        assert.equal(await drink.textContent(), "Drink");
        assert.equal(await drink.isDisabled(), true);
        assert.equal(
          await drink.evaluate(
            (button) =>
              document.getElementById(button.getAttribute("aria-describedby"))
                .textContent,
          ),
          "Full HP",
        );
        assert.equal(await page.locator("#inventory-group").isVisible(), true);
        assert.equal(
          await page.locator("#room-items-group").isVisible(),
          false,
        );

        // No horizontal scroll, even with a wide font as CI's Linux one is.
        await assertNoSideScroll(page, "no horizontal scroll", {
          wideFont: true,
        });
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
