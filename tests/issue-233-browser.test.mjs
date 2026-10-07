// #233, browser → API → storage: in the sealed crypt the risen warden, a
// Zombie, is reduced to 0 HP and its Undead Fortitude keeps it standing. The
// history narrates the save and shows its roll, the initiative table shows
// it at 1 HP, and a restart serves the same state from the saved session.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { firstFighter, launch } from "./fixtures/session-layout.mjs";
import { sealedCrypt } from "./fixtures/modules.mjs";

const crypt = sealedCrypt;
const ROUTE = ["hall", "tomb"];

/**
 * The fight clicks (attack, or end the turn once the action is spent) in the
 * first session on `seed` up to and including the one whose attack the
 * warden's Undead Fortitude saves against and survives, with the character
 * still standing; undefined if that never happens.
 */
function refusal(seed) {
  const runtime = createFifthRuntime(crypt, firstFighter(seed));
  const random = createSeededRandom(sessionSeed(seed, 1));
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  for (const destinationId of ROUTE) {
    state = runtime.handleAction(
      state,
      { type: "move", destinationId },
      random,
    ).state;
  }
  for (let clicks = 1; state.encounter?.outcome === "ongoing"; clicks++) {
    const [target] = runtime.attackTargets(state);
    const result = runtime.handleAction(
      state,
      target === undefined
        ? { type: "end-turn", actorId: "pc" }
        : { type: "attack", actorId: "pc", targetId: target.id },
      random,
    );
    assert.equal(result.rejection, undefined);
    state = result.state;
    const saved = result.events.some(
      ({ type, success }) => type === "undead-fortitude" && success,
    );
    if (saved) {
      return state.encounter.outcome === "ongoing" ? clicks : undefined;
    }
  }
  return undefined;
}

/** Runs one click and waits for its history entry. */
async function click(page, locator) {
  const count = await page.locator("#log li").count();
  await locator.click();
  await page.waitForFunction(
    (seen) =>
      document.querySelectorAll("#log li:not([data-pending])").length > seen,
    count,
  );
}

const fightOn = async (page) => {
  const attack = page.locator("#attack-controls button.attack:enabled");
  await click(
    page,
    (await attack.count()) > 0
      ? attack.first()
      : page.locator('#feature-controls button[data-action="end-turn"]'),
  );
};

/** The warden's row in the initiative table. */
const wardenRow = (page) =>
  page.locator('#initiative-rows tr[data-combatant="risen-warden"]');

test(
  "the risen warden refuses to fall: narrated, rolled and shown at 1 HP, and kept across a restart",
  { timeout: 120000 },
  async () => {
    let seed = 0;
    while (refusal(seed) === undefined) {
      seed += 1;
      assert.ok(seed < 500, "a seed lets the warden refuse to fall");
    }
    const clicks = refusal(seed);
    const directory = await mkdtemp(join(tmpdir(), "issue-233-browser-"));
    const libraryPath = join(directory, "characters.json");
    let server = await startFifthBrowserServer({
      adventures: [crypt],
      libraryPath,
      seed,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(8000);
    try {
      await page.goto(server.url);
      await page.locator("#open-creation").click();
      await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
      await page.locator("#character-name").fill("Ada");
      await page.locator("#save-character").click();
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      await page
        .locator('.start-adventure[data-adventure="sealed-crypt"]')
        .click();
      await page.locator("#adventure").waitFor({ state: "visible" });
      for (const destination of ROUTE) {
        await click(
          page,
          page.locator(
            `button.act[data-action="move"][data-target="${destination}"]`,
          ),
        );
      }
      for (let count = 0; count < clicks; count++) {
        await fightOn(page);
      }

      // Narrated: the blow takes it to 0, then the save keeps it at 1 HP.
      const log = await page.locator("#log").innerText();
      assert.match(log, /Zombie has 0\/15 HP\./);
      assert.match(
        log,
        /Undead Fortitude: Zombie makes a Constitution saving throw against DC 5 \+ \d+ damage taken: \d+ \+ 3 = \d+ against DC \d+\. Success: Zombie refuses to fall and has 1\/15 HP\./u,
      );
      // Rolled: the history's compact line shows the save against its DC.
      const save = page
        .locator("#log .compact")
        .filter({ hasText: "Constitution saving throw (Undead Fortitude)" })
        .last();
      assert.match(
        await save.innerText(),
        /^Zombie Constitution saving throw \(Undead Fortitude\) Success d20 \d+ \+ 3 = \d+ vs DC \d+$/u,
      );
      // Shown: still in the fight at 1 HP.
      assert.match(await wardenRow(page).innerText(), /1\/15/);

      // Stored: a restart serves the warden at 1 HP from the saved session.
      const [file] = await readdir(join(directory, "characters-adventures"));
      const saved = JSON.parse(
        await readFile(join(directory, "characters-adventures", file), "utf8"),
      );
      const warden = saved.state.encounter.combatants.find(
        ({ id }) => id === "risen-warden",
      );
      assert.equal(warden.hp, 1);
      assert.equal(warden.undeadFortitude, true);
      await server.close();
      server = await startFifthBrowserServer({
        adventures: [crypt],
        libraryPath,
        seed: seed + 1,
      });
      await page.goto(`${server.url}/#adventure-${saved.id}`);
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.match(await wardenRow(page).innerText(), /1\/15/);
      assert.match(
        await page.locator("#log").innerText(),
        /Zombie refuses to fall and has 1\/15 HP\./,
      );

      // At phone width the save's line wraps without a horizontal scroll.
      await page.setViewportSize({ width: 375, height: 812 });
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
