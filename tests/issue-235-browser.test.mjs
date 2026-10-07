// #235, browser → API → storage: a gnoll's Multiattack makes two attacks on
// its turn, each with its attack chosen by a die. The log narrates the die,
// the compact roll line shows it as an "attack die", and a restart serves
// the same lines from the saved session.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { fightRoomFile } from "./fixtures/modules.mjs";
import { firstFighter, launch } from "./fixtures/session-layout.mjs";

/** The lone goblin's room with the bestiary's gnoll in the goblin's place. */
const gnollCellar = validateModule(
  fightRoomFile("gnoll-cellar", "The Gnoll Cellar", [
    { id: "gnoll", monster: "gnoll" },
  ]),
);

/** Whether the gnoll acts before Ada's first turn in the session on `seed`. */
function gnollFirst(seed) {
  const runtime = createFifthRuntime(gnollCellar, firstFighter(seed));
  const { events } = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    createSeededRandom(sessionSeed(seed, 1)),
  );
  return (
    events.filter(
      ({ type, actorId }) => type === "attack" && actorId === "gnoll",
    ).length === 2
  );
}

const shown = (page) =>
  page.evaluate(() => ({
    log: document.querySelector("#log").innerText,
    dice: [...document.querySelectorAll("#log .roll.weapon")].map(
      (node) => node.textContent,
    ),
  }));

test(
  "a gnoll's two attacks each name the die that chose them, and a restart keeps them",
  { timeout: 120000 },
  async () => {
    let seed = 0;
    while (!gnollFirst(seed)) {
      seed += 1;
      assert.ok(seed < 200, "a seed lets the gnoll act first");
    }
    const directory = await mkdtemp(join(tmpdir(), "issue-235-browser-"));
    const options = {
      libraryPath: join(directory, "characters.json"),
      adventures: [gnollCellar],
      qualifies: () => true,
    };
    let server = await startFifthBrowserServer({ ...options, seed });
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
        .locator(`.start-adventure[data-adventure="${gnollCellar.id}"]`)
        .click();
      await page.locator("#adventure").waitFor({ state: "visible" });
      await page.locator("#log .roll.weapon").first().waitFor();

      const before = await shown(page);
      const narrated = [
        ...before.log.matchAll(
          /Gnoll Ravager attacks Ada with (Spear|Bite) \(attack chosen by a die: ([12])\)/g,
        ),
      ];
      assert.equal(narrated.length, 2);
      for (const [, weapon, die] of narrated) {
        assert.equal(weapon, ["Spear", "Bite"][Number(die) - 1]);
      }
      assert.deepEqual(
        before.dice,
        narrated.map(([, , die]) => `attack die d2 ${die}`),
      );

      // Stored: a restart serves the same lines from the saved session.
      const [file] = await readdir(join(directory, "characters-adventures"));
      const saved = JSON.parse(
        await readFile(join(directory, "characters-adventures", file), "utf8"),
      );
      await server.close();
      server = await startFifthBrowserServer({ ...options, seed: seed + 1 });
      await page.goto(`${server.url}/#adventure-${saved.id}`);
      await page.locator("#log .roll.weapon").first().waitFor();
      assert.deepEqual(await shown(page), before);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
