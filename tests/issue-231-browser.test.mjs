// #231, browser → API → storage: two skeletons are the bestiary's Skeleton
// under the module's own names, and the fight shows those names in the
// initiative table and the narration.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { launch } from "./fixtures/session-layout.mjs";
import { skeletonBarracks } from "./fixtures/renamed-skeletons.mjs";

test(
  "a renamed bestiary monster fights under the module's name",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-231-browser-"));
    const server = await startFifthBrowserServer({
      adventures: [skeletonBarracks],
      qualifies: () => true,
      libraryPath: join(directory, "characters.json"),
      seed: 0,
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
        .locator('.start-adventure[data-adventure="skeleton-barracks"]')
        .click();
      await page.locator("#adventure").waitFor({ state: "visible" });
      // The fight starts as Ada arrives.
      await page.locator("#initiative-rows tr").first().waitFor();
      await page.locator("#log li:not([data-pending])").first().waitFor();
      const rows = await page.locator("#initiative-rows tr").allTextContents();
      assert.equal(rows.length, 3);
      assert.ok(rows.some((row) => row.includes("Tall Skeleton")));
      assert.ok(rows.some((row) => row.includes("Bent Skeleton")));
      assert.equal(
        rows.filter((row) => row.includes("Skeleton")).length,
        2,
        `only the two named skeletons: ${rows.join(" | ")}`,
      );
      const log = await page.locator("#log").innerText();
      assert.match(
        log,
        /Initiative: [^\n]*(Tall Skeleton[^\n]*Bent Skeleton|Bent Skeleton[^\n]*Tall Skeleton)/u,
      );
      assert.match(log, /A tall skeleton in rusted mail raises a shortsword\./);

      // Each skeleton attacks, or is attacked, under its module name.
      const count = await page.locator("#log li").count();
      await page
        .locator("#attack-controls button.attack:enabled")
        .first()
        .click();
      await page.waitForFunction(
        (seen) =>
          document.querySelectorAll("#log li:not([data-pending])").length >
          seen,
        count,
      );
      assert.match(
        await page.locator("#log li").last().innerText(),
        /(Tall|Bent) Skeleton/u,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
