// #315, browser → API → storage: level-2 Ada fails to search the rubble
// heap, and the bar offers Tactical Mind with her Second Wind uses. Using it
// adds 1d10 to the check: the card shows the d10 on the earlier total, the
// heap gives up its ring, a Second Wind pip empties, and after a reload the
// save holds the new band and the spent use.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { gradedCellar } from "./fixtures/modules.mjs";

const library = libraryAt(2);
const [{ sheet }] = library.characters;
const EXAMINE = { type: "examine", targetId: "rubble-heap" };

/**
 * The first browser seed whose first session fails the heap's Perception
 * check by less than 5, then succeeds with Tactical Mind.
 */
const SEED = (() => {
  const runtime = createFifthRuntime(gradedCellar, sheet);
  for (let seed = 0; seed < 1000; seed++) {
    const random = createSeededRandom(sessionSeed(seed, 1));
    const begun = runtime.handleAction(
      runtime.createSession(),
      { type: "begin" },
      random,
    ).state;
    const failed = runtime.handleAction(begun, EXAMINE, random);
    if (failed.events[0].band !== "failure") {
      continue;
    }
    const used = runtime.handleAction(
      failed.state,
      { type: "tactical-mind" },
      random,
    );
    if (used.events[0].spent) {
      return seed;
    }
  }
  throw new Error("no seed below 1000 fails the heap and then succeeds");
})();

/** Ada's Second Wind pips: how many are full, and what is spoken. */
const secondWind = (page) =>
  page.locator('#resources [data-resource="second-wind"]').evaluate((item) => ({
    full: item.querySelectorAll(".pip.full").length,
    pips: item.querySelectorAll(".pip").length,
    spoken: item.querySelector(".visually-hidden")?.textContent ?? null,
  }));

test(
  `fail a check, use Tactical Mind, and see the card and the pips (seed ${SEED})`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-315-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, JSON.stringify(library));
    const server = await startFifthBrowserServer({
      adventures: [gradedCellar],
      libraryPath,
      seed: SEED,
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 360, height: 740 },
    });
    page.setDefaultTimeout(8000);
    try {
      await page.goto(server.url);
      await page
        .locator("#characters button")
        .filter({ hasText: "Ada" })
        .click();
      await startAdventure(page, "graded-cellar");
      // No check failed yet: nothing to add to.
      assert.equal(await actionButton(page, "tactical-mind").count(), 0);
      assert.deepEqual(await secondWind(page), {
        full: 2,
        pips: 2,
        spoken: "Second Wind: 2 of 2 uses left",
      });

      await clickAction(page, "examine", "rubble-heap");
      assert.match(
        await text(page.locator("#log li").last()),
        /^Perception check: d20 \d+ \+ 0 \+ 2 proficiency = \d+ against DC 12\. Failure\./u,
      );
      const offer = actionButton(page, "tactical-mind");
      assert.equal(
        await offer.textContent(),
        "Tactical Mind: add 1d10 (2 of 2 Second Wind left)",
      );
      assert.equal(await offer.isEnabled(), true);
      await assertNoSideScroll(page, "no horizontal scroll with the offer", {
        wideFont: true,
      });

      await clickAction(page, "tactical-mind");
      const entry = page.locator("#log li").last();
      assert.match(
        await text(entry),
        /Tactical Mind: you add 1d10 to the Perception check\. \d+ \+ \d+ = \d+ against DC 12\. Success: a use of Second Wind is spent \(1 of 2 left\)\./u,
      );
      const lines = await entry
        .locator(".compact")
        .evaluateAll((nodes) => nodes.map((node) => node.textContent));
      assert.ok(
        lines.some((line) =>
          /^Ada Perception check \(Tactical Mind\) Success d10 \d+ \+ \d+ = \d+ vs DC 12$/u.test(
            line,
          ),
        ),
        lines.join("\n"),
      );
      // The ring the success reveals, the empty pip, and no second offer.
      assert.equal(await actionButton(page, "take", "silver-ring").count(), 1);
      assert.deepEqual(await secondWind(page), {
        full: 1,
        pips: 2,
        spoken: "Second Wind: 1 of 2 uses left",
      });
      assert.equal(await actionButton(page, "tactical-mind").count(), 0);

      // After a reload the save holds the new band and the spent use.
      const log = await page.locator("#log").textContent();
      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.equal(await page.locator("#log").textContent(), log);
      assert.equal((await secondWind(page)).full, 1);
      const file = await sessionFile(directory);
      assert.deepEqual(file.state.checks, [
        { id: "examine:rubble-heap", band: "success", tacticalMind: true },
      ]);
      assert.equal(file.state.character.featureUses["second-wind"], 1);
      assert.equal(file.state.tacticalMind, undefined);
      assert.deepEqual(
        file.transitions.map(({ action }) => action.type),
        ["begin", "examine", "tactical-mind"],
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
