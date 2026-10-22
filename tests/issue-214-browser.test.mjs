// #214: exploring actions in an aligned, one-thing-per-row layout, now on
// the room's cards (#520). Each thing is a card of its own with its verb
// buttons on its right: every card's buttons end at the same x, to the right
// of its name and description, which start at one left edge and wrap rather
// than pushing the buttons out of line. Each name is level with its first
// button even when a disabled button's reason makes the card taller.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";
import { ratlessTunnels } from "./fixtures/modules.mjs";
import { createAndStart } from "./fixtures/browser-journey.mjs";

/** Each card's box, its text's box and its verb buttons' boxes. */
const rows = (page) =>
  page.locator("#room li[data-id]").evaluateAll((things) =>
    things.map((thing) => {
      const box = (node) => {
        const { left, right, top, bottom, width } =
          node.getBoundingClientRect();
        return { left, right, top, bottom, width };
      };
      return {
        name: thing.querySelector("strong").textContent,
        row: box(thing),
        label: box(thing.querySelector(".thing-text")),
        buttons: [...thing.querySelectorAll(".thing-controls button")].map(box),
      };
    }),
  );

/** Checks the layout rules of #214 against the room's cards. */
async function assertAligned(page) {
  const things = await rows(page);
  assert.ok(things.length >= 2, JSON.stringify(things));
  const names = things.map(({ name }) => name).join(", ");
  // One thing per card: no two cards share any vertical space.
  for (let index = 1; index < things.length; index++) {
    assert.ok(
      things[index].row.top >= things[index - 1].row.bottom - 0.5,
      `${things[index].name} shares a row with ${things[index - 1].name}`,
    );
  }
  // Texts share a left edge, and every card's last button ends at one x,
  // to the right of its text.
  const lefts = new Set(things.map(({ label }) => Math.round(label.left)));
  assert.equal(lefts.size, 1, names);
  const ends = new Set(
    things.map(({ buttons }) => Math.round(buttons.at(-1).right)),
  );
  assert.equal(ends.size, 1, names);
  for (const { name, label, buttons } of things) {
    assert.ok(label.right <= buttons[0].left, `${name} runs into its buttons`);
    // A name sits level with its first button, not centred on the card.
    assert.ok(
      label.top >= buttons[0].top - 1 && label.top < buttons[0].bottom,
      `${name} is not level with its first button`,
    );
  }
}

const viewport = { width: 1280, height: 850 };
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

      // Empty lists are left out: the stair has exits and a feature, but
      // no items (#157).
      assert.equal(await page.locator("#room-items-group").isVisible(), false);
      // What Ada carries is always listed: her own gear (#209).
      assert.equal(await page.locator("#inventory-group").isVisible(), true);
      assert.equal(await page.locator("#room-empty").isVisible(), false);
      assert.doesNotMatch(await page.locator("#room").innerText(), /None\./);

      // The stair: a feature and two exits, each card with its own verb.
      // Each name is shown once, beside its short verbs, and the verbs are
      // named in full (#157).
      await assertAligned(page);
      assert.deepEqual(
        await page
          .locator("#room li[data-id]")
          .evaluateAll((things) =>
            things.map(
              (thing) =>
                thing.querySelector("strong").textContent +
                " " +
                thing.querySelector(".thing-controls").innerText,
            ),
          ),
        [
          "Rusted Lantern Examine",
          "West: Alcove Go",
          "South: Rat-Gnawed Cellar Go",
        ],
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
      await act("Go west to Alcove");
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
      assert.equal(await page.locator("#room-items-group").isVisible(), false);

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
