// #346, browser → API → storage: a Wizard with 60 gp finds two spell
// scrolls behind the barrow's lintel, reads Mage Armor from "You carry" (no slot
// spent, the scroll used up), and leaves. The saved sheet keeps the unread
// Ray of Sickness scroll and not the read one; between adventures the sheet
// copies Ray of Sickness into the spellbook for 50 gp, using up the scroll.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { defaultPlacement } from "../dist/character-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { WIZARD } from "../dist/wizard-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { explore, launch } from "./fixtures/session-layout.mjs";
import { startAdventure } from "./fixtures/browser-journey.mjs";
import { scroll, scrollBarrowFile } from "./fixtures/scroll-barrow.mjs";

const scrollJourney = validateModule(
  scrollBarrowFile(
    [
      scroll("armour-scroll", "mage-armor"),
      scroll("sickness-scroll", "ray-of-sickness"),
    ],
    2,
  ),
);

const newest = (page) => page.locator("#log li").last().innerText();
const saved = async (path) =>
  JSON.parse(await readFile(path, "utf8")).characters[0].sheet;

test(
  "read one scroll of two and escape: the read one is gone, the other kept and copied into the spellbook",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-346-browser-"));
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
    // 60 gp from an earlier adventure, to copy a scroll with.
    const file = JSON.parse(await readFile(libraryPath, "utf8"));
    file.characters[0].sheet.purse = 6000;
    await writeFile(libraryPath, JSON.stringify(file, null, 2));
    const server = await startFifthBrowserServer({
      libraryPath,
      seed: 0,
      adventures: [scrollJourney],
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
      const start = await saved(libraryPath);
      await startAdventure(page, "lintel-barrow");

      await explore(page, "examine", "scratched-lintel");
      await explore(page, "take", "armour-scroll");
      await explore(page, "take", "sickness-scroll");
      const armour = page.locator(
        '#inventory > li[data-id="lintel-barrow/armour-scroll"]',
      );
      const sickness = page.locator(
        '#inventory > li[data-id="lintel-barrow/sickness-scroll"]',
      );
      assert.match(
        await armour.locator("p").first().innerText(),
        /^Spell Scroll \(Mage Armor\) — A spell scroll of Mage Armor \(1st level\)/u,
      );
      // Ray of Sickness is cast only in a fight: no Read outside one (a
      // Thunderwave scroll until #348 put Thunderwave in the default book).
      assert.equal(await sickness.locator("button").count(), 0);
      const read = armour.locator("button.act[data-action=read]");
      assert.equal(
        await read.getAttribute("aria-label"),
        "Read Spell Scroll (Mage Armor)",
      );

      await explore(page, "read", "lintel-barrow/armour-scroll");
      assert.match(
        await newest(page),
        /^You cast Mage Armor on yourself from the Spell Scroll \(Mage Armor\), which is used up\./u,
      );
      assert.equal(await armour.count(), 0);
      assert.equal(await sickness.count(), 1);

      await page.locator("#leave-controls button").click();
      await page.locator("#confirm-leave").click();
      await page.locator("#ending").waitFor({ state: "visible" });
      await page.locator("#ending-next").click();
      await page.locator("#sheet-name").filter({ hasText: "Vela" }).waitFor();

      const settled = await saved(libraryPath);
      assert.deepEqual(settled.magicItems, [
        { id: "lintel-barrow/sickness-scroll", scroll: "ray-of-sickness" },
      ]);
      assert.deepEqual(settled.finds, [
        "lintel-barrow/armour-scroll",
        "lintel-barrow/sickness-scroll",
      ]);
      assert.equal(settled.purse, start.purse);

      const entry = page.locator("#magic-items li");
      assert.equal(await entry.count(), 1);
      assert.match(
        await entry.innerText(),
        /^Spell Scroll \(Ray of Sickness\)\./u,
      );
      const copy = entry.locator("button[data-scroll]");
      assert.equal(await copy.innerText(), "Copy into spellbook (50 gp)");
      await copy.click();
      await page
        .locator("#sheet-spellbook")
        .filter({ hasText: "Ray of Sickness" })
        .waitFor();
      assert.equal(await page.locator("#magic-items").count(), 0);

      const copied = await saved(libraryPath);
      assert.deepEqual(copied.copiedSpells, ["ray-of-sickness"]);
      assert.deepEqual(copied.magicItems, []);
      assert.equal(copied.purse, settled.purse - 5000);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
