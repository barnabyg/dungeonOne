// #457, browser → API → storage: Ada explores the Mapped Tunnels with the
// map pop-up. The Map button and M open it, Escape and Close return focus;
// M typed in the message box is just a letter. It draws only the rooms she
// has visited and "?" stubs for the ways out of them, naming no room she
// has not been in; a hidden passage shows once found. Choosing a stub, a
// room or a stair next to hers makes the same move as Go to and closes the
// map; one click never moves more than one room, and no move is made while
// the Dungeon Master is answering or in a fight. Each floor has a tab, all
// drawn to one origin. A reload shows the same map, and it fits 900 × 560.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  clickAction,
  createAndStart,
  settled,
} from "./fixtures/browser-journey.mjs";
import { mapTunnels } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

const CELL = { x: 176, y: 128 };

/**
 * What the map draws: each room by name (and "!" for hers) with its stair
 * lines and its centre, each stub by accessible name with its centre, each
 * mark by name, and how many lines; centres in cells from her room's.
 */
const drawn = (page) =>
  page.locator("#map-canvas").evaluate((canvas, cell) => {
    const centre = (node, width, height) => [
      parseFloat(node.style.left) + width / 2,
      parseFloat(node.style.top) + height / 2,
    ];
    const boxes = [...canvas.querySelectorAll(".map-room")];
    const here = boxes.find((box) => box.classList.contains("current"));
    const origin = here ? centre(here, 136, 88) : centre(boxes[0], 136, 88);
    const at = ([x, y]) => [(x - origin[0]) / cell.x, (y - origin[1]) / cell.y];
    return {
      rooms: boxes.map((box) => ({
        name:
          box.querySelector("button").firstChild.textContent +
          (box.classList.contains("current") ? "!" : ""),
        at: at(centre(box, 136, 88)),
        ways: [...box.querySelectorAll(".map-way")].map(
          (way) => way.textContent + (way.tagName === "BUTTON" ? " [go]" : ""),
        ),
      })),
      stubs: [...canvas.querySelectorAll(".map-stub")].map((stub) => [
        stub.getAttribute("aria-label"),
        at(centre(stub, 40, 40)),
      ]),
      marks: [...canvas.querySelectorAll(".map-mark")].map((mark) =>
        mark.getAttribute("aria-label"),
      ),
      lines: canvas.querySelectorAll(".map-lines line").length,
    };
  }, CELL);

/** Every text and attribute value in the map pop-up, to look for names. */
const dialogText = (page) =>
  page
    .locator("#map-dialog")
    .evaluate((dialog) =>
      [dialog, ...dialog.querySelectorAll("*")]
        .flatMap((node) => [
          ...[...node.attributes].map(({ value }) => value),
          ...[...node.childNodes]
            .filter(({ nodeType }) => nodeType === Node.TEXT_NODE)
            .map(({ textContent }) => textContent),
        ])
        .join("\n"),
    );

/** A DM whose reply waits until `release` is called. */
function heldDm() {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  return {
    release: () => release(),
    model: {
      async respond() {
        await held;
        return { text: "Water drips; nothing stirs." };
      },
    },
  };
}

test("the map pop-up shows the rooms visited and moves one room per click", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-457-browser-"));
  const dm = heldDm();
  const server = await startFifthBrowserServer({
    adventures: [mapTunnels],
    // Fixtures are engine material, not gated content.
    qualifies: () => true,
    libraryPath: join(directory, "characters.json"),
    dmModel: dm.model,
    seed: 1,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
  });
  page.setDefaultTimeout(5000);
  const dialog = page.locator("#map-dialog");
  const openButton = page.locator("#open-map");
  const status = page.locator("#map-status");
  const record = page.locator("#map-record");
  /** Clicks `target` in the map and waits for the move's settled entry. */
  const moveBy = async (target, destination) => {
    const sent = page.waitForRequest("**/api/5e/session/explore");
    await settled(page, () => target.click());
    // The same request as Go to's.
    assert.deepEqual((await sent).postDataJSON().action, "move");
    assert.deepEqual((await sent).postDataJSON().target, destination);
    assert.equal(await dialog.isVisible(), false, "the map closes on a move");
  };
  try {
    await createAndStart(page, server.url, "map-tunnels");
    assert.equal(await openButton.isVisible(), true);

    // The button opens it, focused on her room; Escape returns focus.
    await openButton.click();
    assert.equal(await dialog.isVisible(), true);
    assert.equal(
      await page.evaluate(
        () => document.activeElement.closest(".map-room")?.dataset.room,
      ),
      "stair-foot",
    );
    assert.deepEqual(await drawn(page), {
      rooms: [
        {
          name: "Foot of the Stair!",
          at: [0, 0],
          ways: ["↑ stairs NE: ? [go]"],
        },
      ],
      // The gallery's stub is two cells east, on its own cell.
      stubs: [
        ["Go west to a room not yet explored", [-1, 0]],
        ["Go south to a room not yet explored", [0, 1]],
        ["Go east to a room not yet explored", [2, 0]],
      ],
      marks: [],
      lines: 3,
    });
    assert.equal(
      await page.locator("#map-floors").isVisible(),
      false,
      "no floor tabs with one floor visited",
    );
    const unvisited = [
      "Alcove",
      "Rat-Gnawed Cellar",
      "Smugglers' Den",
      "Long Gallery",
      "Belfry",
      "Sump",
      "Cupboard",
      "Lower Tunnels",
    ];
    const shown = await dialogText(page);
    for (const name of unvisited) {
      assert.equal(shown.includes(name), false, `${name} is not named`);
    }
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), false);
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "open-map",
    );

    // M opens it from anywhere but the message box; Close returns focus.
    await page.locator("#log").focus();
    await page.keyboard.press("m");
    assert.equal(await dialog.isVisible(), true);
    await page.locator("#close-map").click();
    assert.equal(await dialog.isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), "log");
    await page.locator("#message").focus();
    await page.keyboard.type("m");
    assert.equal(await dialog.isVisible(), false);
    assert.equal(await page.locator("#message").inputValue(), "m");
    await page.locator("#message").fill("");

    // The hidden passage shows once the wall gives it away.
    await clickAction(page, "examine", "draughty-wall");
    await openButton.click();
    assert.deepEqual((await drawn(page)).stubs.at(-1), [
      "Go north to a room not yet explored",
      [0, -1],
    ]);

    // A stub two cells east is one move, to the gallery, not two.
    await moveBy(
      page.locator("#map-canvas .map-stub[aria-label^='Go east']"),
      "gallery",
    );
    assert.equal(
      await page.locator("#room-title").textContent(),
      "Long Gallery",
    );
    await page.keyboard.press("m");
    const fromGallery = await drawn(page);
    assert.deepEqual(fromGallery.rooms, [
      { name: "Foot of the Stair", at: [-2, 0], ways: ["↑ stairs NE: ?"] },
      { name: "Long Gallery!", at: [0, 0], ways: ["↓ ladder: ? [go]"] },
    ]);

    // Down the ladder by its line on the gallery: the map opens on the
    // floor she is on, with a tab per floor, all to one origin.
    await moveBy(page.locator("#map-canvas button.map-way"), "sump");
    await page.keyboard.press("m");
    assert.deepEqual(
      await page
        .locator("#map-floors button")
        .evaluateAll((tabs) =>
          tabs.map(
            (tab) =>
              tab.textContent +
              (tab.getAttribute("aria-pressed") === "true" ? " [shown]" : ""),
          ),
        ),
      ["Main floor", "1 floor down [shown]"],
    );
    assert.deepEqual((await drawn(page)).rooms, [
      { name: "Sump!", at: [0, 0], ways: ["↑ ladder: Long Gallery [go]"] },
    ]);
    const sumpLeft = await page
      .locator(".map-room[data-room='sump']")
      .evaluate((box) => box.style.left);
    await page.locator("#map-floors button[data-floor='0']").click();
    const mainFloor = await page
      .locator("#map-canvas")
      .evaluate((canvas) =>
        [...canvas.querySelectorAll(".map-room")].map((box) => [
          box.dataset.room,
          box.style.left,
        ]),
      );
    assert.deepEqual(
      mainFloor.find(([id]) => id === "gallery"),
      ["gallery", sumpLeft],
      "the gallery and the sump below it share a column",
    );
    assert.deepEqual(
      (await drawn(page)).rooms.map(({ name, ways }) => [name, ways]),
      [
        ["Foot of the Stair", ["↑ stairs NE: ?"]],
        ["Long Gallery", ["↓ ladder: Sump"]],
      ],
    );

    // A room not next to hers shows its record and does not move her.
    await page.locator(".map-room[data-room='stair-foot'] > button").click();
    assert.match(await record.innerText(), /^Foot of the Stair\n/u);
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await page.locator("#room-title").textContent(), "Sump");
    const before = await drawn(page);
    await page.locator("#close-map").click();

    // A reload shows the same map.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    await openButton.click();
    await page.locator("#map-floors button[data-floor='0']").click();
    assert.deepEqual(await drawn(page), before);
    await page.locator("#close-map").click();

    // While the Dungeon Master answers, the map moves no one.
    await page.locator("#message").fill("I listen at the water.");
    await page.locator("#send-message").click();
    await page.locator("#log li[data-pending]").waitFor();
    await openButton.click();
    await page.locator("#map-canvas button.map-way").click();
    assert.equal(
      await status.textContent(),
      "Wait for the Dungeon Master's reply first.",
    );
    assert.equal(await dialog.isVisible(), true);
    dm.release();
    await page.locator("#log li[data-pending]").waitFor({ state: "detached" });
    assert.equal(await page.locator("#room-title").textContent(), "Sump");
    await page.locator("#close-map").click();

    // Nor in a fight: the rat's cellar, then the stair foot on the map.
    await clickAction(page, "move", "gallery");
    await clickAction(page, "move", "stair-foot");
    await clickAction(page, "move", "rat-cellar");
    assert.equal(await page.locator("#encounter").isVisible(), true);
    await openButton.click();
    await page.locator(".map-room[data-room='stair-foot'] > button").click();
    assert.equal(
      await status.textContent(),
      "Not in a fight: flee from the action bar instead.",
    );
    assert.match(await record.innerText(), /^Foot of the Stair\n/u);
    assert.equal(
      await page.locator("#room-title").textContent(),
      "Rat-Gnawed Cellar",
    );
    assert.deepEqual((await sessionFile(directory)).state.visitedRoomIds, [
      "stair-foot",
      "gallery",
      "sump",
      "rat-cellar",
    ]);
    await page.keyboard.press("Escape");

    // At the smallest window the pop-up fits, and the map scrolls inside it.
    await page.setViewportSize({ width: 900, height: 560 });
    await openButton.click();
    const fit = await page.evaluate(() => {
      const box = document.querySelector("#map-dialog").getBoundingClientRect();
      const view = document.querySelector("#map-view").getBoundingClientRect();
      return {
        dialog:
          box.left >= 0 &&
          box.top >= 0 &&
          box.right <= window.innerWidth &&
          box.bottom <= window.innerHeight,
        view: view.right <= box.right && view.bottom <= box.bottom,
        tall: view.height > 200,
      };
    });
    assert.deepEqual(fit, { dialog: true, view: true, tall: true });
    await assertNoSideScroll(page);
  } finally {
    dm.release();
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
