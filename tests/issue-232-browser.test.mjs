// #232, browser → API → storage: the bestiary's Wolf knocks the
// character prone. The initiative table and the status strip show it when it
// lands, a restart keeps it, and it ends when the character gets up.
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
import { fightRoom } from "./fixtures/modules.mjs";
import { createAndStart, fightTurn } from "./fixtures/browser-journey.mjs";

// The bestiary's Wolf, alone in a one-room fight that starts as Ada arrives.
// The server offers only this module, whatever its gate standing.
const wolfDen = fightRoom("wolf-den", "The Wolf's Den", [
  {
    id: "wolf",
    monster: "wolf",
    description:
      "A gaunt grey wolf rises from behind the casks, hackles up, and comes at you.",
  },
]);
const SERVER_OPTIONS = { adventures: [wolfDen], qualifies: () => true };

const prone = (state) =>
  (state.encounter?.conditions ?? []).some(
    ({ targetId, kind }) => targetId === "pc" && kind === "prone",
  );

/**
 * The fight clicks (attack, or end the turn once the action is spent) in the
 * first session on `seed` that leave the character prone on its own turn,
 * and then that get it up with the fight still on; undefined if that never
 * happens or the knockdown lands before Ada's first click.
 */
function knockdown(seed) {
  const runtime = createFifthRuntime(wolfDen, firstFighter(seed));
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
  for (; ongoing() && !prone(state); down++) {
    fightOn();
  }
  let up = 0;
  for (; ongoing() && prone(state); up++) {
    fightOn();
  }
  return ongoing() && down > 0 ? { down, up } : undefined;
}

/** The conditions the initiative table and the status strip show for Ada. */
const shown = (page) =>
  page.evaluate(() => ({
    table: [
      ...document.querySelectorAll(
        '#initiative-rows tr[data-combatant="pc"] .tag.condition',
      ),
    ].map((tag) => tag.textContent),
    strip: [...document.querySelectorAll("#conditions li")].map(
      (item) => item.textContent,
    ),
  }));

test(
  "the Wolf's knockdown shows when it lands, survives a restart and ends when Ada gets up",
  { timeout: 120000 },
  async () => {
    let seed = 0;
    while (knockdown(seed) === undefined) {
      seed += 1;
      assert.ok(seed < 500, "a seed knocks Ada prone");
    }
    const clicks = knockdown(seed);
    const directory = await mkdtemp(join(tmpdir(), "issue-232-browser-"));
    const libraryPath = join(directory, "characters.json");
    let server = await startFifthBrowserServer({
      ...SERVER_OPTIONS,
      libraryPath,
      seed,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(8000);
    try {
      await createAndStart(page, server.url, "wolf-den");
      await page.locator("#initiative-rows tr").first().waitFor();
      assert.deepEqual(await shown(page), { table: [], strip: [] });
      for (let count = 0; count < clicks.down; count++) {
        await fightTurn(page);
      }

      // The knockdown lands: narrated, tagged in the table and on the strip.
      const log = await page.locator("#log").innerText();
      assert.match(
        log,
        /Ada makes a Strength saving throw against being prone: \d+ [+−] \d+ = \d+ against DC 11\. Failure\./u,
      );
      assert.match(
        log,
        /Ada is knocked prone by Wolf's Bite: disadvantage on its attack rolls, and advantage on attack rolls against it, until it gets up at the end of its next turn\./,
      );
      const prone = {
        table: ["Prone: Wolf's Bite; gets up at the end of this turn"],
        strip: ["Prone: Wolf's Bite; gets up at the end of this turn"],
      };
      assert.deepEqual(await shown(page), prone);
      assert.ok(await page.locator("#conditions .tag.condition").isVisible());

      // Stored: a restart serves the same condition from the saved session.
      const [file] = await readdir(join(directory, "characters-adventures"));
      const saved = JSON.parse(
        await readFile(join(directory, "characters-adventures", file), "utf8"),
      );
      assert.equal(saved.state.encounter.conditions[0].kind, "prone");
      await server.close();
      server = await startFifthBrowserServer({
        ...SERVER_OPTIONS,
        libraryPath,
        seed: seed + 1,
      });
      await page.goto(`${server.url}/#adventure-${saved.id}`);
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await shown(page), prone);

      // Ada attacks at disadvantage and gets up as her turn ends.
      for (let count = 0; count < clicks.up; count++) {
        await fightTurn(page);
      }
      const after = await page.locator("#log").innerText();
      assert.match(after, /at disadvantage \(Prone\)/);
      assert.match(after, /Ada gets up and is no longer prone\./);
      assert.deepEqual(await shown(page), { table: [], strip: [] });
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
