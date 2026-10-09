// #309, browser → API → storage: in the sealed crypt's hall a level-1 Rogue,
// carrying the thieves' tools its kit packs, picks the iron door's lock with
// a Dexterity check that adds its proficiency; a Fighter, who has no tools,
// is offered no Pick and breaks the same door. Each walks through, and the
// save holds the open door and the check.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { buildCharacter, defaultPlacement } from "../dist/character-5e.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { ROGUE } from "../dist/rogue-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, sessionSeed } from "../dist/session-5e.js";
import {
  actionButton,
  clickAction,
  startAdventure,
  text,
} from "./fixtures/browser-journey.mjs";
import { sealedCrypt } from "./fixtures/modules.mjs";
import { ada } from "./fixtures/playthroughs.mjs";
import { readAda, sessionFile } from "./fixtures/save-files.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

const DICE = [
  [6, 5, 4, 1],
  [5, 5, 4, 2],
  [3, 6, 4, 2],
  [4, 4, 4, 4],
  [1, 3, 3, 4],
  [2, 2, 4, 2],
];
const VEX = buildCharacter(
  "c".repeat(32),
  "Vex",
  DICE,
  { ...ROGUE.defaults, placement: defaultPlacement(DICE, ROGUE) },
  "rogue",
);

/** The first seed on which `sheet`'s `approach` opens the iron door. */
function seedFor(sheet, approach) {
  for (let seed = 0; seed < 200; seed++) {
    const runtime = createFifthRuntime(sealedCrypt, sheet);
    const random = createSeededRandom(sessionSeed(seed, 1));
    let state = runtime.createSession();
    for (const action of [
      { type: "begin" },
      { type: "move", destinationId: "hall" },
      { type: approach, doorId: "iron-door" },
    ]) {
      state = runtime.handleAction(state, action, random).state;
    }
    if (state.openedDoorIds.includes("iron-door")) {
      return seed;
    }
  }
  throw new Error(`no seed below 200 opens the door by ${approach}`);
}

const JOURNEYS = [
  {
    who: "a Rogue picks the lock",
    sheet: VEX,
    approach: "pick",
    card: /Dexterity check with thieves' tools: d20 \d+ \+ \d+ \+ 2 proficiency = \d+ against DC 15\. Success\.[\s\S]*You pick the Iron Door's lock\./u,
  },
  {
    who: "a Fighter without thieves' tools breaks the same door",
    sheet: ada,
    approach: "break",
    card: /Athletics check: d20 \d+ \+ \d+ \+ \d+ proficiency = \d+ against DC 18\. Success[\s\S]*You break the Iron Door open\./u,
  },
];

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 375, height: 812 },
]) {
  for (const { who, sheet, approach, card } of JOURNEYS) {
    const seed = seedFor(sheet, approach);
    test(
      `${who} (${viewport.width}px, seed ${seed})`,
      { timeout: 120000 },
      async () => {
        const directory = await mkdtemp(join(tmpdir(), "issue-309-browser-"));
        const libraryPath = join(directory, "characters.json");
        await writeFile(
          libraryPath,
          JSON.stringify({
            kind: "dungeon-one-characters",
            formatVersion: FIFTH_LIBRARY_FORMAT,
            revision: "0".repeat(32),
            creationsStarted: 1,
            sessionsStarted: 0,
            characters: [{ sheet, revision: 1 }],
          }),
        );
        const server = await startFifthBrowserServer({
          libraryPath,
          seed,
          adventures: [sealedCrypt],
          qualifies: () => true,
        });
        const browser = await launch();
        const page = await browser.newPage({ viewport });
        page.setDefaultTimeout(8000);
        try {
          await page.goto(server.url);
          await page
            .locator("#characters button")
            .filter({ hasText: sheet.name })
            .click();
          await startAdventure(page, "sealed-crypt");
          await clickAction(page, "move", "hall");
          // Pick is offered only with thieves' tools; Break always.
          assert.equal(
            await actionButton(page, "pick", "iron-door").count(),
            approach === "pick" ? 1 : 0,
          );
          assert.equal(
            await actionButton(page, "break", "iron-door").count(),
            1,
          );
          // The Rogue's tools are in "You carry", with no Equip.
          if (approach === "pick") {
            assert.match(
              await text(page.locator("#inventory")),
              /Thieves' tools/u,
            );
            assert.equal(
              await actionButton(page, "equip", "thieves-tools").count(),
              0,
            );
          }
          await assertNoSideScroll(page, `the hall (${approach})`, {
            wideFont: true,
          });
          await clickAction(page, approach, "iron-door");
          assert.match(await text(page.locator("#log li").last()), card);
          // Storage: the save holds the check and the open door.
          const saved = await sessionFile(directory);
          assert.equal(saved.formatVersion, FIFTH_SESSION_FORMAT);
          assert.ok(saved.state.openedDoorIds.includes("iron-door"));
          assert.deepEqual(
            saved.state.checks.map(({ id }) => id),
            [`${approach}:iron-door`],
          );
          // The way through is open.
          await clickAction(page, "move", "strongroom");
          const record = await readAda(libraryPath);
          assert.equal(record.sheet.class, sheet.class);
          assert.equal(
            (await sessionFile(directory)).state.roomId,
            "strongroom",
          );
        } finally {
          await browser.close();
          await server.close();
          await rm(directory, { recursive: true, force: true });
        }
      },
    );
  }
}
