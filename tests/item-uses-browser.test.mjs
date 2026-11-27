// #400, browser → API → storage: Ada carries the Stone Snake from the
// alcove to the Stone Door at the foot of the stair. The door's row offers
// "Use Stone Snake" once she carries it; using it fits the carving, uses it
// up and opens the hidden way to the Snake Vault. The saved session holds
// the use, and a reload keeps the way open.
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
  settled,
} from "./fixtures/browser-journey.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import {
  ratTunnels,
  room,
  snakeDoor,
  snakeDoorFile,
} from "./fixtures/modules.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

test("Ada carries the stone snake to the door, fits it, and the way stays open after a reload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "item-uses-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [snakeDoor, ratTunnels],
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
  const use = actionButton(page, "use-on", "stone-door");
  const vault = page.locator('#exits li[data-id="vault"]');
  try {
    await createAndStart(page, server.url, "snake-door");
    // Without the snake, the door offers only Examine, and no way leads on.
    assert.equal(await use.count(), 0);
    assert.equal(await vault.count(), 0);

    await clickAction(page, "move", "alcove");
    await clickAction(page, "take", "stone-snake");
    await clickAction(page, "move", "stair-foot");
    // The door's card offers the snake, by name, beside Examine (#520).
    const row = page.locator('#features li[data-id="stone-door"]');
    assert.deepEqual(
      (await row.locator("button.act").allTextContents()).sort(),
      ["Examine", "Use Stone Snake"],
    );
    assert.equal(
      await use.getAttribute("aria-label"),
      "Use Stone Snake on Stone Door",
    );
    await settled(page, () => use.click());
    const log = await page.locator("#log").textContent();
    assert.match(
      log,
      /You use the Stone Snake on the Stone Door\. The carving fits the hollow\./u,
    );
    assert.match(log, /The Stone Snake is used up\./u);
    assert.equal(await use.count(), 0);
    assert.equal(
      await vault.locator(".route").textContent(),
      "A way you found.",
    );
    const saved = (await sessionFile(directory)).state;
    assert.deepEqual(saved.featureUses, [
      { featureId: "stone-door", itemId: "stone-snake" },
    ]);
    assert.equal(saved.inventory.includes("stone-snake"), false);

    // A reload keeps the way open, and Ada goes through.
    await page.reload();
    await page.locator("#adventure").waitFor({ state: "visible" });
    assert.equal(
      await vault.locator(".route").textContent(),
      "A way you found.",
    );
    await clickAction(page, "move", "vault");
    assert.equal(
      await page.locator("#room-title").textContent(),
      "Snake Vault",
    );
    assert.equal((await sessionFile(directory)).state.roomId, "vault");
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

// #600, browser → API → storage: fitting the snake costs 1 sp. The door's
// row shows the price with the item, and is disabled while Ada's purse is
// empty. With the alms from the alcove's chest she pays: the log says what
// was paid and what the purse holds, and the saved purse is 1 sp lighter.
test("Ada pays the Stone Door's price, which the button names and the purse loses", async () => {
  const priced = structuredClone(snakeDoorFile);
  room(priced, "stair-foot").features.at(-1).uses[0].coins = { sp: 1 };
  room(priced, "alcove").items.push({
    id: "alms",
    name: "Alms",
    description: "A few silver coins.",
    kind: "coin",
    coins: { sp: 3 },
    hiddenIn: "iron-chest",
  });
  const directory = await mkdtemp(join(tmpdir(), "item-uses-cost-browser-"));
  const server = await startFifthBrowserServer({
    adventures: [validateModule(priced), ratTunnels],
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
  const use = actionButton(page, "use-on", "stone-door");
  try {
    await createAndStart(page, server.url, "snake-door");
    await clickAction(page, "move", "alcove");
    await clickAction(page, "take", "stone-snake");
    await clickAction(page, "move", "stair-foot");
    const row = page.locator('#features li[data-id="stone-door"]');
    assert.deepEqual(
      (await row.locator("button.act").allTextContents()).sort(),
      ["Examine", "Use Stone Snake (1 sp)"],
    );
    assert.equal(
      await use.getAttribute("aria-label"),
      "Use Stone Snake (1 sp) on Stone Door",
    );
    // Ada has no coin yet, so the use is there but can't be made.
    assert.equal((await sessionFile(directory)).state.possessions.purse, 0);
    assert.equal(await use.isDisabled(), true);
    // Coin found in this adventure pays for it.
    await clickAction(page, "move", "alcove");
    await clickAction(page, "examine", "iron-chest");
    await clickAction(page, "take", "alms");
    await clickAction(page, "move", "stair-foot");
    const before = (await sessionFile(directory)).state.possessions.purse;
    assert.equal(before, 30);
    assert.equal(await use.isDisabled(), false);
    await settled(page, () => use.click());
    const log = await page.locator("#log").textContent();
    assert.match(
      log,
      /You use the Stone Snake on the Stone Door, paying 1 sp\. The carving fits the hollow\./u,
    );
    assert.match(log, /Purse: /u);
    const saved = (await sessionFile(directory)).state;
    assert.equal(saved.possessions.purse, before - 10);
    assert.deepEqual(saved.featureUses, [
      { featureId: "stone-door", itemId: "stone-snake" },
    ]);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
