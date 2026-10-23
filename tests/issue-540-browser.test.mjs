// #540, browser → API → storage: Thornwood Lodge hides a Pearl of Power in
// the woodpile at its forest gate. A Wizard finds it there and "You carry"
// says it is attuned; Coldwater Weirgate hides the Wand of the War Mage +1
// on its pump room's dry shelf.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { defaultPlacement } from "../dist/character-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import { explore, launch } from "./fixtures/session-layout.mjs";
import { startAdventure } from "./fixtures/browser-journey.mjs";

const shipped = await loadBuiltInFifthAdventures();
const module = (id) => shipped.find((adventure) => adventure.id === id);

test("the shipped modules hide the caster items on their required paths", () => {
  const items = (id) =>
    module(id)
      .rooms.flatMap(({ id: roomId, items: placed }) =>
        placed.map((item) => ({ roomId, ...item })),
      )
      .filter(({ kind }) => kind === "caster-item")
      .map(({ roomId, id: itemId, casterItem, hiddenIn }) => [
        roomId,
        itemId,
        casterItem,
        hiddenIn,
      ]);
  assert.deepEqual(items("coldwater-weirgate"), [
    ["pump-room", "keepers-wand", "wand-of-the-war-mage-plus-1", "dry-shelf"],
  ]);
  assert.deepEqual(items("thornwood-lodge"), [
    ["forest-gate", "oilskin-pearl", "pearl-of-power", "woodpile"],
  ]);
});

test(
  "a Wizard finds Thornwood Lodge's Pearl of Power in the woodpile and is attuned to it",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-540-browser-"));
    const libraryPath = join(directory, "characters.json");
    const library = new FifthCharacterLibrary(libraryPath, 0);
    const started = await library.startCreation();
    await library.create(
      "Vela",
      {
        ...WIZARD.defaults,
        placement: defaultPlacement(started.pendingCreation.dice, WIZARD),
      },
      started.revision,
      "wizard",
    );
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [module("thornwood-lodge")],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await page.locator("#characters .open-character").first().click();
      await page.locator("#sheet-name").filter({ hasText: "Vela" }).waitFor();
      await startAdventure(page, "thornwood-lodge");

      await explore(page, "examine", "woodpile");
      await explore(page, "take", "oilskin-pearl");
      const carried = page.locator(
        '#inventory li[data-id="thornwood-lodge/oilskin-pearl"]',
      );
      assert.equal(
        await carried.locator("strong").innerText(),
        "Pearl of Power",
      );
      assert.match(
        await carried.locator(".carry-text").textContent(),
        /regain one spent spell slot of 3rd level or lower.* Attuned\.$/u,
      );
      assert.equal(
        await carried
          .locator("button.act[data-action=regain-slot]")
          .isDisabled(),
        true,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
