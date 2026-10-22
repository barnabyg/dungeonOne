// #525, browser → API → storage: the fight panel. Ada takes a Potion of
// Healing and goes down to two goblins. While the fight is under way the
// centre column opens with the panel: "Fight · Round N" and the turn order,
// her card (HP, Second Wind and the potion with their dice and action) beside
// a card per goblin (HP, AC and one attack with the sheet's to-hit and
// damage), then a footer of Flee, the turn's pips and End turn. Every card's
// HP follows the engine after each heal, attack and goblin turn; once the
// fight is over the panel is gone. Flee opens a menu of the ways out, which
// Escape closes; a way in it flees. The panel fits 1880, 1280 and 900 × 560
// without scrolling sideways.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FifthSession, sessionSeed } from "../dist/session-5e.js";
import {
  actionButton,
  clickAction,
  createAndStart,
  settled,
} from "./fixtures/browser-journey.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import { PEDLAR } from "./fixtures/market-barrow.mjs";
import { potionCellarFile } from "./fixtures/modules.mjs";
import {
  assertNoSideScroll,
  firstFighter,
  launch,
} from "./fixtures/session-layout.mjs";

/** The potion cellar (#499) with two goblins and casks to look at. */
const cellar = (() => {
  const module = structuredClone(potionCellarFile);
  module.id = "two-goblin-cellar";
  module.title = "The Two-Goblin Cellar";
  module.encounters[0].opponents = [
    { id: "minion", monster: "goblin-minion", description: "A wiry goblin." },
    { id: "warrior", monster: "goblin-warrior", description: "A goblin." },
  ];
  module.rooms.find(({ id }) => id === "cellar").features = [
    {
      id: "casks",
      name: "Broken Casks",
      description: "Staved-in casks along the walls.",
    },
  ];
  return validateModule(module);
})();

/** The same cellar with a pedlar in it, whose Trade waits out the fight. */
const marketCellar = (() => {
  const module = structuredClone(cellar);
  module.id = "market-cellar";
  module.title = "The Market Cellar";
  module.rooms.find(({ id }) => id === "cellar").creatures = [
    structuredClone(PEDLAR),
  ];
  return validateModule(module);
})();

const FOES = ["minion", "warrior"];

/**
 * Ada's session on `seed`, played as the browser plays it: the potion
 * taken and the cellar entered.
 */
function begin(seed) {
  const session = FifthSession.begin(
    sessionSeed(seed, 1),
    cellar,
    firstFighter(seed),
  );
  for (const action of [
    { type: "take", itemId: "healing-potion" },
    { type: "move", destinationId: "cellar" },
  ]) {
    assert.equal(session.act(action, "click").result.rejection, undefined);
  }
  return session;
}

/** The fight as the browser's panel is given it. */
const fightOf = (session) =>
  session.runtime.projectFight(session.state).encounter;
const fighter = (session, id) =>
  fightOf(session).combatants.find((combatant) => combatant.id === id);
/** A goblin still in the fight: standing, and not fled or surrendered. */
const standing = (session, id) =>
  !fighter(session, id).defeated && fighter(session, id).morale === undefined;

/**
 * The first seed whose Ada is hurt on her first turn, with both goblins
 * standing: the potion and Second Wind are both hers to use.
 */
const seed = (() => {
  for (let candidate = 0; candidate < 300; candidate++) {
    const session = begin(candidate);
    const fight = fightOf(session);
    const ada = fighter(session, "pc");
    if (
      session.state.status === "playing" &&
      fight.currentTurn === "pc" &&
      fight.pendingReaction === undefined &&
      ada.hp < ada.maxHp - 4 &&
      FOES.every((id) => standing(session, id))
    ) {
      return candidate;
    }
  }
  throw new Error("no seed below 300 hurts Ada before her first turn");
})();

/** The first seed whose Ada flees from her first turn and lives. */
const fleeSeed = (() => {
  for (let candidate = 0; candidate < 300; candidate++) {
    const session = begin(candidate);
    if (
      session.state.status === "playing" &&
      fightOf(session).currentTurn === "pc" &&
      session.act({ type: "flee", destinationId: "stair" }, "click").result
        .rejection === undefined &&
      session.state.status === "playing"
    ) {
      return candidate;
    }
  }
  throw new Error("no seed below 300 lets Ada flee");
})();

async function withPage(viewport, run, browserSeed = seed, adventure = cellar) {
  const directory = await mkdtemp(join(tmpdir(), "issue-525-"));
  const server = await startFifthBrowserServer({
    adventures: [adventure],
    // Fixtures are engine material, not gated content.
    qualifies: () => true,
    libraryPath: join(directory, "characters.json"),
    seed: browserSeed,
  });
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(8000);
    await createAndStart(page, server.url, adventure.id);
    await clickAction(page, "take", "healing-potion");
    await clickAction(page, "move", "cellar");
    await page.locator("#encounter").waitFor();
    await run(page);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

/** What each card shows: its name, AC and HP as text, and its bar's width. */
const cards = (page) =>
  page.$$eval("#you-card, #foe-cards > li", (all) =>
    all.map((card) => {
      const bar = card.querySelector(".hp-bar");
      return {
        id: card.dataset.combatant,
        name: card.querySelector(".card-name").textContent,
        ac: card.querySelector(".card-ac").textContent,
        hp: card.querySelector(".card-hp").textContent,
        bar: Math.round(
          (100 * card.querySelector(".hp-fill").getBoundingClientRect().width) /
            bar.getBoundingClientRect().width,
        ),
        state: card.querySelector(".card-state")?.textContent ?? "",
      };
    }),
  );

/** The cards as the engine has them: the goblins' in initiative order. */
const expectedCards = (session) =>
  [
    "pc",
    ...fightOf(session)
      .combatants.map(({ id }) => id)
      .filter((id) => id !== "pc"),
  ].map((id) => {
    const { name, hp, maxHp, defeated } = fighter(session, id);
    return {
      id,
      name,
      hp: `HP ${hp} of ${maxHp}${hp} / ${maxHp} HP`,
      bar: Math.round((100 * hp) / maxHp),
      fallen: id !== "pc" && defeated,
    };
  });

/** Asserts every card's HP and bar match `session`'s. */
async function assertCards(page, session, label) {
  const shown = await cards(page);
  const expected = expectedCards(session);
  assert.deepEqual(
    shown.map(({ id, name, hp }) => ({ id, name, hp })),
    expected.map(({ id, name, hp }) => ({ id, name, hp })),
    label,
  );
  for (const [index, card] of shown.entries()) {
    assert.ok(
      Math.abs(card.bar - expected[index].bar) <= 1,
      `${label}: ${card.id}'s bar ${card.bar}% of ${expected[index].bar}%`,
    );
    if (expected[index].fallen) {
      assert.equal(card.state, "Fallen", `${label}: ${card.id} fallen`);
    }
  }
}

test(
  "the fight panel shows Ada's HP and healing beside each goblin's HP and attack, and follows every blow",
  { timeout: 120000 },
  () =>
    withPage({ width: 1280, height: 850 }, async (page) => {
      const session = begin(seed);
      const { runtime } = session;
      // The panel opens the centre column, before the room.
      assert.deepEqual(
        await page.$$eval("#session-scene > *", (all) =>
          all
            .filter((node) => node.checkVisibility())
            .filter((node) => node.id !== "session-actions")
            .map(({ id }) => id),
        ),
        ["encounter", "room"],
      );
      assert.equal(await page.locator("#initiative").count(), 0);
      assert.equal(
        await page.locator("#encounter-title").textContent(),
        "Fight · Round 1",
      );
      // The turn order, the current turn in bold.
      const order = fightOf(session).combatants.map(
        ({ name, initiative }) => `${name} ${initiative.total}`,
      );
      assert.deepEqual(
        await page.$$eval("#turn-order .turn-entry", (all) =>
          all.map((entry) => entry.textContent),
        ),
        order.map((entry) =>
          entry.startsWith("Ada ") ? `${entry} · your turn` : entry,
        ),
      );
      assert.match(
        await page.locator("#turn-order strong").textContent(),
        /^Ada \d+ · your turn$/u,
      );
      // Ada's card and the goblins' cards, as the engine has them.
      await assertCards(page, session, "first turn");
      const ac = (id) => `AC ${fighter(session, id).armorClass}`;
      assert.deepEqual(
        (await cards(page)).map(({ ac: shown }) => shown),
        (await cards(page)).map(({ id }) => ac(id)),
      );
      // Every way to heal sits on Ada's card, with its dice and action.
      const heal = page.locator("#heal-controls button.act");
      assert.deepEqual(await heal.allInnerTexts(), [
        "Second Wind (2 of 2 left) 1d10 + 1 · bonus",
        "Drink Potion of Healing 2d4 + 2 · bonus",
      ]);
      assert.equal(await heal.locator(":scope:disabled").count(), 0);
      // One attack on each goblin's card, with the sheet's to-hit and damage.
      const { attack } = runtime.projectRoom(session.state).gear;
      const sign = attack.bonus < 0 ? "−" : "+";
      const damage = `${attack.damage.dice}d${attack.damage.sides} + ${attack.damage.modifier}`;
      for (const id of FOES) {
        const buttons = page.locator(
          `#foe-cards li[data-combatant="${id}"] button`,
        );
        assert.equal(await buttons.count(), 1, id);
        assert.equal(
          (await buttons.innerText()).trim(),
          `Attack with ${attack.weapon} ${sign}${Math.abs(attack.bonus)} · ${damage}`,
        );
        assert.equal(await buttons.getAttribute("data-action"), "attack");
        assert.equal(await buttons.getAttribute("data-target"), id);
      }
      // The footer: Flee, the turn's pips (not in the status strip) and
      // End turn with what it leaves unused.
      assert.equal(
        await page.locator("#flee-toggle").getAttribute("aria-expanded"),
        "false",
      );
      assert.deepEqual(
        await page.$$eval("#fight-foot [data-resource]", (all) =>
          all.map((item) => item.dataset.resource),
        ),
        ["action", "bonus-action", "reaction"],
      );
      assert.equal(
        await page.locator("#resources [data-resource=action]").count(),
        0,
      );
      assert.match(
        await page.locator("#fight-foot").innerText(),
        /Left unused: .*End turn$/su,
      );
      // The room folds to its heading and one line naming its things.
      assert.equal(await page.locator("#room-things").isHidden(), true);
      assert.equal(
        await page.locator("#room-fold").textContent(),
        "Broken Casks",
      );
      await page.locator("#room-fold").click();
      assert.equal(await page.locator("#room-things").isVisible(), true);
      await page.locator("#room-fold").click();

      const compared = [];
      /** Clicks `control` and plays `action` in the replay; then compares. */
      const step = async (control, action, label) => {
        await settled(page, () => control.click());
        assert.equal(
          session.act(action, "click").result.rejection,
          undefined,
          label,
        );
        const over =
          session.state.status !== "playing" ||
          fightOf(session).currentTurn === null;
        if (!over) {
          await assertCards(page, session, label);
          compared.push(label);
        }
        return over;
      };
      // The potion, from Ada's card: her HP rises, and Second Wind waits
      // for the next turn.
      await step(
        actionButton(page, "use", "healing-potion"),
        { type: "use-item", itemId: "healing-potion" },
        "potion",
      );
      assert.equal(
        await page
          .locator('#heal-controls button[data-action="second-wind"]')
          .isDisabled(),
        true,
      );
      assert.match(
        await page.locator("#heal-controls").innerText(),
        /Bonus action used/u,
      );
      // Each goblin's card attacks that goblin; ending the turn lets the
      // goblins act, and every card follows.
      let over = false;
      for (let turn = 0; turn < 40 && !over; turn++) {
        // Second Wind, from Ada's card, once her bonus action is back.
        const wind = page.locator(
          '#heal-controls button[data-action="second-wind"]:enabled',
        );
        if (!compared.includes("second wind") && (await wind.count()) > 0) {
          over = await step(
            wind,
            { type: "second-wind", actorId: "pc" },
            "second wind",
          );
          continue;
        }
        const target = FOES.find((id) => standing(session, id));
        const button = page.locator(
          `#foe-cards li[data-combatant="${target}"] button.act:enabled`,
        );
        if ((await button.count()) > 0) {
          over = await step(
            button,
            { type: "attack", actorId: "pc", targetId: target },
            `attack ${target}`,
          );
        } else {
          over = await step(
            actionButton(page, "end-turn"),
            { type: "end-turn", actorId: "pc" },
            "end turn",
          );
        }
      }
      assert.ok(over, "the fight ends");
      // The cards followed a heal, and an attack and the goblins' turn after it.
      assert.ok(compared.length >= 2, compared.join(", "));
      assert.match(compared[1], /^attack /u);
      assert.ok(compared.includes("second wind"), compared.join(", "));
      // Once the fight is over the panel is gone, and the room unfolds.
      assert.equal(await page.locator("#encounter").isHidden(), true);
      assert.equal(await page.locator("#initiative").count(), 0);
      if (session.state.status === "playing") {
        assert.equal(await page.locator("#room-things").isVisible(), true);
        assert.equal(await page.locator("#room-fold").isHidden(), true);
      }
    }),
);

test(
  "a merchant's Trade, disabled in the fight, leaves the room folded",
  { timeout: 120000 },
  () =>
    withPage(
      { width: 1280, height: 850 },
      async (page) => {
        assert.equal(await page.locator("#encounter").isVisible(), true);
        assert.equal(await page.locator("#room-things").isHidden(), true);
        assert.equal(await page.locator("#room-fold").isVisible(), true);
        // Unfolded, the pedlar's card shows Trade, disabled with its reason.
        await page.locator("#room-fold").click();
        const trade = page.locator("#open-shop");
        assert.equal(await trade.isDisabled(), true);
        assert.equal(
          await page.locator("#open-shop-reason").textContent(),
          "Not while you are fighting",
        );
      },
      seed,
      marketCellar,
    ),
);

test(
  "Flee opens a menu of the ways out, Escape closes it, and a way in it flees",
  { timeout: 120000 },
  () =>
    withPage(
      { width: 1280, height: 850 },
      async (page) => {
        const toggle = page.locator("#flee-toggle");
        const menu = page.locator("#flee-menu");
        assert.equal(await menu.isHidden(), true);
        await toggle.focus();
        await page.keyboard.press("Enter");
        assert.equal(await toggle.getAttribute("aria-expanded"), "true");
        assert.equal(await toggle.getAttribute("aria-controls"), "flee-menu");
        assert.equal(await menu.isVisible(), true);
        assert.match(
          await page.locator("#flee-attacks").textContent(),
          /^Draws attacks from Goblin (Warrior and Goblin Minion|Minion and Goblin Warrior)$/u,
        );
        // Focus moves to the first way out, an action control.
        const way = page.locator(
          '#flee-ways button.act[data-action="flee"][data-target="stair"]',
        );
        assert.equal(await way.innerText(), "North: Cellar Stair");
        assert.equal(
          await page.evaluate(() => document.activeElement.dataset.target),
          "stair",
        );
        await page.keyboard.press("Escape");
        assert.equal(await menu.isHidden(), true);
        assert.equal(await toggle.getAttribute("aria-expanded"), "false");
        assert.equal(
          await page.evaluate(() => document.activeElement.id),
          "flee-toggle",
        );
        // A click elsewhere closes it too.
        await toggle.click();
        assert.equal(await menu.isVisible(), true);
        await page.locator("#encounter-title").click();
        assert.equal(await menu.isHidden(), true);
        // Choosing a way flees through it.
        await toggle.click();
        await settled(page, () => way.click());
        await page.locator("#encounter").waitFor({ state: "hidden" });
        assert.equal(
          await page.locator("#room-title").textContent(),
          "Cellar Stair",
        );
      },
      fleeSeed,
    ),
);

for (const viewport of [
  { width: 1880, height: 1000 },
  { width: 1280, height: 760 },
  { width: 900, height: 560 },
]) {
  test(
    `the fight panel's cards sit side by side without sideways scrolling (${viewport.width} × ${viewport.height})`,
    { timeout: 120000 },
    () =>
      withPage(viewport, async (page) => {
        const box = (selector) => page.locator(selector).first().boundingBox();
        const you = await box("#you-card");
        const foes = await page
          .locator("#foe-cards > li")
          .evaluateAll((all) =>
            all.map((card) => card.getBoundingClientRect().toJSON()),
          );
        // Ada's card on the left, the goblins' stacked on the right.
        assert.equal(foes.length, 2);
        for (const foe of foes) {
          assert.ok(you.x + you.width <= foe.x, "Ada's card left of the foes'");
        }
        assert.ok(foes[0].y + foes[0].height <= foes[1].y, "foes stacked");
        // Each attack sits inside its card.
        const inside = await page
          .locator("#foe-cards > li")
          .evaluateAll((all) =>
            all.map((card) => {
              const outer = card.getBoundingClientRect();
              const inner = card
                .querySelector("button")
                .getBoundingClientRect();
              return (
                inner.left >= outer.left &&
                inner.right <= outer.right + 1 &&
                inner.bottom <= outer.bottom + 1
              );
            }),
          );
        assert.deepEqual(inside, [true, true]);
        // The panel opens the centre column; End turn closes it, reachable
        // by scrolling the column.
        const panel = await box("#encounter");
        const room = await box("#room");
        assert.ok(panel.y + panel.height <= room.y);
        const end = actionButton(page, "end-turn");
        await end.scrollIntoViewIfNeeded();
        const shown = await end.boundingBox();
        assert.ok(shown.y >= 0 && shown.y + shown.height <= viewport.height);
        await assertNoSideScroll(page, "no horizontal scroll", {
          wideFont: true,
        });
        // With the menu open too.
        await page.locator("#flee-toggle").click();
        await assertNoSideScroll(page, "no horizontal scroll, Flee open");
      }),
  );
}
