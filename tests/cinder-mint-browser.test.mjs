import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  actionButton,
  settled,
  startAdventure,
} from "./fixtures/browser-journey.mjs";
import { readAda } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

const mint = "last-shift-at-cinder-mint";
const moves = (...rooms) => rooms.map((id) => ["move", id]);
const toThePress = [
  ...moves("pay-window", "weigh-house", "engravers-bench", "paymasters-office"),
  ["examine", "stove-fender"],
  ["take", "grain-invoice"],
  ...moves("payroll-archive"),
  ["use-on", "counterfoil-register"],
  ["take", "certified-order"],
  ...moves("witness-stair", "records-landing", "sample-lock"),
  ...moves("acid-bench", "proofing-press"),
  ["use-on", "wax-press"],
];
const evidence = [
  ...toThePress,
  ...moves("die-room"),
  ["examine", "witness-summons"],
  ...moves("assay-chamber"),
];
const switchToBarge = [
  ...moves("delivery-yard", "coal-scales"),
  ["examine", "shift-diagram"],
  ["take", "shift-card"],
  ...moves("delivery-yard", "petitioners-steps"),
  ...toThePress,
  ["use-on", "maintenance-shutter"],
  ...moves("casting-pit", "furnace-walk", "stokers-refuge"),
  ["talk", "kits-wish"],
  ...moves("furnace-walk", "casting-pit", "cooling-beds", "ash-lock"),
  ["examine", "service-hooks"],
  ["take", "service-key"],
  ["use-on", "return-selector"],
  ...moves("assay-chamber"),
];
const barge = [
  ...moves("delivery-yard", "coal-scales"),
  ["examine", "shift-diagram"],
  ["take", "shift-card"],
  ...moves("cart-shed", "watch-mess", "chain-walk", "winding-house"),
  ["take", "winding-crank"],
  ["use-on", "crank-socket"],
  ...moves("bullion-lift", "lift-foot", "stokers-refuge"),
  ["talk", "kits-wish"],
  ...moves("furnace-walk", "casting-pit", "cooling-beds", "ash-lock"),
  ["use-on", "return-selector"],
  ["examine", "service-hooks"],
  ["take", "service-key"],
  ...moves("assay-chamber"),
];

for (const [scenario, title, route, choice, alternative] of [
  ["hearing", "Six names restored", evidence, "enter-proof", "transfer-six"],
  ["barge", "The empty return", barge, "transfer-six", "enter-proof"],
  [
    "change course",
    "The empty return",
    switchToBarge,
    "transfer-six",
    "enter-proof",
  ],
  ["take the wand early", "A pocketful of mint money", evidence],
]) {
  test(
    `Cinder Mint: ${scenario}, resume and keep Third Bell on Scarce`,
    { timeout: 240000 },
    async (t) => {
      const directory = await mkdtemp(join(tmpdir(), "cinder-mint-"));
      const libraryPath = join(directory, "characters.json");
      t.after(() => rm(directory, { recursive: true, force: true }));
      await copyFile(
        new URL("./fixtures/libraries/level-5-ada.json", import.meta.url),
        libraryPath,
      );
      const server = await startFifthBrowserServer({
        libraryPath,
        seed: 24,
        qualifies: () => true,
      });
      const browser = await launch();
      t.after(async () => {
        await browser.close();
        await server.close();
      });
      const page = await browser.newPage();
      page.setDefaultTimeout(12000);
      await page.goto(server.url);
      await page.locator("#open-settings").click();
      await page.locator("#setting-itemsFound-scarce").check();
      await page.locator("#feedback").filter({ hasText: "Saved." }).waitFor();
      await page.goto(server.url);
      await page.locator("#characters .open-character").first().click();
      await startAdventure(page, mint);
      const act = (action, target) =>
        settled(page, () => actionButton(page, action, target).first().click());
      for (const [action, target] of route) {
        await act(action, target);
      }
      await page.reload();
      if (choice !== undefined) {
        await act("talk", "six-voices");
        if (scenario === "change course") {
          assert.equal(
            await actionButton(page, "talk", alternative).isEnabled(),
            true,
          );
        }
        await act("talk", choice);
        assert.equal(await actionButton(page, "talk", alternative).count(), 0);
      }
      await act("unlock", "proof-door");
      await act("move", "proof-vault");
      await act("examine", "foremans-drawer");
      await act("take", "foremans-wand");
      if (choice === undefined) {
        await act("take", "foremans-garnet");
      }
      assert.match(await page.locator("#inventory").innerText(), /Third Bell/u);
      await act("examine", "wharf-release");
      await act("move", "ash-wharf");
      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      assert.equal(await page.locator("#ending-title").innerText(), title);
      const { sheet, session } = await readAda(libraryPath);
      assert.equal(session, undefined);
      assert.deepEqual(
        sheet.magicItems.find(({ wand }) => wand === "third-bell"),
        {
          id: `${mint}/foremans-wand`,
          wand: "third-bell",
          charges: 7,
        },
      );
    },
  );
}
