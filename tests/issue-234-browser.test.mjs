// #234, browser → API → storage: a Ghoul's claw paralyses the character. The
// status strip shows it, the action bar offers only Wait and says why, a
// restart keeps it, and it ends with the character's next turn, bringing the
// bar back.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { fightRoom } from "./fixtures/modules.mjs";
import { firstFighter, launch } from "./fixtures/session-layout.mjs";
import {
  createAndStart,
  fightTurn,
  settled,
} from "./fixtures/browser-journey.mjs";

/** The lone goblin's room with the bestiary's Ghoul in the goblin's place. */
const ghoulCellar = fightRoom("ghoul-cellar", "The Ghoul Cellar", [
  { id: "ghoul", monster: "ghoul" },
]);

const paralysed = (state) =>
  (state.encounter?.conditions ?? []).some(
    ({ targetId, kind }) => targetId === "pc" && kind === "paralysed",
  );

/**
 * The clicks (attack, or end the turn once the action is spent) in the first
 * session on `seed` that leave the character paralysed on its own turn, after
 * which one wait ends the paralysis with the fight still on and the
 * character free; undefined if that never happens.
 */
function paralysis(seed) {
  const runtime = createFifthRuntime(ghoulCellar, firstFighter(seed));
  const random = createSeededRandom(sessionSeed(seed, 1));
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  const fightOn = () => {
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
  };
  const ongoing = () => state.encounter?.outcome === "ongoing";
  let down = 0;
  for (; ongoing() && !paralysed(state); down++) {
    fightOn();
  }
  if (!ongoing()) {
    return undefined;
  }
  fightOn();
  return ongoing() && !paralysed(state) ? down : undefined;
}

/** The status strip's conditions and the action bar's buttons and reasons. */
const shown = (page) =>
  page.evaluate(() => ({
    strip: [...document.querySelectorAll("#conditions li")].map(
      (item) => item.textContent,
    ),
    bar: [...document.querySelectorAll("#action-bar .action")].map(
      (wrap) => wrap.textContent,
    ),
  }));

test(
  "a Ghoul paralyses Ada: only Wait is offered, a restart keeps it, and it ends as her next turn does",
  { timeout: 120000 },
  async () => {
    let seed = 0;
    while (paralysis(seed) === undefined) {
      seed += 1;
      assert.ok(seed < 500, "a seed paralyses Ada");
    }
    const down = paralysis(seed);
    const directory = await mkdtemp(join(tmpdir(), "issue-234-browser-"));
    const libraryPath = join(directory, "characters.json");
    const options = {
      libraryPath,
      adventures: [ghoulCellar],
      qualifies: () => true,
    };
    let server = await startFifthBrowserServer({ ...options, seed });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(8000);
    try {
      await createAndStart(page, server.url, ghoulCellar.id);
      for (let count = 0; count < down; count++) {
        await fightTurn(page);
      }

      // The claw lands: narrated, tagged on the strip, and only Wait offered.
      const log = await page.locator("#log").innerText();
      assert.match(
        log,
        /Ada makes a Constitution saving throw against being paralysed: \d+ [+−] \d+ = \d+ against DC 10\. Failure\./u,
      );
      assert.match(
        log,
        /Ada is paralysed by Ghoul's Claw: it can't act, it fails Strength and Dexterity saving throws, and attack rolls against it have advantage and every hit is a critical hit, until the end of its next turn\./,
      );
      const held = await shown(page);
      assert.equal(held.strip.length, 1);
      assert.match(
        held.strip[0],
        /^Paralysed: Ghoul's Claw; ends at the end of this turn$/,
      );
      assert.deepEqual(held.bar, [
        "WaitYou are paralysed, so you can only wait.",
      ]);
      const wait = page.locator(
        '#feature-controls button[data-action="end-turn"]',
      );
      assert.equal(
        await wait.getAttribute("aria-describedby"),
        "action-reason-0",
      );

      // Stored: a restart serves the same paralysis from the saved session.
      const [file] = await readdir(join(directory, "characters-adventures"));
      const saved = JSON.parse(
        await readFile(join(directory, "characters-adventures", file), "utf8"),
      );
      assert.equal(saved.state.encounter.conditions[0].kind, "paralysed");
      await server.close();
      server = await startFifthBrowserServer({ ...options, seed: seed + 1 });
      await page.goto(`${server.url}/#adventure-${saved.id}`);
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await shown(page), held);

      // Ada waits: the paralysis runs out as her turn ends, with no save.
      await settled(page, () =>
        page
          .locator('#feature-controls button[data-action="end-turn"]')
          .click(),
      );
      const after = await page.locator("#log").innerText();
      assert.match(
        after,
        /Ada is no longer paralysed: it has run its course\./,
      );
      const free = await shown(page);
      assert.deepEqual(free.strip, []);
      assert.ok(free.bar.some((text) => text.startsWith("Attack Ghoul")));
      assert.ok(free.bar.includes("End turn"));
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
