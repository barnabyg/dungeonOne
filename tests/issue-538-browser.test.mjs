// #538, browser → API → storage: a Wizard finds the Pearl of Power behind
// the barrow's lintel. "You carry" says it is attuned and offers Regain a
// slot, disabled with nothing spent; after leaving, the saved sheet holds
// it and the sheet shows it attuned with its effect.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { defaultPlacement } from "../dist/character-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import { explore, launch } from "./fixtures/session-layout.mjs";
import { startAdventure } from "./fixtures/browser-journey.mjs";
import { pearlBarrow } from "./fixtures/war-mage-barrow.mjs";

const saved = async (path) =>
  JSON.parse(await readFile(path, "utf8")).characters[0].sheet;

test(
  "a Wizard finds the Pearl of Power, attuned, with Regain a slot offered on its entry",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-538-browser-"));
    const libraryPath = join(directory, "characters.json");
    const library = new FifthCharacterLibrary(libraryPath, 0);
    const started = await library.startCreation();
    await library.create(
      "Vela",
      {
        ...WIZARD.defaults,
        placement: defaultPlacement(started.pendingCreation.dice, WIZARD),
      },
      started.revision,
      "wizard",
    );
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [pearlBarrow],
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1024, height: 768 },
    });
    page.setDefaultTimeout(5000);
    try {
      await page.goto(server.url);
      await page.locator("#characters .open-character").first().click();
      await page.locator("#sheet-name").filter({ hasText: "Vela" }).waitFor();
      await startAdventure(page, "lintel-barrow");

      await explore(page, "examine", "scratched-lintel");
      await explore(page, "take", "pale-pearl");
      const carried = page.locator(
        '#inventory li[data-id="lintel-barrow/pale-pearl"]',
      );
      assert.equal(
        await carried.locator("strong").innerText(),
        "Pearl of Power",
      );
      assert.match(
        await carried.locator(".carry-text").textContent(),
        /^An uncommon wondrous item that requires attunement by a spellcaster: while attuned, use it outside a fight to regain one spent spell slot of 3rd level or lower, the highest spent; once per long rest\. Attuned\.$/u,
      );
      // Offered on its entry, disabled with every slot full.
      const regain = carried.locator("button.act[data-action=regain-slot]");
      assert.equal(await regain.innerText(), "Regain a slot");
      assert.equal(
        await regain.getAttribute("aria-label"),
        "Regain a spell slot with Pearl of Power",
      );
      assert.equal(await regain.isDisabled(), true);
      assert.match(await carried.innerText(), /No slot spent/u);

      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      await page.locator("#ending-next").click();
      await page.locator("#sheet-name").filter({ hasText: "Vela" }).waitFor();

      assert.deepEqual((await saved(libraryPath)).magicItems, [
        { id: "lintel-barrow/pale-pearl", casterItem: "pearl-of-power" },
      ]);
      assert.match(
        await page.locator("#magic-items li").innerText(),
        /^Pearl of Power\..*regain one spent spell slot.* Attuned\.$/su,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
