// #522, browser → API: the play screen drops what repeats or rarely matters.
// The header bar names the adventure's levels and difficulty but not the
// room (the room panel titles it); there is no Known rooms panel (the map
// keeps the rooms and their records); and no credits footer: the icon and
// sound credits are in Settings, which the header bar opens from every
// screen. The session panel takes the freed height, and the layout holds at
// every width.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { iconCredits } from "../dist/icons-5e.js";
import { soundCredits } from "../dist/sounds-5e.js";
import { startAdventure, text } from "./fixtures/browser-journey.mjs";
import { beaLibrary } from "./fixtures/charismatic-fighter.mjs";
import { goblinYard } from "./fixtures/modules.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

/** How far the session panel's foot sits above the window's. */
const gapBelow = (page) =>
  page.evaluate(
    () =>
      window.innerHeight -
      document.getElementById("adventure").getBoundingClientRect().bottom,
  );

test("the play screen has no room name in the header, no Known rooms and no credits footer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-522-browser-"));
  const libraryPath = join(directory, "characters.json");
  await writeFile(libraryPath, JSON.stringify(beaLibrary()));
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: 7,
    adventures: [goblinYard],
    qualifies: () => true,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1880, height: 1000 },
  });
  page.setDefaultTimeout(8000);
  const credits = page.locator("#credits");
  try {
    await page.goto(server.url);
    // No screen has a footer.
    assert.equal(await page.locator("footer, .credits").count(), 0);
    await page.locator("#characters button").filter({ hasText: "Bea" }).click();
    await startAdventure(page, "goblin-yard");

    // The header: levels and difficulty, no room.
    const meta = page.locator("#adventure-meta");
    assert.equal(await text(meta), "Level 1 · Hard");
    assert.equal(await meta.getAttribute("title"), "Level 1 · Hard");
    assert.equal(
      await text(page.locator("#room-title")),
      goblinYard.rooms[0].name,
    );
    // No Known rooms panel; the map is still there.
    assert.equal(
      await page.locator("#known-rooms, #known-room-list").count(),
      0,
    );
    assert.equal(
      await page.getByRole("heading", { name: "Known rooms" }).count(),
      0,
    );
    assert.equal(await page.locator("#open-map").isVisible(), true);
    assert.equal(await credits.isVisible(), false);

    // The session panel takes the window's height, and the layout holds.
    for (const viewport of [
      { width: 1880, height: 1000 },
      { width: 1280, height: 850 },
      { width: 900, height: 560 },
    ]) {
      await page.setViewportSize(viewport);
      const gap = await gapBelow(page);
      assert.ok(
        gap >= 0 && gap <= 16 + 1,
        `${gap} px below the panel at ${viewport.width}`,
      );
      await assertNoSideScroll(
        page,
        `no horizontal scroll at ${viewport.width}`,
      );
    }

    // Settings, from the play screen's header bar, credits the icons and any
    // CC BY sounds (none now: every sound is CC0) with their licences.
    await page.locator("#open-settings").click();
    await page.locator("#settings-title").waitFor();
    assert.equal(await credits.isVisible(), true);
    assert.equal(
      await text(credits),
      ["Credits", iconCredits(), soundCredits()].filter(Boolean).join("\n"),
    );
    assert.match(await text(credits), /game-icons\.net under CC BY 3\.0\./u);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
