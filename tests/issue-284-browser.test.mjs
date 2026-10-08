// #284, browser → API → storage: fail the climb, find the rope, and the
// cliff offers another try, named for the rope, under its button; after a
// reload it is still offered. The retry rolls at advantage from the rope,
// the card says so, and after another reload the second try is remembered
// in the save, with the action that asked for it.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  actionButton,
  clickAction,
  createAndStart,
  settled,
} from "./fixtures/browser-journey.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { ropeCove } from "./fixtures/modules.mjs";

/**
 * The first browser seed whose first climb fails for the default Ada (seeds
 * 0–3 and 5 succeed); the test checks the failure, so a change to the dice
 * shows here.
 */
const SEED = 4;

/** The cliff's buttons: each accessible name, retry caption and state. */
const cliffButtons = (page) =>
  page
    .locator('#action-bar button[data-target="sheer-cliff"]')
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        name: button.getAttribute("aria-label"),
        retry: button.dataset.retry ?? null,
        caption:
          button.parentElement.querySelector(".retry")?.textContent ?? null,
        disabled: button.disabled,
      })),
    );

/** The newest history entry's compact roll lines. */
const lastLines = (page) =>
  page
    .locator("#log li")
    .last()
    .locator(".compact")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent));

test(
  "fail a climb, find the rope, retry with advantage, reloading on the way",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-284-"));
    const server = await startFifthBrowserServer({
      adventures: [ropeCove],
      libraryPath: join(directory, "characters.json"),
      seed: SEED,
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 360, height: 740 },
    });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "rope-cove");
      await clickAction(page, "examine", "sheer-cliff");
      const [climb] = await lastLines(page);
      assert.match(climb, /^Ada Athletics check Failure \S.* vs DC 15$/);
      // Nothing has changed yet: no other try is offered.
      assert.deepEqual(await cliffButtons(page), [
        {
          name: "Examine Sheer Cliff",
          retry: null,
          caption: null,
          disabled: false,
        },
      ]);

      await clickAction(page, "examine", "old-crate");
      await clickAction(page, "take", "knotted-rope");
      const offered = [
        {
          name: "Examine Sheer Cliff",
          retry: null,
          caption: null,
          disabled: false,
        },
        {
          name: "Try again: Examine Sheer Cliff",
          retry: "true",
          caption: "Knotted Rope",
          disabled: false,
        },
      ];
      assert.deepEqual(await cliffButtons(page), offered);
      await assertNoSideScroll(page, "no horizontal scroll with a retry", {
        wideFont: true,
      });

      // Mid-way: the offer survives a reload.
      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await cliffButtons(page), offered);

      await settled(page, () =>
        page
          .locator('#action-bar button[data-target="sheer-cliff"][data-retry]')
          .click(),
      );
      const entry = await page.locator("#log li").last().textContent();
      assert.match(entry, /Another try at the Sheer Cliff \(Knotted Rope\)\./);
      const lines = await lastLines(page);
      assert.ok(
        lines.some((line) =>
          /^Ada Athletics check \S+.*advantage \(Knotted Rope\) .* vs DC 15$/.test(
            line,
          ),
        ),
        lines.join("\n"),
      );
      // The changed circumstance gave its one try: no other is offered.
      const after = await cliffButtons(page);
      assert.deepEqual(
        after.map(({ retry }) => retry),
        [null],
      );
      assert.equal(await actionButton(page, "take", "knotted-rope").count(), 0);
      const log = await page.locator("#log").textContent();

      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await cliffButtons(page), after);
      assert.equal(await page.locator("#log").textContent(), log);
      const file = await sessionFile(directory);
      assert.deepEqual(
        file.state.checks.map(({ id, held }) => [id, held ?? null]),
        [
          ["examine:sheer-cliff", null],
          ["examine:sheer-cliff", true],
        ],
      );
      assert.deepEqual(file.transitions.at(-1).action, {
        type: "examine",
        targetId: "sheer-cliff",
        retry: true,
      });
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
