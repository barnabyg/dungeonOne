// #405, browser → API → storage: Ada explores the Two-Level Tunnels. The map
// (#457; the play screen has no Known rooms panel since #522) shows the
// record of each room she has been in without moving her: what she found
// there, or that she learned nothing yet; a reload keeps the records.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  clickAction,
  createAndStart,
  text,
} from "./fixtures/browser-journey.mjs";
import { regionTunnels } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

test("the map shows a known room's record without moving her", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-405-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [regionTunnels],
    // Fixtures are engine material, not gated content.
    qualifies: () => true,
    libraryPath: join(directory, "characters.json"),
    seed: 1,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
  });
  page.setDefaultTimeout(5000);
  const record = page.locator("#map-record");
  /** Opens the map and chooses `room` on it. */
  const choose = async (room) => {
    if (!(await page.locator("#map-dialog").isVisible())) {
      await page.locator("#open-map").click();
    }
    await page.locator(`.map-room[data-room='${room}'] > button`).click();
  };
  try {
    await createAndStart(page, server.url, "region-tunnels");
    // Her own room's record, before and after she finds something there.
    await choose("stair-foot");
    assert.equal(
      await text(record),
      "Foot of the Stair: you are here\nNothing learned here yet.",
    );
    await page.locator("#close-map").click();
    await clickAction(page, "examine", "rusted-lantern");
    await choose("stair-foot");
    assert.match(
      await text(record),
      /^Foot of the Stair: you are here\nRusted Lantern: Scratched into the lantern's base: "Rats in the cellar\. Boss in the den\."$/u,
    );
    await page.locator("#close-map").click();

    // From the rat's cellar the alcove is not next door: choosing it shows
    // its record and she stays put.
    await clickAction(page, "move", "alcove");
    await clickAction(page, "move", "stair-foot");
    await clickAction(page, "move", "rat-cellar");
    await choose("alcove");
    assert.equal(await text(record), "Alcove\nNothing learned here yet.");
    assert.equal(
      await page.locator("#room-title").textContent(),
      "Rat-Gnawed Cellar",
    );
    assert.deepEqual((await sessionFile(directory)).state.visitedRoomIds, [
      "stair-foot",
      "alcove",
      "rat-cellar",
    ]);

    // A reload keeps the records.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    await choose("stair-foot");
    assert.match(await text(record), /\nRusted Lantern: /u);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
