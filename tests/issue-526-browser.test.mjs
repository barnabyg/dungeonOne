// #526, browser → API → storage: the attack chooser. A level-5 Wizard's
// fight shows, under her card, every way she can attack the goblin trio as
// chips grouped by kind and slot level, the slots left beside each level:
// her quarterstaff, her cantrips, her prepared attack spells, and the wand
// and scroll she carries. Choosing a chip relabels every goblin's button;
// a levelled spell's slot level is chosen beside its words. An area spell
// turns the buttons into "In the blast" boxes, capped at its targets, with
// one Cast button naming how many; Scorching Ray's rays go to the goblins
// ticked, in the order ticked. Her pick is kept on her next turn. A Life
// Cleric's chooser greys Hold Person (no humanoid here) and, once
// Spiritual Weapon has spent this turn's slot, Guiding Bolt, each with the
// engine's reason; Divine Spark's damage is chosen beside it; Sacred Flame
// and the spiritual weapon's attack work from the goblins' buttons. A
// Fighter with one weapon has no chooser. Every cast matches the engine's
// replay, and the panel fits 1880, 1280 and 900 × 560 without scrolling
// sideways.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  applyLevelChoice,
  characterProfile,
  levelForXp,
  validateCharacter,
} from "../dist/character-5e.js";
import { FIFTH_LIBRARY_FORMAT } from "../dist/character-library-5e.js";
import { legalTargets } from "../dist/encounter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { sessionSeed } from "../dist/session-5e.js";
import {
  attackChip,
  castArea,
  castAt,
  chooseAttack,
  chooseSpell,
  createAndStart,
  foeButton,
  settled,
  startAdventure,
} from "./fixtures/browser-journey.mjs";
import {
  ARMED_SCROLL as SCROLL,
  ARMED_WAND as WAND,
  armedVela,
} from "./fixtures/level-5-wizard.mjs";
import { goblinTrio } from "./fixtures/modules.mjs";
import { lifeCleric, thief } from "./fixtures/playthroughs.mjs";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";

/** Vela at level 5 with a wand and a scroll. */
const VELA = armedVela();

/** Mira, a level-3 Life Cleric with Hold Person in place of Protection from Poison. */
const MIRA = (() => {
  const sheet = lifeCleric();
  return validateCharacter({
    ...sheet,
    spells: {
      ...sheet.spells,
      prepared: sheet.spells.prepared.map((id) =>
        id === "protection-from-poison" ? "hold-person" : id,
      ),
    },
  });
})();

/**
 * The engine's replay of a browser session of `sheet` on `seed`: the state
 * after each action, which the browser's clicks must match.
 */
function replay(sheet, seed) {
  const runtime = createFifthRuntime(goblinTrio, sheet);
  const random = createSeededRandom(sessionSeed(seed, 1));
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  return {
    runtime,
    get state() {
      return state;
    },
    /** Plays `action`; whether the engine took it. */
    act(action) {
      const result = runtime.handleAction(state, action, random);
      if (result.rejection !== undefined) {
        return false;
      }
      state = result.state;
      return true;
    },
    /** The foes still in the fight, in initiative order. */
    targets: () =>
      state.encounter === undefined
        ? []
        : legalTargets(state.encounter, "pc").map(({ id }) => id),
    /** Whether the character's turn is under way, with its action left. */
    fresh() {
      const fight = runtime.projectFight(state);
      return (
        state.status === "playing" &&
        state.encounter?.outcome === "ongoing" &&
        fight.encounter.currentTurn === "pc" &&
        fight.turn?.actions > 0
      );
    },
    /** The character's turn under way, its action spent. */
    spent() {
      const fight = runtime.projectFight(state);
      return (
        state.encounter?.outcome === "ongoing" &&
        fight.encounter.currentTurn === "pc" &&
        fight.turn?.actions === 0
      );
    },
    views: () => runtime.projectActions(state),
  };
}

const cast = (spellId, targetIds, more = {}) => ({
  type: "cast",
  actorId: "pc",
  spellId,
  targetIds,
  ...more,
});

/**
 * The Wizard's turns: Scorching Ray with a 2nd-level slot at the second
 * goblin and then the first; the wand's Magic Missile at 2nd level at the
 * first goblin; the scroll's Shatter at the first two. Each turn ends once
 * its action is spent. Undefined unless every step is taken on a fresh
 * turn of hers.
 */
function wizardPlan(seed) {
  const game = replay(VELA, seed);
  const steps = [];
  const endTurn = () => {
    if (game.spent()) {
      game.act({ type: "end-turn", actorId: "pc" });
      steps.push({ kind: "end-turn" });
    }
  };
  if (!game.fresh() || game.targets().length < 3) {
    return undefined;
  }
  const [first, second] = game.targets();
  if (!game.act(cast("scorching-ray", [second, first], { slotLevel: 2 }))) {
    return undefined;
  }
  steps.push({ kind: "rays", targets: [second, first] });
  endTurn();
  if (!game.fresh()) {
    return undefined;
  }
  const [aimed] = game.targets();
  if (
    !game.act(cast("magic-missile", [aimed], { slotLevel: 2, itemId: WAND }))
  ) {
    return undefined;
  }
  steps.push({ kind: "wand", target: aimed });
  endTurn();
  if (!game.fresh() || game.targets().length < 2) {
    return undefined;
  }
  const caught = game.targets().slice(0, 2);
  if (!game.act(cast("shatter", caught, { itemId: SCROLL }))) {
    return undefined;
  }
  steps.push({ kind: "scroll", targets: caught });
  return { seed, steps, first: replay(VELA, seed), states: game };
}

const wizard = (() => {
  for (let seed = 0; seed < 400; seed++) {
    const plan = wizardPlan(seed);
    if (plan !== undefined) {
      return plan;
    }
  }
  throw new Error("no seed below 400 lets Vela take her three turns");
})();

/** Writes a library holding `sheet` alone, as the browser saves one. */
async function libraryWith(directory, sheet) {
  const path = join(directory, "characters.json");
  await writeFile(
    path,
    JSON.stringify({
      kind: "dungeon-one-characters",
      formatVersion: FIFTH_LIBRARY_FORMAT,
      revision: "b".repeat(32),
      creationsStarted: 1,
      sessionsStarted: 0,
      characters: [{ sheet, revision: 1 }],
    }),
  );
  return path;
}

/** Starts the goblin trio with `sheet` on `seed` and runs `run` on the page. */
async function fightWith(sheet, seed, viewport, run) {
  const directory = await mkdtemp(join(tmpdir(), "issue-526-browser-"));
  const libraryPath = await libraryWith(directory, sheet);
  const server = await startFifthBrowserServer({
    libraryPath,
    seed,
    adventures: [goblinTrio],
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
    await page.locator("#sheet-name").filter({ hasText: sheet.name }).waitFor();
    await startAdventure(page, goblinTrio.id);
    await page.locator("#foe-cards button.act:enabled").first().waitFor();
    await run(page);
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

/** Each group's name, its pips and its chips' names, as shown. */
const groups = (page) =>
  page.$$eval("#chooser-chips .chooser-group", (all) =>
    all.map((group) => [
      group.querySelector(".chooser-label").firstChild.textContent,
      group.querySelector(".chooser-pips")?.textContent ?? "",
      [...group.querySelectorAll(".chip-name")].map(
        ({ textContent }) => textContent,
      ),
    ]),
  );

/** Each foe card's button text, by foe. */
const foeButtons = (page) =>
  page.$$eval("#foe-cards > li", (all) =>
    all.map((card) => [
      card.dataset.combatant,
      card.querySelector("button")?.innerText.trim() ?? "",
    ]),
  );

/** The chosen chip's key. */
const chosen = (page) =>
  page.locator("#chooser-chips label.on").getAttribute("data-choice");

/** Asserts each foe card's HP matches `state`'s. */
async function assertHp(page, game, label) {
  const fight = game.runtime.projectFight(game.state).encounter;
  if (fight === undefined || fight.currentTurn === null) {
    return;
  }
  const shown = await page.$$eval("#foe-cards > li", (all) =>
    all.map((card) => [
      card.dataset.combatant,
      card.querySelector(".hp-now").textContent,
    ]),
  );
  assert.deepEqual(
    shown,
    fight.combatants
      .filter(({ id }) => id !== "pc")
      .map(({ id, hp }) => [id, String(hp)]),
    label,
  );
}

test(
  `a level-5 Wizard picks her attack in the chooser, then the goblin, and keeps her pick (seed ${wizard.seed})`,
  { timeout: 180000 },
  () =>
    fightWith(VELA, wizard.seed, { width: 1280, height: 850 }, async (page) => {
      // The chooser sits under her card: the weapon, the cantrips, each
      // level with its slots left, then the wand and the scroll. Shield
      // isn't prepared; Mage Armor, cast on her, stays in the Cast row.
      assert.equal(await page.locator("#attack-chooser").isVisible(), true);
      assert.deepEqual(
        await page.locator("#cast-spell option").allTextContents(),
        [
          "Mage Armor (1st-level slot)",
          "Mage Armor (2nd-level slot)",
          "Mage Armor (3rd-level slot)",
        ],
      );
      assert.deepEqual(
        wizard.steps
          .map(({ kind }) => kind)
          .filter((kind) => kind !== "end-turn"),
        ["rays", "wand", "scroll"],
      );
      assert.deepEqual(await groups(page), [
        ["Weapon", "", ["Quarterstaff"]],
        [
          "Cantrips",
          "",
          ["Fire Bolt", "Ray of Frost", "Shocking Grasp", "Chill Touch"],
        ],
        ["1st", "●●●●", ["Magic Missile", "Ice Knife", "Chromatic Orb"]],
        ["2nd", "●●●", ["Scorching Ray", "Shatter", "Mind Spike"]],
        ["3rd", "●●", ["Fireball", "Lightning Bolt"]],
        ["Items", "", ["Wand of Magic Missiles", "Spell Scroll (Shatter)"]],
      ]);
      // Area spells say so.
      assert.deepEqual(
        await page.$$eval("#chooser-chips .chip-tag", (all) =>
          all.map((tag) => tag.parentElement.dataset.choice),
        ),
        [
          "cast:shatter",
          "cast:fireball",
          "cast:lightning-bolt",
          `cast:shatter:${SCROLL}`,
        ],
      );
      // The chips are one radio group, the first offered chosen.
      assert.equal(
        await page.locator("#chooser-chips").getAttribute("role"),
        "radiogroup",
      );
      assert.equal(
        await page.locator("#chooser-chips input[type=radio]").count(),
        15,
      );
      assert.equal(await chosen(page), "attack");
      const { attack } = wizard.first.runtime.projectRoom(
        wizard.first.state,
      ).gear;
      const { dice, sides, modifier } = attack.damage;
      const weapon = `Attack with Quarterstaff ${attack.bonus < 0 ? "−" : "+"}${Math.abs(attack.bonus)} · ${dice}d${sides} ${modifier < 0 ? "−" : "+"} ${Math.abs(modifier)}`;
      assert.deepEqual(
        (await foeButtons(page)).map(([, label]) => label),
        [weapon, weapon, weapon],
      );

      // Fire Bolt relabels every goblin's button, in the sheet's words.
      await chooseAttack(page, "cast:fire-bolt");
      assert.equal(
        await page.locator("#chooser-detail").innerText(),
        "Fire Bolt · ranged spell attack +7, 2d10 fire. Choose an enemy.",
      );
      for (const [id, label] of await foeButtons(page)) {
        assert.equal(label, "Fire Bolt +7 · 2d10", id);
        const button = foeButton(page, id);
        assert.equal(await button.getAttribute("data-action"), "cast");
        assert.equal(await button.getAttribute("data-spell"), "fire-bolt");
        assert.match(
          await button.getAttribute("aria-label"),
          /^Cast Fire Bolt at Goblin /u,
        );
      }
      // The keyboard moves along the chips.
      await page
        .locator('#chooser-chips input[value="cast:fire-bolt"]')
        .focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await chosen(page), "cast:ray-of-frost");
      assert.equal(
        await page.evaluate(() => document.activeElement.value),
        "cast:ray-of-frost",
      );

      // Magic Missile: its slot level is chosen beside its words.
      await chooseSpell(page, "magic-missile");
      assert.deepEqual(
        await page.locator("#chooser-slot option").allTextContents(),
        ["1st-level slot", "2nd-level slot", "3rd-level slot"],
      );
      await page.locator("#chooser-slot").selectOption("2");
      assert.deepEqual(
        [...new Set((await foeButtons(page)).map(([, label]) => label))],
        ["Magic Missile 4 × 1d4 + 1"],
      );
      assert.equal(
        await foeButton(page, "warrior").getAttribute("data-slot"),
        "2",
      );

      // Fireball: a box on each card, all three in the blast (it catches
      // up to 4), and one Cast button.
      await chooseSpell(page, "fireball");
      assert.equal(
        await page.locator("#chooser-detail strong").textContent(),
        "Fireball",
      );
      assert.deepEqual(
        await page.locator("#chooser-slot option").allTextContents(),
        ["3rd-level slot"],
      );
      assert.equal(
        await page.locator("#chooser-detail .chooser-text").textContent(),
        " · Dexterity save DC 15, 8d6 fire, half on a success. Catches up to 4: tick who's in the blast.",
      );
      assert.equal(await page.locator("#foe-cards button").count(), 0);
      assert.deepEqual(
        await page.$$eval("#foe-cards .blast-tick", (all) =>
          all.map((label) => [
            label.textContent,
            label.querySelector("input").checked,
          ]),
        ),
        [
          ["In the blast", true],
          ["In the blast", true],
          ["In the blast", true],
        ],
      );
      const castAll = page.locator("#area-cast button.act");
      assert.equal(await castAll.innerText(), "Cast Fireball on 3");
      // Shatter catches two: the third box waits until one is unticked.
      await chooseSpell(page, "shatter");
      const ticks = () =>
        page.$$eval("#foe-cards .blast-tick input", (all) =>
          all.map((box) =>
            box.checked ? "on" : box.disabled ? "off, disabled" : "off",
          ),
        );
      assert.deepEqual(await ticks(), ["on", "on", "off, disabled"]);
      assert.equal(await castAll.innerText(), "Cast Shatter on 2");
      await page.locator("#foe-cards .blast-tick input").first().click();
      assert.deepEqual(await ticks(), ["off", "on", "off"]);
      assert.equal(await castAll.innerText(), "Cast Shatter on 1");

      // Turn 1: Scorching Ray's rays at the second goblin, then the first.
      const game = replay(VELA, wizard.seed);
      for (const step of wizard.steps) {
        if (step.kind === "end-turn") {
          // The action spent, the chips that need it say why.
          const ice = attackChip(page, "cast:ice-knife");
          assert.equal(await ice.getAttribute("class"), "chip off");
          assert.equal(
            await ice.locator(".chip-reason").textContent(),
            "Action used",
          );
          await settled(page, () =>
            page.locator('#encounter button[data-action="end-turn"]').click(),
          );
          game.act({ type: "end-turn", actorId: "pc" });
          await assertHp(page, game, "end turn");
          continue;
        }
        if (step.kind === "rays") {
          await castArea(page, "scorching-ray", step.targets, { slot: 2 });
          assert.ok(
            game.act(cast("scorching-ray", step.targets, { slotLevel: 2 })),
          );
        } else if (step.kind === "wand") {
          // Her pick and its slot are kept on her next turn.
          assert.equal(await chosen(page), "cast:scorching-ray");
          assert.equal(await page.locator("#chooser-slot").inputValue(), "2");
          assert.equal(
            await page
              .locator(
                "#chooser-chips .chooser-group[data-group=level-2] .chooser-pips",
              )
              .textContent(),
            "●●○",
          );
          // The wand's levels spend a charge each.
          await chooseSpell(page, "magic-missile", { item: WAND });
          assert.deepEqual(
            await page.locator("#chooser-slot option").allTextContents(),
            [
              "1st level, 1 charge",
              "2nd level, 2 charges",
              "3rd level, 3 charges",
            ],
          );
          await castAt(page, "magic-missile", step.target, {
            item: WAND,
            slot: 2,
          });
          assert.ok(
            game.act(
              cast("magic-missile", [step.target], {
                slotLevel: 2,
                itemId: WAND,
              }),
            ),
          );
        } else {
          await castArea(page, "shatter", step.targets, { item: SCROLL });
          assert.ok(
            game.act(cast("shatter", step.targets, { itemId: SCROLL })),
          );
        }
        assert.match(
          await page.locator("#log li").last().innerText(),
          {
            rays: /Scorching Ray/u,
            wand: /Wand of Magic Missiles/u,
            scroll: /Spell Scroll \(Shatter\)/u,
          }[step.kind],
        );
        await assertHp(page, game, step.kind);
      }
    }),
);

/**
 * The Cleric's turns: Spiritual Weapon with a 2nd-level slot at the first
 * goblin, then Divine Spark's necrotic damage at the first; her next turn
 * Sacred Flame at the first, then the spiritual weapon's attack at the
 * first. The first seed on which each is taken in turn.
 */
function clericSeed() {
  for (let seed = 0; seed < 400; seed++) {
    const game = replay(MIRA, seed);
    const first = () => game.targets()[0];
    const ongoing = () => game.state.encounter?.outcome === "ongoing";
    const taken =
      game.fresh() &&
      game.targets().length > 1 &&
      game.act(cast("spiritual-weapon", [first()], { slotLevel: 2 })) &&
      ongoing() &&
      game.act({
        type: "divine-spark",
        actorId: "pc",
        targetId: first(),
        mode: "necrotic",
      }) &&
      (!game.spent() || game.act({ type: "end-turn", actorId: "pc" })) &&
      game.fresh() &&
      game.act(cast("sacred-flame", [first()])) &&
      ongoing() &&
      game.act({ type: "spectral-attack", actorId: "pc", targetId: first() });
    if (taken) {
      return seed;
    }
  }
  throw new Error("no seed below 400 lets Mira take her two turns");
}
const CLERIC_SEED = clericSeed();

test(
  `a Life Cleric's greyed chips say why, Divine Spark's damage is chosen, and Sacred Flame and the spiritual weapon strike (seed ${CLERIC_SEED})`,
  { timeout: 180000 },
  () =>
    fightWith(MIRA, CLERIC_SEED, { width: 1280, height: 850 }, async (page) => {
      const game = replay(MIRA, CLERIC_SEED);
      /** The fight view's to-hit and damage for `action` (#526). */
      const stats = (action, more = {}) => {
        const found = game.runtime
          .projectFight(game.state)
          .attackStats.find(
            (entry) =>
              entry.action === action &&
              Object.entries(more).every(
                ([key, value]) => entry[key] === value,
              ),
          );
        return found;
      };
      assert.deepEqual(await groups(page), [
        ["Weapon", "", ["Mace"]],
        ["Cantrips", "", ["Sacred Flame"]],
        ["1st", "●●●●", ["Guiding Bolt"]],
        ["2nd", "●●", ["Spiritual Weapon", "Hold Person"]],
        ["Channel Divinity", "●●", ["Divine Spark"]],
      ]);
      /** Asserts chip `key` is greyed with the engine's reason for it. */
      const greyed = async (key, spellId) => {
        const reason = game
          .views()
          .find(
            ({ action, spell }) => action === "cast" && spell.id === spellId,
          ).reason;
        assert.ok(reason, `${spellId} refused`);
        const chip = attackChip(page, key);
        assert.match(await chip.getAttribute("class"), /^chip off/u);
        assert.equal(await chip.locator(".chip-reason").textContent(), reason);
        assert.equal(await chip.locator("input").isDisabled(), true);
      };
      // Goblins are Fey: Hold Person is greyed with the engine's reason.
      await greyed("cast:hold-person", "hold-person");
      assert.equal(
        await attackChip(page, "cast:hold-person")
          .locator(".chip-reason")
          .textContent(),
        "Wrong creature",
      );
      const first = () => game.targets()[0];
      // Spiritual Weapon, a bonus action, at the first goblin.
      await chooseSpell(page, "spiritual-weapon");
      const weapon = stats("cast", {
        spellId: "spiritual-weapon",
        slotLevel: 2,
      });
      assert.match(weapon.hit, /^\+\d+$/u);
      assert.equal(
        (await foeButton(page, first()).innerText()).trim(),
        `Spiritual Weapon ${weapon.hit} · ${weapon.damage}`,
      );
      await settled(page, () => foeButton(page, first()).click());
      assert.ok(
        game.act(cast("spiritual-weapon", [first()], { slotLevel: 2 })),
      );
      await assertHp(page, game, "spiritual weapon");
      // This turn's slot is spent: Guiding Bolt says so.
      await greyed("cast:guiding-bolt", "guiding-bolt");
      // Divine Spark, its damage chosen beside it.
      await chooseSpell(page, "divine-spark", { variant: "necrotic" });
      const spark = stats("divine-spark", { mode: "necrotic" });
      assert.match(
        spark.text,
        /^Constitution save DC \d+, \d+d8 \+ \d+ necrotic, half on a success$/u,
      );
      assert.equal(
        await page.locator("#chooser-detail .chooser-text").textContent(),
        ` · ${spark.text}. Choose an enemy.`,
      );
      assert.equal(
        (await foeButton(page, first()).innerText()).trim(),
        `Divine Spark ${spark.hit} · ${spark.damage}`,
      );
      await settled(page, () => foeButton(page, first()).click());
      assert.ok(
        game.act({
          type: "divine-spark",
          actorId: "pc",
          targetId: first(),
          mode: "necrotic",
        }),
      );
      await assertHp(page, game, "divine spark");
      if (game.spent()) {
        await settled(page, () =>
          page.locator('#encounter button[data-action="end-turn"]').click(),
        );
        game.act({ type: "end-turn", actorId: "pc" });
      }
      // Her next turn: Divine Spark still chosen, with its damage.
      assert.equal(await chosen(page), "divine-spark");
      assert.equal(
        await page.locator("#chooser-variant").inputValue(),
        "necrotic",
      );
      await castAt(page, "sacred-flame", first());
      assert.ok(game.act(cast("sacred-flame", [first()])));
      await assertHp(page, game, "sacred flame");
      // The spiritual weapon's attack, while it is out.
      await chooseAttack(page, "spectral-attack");
      await settled(page, () =>
        page
          .locator(
            `#foe-cards li[data-combatant="${first()}"] button[data-action="spectral-attack"]`,
          )
          .click(),
      );
      assert.ok(
        game.act({ type: "spectral-attack", actorId: "pc", targetId: first() }),
      );
      await assertHp(page, game, "spectral attack");
    }),
);

/**
 * Vex, the Thief raised to level 5 (#308), carrying a Wand of Magic
 * Missiles, which a character who casts no spells can use (#346).
 */
const VEX = (() => {
  const xp = 6500;
  const raised = { ...thief(), xp, level: levelForXp(xp) };
  const sheet = applyLevelChoice(
    validateCharacter({ ...raised, hp: characterProfile(raised).maxHp }),
    { increase: { dexterity: 2 } },
  );
  return validateCharacter({
    ...sheet,
    magicItems: [{ id: WAND, wand: "wand-of-magic-missiles", charges: 7 }],
  });
})();
const VEX_WAND = `cast:magic-missile:${WAND}`;

/**
 * The first seed whose Vex has her first turn fresh, with Steady Aim to
 * take; once taken, Trip goes with an attack and the wand can be used.
 */
const rogueSeed = (() => {
  for (let candidate = 0; candidate < 300; candidate++) {
    const game = replay(VEX, candidate);
    const aim = game
      .views()
      .find(({ action, available }) => action === "steady-aim" && available);
    if (
      game.fresh() &&
      aim !== undefined &&
      game.act(game.runtime.actionOf(aim)) &&
      game
        .views()
        .some(
          ({ cunningStrike, available }) =>
            cunningStrike?.id === "trip" && available,
        ) &&
      game
        .views()
        .some(
          ({ action, spell, available }) =>
            action === "cast" && spell?.item?.id === WAND && available,
        )
    ) {
      return candidate;
    }
  }
  throw new Error("no seed below 300 gives Vex Steady Aim and Trip");
})();

test(
  `a Rogue's Cunning Strike shows only while a weapon attack is chosen, and keeps its choice (seed ${rogueSeed})`,
  { timeout: 120000 },
  () =>
    fightWith(VEX, rogueSeed, { width: 1280, height: 850 }, async (page) => {
      await settled(page, () =>
        page.locator('#encounter button[data-action="steady-aim"]').click(),
      );
      const strike = page.locator("#cunning-strike");
      // The weapon attack is chosen: Cunning Strike goes with it.
      assert.equal(await chosen(page), "attack");
      assert.equal(await strike.isVisible(), true);
      await strike.selectOption("trip");
      // The wand's Magic Missile makes no weapon attack: no Cunning Strike.
      await chooseAttack(page, VEX_WAND);
      assert.equal(await strike.count(), 0);
      assert.equal(await page.locator("#strike-control").isHidden(), true);
      // Back to the weapon, the choice is as it was.
      await chooseAttack(page, "attack");
      assert.equal(await strike.isVisible(), true);
      assert.equal(await strike.inputValue(), "trip");
    }),
);

test(
  "a Fighter with one weapon has no chooser: the goblins' buttons name the weapon",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-526-fighter-"));
    const server = await startFifthBrowserServer({
      adventures: [goblinTrio],
      qualifies: () => true,
      libraryPath: join(directory, "characters.json"),
      seed: 0,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(8000);
    try {
      await createAndStart(page, server.url, goblinTrio.id);
      await page.locator("#foe-cards button.act").first().waitFor();
      assert.equal(await page.locator("#attack-chooser").isHidden(), true);
      assert.equal(await page.locator("#chooser-chips label").count(), 0);
      for (const [, label] of await foeButtons(page)) {
        assert.match(label, /^Attack with Mace [+−]\d+ · 1d6 [+−] \d+$/u);
      }
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

for (const viewport of [
  { width: 1880, height: 1000 },
  { width: 1280, height: 760 },
  { width: 900, height: 560 },
]) {
  test(
    `the attack chooser sits under the Wizard's card without sideways scrolling (${viewport.width} × ${viewport.height})`,
    { timeout: 120000 },
    () =>
      fightWith(VELA, wizard.seed, viewport, async (page) => {
        const you = await page.locator("#you-card").boundingBox();
        const chooser = await page.locator("#attack-chooser").boundingBox();
        const foes = await page.locator("#foe-cards").boundingBox();
        assert.ok(chooser.y >= you.y + you.height, "under the card");
        assert.ok(chooser.x + chooser.width <= foes.x, "left of the foes");
        await assertNoSideScroll(page, "no horizontal scroll", {
          wideFont: true,
        });
        await chooseSpell(page, "fireball");
        await assertNoSideScroll(page, "no horizontal scroll, Fireball");
        // Each box sits inside its card, the Cast button under them.
        const inside = await page
          .locator("#foe-cards > li")
          .evaluateAll((all) =>
            all.map((card) => {
              const outer = card.getBoundingClientRect();
              const inner = card
                .querySelector(".blast-tick")
                .getBoundingClientRect();
              return inner.left >= outer.left && inner.right <= outer.right + 1;
            }),
          );
        assert.deepEqual(inside, [true, true, true]);
        const cast = await page.locator("#area-cast button").boundingBox();
        const cards = await page.locator("#foe-cards").boundingBox();
        assert.ok(cast.y >= cards.y + cards.height);
      }),
  );
}
