// #377, browser → API → storage: Bea finds a purse and a dagger in the
// Goblin Yard and goes down to the goblin. Each shows its icon in the room's
// lists and beside the log line that names it, the goblin also in the
// initiative table; the log's text is unchanged, the icons survive a reload,
// and the footer credits the artists.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { iconCredits } from "../dist/icons-5e.js";
import { launch } from "./fixtures/session-layout.mjs";
import {
  clickAction,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { beaLibrary } from "./fixtures/charismatic-fighter.mjs";
import { goblinYard } from "./fixtures/modules.mjs";

/** The icons in `locator`, in order. */
const iconsIn = (locator) =>
  locator.evaluate((node) =>
    [...node.querySelectorAll("svg.icon")].map((svg) =>
      svg.querySelector("use").getAttribute("href"),
    ),
  );

/** The text that follows the first icon in `locator`. */
const afterIcon = (locator) =>
  locator.evaluate((node) => {
    const svg = node.querySelector("svg.icon");
    let text = "";
    for (let next = svg.nextSibling; next; next = next.nextSibling) {
      text += next.textContent;
    }
    return text;
  });

test("monsters and items show their icons beside the text that names them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-377-browser-"));
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
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(8000);
  const last = () => page.locator("#log > li").last();
  try {
    await page.goto(server.url);
    await page.locator("#characters button").filter({ hasText: "Bea" }).click();
    await startAdventure(page, "goblin-yard");
    assert.equal(await text(page.locator(".credits")), iconCredits());

    // Found: each item in the room's list after its icon, and in the line
    // that finds it.
    await clickAction(page, "examine", "woodpile");
    assert.deepEqual(await iconsIn(last()), ["#icon-plain-dagger"]);
    assert.match(await text(last()), /You find the Dagger\.$/u);
    assert.equal(await afterIcon(last().locator("p").last()), "Dagger.");
    await clickAction(page, "examine", "water-butt");
    assert.deepEqual(await iconsIn(page.locator("#room-items")), [
      "#icon-two-coins",
      "#icon-plain-dagger",
    ]);

    // Taken: the coin line starts with the purse; the purse shows it too.
    await clickAction(page, "take", "lost-purse");
    assert.deepEqual(await iconsIn(last()), ["#icon-two-coins"]);
    assert.equal(
      await text(last()),
      "You take the Lost Purse and put 5 sp in your purse.",
    );
    assert.deepEqual(await iconsIn(page.locator("#purse")), [
      "#icon-two-coins",
    ]);
    await clickAction(page, "take", "yard-dagger");
    assert.deepEqual(
      await iconsIn(page.locator('#inventory li[data-id="dagger"]')),
      ["#icon-plain-dagger"],
    );

    // The goblin: before its description as Bea enters, and in the table.
    await clickAction(page, "move", "cellar");
    const entered = last().locator(".card-line").first();
    assert.deepEqual(await iconsIn(entered), ["#icon-goblin"]);
    assert.equal(
      await afterIcon(entered),
      "A small, sharp-toothed goblin in scraps of leather, scimitar already drawn.",
    );
    assert.deepEqual(
      await iconsIn(
        page.locator('#initiative-rows tr[data-combatant="goblin"]'),
      ),
      ["#icon-goblin"],
    );
    const log = await page.locator("#log").innerHTML();

    // A reload draws the saved lines' icons again.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    assert.equal(await page.locator("#log").innerHTML(), log);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
