// #240, browser → API → storage: Ada defeats the barrow's bestiary Goblin
// Warrior, whose loot the authoring-time roll gave it from its treasure type.
// Nothing of it shows until its body is searched after the fight; the search
// finds exactly the items the module records, and taking and escaping puts
// exactly their coin in the saved library.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { formatCoins } from "../dist/equipment-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { room } from "./fixtures/modules.mjs";
import { rolledBarrow } from "./fixtures/rolled-barrow.mjs";
import {
  explore,
  fightOn,
  firstFighter,
  launch,
} from "./fixtures/session-layout.mjs";

/** What the module records the goblin carrying. */
const carried = room(rolledBarrow, "burial-hall").items.filter(
  ({ hiddenIn }) => hiddenIn === "barrow-goblin",
);

/** A browser seed on which the first Ada wins the burial hall's fight. */
function winningSeed() {
  for (let seed = 0; seed < 500; seed++) {
    const runtime = createFifthRuntime(rolledBarrow, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    const run = (state, action) =>
      runtime.handleAction(state, action, random).state;
    let state = run(runtime.createSession(), { type: "begin" });
    state = run(state, { type: "move", destinationId: "burial-hall" });
    while (state.encounter?.outcome === "ongoing") {
      state = run(
        state,
        runtime.attackTargets(state).length > 0
          ? { type: "attack", actorId: "pc", targetId: "barrow-goblin" }
          : { type: "end-turn", actorId: "pc" },
      );
    }
    if (state.status === "playing") {
      return seed;
    }
  }
  throw new Error("no seed wins the burial hall");
}

test("defeat a bestiary goblin, search its body and find exactly the loot the module rolled for it", async () => {
  // The roll gave the goblin one pouch of copper, within its type's 3d6.
  assert.equal(carried.length, 1);
  const [pouch] = carried;
  assert.equal(pouch.kind, "coin");
  assert.ok(pouch.coins.cp >= 3 && pouch.coins.cp <= 18);
  const coin = formatCoins(pouch.coins.cp);

  const directory = await mkdtemp(join(tmpdir(), "issue-240-browser-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: winningSeed(),
    adventures: [rolledBarrow],
    qualifies: () => true,
  });
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 375, height: 812 },
  });
  page.setDefaultTimeout(5000);
  const takePouch = page.locator(
    `button.act[data-action="take"][data-target="${pouch.id}"]`,
  );
  try {
    await page.goto(server.url);
    await page.locator("#open-creation").click();
    await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
    await page.locator("#character-name").fill("Ada");
    await page.locator("#save-character").click();
    await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
    await page
      .locator('.start-adventure[data-adventure="lintel-barrow"]')
      .click();
    await page.locator("#adventure").waitFor({ state: "visible" });

    await explore(page, "move", "burial-hall");
    // During the fight there is no body to search and nothing to take.
    assert.equal(
      await page
        .locator(
          'button.act[data-action="examine"][data-target="barrow-goblin"]',
        )
        .count(),
      0,
    );
    const over = page.locator("#turn:text-is('The fight is over.')");
    while ((await over.count()) === 0) {
      await fightOn(page);
    }
    // Won, but the loot shows only once the body is searched.
    assert.equal(await takePouch.count(), 0);
    assert.doesNotMatch(await page.locator("#room").innerText(), /Coins/);
    await explore(page, "examine", "barrow-goblin");
    assert.match(
      await page.locator("#room").innerText(),
      new RegExp(`Goblin Warrior's body — [^\\n]*\\s+You found: ${pouch.name}`),
    );
    await explore(page, "take", pouch.id);
    assert.equal(
      await page.locator("#log li").last().innerText(),
      `You take the ${pouch.name} and put ${coin} in your purse.`,
    );
    assert.equal(await page.locator("#purse").textContent(), `Purse: ${coin}`);
    // Searched once, the body holds nothing more.
    assert.equal(await takePouch.count(), 0);

    await explore(page, "move", "barrow-mouth");
    await page.locator("#leave-controls button").click();
    await page.locator("#confirm-leave").click();
    await page.locator("#ending").waitFor({ state: "visible" });
    const [ada] = JSON.parse(await readFile(libraryPath, "utf8")).characters;
    assert.equal(ada.session, undefined);
    assert.equal(ada.sheet.purse, pouch.coins.cp);
    assert.ok(ada.sheet.finds.includes(`lintel-barrow/${pouch.id}`));
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
