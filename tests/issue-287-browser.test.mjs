// #287, browser → API → storage: a level-5 Fighter splits Extra Attack's two
// attacks between two goblins, one button each, wins the fight, and the
// library file credits the XP.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { libraryAt } from "../dist/test-fighter-5e.js";
import {
  actionButton,
  clickAction,
  text,
} from "./fixtures/browser-journey.mjs";
import { fightRoom } from "./fixtures/modules.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

const goblinPair = fightRoom("goblin-pair", "The Goblin Pair", [
  { id: "left", monster: "goblin-warrior", name: "Left Goblin" },
  { id: "right", monster: "goblin-warrior", name: "Right Goblin" },
]);
const library = libraryAt(5);
const [{ sheet: ada }] = library.characters;

/**
 * The fight's next step: an Attack action's first attack at the left goblin
 * and its second at the right one, each falling back to the other once one
 * is down; the turn ends once no attack is left.
 */
function step(runtime, state) {
  const targets = runtime.attackTargets(state).map(({ id }) => id);
  if (targets.length === 0) {
    return undefined;
  }
  const second = state.encounter.economy.attacks > 0;
  const wanted = second ? "right" : "left";
  return targets.includes(wanted) ? wanted : targets[0];
}

/** A seed whose first session wins the fight, splitting the first turn's attacks. */
function winningSeed() {
  const runtime = createFifthRuntime(goblinPair, ada);
  for (let seed = 0; seed < 500; seed++) {
    const random = createSeededRandom(sessionSeed(seed, 1));
    let state = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    if (state.encounter.order[0].combatantId !== "pc") {
      continue;
    }
    while (state.encounter?.outcome === "ongoing") {
      const target = step(runtime, state);
      state = runtime.handleAction(
        state,
        target === undefined
          ? { type: "end-turn", actorId: "pc" }
          : { type: "attack", actorId: "pc", targetId: target },
        random,
      ).state;
    }
    if (state.encounter?.outcome === "victory") {
      return seed;
    }
  }
  throw new Error("no seed wins the goblin pair");
}

test(
  "a level-5 Fighter splits its two attacks between two goblins, wins, and the library credits the XP",
  { timeout: 180000 },
  async () => {
    const seed = winningSeed();
    const directory = await mkdtemp(join(tmpdir(), "issue-287-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, JSON.stringify(library));
    const server = await startFifthBrowserServer({
      libraryPath,
      seed,
      adventures: [goblinPair],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(`${server.url}#character-${ada.id}`);
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      assert.match(
        await text(page.locator("#sheet-body")),
        /Extra Attack\. Attack twice, instead of once, whenever you take the Attack action\./u,
      );
      await page
        .locator('.start-adventure[data-adventure="goblin-pair"]')
        .click();
      await page.locator("#log li").first().waitFor();
      assert.equal(
        await page.locator("#turn").textContent(),
        "Round 1: your turn.",
      );

      // The first attack, at the left goblin, leaves the second to make.
      await clickAction(page, "attack", "left");
      assert.match(
        await page.locator("#resources").innerText(),
        /second attack to make/u,
      );
      const second = actionButton(page, "attack", "right");
      assert.equal(
        (await second.innerText()).trim(),
        "Second attack on Right Goblin",
      );
      await assertNoSideScroll(page);
      await clickAction(page, "attack", "right");
      const log = await page.locator("#log").innerText();
      assert.match(log, /Left Goblin/u);
      assert.match(log, /Right Goblin/u);

      // The rest of the fight, by the same policy as the seed search.
      while (
        (await page.locator("#turn").textContent()) !== "The fight is over."
      ) {
        const attacks = page.locator("#attack-controls button.attack:enabled");
        if ((await attacks.count()) === 0) {
          await clickAction(page, "end-turn");
          continue;
        }
        const label = await attacks.first().innerText();
        const wanted = label.startsWith("Second attack") ? "right" : "left";
        const target =
          (await actionButton(page, "attack", wanted).count()) > 0
            ? wanted
            : await attacks.first().getAttribute("data-target");
        await clickAction(page, "attack", target);
      }
      await page.locator("#ending").waitFor({ state: "visible" });

      const stored = JSON.parse(await readFile(libraryPath, "utf8"));
      const [record] = stored.characters;
      assert.equal(record.session, undefined);
      // Two goblin warriors, 50 XP each.
      assert.equal(record.sheet.xp, ada.xp + 100);
      assert.equal(record.sheet.level, 5);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
