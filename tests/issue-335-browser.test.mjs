import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { restingTunnelsFile } from "./fixtures/modules.mjs";
import {
  clickAction,
  createAndStart,
  fight,
  settled,
  text,
} from "./fixtures/browser-journey.mjs";
import {
  assertNoSideScroll,
  launch,
  widenFont,
} from "./fixtures/session-layout.mjs";
import { readAda, sessionFile } from "./fixtures/save-files.mjs";

// #335: a long rest at a fixture rest site, and a short rest the module's
// wandering encounter interrupts, from the room panel through the API to the
// saved session.

/** The resting tunnels with no wandering encounter: no rest is interrupted. */
const quiet = validateModule(restingTunnelsFile());
/**
 * The resting tunnels whose wandering encounter always comes: a starved rat
 * of 1 HP whose bite rarely lands, so the journey goes on past its fight.
 */
const prowled = validateModule(
  (() => {
    const module = restingTunnelsFile(100);
    module.id = "prowled-tunnels";
    module.title = "The Prowled Tunnels";
    const { statBlock } = module.encounters.at(-1).opponents[0];
    statBlock.hitPoints = { average: 1, formula: "1d1" };
    statBlock.attacks[0].bonus = -5;
    return module;
  })(),
);

async function serve(seed) {
  const directory = await mkdtemp(join(tmpdir(), "issue-335-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({
    adventures: [quiet, prowled],
    // Fixtures are engine material, not gated content: the gate is tested
    // in issue-335.test.mjs.
    qualifies: () => true,
    libraryPath,
    seed,
  });
  return { directory, libraryPath, server };
}

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `a long rest at a rest site restores every hit point, at ${viewport.width} px`,
    { timeout: 120000 },
    async () => {
      // Ada leaves the rat's fight at 7 of 13 HP.
      const { directory, libraryPath, server } = await serve(1);
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await createAndStart(page, server.url, "resting-tunnels");
        const longRest = page.locator("#long-rest-controls button.act");
        // The stair is no rest site: no long rest shows.
        assert.equal(await page.locator("#long-rest").isVisible(), false);
        // The alcove is one, but fresh there is nothing to restore.
        await clickAction(page, "move", "alcove");
        assert.equal(await page.locator("#long-rest").isVisible(), true);
        assert.equal(
          await page.locator("#long-rest-summary").textContent(),
          "This is a safe place to rest. Long rests: 1 of 1 left in this adventure; a long rest restores every hit point, hit die and feature use.",
        );
        assert.equal(await longRest.count(), 0);
        await clickAction(page, "move", "stair-foot");
        await clickAction(page, "move", "rat-cellar");
        await fight(page);
        assert.match(
          await page.locator("#character-hp").textContent(),
          /^HP 7 of 13,/u,
        );
        // Hurt, away from the rest site: still no long rest.
        assert.equal(await page.locator("#long-rest").isVisible(), false);
        await clickAction(page, "move", "stair-foot");
        await clickAction(page, "move", "alcove");
        assert.equal(await longRest.isEnabled(), true);
        if (viewport.width === 375) {
          // CI's Linux fallback font is wider than Windows'.
          await widenFont(page);
          await assertNoSideScroll(page);
        }
        await settled(page, () => longRest.click());
        assert.match(
          await text(page.locator("#log li.newest")),
          /You take a long rest: you regain 6 HP \(13\/13 HP\) and 0 hit dice \(1 of 1 d10 left\)\. Long rests: 0 of 1 left in this adventure\./u,
        );
        assert.match(
          await page.locator("#character-hp").textContent(),
          /^HP 13 of 13,/u,
        );
        // Nothing is left to restore, so Long rest goes.
        assert.equal(await longRest.count(), 0);
        assert.match(
          await page.locator("#long-rest-summary").textContent(),
          /Long rests: 0 of 1 left in this adventure;/u,
        );
        const file = await sessionFile(directory);
        assert.equal(file.state.longRests, 1);
        assert.equal(file.state.character.hp, 13);
        assert.deepEqual(file.transitions.at(-1).action, {
          type: "long-rest",
        });
        // Reloading shows the same.
        await page.reload();
        await page.locator("#log li").first().waitFor();
        assert.match(
          await page.locator("#long-rest-summary").textContent(),
          /Long rests: 0 of 1 left/u,
        );
        assert.ok((await readAda(libraryPath)).session !== undefined);
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}

test(
  "a short rest the wandering encounter interrupts restores nothing and starts its fight",
  { timeout: 120000 },
  async () => {
    // Ada leaves the rat's fight hurt, and beats the starved rat.
    const { directory, server } = await serve(1);
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "prowled-tunnels");
      await clickAction(page, "move", "rat-cellar");
      await fight(page);
      const before = (await sessionFile(directory)).state.character.hp;
      assert.ok(before < 13);
      const rest = page.locator("#rest-controls button.act");
      await settled(page, () => rest.click());
      const card = await text(page.locator("#log li.newest"));
      assert.match(
        card,
        /You keep watch as you rest: d100 \d+, 100 or less: the Prowling Rat comes upon you\. Your short rest is interrupted and restores nothing\./u,
      );
      // The d100 shows on the card.
      assert.match(
        await page
          .locator("#log li.newest .roll.wandering")
          .first()
          .textContent(),
        /^d100 \d+ vs 100 or less$/u,
      );
      // Nothing restored; the fight is on and the rest panel is away.
      assert.doesNotMatch(card, /You spend a hit die/u);
      assert.equal(await page.locator("#rest-group").isVisible(), false);
      assert.match(
        await page.locator("#encounter").innerText(),
        /Prowling Rat/u,
      );
      const interrupted = await sessionFile(directory);
      assert.ok(interrupted.state.character.hp <= before);
      assert.equal(interrupted.state.shortRests, 0);
      assert.equal(interrupted.state.character.hitDice, 1);
      assert.equal(interrupted.state.wandering, true);
      assert.deepEqual(interrupted.transitions.at(-1).action, {
        type: "rest",
        hitDice: 1,
      });
      await fight(page);
      // Won, the short rest is offered again, and no d100 is rolled now.
      const won = await sessionFile(directory);
      assert.equal(won.state.status, "playing");
      assert.ok(won.state.clearedEncounterIds.includes("prowling-rat"));
      assert.ok(won.state.character.hp < 13);
      await settled(page, () => rest.click());
      const rested = await text(page.locator("#log li.newest"));
      assert.match(rested, /You take a short rest and spend 1 hit die/u);
      assert.doesNotMatch(rested, /d100/u);
      assert.equal((await sessionFile(directory)).state.shortRests, 1);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
