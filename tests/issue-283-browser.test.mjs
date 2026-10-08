// #283, browser → API → storage: the wall offers one Examine per approach,
// each under its skill; choosing Acrobatics rolls Acrobatics, the other
// approach goes, and after a reload the wall is still resolved.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createAndStart, settled } from "./fixtures/browser-journey.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { obstacleYard } from "./fixtures/modules.mjs";

/** The wall's Examine buttons: each accessible name, skill and state. */
const wallButtons = (page) =>
  page
    .locator('#action-bar button[data-target="crumbling-wall"]')
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        name: button.getAttribute("aria-label"),
        approach: button.dataset.approach ?? null,
        caption:
          button.parentElement.querySelector(".approach")?.textContent ?? null,
        disabled: button.disabled,
      })),
    );

test(
  "choosing an approach rolls its skill, withdraws the other, and survives a reload",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-283-"));
    const server = await startFifthBrowserServer({
      adventures: [obstacleYard],
      libraryPath: join(directory, "characters.json"),
      seed: 0,
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 360, height: 740 },
    });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "obstacle-yard");
      assert.deepEqual(await wallButtons(page), [
        {
          name: "Examine Crumbling Wall with Athletics",
          approach: "athletics",
          caption: "Athletics",
          disabled: false,
        },
        {
          name: "Examine Crumbling Wall with Acrobatics",
          approach: "acrobatics",
          caption: "Acrobatics",
          disabled: false,
        },
      ]);
      await assertNoSideScroll(page, "no horizontal scroll with approaches", {
        wideFont: true,
      });

      await settled(page, () =>
        page
          .locator(
            '#action-bar button[data-target="crumbling-wall"][data-approach="acrobatics"]',
          )
          .click(),
      );
      const [line] = await page
        .locator("#log li")
        .last()
        .locator(".compact")
        .evaluateAll((nodes) => nodes.map((node) => node.textContent));
      assert.match(line, /^Ada Acrobatics check \S.* vs DC 14$/);
      const after = await wallButtons(page);
      assert.deepEqual(after, [
        {
          name: "Examine Crumbling Wall",
          approach: null,
          caption: null,
          disabled: false,
        },
      ]);
      const log = await page.locator("#log").textContent();

      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await wallButtons(page), after);
      assert.equal(await page.locator("#log").textContent(), log);
      const file = await sessionFile(directory);
      assert.equal(file.state.checks[0].id, "examine:crumbling-wall");
      assert.deepEqual(file.transitions.at(-1).action, {
        type: "examine",
        targetId: "crumbling-wall",
        approach: "acrobatics",
      });
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
