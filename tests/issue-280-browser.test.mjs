// #280, browser → API → storage: forcing a stuck door and asking a topic with
// a check, both through the one check path, show their cards, and a reload
// and a server restart show the same cards from the saved session.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { clickAction, createAndStart } from "./fixtures/browser-journey.mjs";
import { launch } from "./fixtures/session-layout.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { sealedCrypt } from "./fixtures/modules.mjs";

/** The history as shown: each entry's text and its compact roll lines. */
const history = (page) =>
  page.locator("#log li").evaluateAll((entries) =>
    entries.map((entry) => ({
      text: entry.textContent,
      compact: [...entry.querySelectorAll(".compact")].map(
        (node) => node.textContent,
      ),
    })),
  );

test(
  "a forced door and a topic's check keep their cards across a reload and a restart",
  { timeout: 120000 },
  async () => {
    const seed = 0;
    const directory = await mkdtemp(join(tmpdir(), "issue-280-"));
    const libraryPath = join(directory, "characters.json");
    let server = await startFifthBrowserServer({
      adventures: [sealedCrypt],
      libraryPath,
      seed,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 360, height: 740 },
    });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "sealed-crypt");
      await clickAction(page, "force", "swollen-door");
      await clickAction(page, "move", "hall");
      await clickAction(page, "talk", "key-whereabouts");

      const shown = await history(page);
      const [force] = shown.find(({ text }) =>
        /Swollen Door/.test(text),
      ).compact;
      assert.match(
        force,
        /^Ada Athletics check (Success|Failure) d20 \d+ [+−] \d+ \+ 2 prof = \d+ vs DC 13$/,
      );
      const [ask] = shown.at(-1).compact;
      assert.match(
        ask,
        /^Ada Persuasion check (Success|Failure) d20 \d+ [+−] \d+( \+ 2 prof)? = \d+ vs DC 12$/,
      );
      const file = await sessionFile(directory);
      assert.deepEqual(
        file.state.checks.map(({ id }) => id),
        ["force:swollen-door", "talk:key-whereabouts"],
      );

      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await history(page), shown);

      await server.close();
      server = await startFifthBrowserServer({
        adventures: [sealedCrypt],
        libraryPath,
        seed: seed + 1,
      });
      await page.goto(`${server.url}/#adventure-${file.id}`);
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await history(page), shown);
      // The remembered checks stay tried.
      const disabled = await page
        .locator(
          '#action-bar button[data-action="talk"][data-target="key-whereabouts"]',
        )
        .isDisabled();
      assert.ok(disabled);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
