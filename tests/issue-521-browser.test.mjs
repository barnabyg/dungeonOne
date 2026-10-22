// #521, browser → API → storage: the character column's Rest section is
// always shown while the adventure is in play, fights included. Each line
// says what the player can do now or, in a few words, why not; the rules
// sit behind "How resting works", closed by default. Resting works as
// before, and the layout holds at every width.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { restingTunnelsFile, room } from "./fixtures/modules.mjs";
import {
  clickAction,
  createAndStart,
  fight,
  settled,
  text,
} from "./fixtures/browser-journey.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";

/**
 * The resting tunnels whose den is a way out: its goblin fights but no
 * longer ends the adventure, so Ada can rest after it.
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

      // How resting works: closed by default, the hit-dice rule inside.
      assert.equal(await rules.getAttribute("open"), null);
      assert.equal(await text(rules.locator("summary")), "How resting works");
      assert.equal(await page.locator("#rest-rules-text").isVisible(), false);
      await rules.locator("summary").click();
      assert.match(
        await text(page.locator("#rest-rules-text")),
        /each heals its roll \+ your Constitution modifier, and you stop spending them at full HP\./u,
      );
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
