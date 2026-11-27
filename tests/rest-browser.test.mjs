import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { ratTunnels, restingTunnelsFile, room } from "./fixtures/modules.mjs";
import {
  clickAction,
  createAndStart,
  fight,
  settled,
  text,
} from "./fixtures/browser-journey.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";
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
/**
 * The resting tunnels whose den is a way out: its goblin fights but no
 * longer ends the adventure, so Ada can come back hurt after her long rest.
 */
const denExit = validateModule(
  (() => {
    const module = restingTunnelsFile();
    module.id = "den-exit-tunnels";
    module.title = "The Den Exit Tunnels";
    delete module.encounters.find(({ id }) => id === "den-goblin")
      .victoryEndingId;
    room(module, "den").exit = true;
    module.endings = [
      {
        id: "out-through-the-den",
        kind: "escape-without-loot",
        title: "Out through the den",
        text: "You climb the den's back stair into the open air.",
      },
      module.endings.find(({ kind }) => kind === "defeat"),
    ];
    return module;
  })(),
);

async function serve(seed) {
  const directory = await mkdtemp(join(tmpdir(), "issue-335-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({
    adventures: [quiet, prowled, denExit],
    // Fixtures are engine material, not gated content: the gate is tested
    // in issue-335.test.mjs.
    qualifies: () => true,
    libraryPath,
    seed,
  });
  return { directory, libraryPath, server };
}

const viewport = { width: 1280, height: 850 };
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
      // The stair is no rest site: the long rest's line says so (#521).
      assert.equal(await longRest.count(), 0);
      assert.equal(
        await page.locator("#long-rest-reason").textContent(),
        "Only at a rest site",
      );
      // The alcove is one, but fresh there is nothing to restore.
      await clickAction(page, "move", "alcove");
      assert.equal(
        await page.locator("#long-rest-summary").textContent(),
        "Long rest 1 of 1 left in this adventure. This is a safe place to rest.",
      );
      assert.equal(await longRest.isDisabled(), true);
      assert.equal(
        await longRest.getAttribute("aria-describedby"),
        "rest-reason",
      );
      assert.equal(
        await page
          .locator("#rest-group")
          .getByText("Nothing to recover", { exact: true })
          .count(),
        1,
      );
      await clickAction(page, "move", "stair-foot");
      await clickAction(page, "move", "rat-cellar");
      await fight(page);
      assert.match(
        await page.locator("#character-hp").textContent(),
        /^HP 7 of 13,/u,
      );
      // Hurt, away from the rest site: still no long rest.
      assert.equal(await longRest.count(), 0);
      assert.equal(
        await page.locator("#long-rest-reason").textContent(),
        "Only at a rest site",
      );
      await clickAction(page, "move", "stair-foot");
      await clickAction(page, "move", "alcove");
      assert.equal(await longRest.isEnabled(), true);
      await settled(page, () => longRest.click());
      assert.match(
        await text(page.locator("#log li.newest")),
        /You take a long rest: you regain 6 HP \(13\/13 HP\) and 0 hit dice \(1 of 1 d10 left\)\. Long rests: 0 of 1 left in this adventure\./u,
      );
      assert.match(
        await page.locator("#character-hp").textContent(),
        /^HP 13 of 13,/u,
      );
      // None is left, so Long rest is greyed with its reason.
      assert.equal(await longRest.isDisabled(), true);
      assert.equal(
        await page.locator("#long-rest-reason").textContent(),
        "No long rest left",
      );
      assert.match(
        await page.locator("#long-rest-summary").textContent(),
        /^Long rest 0 of 1 left in this adventure\./u,
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
        /^Long rest 0 of 1 left/u,
      );
      assert.ok((await readAda(libraryPath)).session !== undefined);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

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
        /You keep watch as you rest: d100 \d+, 100 or less: Prowling Rat comes upon you\. Your short rest is interrupted and restores nothing\./u,
      );
      // The d100 shows on the card.
      assert.match(
        await page
          .locator("#log li.newest .roll.wandering")
          .first()
          .textContent(),
        /^d100 \d+ vs 100 or less$/u,
      );
      // Nothing restored; the fight is on and the rest panel says so, the
      // interrupted rest not counted (#521).
      assert.doesNotMatch(card, /You spend a hit die/u);
      assert.equal(await page.locator("#short-rest").isVisible(), false);
      assert.equal(
        await text(page.locator("#rest-fight")),
        "Not during a fight\nShort rests 2 of 2 left · Long rests 1 of 1 left",
      );
      assert.match(
        await page.locator("#encounter").innerText(),
        /Prowling Rat/u,
      );
      const interrupted = await sessionFile(directory);
      assert.ok(interrupted.state.character.hp <= before);
      assert.equal(interrupted.state.shortRests, 0);
      assert.equal(interrupted.state.character.hitDice, 1);
      assert.equal(interrupted.state.wandering, "prowling-rat");
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

test(
  "a long rest already taken is refused at the rest site, with its reason",
  { timeout: 120000 },
  async () => {
    // With seed 7 Ada survives the rat, and the goblin hurts her again.
    const { directory, server } = await serve(7);
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "den-exit-tunnels");
      await clickAction(page, "move", "rat-cellar");
      await fight(page);
      await clickAction(page, "move", "stair-foot");
      await clickAction(page, "move", "alcove");
      const longRest = page.locator("#long-rest-controls button.act");
      await settled(page, () => longRest.click());
      // The goblin in the den hurts Ada again.
      await clickAction(page, "move", "stair-foot");
      await clickAction(page, "move", "rat-cellar");
      await clickAction(page, "move", "den");
      await fight(page);
      const hurt = await sessionFile(directory);
      assert.equal(hurt.state.status, "playing");
      assert.ok(hurt.state.character.hp < 13, "the goblin hurts Ada");
      await clickAction(page, "move", "rat-cellar");
      await clickAction(page, "move", "stair-foot");
      await clickAction(page, "move", "alcove");
      // Long rest shows, disabled, with the engine's reason beside it.
      assert.equal(await longRest.isDisabled(), true);
      assert.equal(
        await page.locator("#long-rest-reason").textContent(),
        "No long rest left",
      );
      assert.equal(
        await longRest.getAttribute("aria-describedby"),
        "long-rest-reason",
      );
      assert.match(
        await page.locator("#long-rest-summary").textContent(),
        /^Long rest 0 of 1 left in this adventure\./u,
      );
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

const WIDTHS = [
  { width: 1880, height: 1000 },
  { width: 1280, height: 850 },
  { width: 900, height: 560 },
];

/** No horizontal scroll on the page or inside the character column's parts. */
async function assertFits(page, when) {
  for (const viewport of WIDTHS) {
    await page.setViewportSize(viewport);
    await assertNoSideScroll(page, `${when}: no scroll at ${viewport.width}`);
    const inner = await page.evaluate(() =>
      ["session-main", "rest-group"].filter((id) => {
        const box = document.getElementById(id);
        return box.scrollWidth > box.clientWidth + 1;
      }),
    );
    assert.deepEqual(
      inner,
      [],
      `${when}: nothing overflows at ${viewport.width}`,
    );
  }
  await page.setViewportSize(WIDTHS[0]);
}

test(
  "the Rest section shows in every state of play, each line with what can be done or why not",
  { timeout: 180000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-521-browser-"));
    const libraryPath = join(directory, "characters.json");
    // With seed 7 Ada survives the rat hurt, and the goblin hurts her again.
    const server = await startFifthBrowserServer({
      adventures: [denExit],
      qualifies: () => true,
      libraryPath,
      seed: 7,
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport: WIDTHS[0] });
    page.setDefaultTimeout(5000);
    const group = page.locator("#rest-group");
    const shortRest = page.locator("#rest-controls button.act");
    const longRest = page.locator("#long-rest-controls button.act");
    const rules = page.locator("#rest-rules");
    try {
      await createAndStart(page, server.url, "den-exit-tunnels");

      // Exploring at full HP: the counts, Short rest greyed with its
      // reason, and the long rest only at a rest site.
      assert.equal(await group.isVisible(), true);
      assert.equal(await text(page.locator("#rest-title")), "Rest");
      assert.equal(
        await text(page.locator("#rest-summary")),
        "Short rest 2 of 2 left in this adventure · Hit dice 1 of 1 d10 left",
      );
      assert.equal(await shortRest.isDisabled(), true);
      assert.equal(await text(shortRest), "Short rest");
      assert.equal(
        await text(page.locator("#rest-reason")),
        "Nothing to recover",
      );
      assert.equal(
        await shortRest.getAttribute("aria-describedby"),
        "rest-reason",
      );
      assert.equal(await page.locator("#rest-dice").count(), 0);
      assert.doesNotMatch(
        await group.innerText(),
        /each hit die spent|heals its roll/iu,
      );
      assert.equal(
        await text(page.locator("#long-rest-summary")),
        "Long rest Only at a rest site",
      );
      assert.equal(
        await text(page.locator("#long-rest-reason")),
        "Only at a rest site",
      );
      assert.equal(await longRest.count(), 0);
      assert.equal(await page.locator("#rest-fight").isVisible(), false);

      // How resting works: closed by default, the hit-dice rules inside:
      // where hit dice come from, what a short rest restores and doesn't,
      // and what the short rests left count (#533).
      assert.equal(await rules.getAttribute("open"), null);
      assert.equal(await text(rules.locator("summary")), "How resting works");
      assert.equal(await page.locator("#rest-rules-text").isVisible(), false);
      await rules.locator("summary").click();
      const rulesText = await text(page.locator("#rest-rules-text"));
      for (const rule of [
        /one hit die per level, its size set by your class\./u,
        /each heals its roll \+ your Constitution modifier, and you stop spending them at full HP\./u,
        /feature uses that return on a short rest, but no hit dice\./u,
        /counted per adventure, or per region in a long module/u,
        /Each new adventure starts with everything restored\./u,
      ]) {
        assert.match(rulesText, rule);
      }
      await rules.locator("summary").click();
      assert.equal(await page.locator("#rest-rules-text").isVisible(), false);

      // In a fight: one line why not, then the counts.
      await clickAction(page, "move", "rat-cellar");
      assert.equal(await group.isVisible(), true);
      assert.equal(
        await text(page.locator("#rest-fight")),
        "Not during a fight\nShort rests 2 of 2 left · Long rests 1 of 1 left",
      );
      assert.equal(await page.locator("#short-rest").isVisible(), false);
      assert.equal(await page.locator("#long-rest").isVisible(), false);
      assert.equal(await rules.isVisible(), true);
      await assertFits(page, "in a fight");
      await fight(page);

      // Hurt, the room clear: Short rest and its hit dice.
      const [, hp, maxHp] = (await page.locator("#character-hp").textContent())
        .match(/^HP (\d+) of (\d+),/u)
        .map(Number);
      assert.ok(hp < maxHp, "the rat hurts Ada");
      assert.equal(await page.locator("#rest-fight").isVisible(), false);
      assert.equal(await shortRest.isEnabled(), true);
      assert.equal(await page.locator("#rest-reason").count(), 0);
      assert.deepEqual(
        await page.locator("#rest-dice option").allTextContents(),
        ["1"],
      );
      assert.equal(
        await text(page.locator("#long-rest-reason")),
        "Only at a rest site",
      );

      // At a rest site: the long rests left and Long rest.
      await clickAction(page, "move", "stair-foot");
      await clickAction(page, "move", "alcove");
      assert.equal(
        await text(page.locator("#long-rest-summary")),
        "Long rest 1 of 1 left in this adventure. This is a safe place to rest.",
      );
      assert.equal(await longRest.isEnabled(), true);
      assert.equal(await text(longRest), "Long rest");
      assert.equal(await page.locator("#long-rest-reason").count(), 0);
      await assertFits(page, "at a rest site");
      await settled(page, () => longRest.click());
      assert.match(
        await text(page.locator("#log li.newest")),
        /You take a long rest: you regain \d+ HP \((\d+)\/\1 HP\) and 0 hit dice \(1 of 1 d10 left\)\. Long rests: 0 of 1 left in this adventure\./u,
      );
      // Rested: both greyed, each with its reason.
      assert.equal(await longRest.isDisabled(), true);
      assert.equal(
        await text(page.locator("#long-rest-reason")),
        "No long rest left",
      );
      assert.equal(
        await longRest.getAttribute("aria-describedby"),
        "long-rest-reason",
      );
      assert.equal(
        await text(page.locator("#rest-reason")),
        "Nothing to recover",
      );

      // Away from the rest site, the long rest taken: one line.
      await clickAction(page, "move", "stair-foot");
      assert.equal(
        await text(page.locator("#long-rest-summary")),
        "Long rest No long rest left",
      );
      assert.equal(await longRest.count(), 0);

      // The goblin hurts Ada; a short rest spends her hit die as before.
      await clickAction(page, "move", "rat-cellar");
      await clickAction(page, "move", "den");
      assert.equal(
        await text(page.locator("#rest-fight")),
        "Not during a fight\nShort rests 2 of 2 left · Long rests 0 of 1 left",
      );
      await fight(page);
      const hurt = await sessionFile(directory);
      assert.equal(hurt.state.status, "playing");
      assert.ok(hurt.state.character.hp < maxHp, "the goblin hurts Ada");
      assert.equal(await shortRest.isEnabled(), true);
      await settled(page, () => shortRest.click());
      assert.match(
        await text(page.locator("#log li.newest")),
        /You take a short rest and spend 1 hit die \(0 of 1 d10 left\)\. Short rests: 1 of 2 left in this adventure\./u,
      );
      assert.equal(
        await text(page.locator("#rest-summary")),
        "Short rest 1 of 2 left in this adventure · Hit dice 0 of 1 d10 left",
      );
      const rested = await sessionFile(directory);
      assert.equal(rested.state.shortRests, 1);
      assert.equal(rested.state.character.hitDice, 0);
      assert.deepEqual(rested.transitions.at(-1).action, {
        type: "rest",
        hitDice: 1,
      });
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

// #334: a short rest from the room panel, through the API to the saved
// session; abandoning the adventure afterwards leaves the character exactly
// as it started.

test(
  `a short rest after a fight spends a hit die, and abandoning undoes it, at ${viewport.width} px`,
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-334-"));
    const libraryPath = join(directory, "characters.json");
    const server = await startFifthBrowserServer({
      adventures: [ratTunnels],
      // Fixtures are engine material, not gated content: the gate is
      // tested in balance-5e.test.mjs (#310).
      qualifies: () => true,
      libraryPath,
      // Ada leaves the rat's fight at 7 of 13 HP.
      seed: 1,
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "rat-tunnels");
      const before = (await readAda(libraryPath)).sheet;
      const rest = page.locator("#rest-controls button.act");
      // Fresh, there is nothing to rest for: what is left shows, with Short
      // rest greyed and its reason (#521).
      assert.equal(await page.locator("#rest-group").isVisible(), true);
      assert.equal(await rest.isDisabled(), true);
      assert.equal(
        await page.locator("#rest-reason").textContent(),
        "Nothing to recover",
      );
      assert.equal(
        await page.locator("#rest-summary").textContent(),
        "Short rest 2 of 2 left in this adventure · Hit dice 1 of 1 d10 left",
      );
      // No rest in a fight: the section says why (#521).
      await clickAction(page, "move", "rat-cellar");
      assert.equal(await page.locator("#short-rest").isVisible(), false);
      assert.match(
        await page.locator("#rest-fight").innerText(),
        /^Not during a fight\n/u,
      );
      await fight(page);
      assert.match(
        await page.locator("#character-hp").textContent(),
        /^HP 7 of 13,/u,
      );
      assert.equal(await rest.isEnabled(), true);
      // With every Second Wind left, a rest spends its one hit die.
      const dice = page.locator("#rest-dice");
      assert.deepEqual(await dice.locator("option").allTextContents(), ["1"]);
      await settled(page, () => rest.click());
      const card = await text(page.locator("#log li.newest"));
      assert.match(
        card,
        /You take a short rest and spend 1 hit die \(0 of 1 d10 left\)\. Short rests: 1 of 2 left in this adventure\./u,
      );
      // The die shows on the card, as rolled.
      const healed = card.match(
        /You spend a hit die: d10 (\d+) \+ (\d+) = \d+; you regain (\d+)(?: of the \d+)? HP(?:, stopping at full health,)? and have (\d+)\/13 HP\./u,
      );
      assert.ok(healed, card);
      const hp = Number(healed[4]);
      assert.equal(hp, 7 + Number(healed[3]));
      assert.equal(
        await page
          .locator("#log li.newest .roll.healing .roll-die")
          .first()
          .textContent(),
        `d10 ${healed[1]}`,
      );
      assert.match(
        await page.locator("#character-hp").textContent(),
        new RegExp(`^HP ${hp} of 13,`, "u"),
      );
      // Nothing is left to spend or recover, so Short rest is greyed.
      assert.equal(await rest.isDisabled(), true);
      assert.equal(
        await page.locator("#rest-reason").textContent(),
        "Nothing to recover",
      );
      assert.equal(
        await page.locator("#rest-summary").textContent(),
        "Short rest 1 of 2 left in this adventure · Hit dice 0 of 1 d10 left",
      );
      const file = await sessionFile(directory);
      assert.equal(file.state.shortRests, 1);
      assert.equal(file.state.character.hitDice, 0);
      assert.equal(file.state.character.hp, hp);
      assert.deepEqual(file.transitions.at(-1).action, {
        type: "rest",
        hitDice: 1,
      });
      // Abandoning leaves the character exactly as it started.
      await page.locator('#breadcrumb a[data-view="sheet"]').click();
      await page.locator("#abandon-adventure").click();
      await page.locator("#confirm-abandon").click();
      await page
        .locator("#feedback")
        .filter({ hasText: "Ada abandoned The Rat Tunnels." })
        .waitFor();
      const record = await readAda(libraryPath);
      assert.equal(record.session, undefined);
      assert.deepEqual(record.sheet, before);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
