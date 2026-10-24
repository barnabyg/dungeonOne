// Way marks, browser → API → storage: each card in Ways on carries ↩ on the
// way back to the room Ada last came from and ✦ on a way to a room she has
// not been in, its words on hover, after the way's name for a screen reader
// and on its Go button. The marks survive a reload and a restart.
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
import { ratlessTunnels } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

/**
 * Each card in Ways on: its id, its mark's symbol, hover words and kind,
 * the words a screen reader hears after its name, and its Go button's name.
 */
const ways = (page) =>
  page.locator("#exits li.thing").evaluateAll((cards) =>
    cards.map((card) => {
      const mark = card.querySelector(".way-mark");
      return {
        id: card.dataset.id,
        mark: mark && {
          symbol: mark.textContent,
          title: mark.title,
          kind: mark.dataset.mark,
          hidden: mark.getAttribute("aria-hidden"),
        },
        spoken: card.querySelector(".thing-text .visually-hidden")?.textContent,
        go: card
          .querySelector('button.act[data-action="move"]')
          ?.getAttribute("aria-label"),
      };
    }),
  );

const unexplored = (id, go) => ({
  id,
  mark: {
    symbol: "✦",
    title: "Not yet explored",
    kind: "unvisited",
    hidden: "true",
  },
  spoken: " (not yet explored)",
  go: go + " (not yet explored)",
});
const wayBack = (id, go) => ({
  id,
  mark: {
    symbol: "↩",
    title: "The way you came",
    kind: "came-from",
    hidden: "true",
  },
  spoken: " (the way you came)",
  go: go + " (the way you came)",
});
const plain = (id, go) => ({ id, mark: null, spoken: undefined, go });

test(
  "Ways on marks the way back and the rooms not yet explored, after a reload and a restart",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "way-marks-browser-"));
    const options = {
      libraryPath: join(directory, "characters.json"),
      adventures: [ratlessTunnels],
      // Fixtures are engine material, not gated content.
      qualifies: () => true,
    };
    let server = await startFifthBrowserServer({ ...options, seed: 0 });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(8000);
    try {
      await createAndStart(page, server.url, ratlessTunnels.id);
      // At the start no way leads back; both lead somewhere new.
      assert.deepEqual(await ways(page), [
        unexplored("alcove", "Go west to Alcove"),
        unexplored("rat-cellar", "Go south to Rat-Gnawed Cellar"),
      ]);
      // The two marks differ in colour.
      const colour = (kind) =>
        page
          .locator(`.way-mark[data-mark="${kind}"]`)
          .first()
          .evaluate((mark) => getComputedStyle(mark).color);
      const newColour = await colour("unvisited");

      await clickAction(page, "move", "alcove");
      assert.deepEqual(await ways(page), [
        wayBack("stair-foot", "Go east to Foot of the Stair"),
      ]);
      assert.notEqual(await colour("came-from"), newColour);
      await page
        .getByRole("button", {
          name: "Go east to Foot of the Stair (the way you came)",
        })
        .waitFor();

      // Back at the start, the alcove is the way back and is explored now.
      await clickAction(page, "move", "stair-foot");
      const screen = [
        wayBack("alcove", "Go west to Alcove"),
        unexplored("rat-cellar", "Go south to Rat-Gnawed Cellar"),
      ];
      assert.deepEqual(await ways(page), screen);

      await page.reload();
      await actionButton(page, "move", "alcove").waitFor();
      assert.deepEqual(await ways(page), screen);

      await server.close();
      server = await startFifthBrowserServer({ ...options, seed: 1 });
      const file = await sessionFile(directory);
      assert.equal(file.state.previousRoomId, "alcove");
      await page.goto(`${server.url}/#adventure-${file.id}`);
      await actionButton(page, "move", "alcove").waitFor();
      assert.deepEqual(await ways(page), screen);

      // A way to a room explored but not just left carries no mark.
      await clickAction(page, "move", "rat-cellar");
      const cellar = await ways(page);
      assert.deepEqual(
        cellar.find(({ id }) => id === "stair-foot"),
        wayBack("stair-foot", "Go north to Foot of the Stair"),
      );
      await clickAction(page, "move", "stair-foot");
      assert.deepEqual(await ways(page), [
        plain("alcove", "Go west to Alcove"),
        wayBack("rat-cellar", "Go south to Rat-Gnawed Cellar"),
      ]);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
