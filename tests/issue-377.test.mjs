// #377: small silhouettes beside the text that names a monster or an item.
// The engine's own lines mark where each icon goes without changing their
// text; the room, the fight and what the character carries show them too;
// and a saved line keeps its icons.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AMMUNITION,
  ARMOUR,
  TOOL_ITEMS,
  WEAPONS,
} from "../dist/equipment-5e.js";
import {
  catalogueIcon,
  GAME_ICONS,
  iconCredits,
  iconSprite,
  MONSTER_ICONS,
  OPPONENT_ICON,
} from "../dist/icons-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import {
  bestiary,
  inlineMonster,
  validateModule,
} from "./fixtures/bestiary.mjs";
import { BEA } from "./fixtures/charismatic-fighter.mjs";
import { goblinYard, moduleFile } from "./fixtures/modules.mjs";

const GOBLIN =
  "A small, sharp-toothed goblin in scraps of leather, scimitar already drawn.";

/** Each action's card, as the browser server records it. */
function play(session, ...actions) {
  return actions.map((action) => {
    const { result, rolls } = session.act(action, "click");
    assert.equal(result.rejection, undefined, JSON.stringify(result.rejection));
    const card = session.card(result, rolls);
    session.history.push({ reply: "", cards: [card] });
    return card;
  });
}

const EXAMINE = { type: "examine", targetId: "woodpile" };
const LOOK_BEHIND = { type: "examine", targetId: "water-butt" };
const TAKE_PURSE = { type: "take", itemId: "lost-purse" };
const TAKE_DAGGER = { type: "take", itemId: "yard-dagger" };
const DOWN = { type: "move", destinationId: "cellar" };
const ATTACK = { type: "attack", actorId: "pc", targetId: "goblin" };
const END_TURN = { type: "end-turn", actorId: "pc" };

test("every icon is one SVG path, and the credits name each artist", () => {
  const ids = Object.keys(GAME_ICONS);
  for (const [id, { path, source, artist }] of Object.entries(GAME_ICONS)) {
    assert.match(path, /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/u, id);
    assert.match(source, new RegExp(`^[a-z-]+/${id}$`, "u"));
    assert.ok(iconCredits().includes(artist), artist);
  }
  assert.match(iconCredits(), /game-icons\.net under CC BY 3\.0\.$/u);
  const sprite = iconSprite();
  assert.equal(sprite.match(/<symbol /gu).length, ids.length);
  assert.equal(sprite.match(/<path /gu).length, ids.length);
  assert.doesNotMatch(sprite, /<script|on[a-z]+=|href/iu);
});

test("every bestiary monster and catalogue item has an icon", () => {
  assert.deepEqual(
    bestiary.monsters.map(({ id }) => id).sort(),
    Object.keys(MONSTER_ICONS).sort(),
  );
  for (const icon of Object.values(MONSTER_ICONS)) {
    assert.ok(Object.hasOwn(GAME_ICONS, icon), icon);
  }
  for (const id of [
    ...Object.keys(WEAPONS),
    ...Object.keys(ARMOUR),
    ...Object.keys(TOOL_ITEMS),
    ...Object.keys(AMMUNITION),
  ]) {
    assert.ok(Object.hasOwn(GAME_ICONS, catalogueIcon(id)), id);
  }
  // A +1 item has its base item's icon.
  assert.equal(catalogueIcon("shortsword-plus-1"), catalogueIcon("shortsword"));
});

test("an opponent has its authored icon, or its monster's, or crossed swords", () => {
  const withOpponents = (opponents) => {
    const module = moduleFile("lone-goblin");
    module.encounters[0].opponents = opponents;
    return module;
  };
  const icons = (opponents) =>
    validateModule(withOpponents(opponents)).encounters[0].opponents.map(
      ({ icon }) => icon,
    );
  assert.deepEqual(
    icons([
      { id: "goblin", monster: "goblin-warrior" },
      {
        id: "hound",
        monster: "goblin-warrior",
        name: "Hound",
        icon: "wolf-howl",
      },
      inlineMonster("bandit", { id: "stranger", name: "Stranger" }),
      inlineMonster("wolf", { id: "cur", name: "Cur", icon: "sitting-dog" }),
    ]),
    ["goblin", "wolf-howl", OPPONENT_ICON, "sitting-dog"],
  );
  assert.throws(
    () =>
      validateModule(
        withOpponents([
          { id: "goblin", monster: "goblin-warrior", icon: "dragon" },
        ]),
      ),
    /opponent 1 \(goblin\) icon must name an icon in src\/icons-5e\.ts/u,
  );
  // A validated module validates again as it is (#251's fixtures do so).
  assert.deepEqual(
    validateModule(structuredClone(goblinYard)).encounters,
    goblinYard.encounters,
  );
});

test("the engine's lines mark the items and the goblin without changing their text", () => {
  const session = FifthSession.begin(7, goblinYard, BEA);
  const [examined, , purse, dagger, entered] = play(
    session,
    EXAMINE,
    LOOK_BEHIND,
    TAKE_PURSE,
    TAKE_DAGGER,
    DOWN,
  );
  const [found] = examined.lines;
  assert.match(found.text, /You find the Dagger\.$/u);
  assert.deepEqual(found.icons, [
    { at: found.text.lastIndexOf("Dagger"), icon: "plain-dagger" },
  ]);
  assert.deepEqual(purse.lines[0], {
    text: "You take the Lost Purse and put 5 sp in your purse.",
    rolls: [],
    icons: [{ at: 0, icon: "two-coins" }],
    // Its coin clinks (#484).
    sound: "coins",
  });
  assert.deepEqual(dagger.lines[0].icons, [{ at: 0, icon: "plain-dagger" }]);
  // Entering the cellar starts the fight: the goblin's line is marked
  // before its description; the initiative line is not.
  const [arrival, ...rest] = entered.lines;
  assert.ok(arrival.text.endsWith(GOBLIN));
  assert.deepEqual(arrival.icons, [
    { at: arrival.text.indexOf(GOBLIN), icon: "goblin" },
  ]);
  const initiative = rest.find(({ text }) => text.startsWith("Initiative:"));
  assert.equal(initiative.icons, undefined);
  // Each card's text is still its lines' text.
  for (const card of [examined, purse, dagger, entered]) {
    assert.equal(card.text, card.lines.map(({ text }) => text).join("\n"));
  }

  // An attack line marks the goblin's name where it first appears.
  const attacking = ({ rolls }) =>
    rolls.some(({ purpose }) => purpose === "attack");
  const attacks = entered.lines.filter(attacking);
  while (attacks.length === 0 && session.state.status === "playing") {
    const [card] = play(
      session,
      session.runtime.attackTargets(session.state).length > 0
        ? ATTACK
        : END_TURN,
    );
    attacks.push(...card.lines.filter(attacking));
  }
  assert.ok(attacks.length > 0);
  for (const line of attacks) {
    assert.deepEqual(line.icons, [
      { at: line.text.indexOf("Goblin Warrior"), icon: "goblin" },
    ]);
  }
});

test("the room, the fight and the carried gear carry their icons", () => {
  const session = FifthSession.begin(7, goblinYard, BEA);
  const { runtime } = session;
  play(session, EXAMINE, LOOK_BEHIND);
  const yard = runtime.projectRoom(session.state);
  assert.deepEqual(
    yard.items.map(({ id, icon }) => [id, icon]),
    [
      ["lost-purse", "two-coins"],
      ["yard-dagger", "plain-dagger"],
    ],
  );
  assert.ok(
    yard.gear.worn.every(({ icon }) => Object.hasOwn(GAME_ICONS, icon)),
  );
  assert.ok(
    yard.gear.held.every(({ icon }) => Object.hasOwn(GAME_ICONS, icon)),
  );
  play(session, TAKE_DAGGER, DOWN);
  const fight = runtime.projectFight(session.state).encounter;
  assert.deepEqual(
    fight.combatants.map(({ id, icon }) => [id, icon]),
    fight.combatants.map(({ id }) => [id, id === "pc" ? undefined : "goblin"]),
  );
  const carried = runtime.projectRoom(session.state).gear.stowed;
  assert.deepEqual(
    carried.map(({ id, icon }) => [id, icon]),
    [["dagger", "plain-dagger"]],
  );
});

test("a saved line keeps its icons, and a line with an unknown icon is refused", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-377-"));
  try {
    const path = join(directory, "session.json");
    const session = await FifthSession.create(
      path,
      "c".repeat(32),
      7,
      goblinYard,
      BEA,
    );
    play(session, LOOK_BEHIND, TAKE_PURSE, DOWN);
    await session.persist();
    const loaded = await FifthSession.load(path, [goblinYard]);
    assert.deepEqual(loaded.history, session.history);
    const file = JSON.parse(await readFile(path, "utf8"));
    const taken = file.history.at(-2).cards[0].lines[0];
    assert.deepEqual(taken.icons, [{ at: 0, icon: "two-coins" }]);

    for (const icons of [
      [{ at: 0, icon: "dragon" }],
      [{ at: taken.text.length, icon: "two-coins" }],
      [],
    ]) {
      const tampered = structuredClone(file);
      tampered.history.at(-2).cards[0].lines[0].icons = icons;
      await writeFile(path, JSON.stringify(tampered));
      await assert.rejects(
        FifthSession.load(path, [goblinYard]),
        /Invalid adventure session/u,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
