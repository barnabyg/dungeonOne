// #198: a full loot run through The Abandoned Delve fits the phone action
// bar. Ada takes both potions, the key and every treasure on the push-deeper
// route, opens the vault, fights the ghoul and climbs the shaft, and after
// every action the newest history entry and the actions are on screen
// together (#154).
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import {
  act,
  assertTogether,
  explore,
  fightOn,
  firstFighter,
  launch,
  narratingDm,
} from "./fixtures/session-layout.mjs";

const delve = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "abandoned-delve",
);

// The push-deeper route as the browser's actions, with the storeroom's
// barrel potion on the way. Moving into a guarded room starts its fight.
const PUSH_DEEPER = [
  ["examine", "chalk-marks"],
  ["move", "gate-hall"],
  ["force", "swollen-door"],
  ["move", "storeroom"],
  ["examine", "old-barrel"],
  ["take", "barrel-potion"],
  ["move", "gate-hall"],
  ["move", "guard-post"],
  ["examine", "zombie"],
  ["take", "guard-purse"],
  ["examine", "weapon-rack"],
  ["take", "rack-potion"],
  ["move", "dry-well"],
  ["talk", "the-vault"],
  ["search", "dry-well"],
  ["move", "shrine"],
  ["examine", "altar"],
  ["take", "bronze-key"],
  ["take", "candlesticks"],
  ["move", "shaft-bottom"],
  ["unlock", "vault-door"],
  ["move", "vault"],
  ["examine", "ghoul"],
  ["take", "jewelled-goblet"],
  ["examine", "iron-chest"],
  ["take", "coin-chest"],
  ["move", "shaft-bottom"],
];
// At the shaft, fully laden, Ada looks over what she carries.
const CARRIED = ["barrel-potion", "bronze-key", "candlesticks"];

const ENGINE = {
  examine: (id) => ({ type: "examine", targetId: id }),
  move: (id) => ({ type: "move", destinationId: id }),
  force: (id) => ({ type: "force", doorId: id }),
  take: (id) => ({ type: "take", itemId: id }),
  talk: (id) => ({ type: "talk", topicId: id }),
  search: (id) => ({ type: "search", roomId: id }),
  unlock: (id) => ({ type: "unlock", doorId: id }),
};

/** A seed where Ada forces the door and survives every fight on the route. */
function findSeed() {
  for (let seed = 0; seed < 5000; seed++) {
    const runtime = createFifthRuntime(delve, firstFighter(seed));
    const random = createSeededRandom(sessionSeed(seed, 1));
    const run = (state, action) =>
      runtime.handleAction(state, action, random).state;
    let state = run(runtime.createSession(), { type: "begin" });
    for (const [action, id] of PUSH_DEEPER) {
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
      state.roomId === "shaft-bottom" &&
      state.inventory.includes("jewelled-goblet") &&
      state.inventory.includes("barrel-potion")
    ) {
      return seed;
    }
  }
  throw new Error("no seed where Ada carries the whole route's loot out");
}

const seed = findSeed();

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `a full loot run through the Abandoned Delve keeps actions and history on screen (${viewport.width}px)`,
    { timeout: 180000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-198-"));
      const server = await startFifthBrowserServer({
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
          .getByRole("button", { name: "Start The Abandoned Delve" })
          .click();
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#log li").first().waitFor();
        await assertTogether(page, "start");

        for (const [action, target] of PUSH_DEEPER) {
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
