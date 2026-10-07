// #230, browser → API → storage: Wren, an archer with two arrows, shoots
// both at the barrow's goblin; Attack then shows "No arrows" until she
// wields her mace. Winning recovers one of the two arrows spent. Back at the
// mouth she takes the quiver behind the lintel and sells a bundle of 20 to
// the bowyer, who will not buy the last arrow, and escapes: the sheet and
// the saved library keep the one arrow.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { archer, archeryBarrow, QUIVER } from "./fixtures/archery-barrow.mjs";
import { assertTogether, launch } from "./fixtures/session-layout.mjs";

const sheet = archer(2);
const GOBLIN = "barrow-goblin";

/**
 * What Wren does on her turn, read from the action bar as the browser shows
 * it: shoot while Attack is enabled, wield the mace once it says No arrows,
 * and otherwise end the turn.
 */
function choose(attack) {
  return attack.available
    ? "attack"
    : attack.reason === "No arrows"
      ? "swap"
      : "end-turn";
}

/**
 * The first browser seed on which Wren, playing `choose`, empties her quiver
 * with the goblin still standing and then wins with the mace.
 */
function archerySeed() {
  for (let seed = 0; seed < 500; seed++) {
    const runtime = createFifthRuntime(archeryBarrow, sheet);
    const random = createSeededRandom(sessionSeed(seed, 1));
    let state = runtime.createSession();
    for (const action of [
      { type: "begin" },
      { type: "move", destinationId: "burial-hall" },
    ]) {
      state = runtime.handleAction(state, action, random).state;
    }
    let drew = false;
    while (
      state.status === "playing" &&
      state.encounter?.outcome === "ongoing"
    ) {
      const attack = runtime
        .projectActions(state)
        .find(({ action }) => action === "attack");
      const choice = choose(attack);
      drew ||= choice === "swap";
      state = runtime.handleAction(
        state,
        choice === "attack"
          ? { type: "attack", actorId: "pc", targetId: GOBLIN }
          : choice === "swap"
            ? { type: "swap", itemId: "mace" }
            : { type: "end-turn", actorId: "pc" },
        random,
      ).state;
    }
    if (drew && state.status === "playing") {
      return seed;
    }
  }
  throw new Error("No seed in 500 has Wren run out of arrows and win.");
}

/** Clicks an action control and waits for its result card. */
async function click(page, action, target) {
  const count = await page.locator("#log li").count();
  await page
    .locator(
      `button.act[data-action="${action}"]${target === undefined ? "" : `[data-target="${target}"]`}`,
    )
    .click();
  await page.waitForFunction(
    (seen) => document.querySelectorAll("#log li").length > seen,
    count,
  );
  await assertTogether(page, `${action} ${target}`);
}

/** The short reason shown beside a disabled control. */
async function reason(page, control) {
  return page
    .locator(`#${await control.getAttribute("aria-describedby")}`)
    .textContent();
}

const carried = (page, id) =>
  page.locator(`#inventory li[data-id="${id}"] strong`).first().textContent();

test(
  "an archer runs out of arrows, draws her mace, recovers an arrow, sells a bundle and keeps the rest",
  { timeout: 180000 },
  async () => {
    const seed = archerySeed();
    const directory = await mkdtemp(join(tmpdir(), "issue-230-browser-"));
    const libraryPath = join(directory, "characters.json");
    await writeFile(
      libraryPath,
      JSON.stringify({
        kind: "dungeon-one-characters",
        formatVersion: FIFTH_LIBRARY_FORMAT,
        revision: "1".repeat(32),
        creationsStarted: 1,
        sessionsStarted: 0,
        characters: [{ sheet, revision: 1 }],
      }),
    );
    const server = await startFifthBrowserServer({
      libraryPath,
      seed,
      adventures: [archeryBarrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(`${server.url}#character-${sheet.id}`);
      await page.locator("#sheet-name").filter({ hasText: "Wren" }).waitFor();
      const before = await page.locator("#sheet-body").innerText();
      assert.match(before, /Ammunition: 2 arrows/);
      assert.match(
        before,
        /Shortbow:\s*\+4 to hit, 1d6 \+ 2 piercing, ranged \(arrows; disadvantage from round 2\)/,
      );

      await page
        .locator('.start-adventure[data-adventure="archery-barrow"]')
        .click();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.match(
        await page.locator("#gear-numbers").textContent(),
        /Shortbow \+4 to hit.*; 2 arrows\.$/,
      );
      assert.equal(await carried(page, "arrows"), "Arrows (2)");

      await click(page, "move", "burial-hall");
      const attack = page.locator(
        `button.act[data-action="attack"][data-target="${GOBLIN}"]`,
      );
      let drew = false;
      // Attack is offered only while the fight goes on.
      while ((await attack.count()) > 0) {
        const choice = choose({
          available: !(await attack.isDisabled()),
          reason: (await attack.isDisabled()) ? await reason(page, attack) : "",
        });
        if (choice === "swap") {
          assert.equal(drew, false);
          drew = true;
          assert.match(
            await page.locator("#gear-numbers").textContent(),
            /Shortbow .*; 0 arrows\.$/,
          );
          await click(page, "swap", "mace");
          assert.match(
            await page.locator("#gear-numbers").textContent(),
            /Mace \+5 to hit/,
          );
        } else {
          await click(page, choice, choice === "attack" ? GOBLIN : undefined);
        }
      }
      assert.equal(drew, true);
      assert.match(
        await page.locator("#log").innerText(),
        /You recover 1 arrow from the fight\. You have 1 arrow\./,
      );
      assert.equal(await carried(page, "arrows"), "Arrows (1)");

      await click(page, "move", "barrow-mouth");
      await click(page, "examine", "scratched-lintel");
      await click(page, "take", QUIVER.id);
      assert.equal(await carried(page, "arrows"), "Arrows (21)");
      await click(page, "sell", "arrows");
      assert.equal(await carried(page, "arrows"), "Arrows (1)");
      const sell = page.locator(
        'button.act[data-action="sell"][data-target="arrows"]',
      );
      assert.equal(await sell.isDisabled(), true);
      assert.equal(await reason(page, sell), "Fewer than 20");

      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      await page.locator("#ending-next").click();
      await page.locator("#sheet-name").filter({ hasText: "Wren" }).waitFor();
      assert.match(
        await page.locator("#sheet-body").innerText(),
        /Ammunition: 1 arrow\b/,
      );
      const saved = JSON.parse(await readFile(libraryPath, "utf8"))
        .characters[0].sheet;
      assert.deepEqual(saved.ammunition, { arrows: 1, bolts: 0 });
      assert.deepEqual(saved.equipment, ["leather", "mace"]);
      assert.deepEqual(saved.stowed, ["shortbow"]);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
