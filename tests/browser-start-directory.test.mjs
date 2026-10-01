import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { startBrowserServer } from "../dist/browser-server.js";

test(
  "Start adventure creates a missing save directory and restores the saved opening",
  { timeout: 30000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "dungeon-start-directory-"));
    const savePath = join(directory, "missing", "nested", "slot.json");
    const options = {
      contentVersion: "6",
      seed: 1,
      savePath,
      apiKey: "offline",
      dmModel: {
        async respond() {
          throw new Error("Starting and continuing must not call AI");
        },
      },
    };
    const browser = await chromium.launch(
      process.platform === "win32" ? { channel: "msedge" } : {},
    );
    let server;
    try {
      server = await startBrowserServer(options);
      const page = await browser.newPage();
      await page.goto(server.url);
      await page
        .getByRole("button", { name: "Start adventure", exact: true })
        .waitFor();
      await assert.rejects(stat(join(directory, "missing")), {
        code: "ENOENT",
      });
      const response = page.waitForResponse((result) =>
        result.url().endsWith("/api/start"),
      );
      await page
        .getByRole("button", { name: "Start adventure", exact: true })
        .click();
      const result = await response;
      const body = await result.json();
      assert.equal(result.status(), 200, body.error);
      assert.equal(body.scene.room.id, "watch-yard");
      const saved = JSON.parse(await readFile(savePath, "utf8"));
      assert.equal(saved.content.snapshot.contentVersion, "6");
      await server.close();
      server = await startBrowserServer(options);
      await page.goto(server.url);
      await page.waitForFunction(
        () =>
          document.getElementById("conversation").getAttribute("aria-busy") ===
          "false",
      );
      const resumed = await (await fetch(server.url + "/api/state")).json();
      assert.equal(resumed.slot, "occupied");
      assert.equal(resumed.scene.room.id, "watch-yard");
      assert.deepEqual(
        JSON.parse(await readFile(savePath, "utf8")).checkpoint,
        saved.checkpoint,
      );
      assert.deepEqual(resumed.history, []);
    } finally {
      if (server) {
        await server.close();
      }
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
