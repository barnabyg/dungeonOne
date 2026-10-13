// #401, browser → API → storage: Ada knocks the Stacked Crates over at the
// foot of the stair in the Alarmed Tunnels. The check fails by 5 or more, a
// noisy band: the card names what raised the alarm, the room panel shows the
// module's words, the saved session holds what raised it, the grate closes
// the way down, and after a reload the alarm is still raised.
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
import { alarmTunnels, ratTunnels } from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

const WORDS =
  "A gong booms below, and goblin voices shout. The tunnels are roused.";

test("Ada raises the alarm at the crates, and it stays raised after a reload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-401-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [alarmTunnels, ratTunnels],
    // Fixtures are engine material, not gated content.
    qualifies: () => true,
    libraryPath: join(directory, "characters.json"),
    seed: 4,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
  });
  page.setDefaultTimeout(5000);
  const alarm = page.locator("#room-alarm");
  const way = page.locator('#exits li[data-id="rat-cellar"] .route');
  try {
    await createAndStart(page, server.url, "alarm-tunnels");
    // Quiet at first: no alarm in the room panel, the way down open.
    assert.equal(await alarm.isHidden(), true);
    assert.equal(await way.count(), 0);

    // On seed 4 the check fails by 5 or more: the crates crash down.
    await settled(page, () => clickAction(page, "examine", "stacked-crates"));
    const log = await page.locator("#log").textContent();
    assert.match(
      log,
      /The alarm is raised by examining the Stacked Crates \(failure by 5 or more\)\. A gong booms below/u,
    );
    assert.equal(await alarm.isVisible(), true);
    assert.equal(await alarm.textContent(), WORDS);
    assert.equal(await way.textContent(), "The way is closed.");
    const saved = (await sessionFile(directory)).state;
    assert.deepEqual(saved.alarm, {
      by: "check",
      checkId: "examine:stacked-crates",
      band: "failure-by-5",
    });
    assert.ok(saved.flags.includes("alarm"));

    // A reload keeps the alarm raised, in the module's words.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    assert.deepEqual((await sessionFile(directory)).state.alarm, saved.alarm);
    assert.equal(await alarm.isVisible(), true);
    assert.equal(await alarm.textContent(), WORDS);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
