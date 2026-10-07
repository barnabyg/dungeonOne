// #234, browser → API → storage: a Ghoul's claw paralyses the character. The
// status strip shows it, the action bar offers only Wait and says why, a
// restart keeps it, and the repeat save that ends it brings the bar back.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { firstFighter, launch } from "./fixtures/session-layout.mjs";

/** The Goblin in the Cellar with the bestiary's Ghoul in the goblin's place. */
const cellarFile = JSON.parse(
  await readFile(
    new URL("../adventures/5e/cellar-goblin.json", import.meta.url),
    "utf8",
  ),
);
const ghoulCellar = validateModule({
  ...cellarFile,
  encounters: [
    {
      id: "cellar-goblin",
      opponents: [{ id: "ghoul", monster: "ghoul" }],
      victoryEndingId: "goblin-defeated",
      defeatEndingId: "fallen-in-the-cellar",
    },
  ],
});

const paralysed = (state) =>
  (state.encounter?.conditions ?? []).some(
    ({ targetId, kind }) => targetId === "pc" && kind === "paralysed",
  );

/**
 * The clicks (attack, or end the turn once the action is spent) in the first
 * session on `seed` that leave the character paralysed on its own turn, and
 * then the waits until a repeat save ends it with the fight still on;
 * undefined if that never happens.
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
    return result.events;
  };
  const ongoing = () => state.encounter?.outcome === "ongoing";
  let down = 0;
  for (; ongoing() && !paralysed(state); down++) {
    fightOn();
  }
  let waits = 0;
  let saved = false;
  for (; ongoing() && paralysed(state); waits++) {
    saved = fightOn().some(
      ({ type, reason, kind }) =>
        type === "condition-ended" &&
        kind === "paralysed" &&
        reason === "saved",
    );
  }
  // At least two waits, so a restart comes mid-paralysis with one to go.
  return ongoing() && saved && waits >= 2 ? { down, waits } : undefined;
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
  "a Ghoul paralyses Ada: only Wait is offered, a restart keeps it, and the save that ends it frees her",
  { timeout: 120000 },
  async () => {
    let seed = 0;
    while (paralysis(seed) === undefined) {
      seed += 1;
      assert.ok(seed < 500, "a seed paralyses Ada");
    }
    const { down, waits } = paralysis(seed);
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
      await page.goto(server.url);
      await page.locator("#open-creation").click();
      await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
      await page.locator("#character-name").fill("Ada");
      await page.locator("#save-character").click();
      await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
      await page
        .locator(`.start-adventure[data-adventure="${ghoulCellar.id}"]`)
        .click();
      await page.locator("#adventure").waitFor({ state: "visible" });
      for (let count = 0; count < down; count++) {
        await fightOn(page);
      }

      // The claw lands: narrated, tagged on the strip, and only Wait offered.
      const log = await page.locator("#log").innerText();
      assert.match(
        log,
        /Ada makes a Constitution saving throw against being paralysed: \d+ [+−] \d+ = \d+ against DC 10\. Failure\./u,
      );
      assert.match(
        log,
        /Ada is paralysed by Ghoul's Claw: it can't act, it fails Strength and Dexterity saving throws, and attack rolls against it have advantage and every hit is a critical hit, until it succeeds on a DC 10 Constitution saving throw at the end of one of its turns, for up to 10 turns\./,
      );
      const held = await shown(page);
      assert.equal(held.strip.length, 1);
      assert.match(
        held.strip[0],
        /^Paralysed: Ghoul's Claw; DC 10 Constitution save at the end of each of its turns, up to 10 turns left$/,
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

      // One wait: a failed save, and the paralysis goes on.
      await click(page, wait);
      const mid = await shown(page);
      assert.match(
        mid.strip[0],
        /^Paralysed: Ghoul's Claw; .* up to \d+ turns? left$/,
      );
      assert.deepEqual(mid.bar, held.bar);

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
      assert.deepEqual(await shown(page), mid);

      // Ada waits until her repeat save succeeds, and can act again.
      for (let count = 1; count < waits; count++) {
        await click(
          page,
          page.locator('#feature-controls button[data-action="end-turn"]'),
        );
      }
      const after = await page.locator("#log").innerText();
      assert.match(
        after,
        /Ada repeats a Constitution saving throw against being paralysed: \d+ [+−] \d+ = \d+ against DC 10\. Success\./u,
      );
      assert.match(after, /Ada is no longer paralysed\./);
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
