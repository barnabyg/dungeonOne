// #491, browser → API → storage: once a feature or an item is examined, its
// Examine button reads "✓ Examined" in a muted style, stays enabled and is
// named "Examine Water Butt (examined)". An item keeps its mark on "You
// carry" once taken, and both marks survive a reload and a restart.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  actionButton,
  clickAction,
  createAndStart,
} from "./fixtures/browser-journey.mjs";
import { findsYard } from "./fixtures/finds-yard.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

/** The Examine button on `target`: its text, accessible name, mark and state. */
const examineButton = (page, target) =>
  actionButton(page, "examine", target).evaluate((button) => ({
    text: button.textContent,
    name: button.getAttribute("aria-label"),
    examined: button.classList.contains("examined"),
    disabled: button.disabled,
    carried: button.closest("#inventory") !== null,
  }));

const unmarked = (name, carried = false) => ({
  text: "Examine",
  name: `Examine ${name}`,
  examined: false,
  disabled: false,
  carried,
});
const marked = (name, carried = false) => ({
  text: "✓ Examined",
  name: `Examine ${name} (examined)`,
  examined: true,
  disabled: false,
  carried,
});

test(
  "examined features and items are marked, in the room and on You carry, after a reload and a restart",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-491-browser-"));
    const options = {
      libraryPath: join(directory, "characters.json"),
      adventures: [findsYard],
      qualifies: () => true,
    };
    let server = await startFifthBrowserServer({ ...options, seed: 0 });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(8000);
    try {
      await createAndStart(page, server.url, findsYard.id);
      assert.deepEqual(
        await examineButton(page, "water-butt"),
        unmarked("Water Butt"),
      );
      assert.deepEqual(
        await examineButton(page, "yard-potion"),
        unmarked("Potion of Healing"),
      );

      await clickAction(page, "examine", "water-butt");
      assert.deepEqual(
        await examineButton(page, "water-butt"),
        marked("Water Butt"),
      );
      // The accessible name is the button's role name.
      await page
        .getByRole("button", { name: "Examine Water Butt (examined)" })
        .waitFor();
      // Muted: its text is the page's muted colour.
      const colours = await page.evaluate(() => {
        const muted = document.createElement("span");
        muted.className = "reason";
        document.body.append(muted);
        const colour = getComputedStyle(muted).color;
        muted.remove();
        return {
          muted: colour,
          button: getComputedStyle(
            document.querySelector(
              'button.act[data-action="examine"][data-target="water-butt"]',
            ),
          ).color,
        };
      });
      assert.equal(colours.button, colours.muted);
      // Examining again still works, and shows it again.
      const entries = await page.locator("#log li").count();
      await clickAction(page, "examine", "water-butt");
      assert.equal(await page.locator("#log li").count(), entries + 1);
      // The other feature is not marked.
      assert.deepEqual(
        await examineButton(page, "woodpile"),
        unmarked("Woodpile"),
      );

      await clickAction(page, "examine", "yard-potion");
      assert.deepEqual(
        await examineButton(page, "yard-potion"),
        marked("Potion of Healing"),
      );
      await clickAction(page, "take", "yard-potion");
      const screen = {
        butt: marked("Water Butt"),
        potion: marked("Potion of Healing", true),
      };
      const shown = async () => ({
        butt: await examineButton(page, "water-butt"),
        potion: await examineButton(page, "yard-potion"),
      });
      assert.deepEqual(await shown(), screen);

      await page.reload();
      await actionButton(page, "examine", "yard-potion").waitFor();
      assert.deepEqual(await shown(), screen);

      await server.close();
      server = await startFifthBrowserServer({ ...options, seed: 1 });
      const file = await sessionFile(directory);
      assert.deepEqual(file.state.examinedItemIds, ["yard-potion"]);
      await page.goto(`${server.url}/#adventure-${file.id}`);
      await actionButton(page, "examine", "yard-potion").waitFor();
      assert.deepEqual(await shown(), screen);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
