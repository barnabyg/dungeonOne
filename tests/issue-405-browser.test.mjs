// #405, browser → API → storage: Ada explores the Two-Level Tunnels. The
// Known rooms panel lists the rooms she has been in and those seen through
// an exit, by region, with her own marked; choosing one shows its record
// without moving her, and a reload shows the same rooms.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { clickAction, createAndStart } from "./fixtures/browser-journey.mjs";
import { regionTunnels } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

/** Each region's heading and its rooms' buttons, as the panel shows them. */
const panel = (page) =>
  page
    .locator("#known-room-list .known-region")
    .evaluateAll((groups) =>
      groups.map((group) => [
        group.querySelector("h4")?.textContent,
        [...group.querySelectorAll("button")].map(
          (button) =>
            button.textContent +
            (button.getAttribute("aria-pressed") === "true" ? " [shown]" : ""),
        ),
      ]),
    );

test("the Known rooms panel lists the rooms by region and shows a room's record without moving", async () => {
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
  const record = page.locator("#known-room-record");
  try {
    await createAndStart(page, server.url, "region-tunnels");
    assert.deepEqual(await panel(page), [
      [
        "Upper Tunnels",
        ["Foot of the Stair (you are here) [shown]", "Alcove (seen)"],
      ],
      ["Lower Tunnels", ["Rat-Gnawed Cellar (seen)"]],
    ]);
    assert.match(await record.innerText(), /Nothing learned here yet\./u);

    await clickAction(page, "examine", "rusted-lantern");
    await clickAction(page, "move", "alcove");
    assert.deepEqual(await panel(page), [
      ["Upper Tunnels", ["Foot of the Stair", "Alcove (you are here) [shown]"]],
      ["Lower Tunnels", ["Rat-Gnawed Cellar (seen)"]],
    ]);

    // Choosing the stair foot shows what she found there; she stays put.
    await page
      .locator("#known-room-list button[data-room='stair-foot']")
      .click();
    assert.match(
      await record.innerText(),
      /^Foot of the Stair\nRusted Lantern: Scratched into the lantern's base: "Rats in the cellar\. Boss in the den\."$/u,
    );
    assert.equal(await page.locator("#room-title").textContent(), "Alcove");
    // A room only seen has no record yet.
    await page
      .locator("#known-room-list button[data-room='rat-cellar']")
      .click();
    assert.match(await record.innerText(), /you have not been in\./u);
    assert.deepEqual((await sessionFile(directory)).state.visitedRoomIds, [
      "stair-foot",
      "alcove",
    ]);

    // A reload shows the same rooms, the current one's record shown.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    assert.deepEqual(await panel(page), [
      ["Upper Tunnels", ["Foot of the Stair", "Alcove (you are here) [shown]"]],
      ["Lower Tunnels", ["Rat-Gnawed Cellar (seen)"]],
    ]);
    await page
      .locator("#known-room-list button[data-room='stair-foot']")
      .click();
    assert.match(await record.innerText(), /Rusted Lantern: /u);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
