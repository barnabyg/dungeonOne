import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultPlacement } from "../dist/character-5e.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FifthSession, sessionSeed } from "../dist/session-5e.js";
import { TEST_CASTER_CLASS } from "../dist/test-caster-class-5e.js";
import { loneGoblin } from "./fixtures/modules.mjs";
import { settled, text } from "./fixtures/browser-journey.mjs";
import {
  assertNoSideScroll,
  launch,
  widenFont,
} from "./fixtures/session-layout.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";

// #337: casting in the browser with the test-only caster, Sage, from a
// fixture library: a spell and target are chosen beside Cast; the status
// strip shows each ongoing effect, the spell holding concentration and when
// it ends; and Shield answers a hit. Through the API to the saved session.

/** A library holding Sage, preparing `prepared`; Sage's sheet. */
async function sageLibrary(path, prepared) {
  const library = new FifthCharacterLibrary(path, 7);
  const started = await library.startCreation();
  const data = await library.create(
    "Sage",
    {
      ...TEST_CASTER_CLASS.defaults,
      spells: { cantrips: ["fire-bolt", "sacred-flame"], prepared },
      placement: defaultPlacement(
        started.pendingCreation.dice,
        TEST_CASTER_CLASS,
      ),
    },
    started.revision,
    "test-caster",
  );
  return data.characters[0].sheet;
}

/** The first browser seed whose first session of `sheet` passes `ready`. */
function seedWhere(sheet, ready) {
  for (let seed = 0; seed < 500; seed++) {
    const session = FifthSession.begin(sessionSeed(seed, 1), loneGoblin, sheet);
    if (ready(session)) {
      return seed;
    }
  }
  throw new Error("no seed");
}

async function serve(prepared, ready) {
  const directory = await mkdtemp(join(tmpdir(), "issue-337-"));
  const libraryPath = join(directory, "characters.json");
  const sheet = await sageLibrary(libraryPath, prepared);
  const server = await startFifthBrowserServer({
    adventures: [loneGoblin],
    // Fixtures are engine material, not gated content.
    qualifies: () => true,
    libraryPath,
    seed: seedWhere(sheet, ready),
  });
  return { directory, server };
}

async function startSage(page, url) {
  await page.goto(url);
  await page.locator("#characters .open-character").first().click();
  await page.locator('.start-adventure[data-adventure="lone-goblin"]').click();
  await page.locator("#adventure").waitFor({ state: "visible" });
  await page.locator("#log li").first().waitFor();
}

/** Sage's turn first, and Bless still holds once cast and the goblin acts. */
const blessHolds = (session) => {
  const { state } = session;
  if (
    state.encounter?.order[state.encounter.turn].combatantId !== "pc" ||
    state.encounter.pendingReaction !== undefined
  ) {
    return false;
  }
  session.act(
    {
      type: "cast",
      actorId: "pc",
      spellId: "bless",
      targetId: "pc",
      slotLevel: 1,
    },
    "click",
  );
  return session.state.character.effects?.[0]?.spellId === "bless";
};

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `Bless is cast from the spell choice and shows with its concentration, at ${viewport.width} px`,
    { timeout: 120000 },
    async () => {
      const { directory, server } = await serve(
        ["bless", "shield-of-faith", "cure-wounds"],
        blessHolds,
      );
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await startSage(page, server.url);
        const spell = page.locator("#cast-spell");
        assert.deepEqual(await spell.locator("option").allTextContents(), [
          "Fire Bolt (cantrip)",
          "Sacred Flame (cantrip)",
          "Bless (1st-level slot)",
          "Shield of Faith (1st-level slot)",
          "Cure Wounds (1st-level slot)",
        ]);
        // Cure Wounds at full HP: Cast is disabled with the engine's reason.
        await spell.selectOption({ label: "Cure Wounds (1st-level slot)" });
        assert.equal(
          await page.locator("button.act[data-action=cast]").isDisabled(),
          true,
        );
        assert.equal(
          await page.locator("#cast-reason").textContent(),
          "Full HP",
        );
        await spell.selectOption({ label: "Bless (1st-level slot)" });
        assert.deepEqual(
          await page.locator("#cast-target option").allTextContents(),
          ["Yourself"],
        );
        if (viewport.width === 375) {
          await widenFont(page);
          await assertNoSideScroll(page);
        }
        await settled(page, () =>
          page.locator("button.act[data-action=cast]").click(),
        );
        assert.match(
          await text(page.locator("#log li").filter({ hasText: "takes hold" })),
          /Bless takes hold on you: \+1d4 to attack rolls and saving throws, until the fight ends\. You concentrate on it\./u,
        );
        const bless = page.locator('#effects li[data-effect="bless"]');
        assert.equal(
          await bless.locator(".effect-until").textContent(),
          "concentration, until the fight ends",
        );
        assert.match(
          await bless.locator(".tag").textContent(),
          /^Bless: \+1d4 to attack rolls and saving throws$/u,
        );
        if (viewport.width === 375) {
          await assertNoSideScroll(page);
        }
        const file = await sessionFile(directory);
        assert.deepEqual(file.transitions.at(-1).action, {
          type: "cast",
          actorId: "pc",
          spellId: "bless",
          targetId: "pc",
          slotLevel: 1,
        });
        assert.deepEqual(
          file.state.character.effects.map(({ spellId }) => spellId),
          ["bless"],
        );
        // Reloading shows the same.
        await page.reload();
        await page.locator("#log li").first().waitFor();
        assert.equal(
          await page.locator('#effects li[data-effect="bless"]').count(),
          1,
        );
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}

test(
  "Shield answers a hit from the spell choice, beside Take the hit",
  { timeout: 120000 },
  async () => {
    const { directory, server } = await serve(
      ["shield", "magic-missile", "cure-wounds"],
      ({ state }) => state.encounter?.pendingReaction !== undefined,
    );
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(5000);
    try {
      await startSage(page, server.url);
      assert.match(await page.locator("#turn").textContent(), /hits you\.$/u);
      assert.deepEqual(
        await page.locator("#cast-spell option").allTextContents(),
        ["Shield (1st-level slot)"],
      );
      assert.equal(
        await page.locator('button.act[data-action="take-hit"]').count(),
        1,
      );
      assert.equal(
        await page.locator('button.act[data-action="uncanny-dodge"]').count(),
        0,
      );
      await settled(page, () =>
        page.locator("button.act[data-action=cast]").click(),
      );
      assert.match(
        await text(page.locator("#log li.newest")),
        /You cast Shield on yourself with a 1st-level spell slot \(1 of 2 left\)\.\nShield takes hold on you: \+5 AC, until the start of your next turn\./u,
      );
      const file = await sessionFile(directory);
      assert.equal(file.state.encounter.pendingReaction, undefined);
      assert.equal(file.state.character.featureUses["spell-slots-1"], 1);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
