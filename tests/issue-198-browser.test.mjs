// #198: a full loot run fits the phone action bar. In a crypt with a way out,
// Ada forces a door, talks, searches for a trap, takes both potions, the key,
// the coins and every treasure, unlocks the strongroom, fights the warden and
// walks out, and after every action the newest history entry and the actions
// are on screen together (#154).
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { moduleFile, room } from "./fixtures/modules.mjs";
import {
  act,
  assertTogether,
  explore,
  fightOn,
  firstFighter,
  launch,
  narratingDm,
} from "./fixtures/session-layout.mjs";

// The sealed crypt made into a loot run: its stair is a way out, treasure
// and coins wait in the bowl, the strongbox and on the warden, and beating
// the warden no longer ends the adventure. The bound smuggler sits in the
// flooded cell, so no room offers more actions than the phone dock can show.
const lootedCrypt = (() => {
  const module = moduleFile("sealed-crypt");
  module.id = "looted-crypt";
  module.title = "The Looted Crypt";
  room(module, "crypt-stair").exit = true;
  room(module, "flooded-cell").creatures = room(module, "hall").creatures;
  delete room(module, "hall").creatures;
  room(module, "offering-room").items.push({
    id: "silver-chalice",
    name: "Silver Chalice",
    description: "A tarnished silver chalice among the old coins.",
    kind: "treasure",
    treasure: "art-25gp",
    hiddenIn: "offering-bowl",
  });
  room(module, "strongroom").items.push({
    id: "strongbox-coins",
    name: "Gold Coins",
    description: "Handfuls of old gold coins.",
    kind: "coin",
    coins: { gp: 40 },
    hiddenIn: "strongbox",
  });
  room(module, "tomb").items.push({
    id: "grave-ring",
    name: "Gold Ring",
    description: "A heavy gold ring set with a red stone.",
    kind: "treasure",
    treasure: "art-25gp",
    hiddenIn: "risen-warden",
  });
  delete module.encounters[0].victoryEndingId;
  module.endings = [
    {
      id: "out-with-the-loot",
      kind: "escape-with-loot",
      title: "Out with the loot",
      text: "You climb back up the stair with the crypt's treasure on your back.",
      xp: 200,
    },
    {
      id: "out-empty-handed",
      kind: "escape-without-loot",
      title: "Out empty-handed",
      text: "You climb back up the stair alive, with nothing to show for it.",
    },
    ...module.endings.filter(({ kind }) => kind === "defeat"),
  ];
  return validateModule(module);
})();

// The whole loot run as the browser's actions. Moving into a guarded room
// starts its fight.
const LOOT_RUN = [
  ["examine", "carved-warning"],
  ["force", "swollen-door"],
  ["move", "flooded-cell"],
  ["examine", "wall-shelf"],
  ["take", "cell-potion"],
  ["talk", "warden"],
  ["move", "crypt-stair"],
  ["move", "hall"],
  ["search", "hall"],
  ["move", "offering-room"],
  ["examine", "offering-bowl"],
  ["take", "iron-key"],
  ["take", "silver-chalice"],
  ["move", "hall"],
  ["unlock", "iron-door"],
  ["move", "strongroom"],
  ["examine", "strongbox"],
  ["take", "strongroom-potion"],
  ["take", "strongbox-coins"],
  ["move", "hall"],
  ["move", "tomb"],
  ["examine", "risen-warden"],
  ["take", "grave-ring"],
  ["move", "hall"],
  ["move", "crypt-stair"],
];
// At the stair, fully laden, Ada looks over what she carries, in the order
// she picked it up. Before #256 the key's Examine ended under the dock here.
const CARRIED = ["cell-potion", "iron-key", "silver-chalice"];

const ENGINE = {
  examine: (id) => ({ type: "examine", targetId: id }),
  move: (id) => ({ type: "move", destinationId: id }),
  force: (id) => ({ type: "force", doorId: id }),
  take: (id) => ({ type: "take", itemId: id }),
  talk: (id) => ({ type: "talk", topicId: id }),
  search: (id) => ({ type: "search", roomId: id }),
  unlock: (id) => ({ type: "unlock", doorId: id }),
};

/** A seed where Ada forces the door and survives the whole loot run. */
function findSeed() {
  for (let seed = 0; seed < 5000; seed++) {
    const runtime = createFifthRuntime(lootedCrypt, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    const run = (state, action) =>
      runtime.handleAction(state, action, random).state;
    let state = run(runtime.createSession(), { type: "begin" });
    for (const [action, id] of LOOT_RUN) {
      if (state.status !== "playing") {
        break;
      }
      state = run(state, ENGINE[action](id));
      while (
        state.status === "playing" &&
        state.encounter?.outcome === "ongoing"
      ) {
        const [target] = runtime.attackTargets(state);
        state = run(
          state,
          target === undefined
            ? { type: "end-turn", actorId: "pc" }
            : { type: "attack", actorId: "pc", targetId: target.id },
        );
      }
    }
    if (
      state.status === "playing" &&
      state.roomId === "crypt-stair" &&
      state.inventory.includes("grave-ring") &&
      state.inventory.includes("cell-potion") &&
      state.inventory.includes("strongroom-potion")
    ) {
      return seed;
    }
  }
  throw new Error("no seed where Ada carries the whole run's loot out");
}

const seed = findSeed();

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `a full loot run keeps actions and history on screen (${viewport.width}px)`,
    { timeout: 180000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-198-"));
      // The server offers only the loot run, whatever its gate standing.
      const server = await startFifthBrowserServer({
        adventures: [lootedCrypt],
        qualifies: () => true,
        libraryPath: join(directory, "characters.json"),
        seed,
        dmModel: narratingDm(),
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await page.goto(server.url);
        await page.locator("#open-creation").click();
        await page
          .locator("#preview-body")
          .filter({ hasText: "AC:" })
          .waitFor();
        await page.locator("#character-name").fill("Ada");
        await page.locator("#save-character").click();
        await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
        await page
          .getByRole("button", { name: "Start The Looted Crypt" })
          .click();
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#log li").first().waitFor();
        await assertTogether(page, "start");

        for (const [action, target] of LOOT_RUN) {
          await explore(page, action, target);
          while (
            (await page
              .locator('#feature-controls button[data-action="end-turn"]')
              .count()) > 0
          ) {
            await fightOn(page);
          }
        }

        // What Ada carries is acted on from her inventory, not the bar.
        assert.equal(
          await page
            .locator("#action-bar [data-target]")
            .evaluateAll(
              (nodes, carried) =>
                nodes.filter((node) => carried.includes(node.dataset.target))
                  .length,
              CARRIED,
            ),
          0,
          "no carried item in the action bar",
        );
        assert.equal(
          await page
            .locator("#inventory")
            .getByRole("button", { name: "Drink Potion of Healing" })
            .count(),
          2,
          "each potion offers Drink on its inventory entry",
        );
        for (const item of CARRIED) {
          await act(page, `examine carried ${item}`, () =>
            page
              .locator(
                `#inventory button[data-action="examine"][data-target="${item}"]`,
              )
              .click(),
          );
        }

        await page.locator("#leave-controls button").click();
        await page.locator("#confirm-leave").click();
        await page.locator("#ending").waitFor({ state: "visible" });
        assert.equal(
          await page.locator("#ending-title").textContent(),
          "Out with the loot",
        );
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
