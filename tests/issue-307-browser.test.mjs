// #307, browser → API → storage: a level-3 Thief from the library plays the
// rat tunnels, takes Steady Aim before each attack, lands a 2d6 Sneak Attack,
// wins and settles back into the library with its XP.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, sessionSeed } from "../dist/session-5e.js";
import {
  actionButton,
  clickAction,
  settled,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { ratTunnels } from "./fixtures/modules.mjs";
import { thief } from "./fixtures/playthroughs.mjs";
import { readAda, sessionFile } from "./fixtures/save-files.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

const ROUTE = ["rat-cellar", "den"];
const VEX = thief();

/**
 * The fight click the test makes: Steady Aim while it is enabled, else the
 * first enabled attack (the attack, then the Nick extra attack), else End
 * turn.
 */
function choose(views) {
  const enabled = (kind) =>
    views.find(({ action, available }) => action === kind && available);
  return (
    enabled("steady-aim") ??
    enabled("attack") ??
    enabled("light-attack") ??
    enabled("end-turn")
  );
}

/**
 * Plays the route on `seed`'s first browser session with those clicks: how
 * it ends, and how many Sneak Attacks landed at advantage from Steady Aim.
 */
function play(seed) {
  const runtime = createFifthRuntime(ratTunnels, VEX);
  const random = createSeededRandom(sessionSeed(seed, 1));
  let aimedSneakAttacks = 0;
  const step = (state, action) => {
    const result = runtime.handleAction(state, action, random);
    aimedSneakAttacks += (result.events ?? []).filter(
      (event) =>
        event.type === "attack" &&
        event.sneakAttack?.damageRolls.length === 2 &&
        event.mode?.advantage.includes("Steady Aim"),
    ).length;
    return result.state;
  };
  let state = step(runtime.createSession(), { type: "begin" });
  for (const destinationId of ROUTE) {
    if (state.status !== "playing") {
      break;
    }
    state = step(state, { type: "move", destinationId });
    while (
      state.status === "playing" &&
      state.encounter?.outcome === "ongoing"
    ) {
      const { action, target } = choose(runtime.projectActions(state));
      state = step(state, {
        type: action,
        actorId: "pc",
        ...(target === undefined ? {} : { targetId: target.id }),
      });
    }
  }
  return { status: state.status, aimedSneakAttacks };
}

const seed = (() => {
  for (let candidate = 0; candidate < 100; candidate++) {
    const { status, aimedSneakAttacks } = play(candidate);
    if (status === "victory" && aimedSneakAttacks > 0) {
      return candidate;
    }
  }
  throw new Error("no seed below 100 wins with an aimed Sneak Attack");
})();

/** Takes one fight turn's click as `choose` does, and waits for its entry. */
async function fightClick(page) {
  const aim = page.locator(
    '#feature-controls button[data-action="steady-aim"]:enabled',
  );
  const attack = page.locator("#attack-controls button.attack:enabled");
  await settled(page, async () => {
    if ((await aim.count()) > 0) {
      await aim.click();
    } else if ((await attack.count()) > 0) {
      await attack.first().click();
    } else {
      await page
        .locator('#feature-controls button[data-action="end-turn"]')
        .click();
    }
  });
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 375, height: 812 },
]) {
  test(
    `a level-3 Thief takes Steady Aim and lands a 2d6 Sneak Attack, wins and keeps the XP (${viewport.width}px, seed ${seed})`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-307-browser-"));
      const libraryPath = join(directory, "characters.json");
      await writeFile(
        libraryPath,
        JSON.stringify({
          kind: "dungeon-one-characters",
          formatVersion: FIFTH_LIBRARY_FORMAT,
          revision: "0".repeat(32),
          creationsStarted: 1,
          sessionsStarted: 0,
          characters: [{ sheet: VEX, revision: 1 }],
        }),
      );
      const server = await startFifthBrowserServer({
        libraryPath,
        seed,
        adventures: [ratTunnels],
        qualifies: () => true,
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(8000);
      try {
        await page.goto(server.url);
        await page
          .locator("#characters button")
          .filter({ hasText: "Vex" })
          .click();
        const sheetText = await text(page.locator("#sheet-body"));
        assert.match(sheetText, /^Level 3 Rogue/u);
        assert.match(sheetText, /Cunning Action\. Bonus action: Hide\./u);
        assert.match(sheetText, /Steady Aim\. Bonus action/u);
        assert.match(sheetText, /Thief: Fast Hands\./u);
        assert.match(sheetText, /Thief: Second-Story Work\./u);
        assert.match(sheetText, /extra 2d6 damage/u);

        await startAdventure(page, "rat-tunnels");
        for (const destinationId of ROUTE) {
          await clickAction(page, "move", destinationId);
          let first = true;
          while (
            (await page.locator("#turn").textContent()) !== "The fight is over."
          ) {
            if (first) {
              // Hide and Steady Aim wait beside End turn on the Thief's turn.
              assert.equal(await actionButton(page, "hide").isEnabled(), true);
              await assertNoSideScroll(page, "the Thief's fight", {
                wideFont: true,
              });
              first = false;
            }
            await fightClick(page);
          }
          // The save records each Steady Aim the fight took.
          if (destinationId === ROUTE[0]) {
            const saved = await sessionFile(directory);
            assert.equal(saved.formatVersion, FIFTH_SESSION_FORMAT);
            assert.match(JSON.stringify(saved), /"type":"steady-aim"/u);
          }
        }
        const log = await text(page.locator("#log"));
        assert.match(
          log,
          /You steady your aim: your next attack roll this turn has advantage\./u,
        );
        assert.match(
          log,
          /Vex attacks [^\n]+ at advantage \([^)]*Steady Aim[^)]*\)[^\n]+ \+ Sneak Attack \d+ \+ \d+ = \d+ piercing/u,
        );
        await page.locator("#ending").waitFor({ state: "visible" });
        assert.match(await text(page.locator("#ending")), /Victory/iu);

        // The library settles the Thief: no session, the XP credited.
        const record = await readAda(libraryPath);
        assert.equal(record.session, undefined);
        assert.equal(record.sheet.class, "rogue");
        assert.ok(record.sheet.xp > VEX.xp);
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
