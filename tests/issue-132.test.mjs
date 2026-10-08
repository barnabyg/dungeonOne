// #132: checks, doors, traps and talk in the 5e runtime. Every check is
// rolled once and remembered; each new action's projected availability and
// reason match what the engine accepts or refuses; the AI DM is offered only
// the same actions and cannot invent results.
import assert from "node:assert/strict";
import test from "node:test";
import { runDmTurn } from "../dist/dm-turn.js";
import { buildCharacter } from "../dist/character-5e.js";
import { createSeededRandom } from "../dist/random.js";
import {
  createFifthRuntime,
  describeFifthResult,
  renderFifthResult,
} from "../dist/runtime-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { ratlessTunnels, sealedCrypt } from "./fixtures/modules.mjs";
import { engineAction } from "./fixtures/playthroughs.mjs";
import { uncheckedDice as dice } from "./fixtures/engine-dice.mjs";

const crypt = sealedCrypt;

// Str 16 (+3), Dex 12 (+1), Con 14 (+2), Int 10, Wis 10, Cha 10; Athletics
// (+5) and Perception (+2); 12 HP.
const sheet = buildCharacter(
  "a".repeat(32),
  "Ada",
  [
    [6, 6, 4, 1],
    [4, 4, 4, 1],
    [4, 4, 4, 1],
    [3, 3, 3, 1],
    [3, 3, 4, 1],
    [3, 3, 4, 1],
  ],
  {
    placement: {
      strength: 0,
      dexterity: 1,
      constitution: 2,
      intelligence: 3,
      wisdom: 4,
      charisma: 5,
    },
    increase: { constitution: 2, intelligence: 1 },
    skills: ["athletics", "perception"],
    fightingStyle: "defense",
    kit: "mace",
    masteries: ["dagger", "mace", "shortsword"],
  },
);

const runtimeFor = (adventure = crypt) => createFifthRuntime(adventure, sheet);

/** Applies actions in order, each drawing from its own queue. */
function play(runtime, steps, state = runtime.createSession()) {
  for (const [action, ...values] of steps) {
    const result = runtime.handleAction(state, action, dice(...values));
    assert.equal(result.rejection, undefined, result.rejection?.reason);
    state = result.state;
  }
  return state;
}

const BEGIN = [{ type: "begin" }];
const TO_HALL = [{ type: "move", destinationId: "hall" }];
const TO_OFFERINGS = [{ type: "move", destinationId: "offering-room" }];
const force = (...values) => [
  { type: "force", doorId: "swollen-door" },
  ...values,
];

const TOOLS = [
  ["move", "move"],
  ["examine", "examine"],
  ["take", "take"],
  ["use_item", "use"],
  ["attack", "attack"],
  ["force_door", "force"],
  ["pick_lock", "pick"],
  ["break_door", "break"],
  ["unlock", "unlock"],
  ["search", "search"],
  ["disarm", "disarm"],
  ["talk", "talk"],
  ["equip", "equip"],
  ["unequip", "unequip"],
  ["swap_weapon", "swap"],
  ["drop", "drop"],
];

/**
 * Each projected action is available exactly when the engine accepts it, an
 * unavailable one gives a reason, and the AI DM's tools list exactly the
 * available ones.
 */
function assertAgrees(runtime, state) {
  const actions = runtime.projectActions(state);
  for (const shown of actions) {
    const result = runtime.handleAction(
      state,
      engineAction(shown),
      createSeededRandom(1),
    );
    assert.equal(
      shown.available,
      result.rejection === undefined,
      `${JSON.stringify(shown)}: ${result.rejection?.reason ?? "accepted"}`,
    );
    assert.equal(
      typeof shown.reason === "string" && shown.reason.length > 0,
      !shown.available,
      JSON.stringify(shown),
    );
  }
  const tools = new Map(
    runtime.getGameToolDefinitions(state).map((tool) => [tool.name, tool]),
  );
  for (const [tool, kind] of TOOLS) {
    const offered = tools.get(tool);
    assert.deepEqual(
      offered === undefined
        ? []
        : Object.values(offered.parameters.properties)[0].enum,
      actions
        .filter(({ action, available }) => action === kind && available)
        .map(({ target }) => target.id),
      `${tool} offers exactly the enabled ${kind} actions`,
    );
  }
  return actions;
}

const find = (actions, action, targetId) =>
  actions.find(
    (shown) => shown.action === action && shown.target?.id === targetId,
  );

/** Asserts the engine refuses `action` with `code`, drawing no dice. */
function refuses(runtime, state, action, code) {
  const random = dice();
  const result = runtime.handleAction(state, action, random);
  assert.equal(result.rejection?.code, code, result.rejection?.reason);
  assert.deepEqual(random.drawn, []);
  assert.equal(result.state, state);
  return result.rejection.reason;
}

test("the crypt stair offers the stuck door's Force, a Search and no way through the shut door", () => {
  const runtime = runtimeFor();
  const start = play(runtime, [BEGIN]);
  assert.deepEqual(assertAgrees(runtime, start), [
    {
      action: "move",
      target: { id: "flooded-cell", name: "Flooded Cell" },
      available: false,
      reason: "Door shut",
    },
    {
      action: "move",
      target: { id: "hall", name: "Hall of Niches" },
      available: true,
    },
    {
      action: "force",
      target: { id: "swollen-door", name: "Swollen Door" },
      available: true,
    },
    {
      action: "search",
      target: { id: "crypt-stair", name: "Crypt Stair" },
      available: true,
    },
    {
      action: "examine",
      target: { id: "carved-warning", name: "Carved Warning" },
      available: true,
    },
    // The character's own armour (#209).
    {
      action: "unequip",
      target: { id: "leather", name: "Leather armour" },
      available: true,
    },
  ]);
  assert.match(
    refuses(
      runtime,
      start,
      { type: "move", destinationId: "flooded-cell" },
      "door-shut",
    ),
    /The Swollen Door is shut\./,
  );
});

test("a failed check is remembered: forcing again is refused, not rerolled", () => {
  const runtime = runtimeFor();
  const random = dice(7);
  const result = runtime.handleAction(
    play(runtime, [BEGIN]),
    { type: "force", doorId: "swollen-door" },
    random,
  );
  assert.deepEqual(random.drawn, [{ sides: 20, value: 7 }]);
  assert.equal(
    renderFifthResult(result),
    "Athletics check: d20 7 + 3 + 2 proficiency = 12 against DC 13. Failure.\nThe Swollen Door holds.",
  );
  const failed = result.state;
  assert.deepEqual(failed.checks, [
    { id: "force:swollen-door", band: "failure" },
  ]);
  const actions = assertAgrees(runtime, failed);
  assert.deepEqual(find(actions, "force", "swollen-door"), {
    action: "force",
    target: { id: "swollen-door", name: "Swollen Door" },
    available: false,
    reason: "Already tried",
  });
  assert.equal(find(actions, "move", "flooded-cell").reason, "Door shut");
  assert.match(
    refuses(
      runtime,
      failed,
      { type: "force", doorId: "swollen-door" },
      "already-tried",
    ),
    /You already tried to force the Swollen Door/,
  );
});

test("a passed check opens the door for good", () => {
  const runtime = runtimeFor();
  const result = runtime.handleAction(
    play(runtime, [BEGIN]),
    { type: "force", doorId: "swollen-door" },
    dice(8),
  );
  assert.equal(
    renderFifthResult(result),
    "Athletics check: d20 8 + 3 + 2 proficiency = 13 against DC 13. Success.\nYou force the Swollen Door open.",
  );
  const opened = result.state;
  assert.deepEqual(opened.openedDoorIds, ["swollen-door"]);
  const actions = assertAgrees(runtime, opened);
  assert.equal(find(actions, "move", "flooded-cell").available, true);
  // An open door offers no way to open it (#136).
  assert.equal(find(actions, "force", "swollen-door"), undefined);
  refuses(
    runtime,
    opened,
    { type: "force", doorId: "swollen-door" },
    "door-open",
  );
  const inside = play(
    runtime,
    [[{ type: "move", destinationId: "flooded-cell" }]],
    opened,
  );
  assert.equal(inside.roomId, "flooded-cell");
  // The open door shows on the exit from either side.
  assert.deepEqual(runtime.projectRoom(inside).exits[0].door, {
    id: "swollen-door",
    name: "Swollen Door",
    description: "The wood has swollen tight in its frame.",
    open: true,
  });
});

test("a locked door is picked or broken by checks, or opened with its key", () => {
  const runtime = runtimeFor();
  const hall = play(runtime, [BEGIN, TO_HALL]);
  const actions = assertAgrees(runtime, hall);
  assert.deepEqual(
    actions
      .filter(({ target }) => target?.id === "iron-door")
      .map(({ action }) => action),
    ["pick", "break"],
    "Unlock is shown only while the key is carried",
  );
  // Dexterity check 3 + 1 = 4 against DC 15 fails; Athletics 13 + 5 = 18
  // against DC 18 succeeds.
  const picked = runtime.handleAction(
    hall,
    { type: "pick", doorId: "iron-door" },
    dice(3),
  );
  assert.equal(
    renderFifthResult(picked),
    "Dexterity check: d20 3 + 1 = 4 against DC 15. Failure.\nThe Iron Door's lock defeats you.",
  );
  assert.equal(
    find(assertAgrees(runtime, picked.state), "pick", "iron-door").reason,
    "Already tried",
  );
  const broken = runtime.handleAction(
    picked.state,
    { type: "break", doorId: "iron-door" },
    dice(13),
  );
  assert.match(renderFifthResult(broken), /\nYou break the Iron Door open\.$/);
  assert.deepEqual(broken.state.openedDoorIds, ["iron-door"]);

  // With the key from the offering bowl (the trap found and disarmed first),
  // Unlock opens it without a roll.
  const keyed = play(runtime, [
    BEGIN,
    TO_HALL,
    [{ type: "search", roomId: "hall" }, 15],
    [{ type: "disarm", trapId: "dart-trap" }, 15],
    TO_OFFERINGS,
    [{ type: "examine", targetId: "offering-bowl" }],
    [{ type: "take", itemId: "iron-key" }],
    TO_HALL,
  ]);
  const withKey = assertAgrees(runtime, keyed);
  assert.equal(find(withKey, "unlock", "iron-door").available, true);
  assert.equal(
    find(withKey, "use", "iron-key"),
    undefined,
    "a key is not drunk",
  );
  refuses(
    runtime,
    keyed,
    { type: "use-item", itemId: "iron-key" },
    "not-drinkable",
  );
  const random = dice();
  const unlocked = runtime.handleAction(
    keyed,
    { type: "unlock", doorId: "iron-door" },
    random,
  );
  assert.deepEqual(random.drawn, []);
  assert.equal(
    renderFifthResult(unlocked),
    "You unlock the Iron Door with the Iron Key.",
  );
  assert.equal(
    find(assertAgrees(runtime, unlocked.state), "unlock", "iron-door"),
    undefined,
  );
});

test("searching finds a trap on the room's exits; a found trap can be disarmed once", () => {
  const runtime = runtimeFor();
  const hall = play(runtime, [BEGIN, TO_HALL]);
  assert.equal(
    find(assertAgrees(runtime, hall), "disarm", "dart-trap"),
    undefined,
    "an unfound trap is not shown",
  );
  const searched = runtime.handleAction(
    hall,
    { type: "search", roomId: "hall" },
    dice(11),
  );
  assert.equal(
    renderFifthResult(searched),
    "Perception check: d20 11 + 0 + 2 proficiency = 13 against DC 13. Success.\nYou find a Dart Trap on the way to the Offering Room: A tripwire is strung low across the archway, wired to holes in the wall.",
  );
  const found = searched.state;
  assert.deepEqual(found.foundTrapIds, ["dart-trap"]);
  let actions = assertAgrees(runtime, found);
  assert.equal(find(actions, "search", "hall").reason, "Already searched");
  assert.equal(find(actions, "disarm", "dart-trap").available, true);
  assert.deepEqual(runtime.projectRoom(found).exits[2].trap, {
    id: "dart-trap",
    name: "Dart Trap",
    description:
      "A tripwire is strung low across the archway, wired to holes in the wall.",
    state: "armed",
  });

  const disarmed = runtime.handleAction(
    found,
    { type: "disarm", trapId: "dart-trap" },
    dice(11),
  );
  assert.equal(
    renderFifthResult(disarmed),
    "Dexterity check: d20 11 + 1 = 12 against DC 12. Success.\nYou disarm the Dart Trap.",
  );
  actions = assertAgrees(runtime, disarmed.state);
  assert.equal(find(actions, "disarm", "dart-trap").reason, "Trap disarmed");
  // Going through a disarmed trap draws no dice.
  const through = play(runtime, [TO_OFFERINGS], disarmed.state);
  assert.equal(through.roomId, "offering-room");
  assert.equal(through.character.hp, 12);

  // A failed disarm leaves the trap armed and is not retried.
  const fumbled = runtime.handleAction(
    found,
    { type: "disarm", trapId: "dart-trap" },
    dice(2),
  );
  assert.match(
    renderFifthResult(fumbled),
    /\nYou can't work out how to disarm the Dart Trap\.$/,
  );
  assert.equal(
    find(assertAgrees(runtime, fumbled.state), "disarm", "dart-trap").reason,
    "Already tried",
  );
});

test("a failed search finds nothing and is not retried; no Disarm appears", () => {
  const runtime = runtimeFor();
  const searched = runtime.handleAction(
    play(runtime, [BEGIN, TO_HALL]),
    { type: "search", roomId: "hall" },
    dice(2),
  );
  assert.match(renderFifthResult(searched), /Failure\.\nYou find no traps\.$/);
  const actions = assertAgrees(runtime, searched.state);
  assert.equal(find(actions, "disarm", "dart-trap"), undefined);
  refuses(
    runtime,
    searched.state,
    { type: "search", roomId: "hall" },
    "already-searched",
  );
});

test("an armed trap springs on the way through: a saving throw against its damage, once", () => {
  const runtime = runtimeFor();
  const hall = play(runtime, [BEGIN, TO_HALL]);
  // Dexterity save 5 + 1 = 6 against DC 12 fails: the full 3 + 4.
  const random = dice(5, 3, 4);
  const sprung = runtime.handleAction(hall, TO_OFFERINGS[0], random);
  assert.deepEqual(random.drawn, [
    { sides: 20, value: 5 },
    { sides: 4, value: 3 },
    { sides: 4, value: 4 },
  ]);
  assert.equal(
    renderFifthResult(sprung),
    [
      "Dart Trap: A wire snaps underfoot and darts hiss from the wall.",
      "Dexterity saving throw: d20 5 + 1 = 6 against DC 12. Failure.",
      "The Dart Trap deals 3 + 4 = 7 piercing; you have 5/12 HP.",
      "You enter the Offering Room. A low chamber with a stone altar. Mouldering offerings are heaped around a bronze bowl.",
    ].join("\n"),
  );
  assert.equal(sprung.state.character.hp, 5);
  assert.deepEqual(sprung.state.sprungTrapIds, ["dart-trap"]);
  assert.equal(runtime.projectRoom(sprung.state).character.health, "bloodied");
  // It is spent: going back draws nothing.
  const back = play(runtime, [TO_HALL], sprung.state);
  assert.equal(back.character.hp, 5);
  assert.deepEqual(runtime.projectRoom(back).exits[2].trap.state, "sprung");

  // A passed save halves the damage, rounding down.
  const saved = runtime.handleAction(hall, TO_OFFERINGS[0], dice(15, 3, 4));
  assert.match(
    renderFifthResult(saved),
    /Dexterity saving throw: d20 15 \+ 1 = 16 against DC 12\. Success\.\nThe Dart Trap deals 3 \+ 4 = 7 piercing, halved to 3; you have 9\/12 HP\./,
  );
});

test("a trap's saving throw adds proficiency in the Fighter's saves", () => {
  const constitution = validateModule({
    ...structuredClone(crypt),
    passages: crypt.passages.map((entry) =>
      entry.trap === undefined
        ? entry
        : {
            ...entry,
            trap: { ...entry.trap, save: { ability: "constitution", dc: 12 } },
          },
    ),
  });
  const runtime = runtimeFor(constitution);
  const sprung = runtime.handleAction(
    play(runtime, [BEGIN, TO_HALL]),
    TO_OFFERINGS[0],
    dice(8, 1, 1),
  );
  assert.match(
    renderFifthResult(sprung),
    /Constitution saving throw: d20 8 \+ 2 \+ 2 proficiency = 12 against DC 12\. Success\./,
  );
});

test("a trap that drops the character to 0 HP ends the adventure in its defeat", () => {
  const deadly = validateModule({
    ...structuredClone(crypt),
    passages: crypt.passages.map((entry) =>
      entry.trap === undefined
        ? entry
        : {
            ...entry,
            trap: {
              ...entry.trap,
              damage: { ...entry.trap.damage, modifier: 20 },
            },
          },
    ),
  });
  const runtime = runtimeFor(deadly);
  const result = runtime.handleAction(
    play(runtime, [BEGIN, TO_HALL]),
    TO_OFFERINGS[0],
    dice(2, 1, 1),
  );
  assert.equal(result.state.status, "defeat");
  assert.equal(result.state.endingId, "fallen-in-the-crypt");
  assert.equal(result.state.character.hp, 0);
  assert.equal(result.state.roomId, "hall");
  assert.equal(result.events.at(-1).type, "ending");
  assert.deepEqual(runtime.projectActions(result.state), []);
});

test("talking: a free topic draws no dice; a topic with a check rolls once; each is asked once", () => {
  const runtime = runtimeFor();
  const hall = play(runtime, [BEGIN, TO_HALL]);
  const actions = assertAgrees(runtime, hall);
  assert.deepEqual(
    actions.filter(({ action }) => action === "talk"),
    [
      {
        action: "talk",
        target: { id: "warden", name: "Bound Smuggler about the warden" },
        available: true,
      },
      {
        action: "talk",
        target: {
          id: "key-whereabouts",
          name: "Bound Smuggler about the iron key",
        },
        available: true,
      },
    ],
  );
  const random = dice();
  const told = runtime.handleAction(
    hall,
    { type: "talk", topicId: "warden" },
    random,
  );
  assert.deepEqual(random.drawn, []);
  assert.equal(
    renderFifthResult(told),
    'Bound Smuggler: "I lifted the sarcophagus lid and the warden climbed out after me. My partners left me tied here. Go and see for yourself."',
  );
  assert.equal(
    find(assertAgrees(runtime, told.state), "talk", "warden").reason,
    "Already asked",
  );
  refuses(
    runtime,
    told.state,
    { type: "talk", topicId: "warden" },
    "already-asked",
  );

  // Persuasion 12 + 0 = 12 against DC 12 passes; 11 fails.
  const persuaded = runtime.handleAction(
    told.state,
    { type: "talk", topicId: "key-whereabouts" },
    dice(12),
  );
  assert.equal(
    renderFifthResult(persuaded),
    'Persuasion check: d20 12 + 0 = 12 against DC 12. Success.\nBound Smuggler: "The key to the iron door? In the offering bowl, past the archway. Mind the wire across it."',
  );
  const refused = runtime.handleAction(
    told.state,
    { type: "talk", topicId: "key-whereabouts" },
    dice(11),
  );
  assert.match(
    renderFifthResult(refused),
    /Failure\.\nBound Smuggler: "Untie me first, then we'll talk about keys\." The smuggler turns away\.$/,
  );
  // The room shows what each topic drew from the creature.
  assert.deepEqual(runtime.projectRoom(refused.state).creatures, [
    {
      id: "smuggler",
      name: "Bound Smuggler",
      description:
        "A smuggler sits bound and gagged against a niche. When you pull the gag free they spit and glare at you.",
      topics: [
        {
          id: "warden",
          name: "the warden",
          said: '"I lifted the sarcophagus lid and the warden climbed out after me. My partners left me tied here. Go and see for yourself."',
        },
        {
          id: "key-whereabouts",
          name: "the iron key",
          said: '"Untie me first, then we\'ll talk about keys." The smuggler turns away.',
        },
      ],
    },
  ]);
  // Talking about a topic of a creature elsewhere is refused.
  refuses(
    runtime,
    play(runtime, [BEGIN]),
    { type: "talk", topicId: "warden" },
    "no-topic",
  );
});

test("nothing new can be done in a fight; doors, searches and talk are refused", () => {
  const runtime = runtimeFor();
  const fighting = play(runtime, [
    BEGIN,
    TO_HALL,
    // Initiative: Ada 15 + 1, the goblin 3 + 2.
    [{ type: "move", destinationId: "tomb" }, 15, 3],
  ]);
  assert.equal(fighting.encounter.outcome, "ongoing");
  for (const action of [
    { type: "search", roomId: "tomb" },
    { type: "talk", topicId: "warden" },
    { type: "force", doorId: "swollen-door" },
  ]) {
    refuses(runtime, fighting, action, "fighting");
  }
  const actions = assertAgrees(runtime, fighting);
  assert.equal(
    actions.some(({ action }) => ["search", "talk", "force"].includes(action)),
    false,
  );
});

test("a check's card groups its roll: die, modifier, proficiency, DC and outcome", () => {
  const runtime = runtimeFor();
  const rolls = [{ sides: 20, value: 7 }];
  const result = runtime.handleAction(
    play(runtime, [BEGIN]),
    { type: "force", doorId: "swollen-door" },
    dice(7),
  );
  assert.deepEqual(describeFifthResult(result, rolls, "Ada"), [
    {
      text: "Athletics check: d20 7 + 3 + 2 proficiency = 12 against DC 13. Failure.",
      rolls: [
        {
          purpose: "check",
          roller: "Ada",
          label: "Athletics check",
          dice: [{ sides: 20, value: 7 }],
          modifier: 3,
          proficiency: 2,
          total: 12,
          dc: 13,
          outcome: "failure",
        },
      ],
    },
    { text: "The Swollen Door holds.", rolls: [] },
  ]);
  const hall = play(runtime, [BEGIN, TO_HALL]);
  const sprung = runtime.handleAction(hall, TO_OFFERINGS[0], dice(15, 3, 4));
  const lines = describeFifthResult(
    sprung,
    [
      { sides: 20, value: 15 },
      { sides: 4, value: 3 },
      { sides: 4, value: 4 },
    ],
    "Ada",
  );
  assert.deepEqual(lines[1].rolls, [
    {
      purpose: "save",
      roller: "Ada",
      label: "Dexterity saving throw",
      dice: [{ sides: 20, value: 15 }],
      modifier: 1,
      proficiency: 0,
      total: 16,
      dc: 12,
      outcome: "success",
    },
  ]);
  assert.deepEqual(lines[2].rolls, [
    {
      purpose: "damage",
      roller: "Dart Trap",
      target: "Ada",
      dice: [
        { sides: 4, value: 3 },
        { sides: 4, value: 4 },
      ],
      modifier: 0,
      total: 3,
      halved: true,
      damageType: "piercing",
      hpAfter: 9,
      maxHp: 12,
    },
  ]);
});

function scripted(...responses) {
  const requests = [];
  return {
    requests,
    async respond(request) {
      requests.push(request);
      assert.ok(responses.length > 0, "the scripted DM ran out of responses");
      return responses.shift();
    },
  };
}

const call = (name, args) => ({
  toolCalls: [{ id: "call-1", name, argumentsJson: JSON.stringify(args) }],
});

const turn = (runtime, state, playerInput, model, random = dice()) =>
  runDmTurn({ state, playerInput, transcript: [], random, model, runtime });

test("scripted DM: a check is rolled only for an explicit request naming an offered approach", async () => {
  const runtime = runtimeFor();
  const start = play(runtime, [BEGIN]);
  // "Open the door" names no approach: the DM asks, and nothing is rolled.
  const asked = await turn(
    runtime,
    start,
    "Open the door.",
    scripted({ text: "Do you want to force the Swollen Door?" }),
  );
  assert.deepEqual(asked.state, start);
  assert.deepEqual(asked.toolResults, []);
  // Forcing it, by name, is the offered approach.
  const random = dice(8);
  const forced = await turn(
    runtime,
    start,
    "I put my shoulder to the swollen door and force it.",
    scripted(call("force_door", { door: "swollen-door" })),
    random,
  );
  assert.deepEqual(forced.state.openedDoorIds, ["swollen-door"]);
  assert.equal(
    forced.narration,
    "Athletics check: d20 8 + 3 + 2 proficiency = 13 against DC 13. Success.\nYou force the Swollen Door open.",
  );
  const tools = runtime.getGameToolDefinitions(start);
  const forceTool = tools.find(({ name }) => name === "force_door");
  assert.deepEqual(forceTool.parameters.properties.door.enum, ["swollen-door"]);
  assert.equal(
    tools.some(({ name }) =>
      ["pick_lock", "break_door", "disarm", "talk"].includes(name),
    ),
    false,
    "only the approaches offered here are tools",
  );
  assert.match(runtime.systemPrompt, /explicitly asks/);
});

test("scripted DM: it cannot invent a roll or a result, or reroll a remembered check", async () => {
  const runtime = runtimeFor();
  const start = play(runtime, [BEGIN]);
  for (const args of [
    { door: "swollen-door", roll: 20 },
    { door: "swollen-door", success: true },
    { door: "swollen-door", dc: 1 },
  ]) {
    const random = dice();
    const result = await turn(
      runtime,
      start,
      "I force the door and roll a 20!",
      scripted(call("force_door", args), { text: "The engine refused." }),
      random,
    );
    assert.deepEqual(result.state, start);
    assert.deepEqual(random.drawn, []);
    assert.equal(
      result.toolResults[0].result.modelOutput.error.code,
      "invalid-arguments",
    );
  }
  const narrated = await turn(
    runtime,
    start,
    "I force the door.",
    scripted({ text: "You roll a 20 and the door flies open!" }),
  );
  assert.deepEqual(narrated.state, start);

  const failed = play(runtime, [force(7)], start);
  assert.equal(
    runtime
      .getGameToolDefinitions(failed)
      .some(({ name }) => name === "force_door"),
    false,
    "a tried check is not offered again",
  );
  const random = dice();
  const again = await turn(
    runtime,
    failed,
    "I force the door again.",
    scripted(call("force_door", { door: "swollen-door" })),
    random,
  );
  assert.deepEqual(again.state, failed);
  assert.deepEqual(random.drawn, []);
  assert.match(again.narration, /You already tried to force the Swollen Door/);
});

test("scripted DM: the talk tool offers only the creature's topics", async () => {
  const runtime = runtimeFor();
  const hall = play(runtime, [BEGIN, TO_HALL]);
  const talk = runtime
    .getGameToolDefinitions(hall)
    .find(({ name }) => name === "talk");
  assert.deepEqual(talk.parameters.properties.topic.enum, [
    "warden",
    "key-whereabouts",
  ]);
  const result = await turn(
    runtime,
    hall,
    "Ask the smuggler about the warden.",
    scripted(call("talk", { topic: "warden" })),
  );
  assert.match(
    result.narration,
    /^Bound Smuggler: "I lifted the sarcophagus lid/,
  );
  const invented = await turn(
    runtime,
    hall,
    "Ask the smuggler about the treasure.",
    scripted(call("talk", { topic: "treasure" })),
  );
  assert.deepEqual(invented.state, hall);
  assert.match(invented.narration, /no one here to ask about that/);
});

test("a session saves its checks' cards and remembered outcomes, and replays them exactly", async () => {
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { FIFTH_SESSION_FORMAT, FifthSession } =
    await import("../dist/session-5e.js");
  const directory = await mkdtemp(join(tmpdir(), "issue-132-"));
  try {
    const path = join(directory, "session.json");
    const session = await FifthSession.create(
      path,
      "b".repeat(32),
      3,
      crypt,
      sheet,
    );
    for (const action of [
      { type: "force", doorId: "swollen-door" },
      { type: "move", destinationId: "hall" },
      { type: "search", roomId: "hall" },
      { type: "talk", topicId: "key-whereabouts" },
      { type: "move", destinationId: "offering-room" },
    ]) {
      const { result, rolls } = session.act(action, "click");
      assert.equal(result.rejection, undefined, result.rejection?.reason);
      session.history.push({ reply: "", cards: [session.card(result, rolls)] });
    }
    await session.persist();
    const file = JSON.parse(await readFile(path, "utf8"));
    assert.equal(file.formatVersion, FIFTH_SESSION_FORMAT);
    const purposes = file.history.flatMap(({ cards }) =>
      cards.flatMap(({ lines }) =>
        lines.flatMap(({ rolls }) => rolls.map(({ purpose }) => purpose)),
      ),
    );
    assert.ok(purposes.includes("check"));
    assert.equal(file.state.checks.length, 3);
    const loaded = await FifthSession.load(path, [crypt]);
    assert.deepEqual(loaded.state, session.state);
    assert.deepEqual(loaded.history, session.history);
    assert.equal(loaded.randomPosition, session.randomPosition);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a module without traps offers no Search, and the engine refuses one", () => {
  const runtime = runtimeFor(ratlessTunnels);
  const start = play(runtime, [BEGIN]);
  assert.equal(
    assertAgrees(runtime, start).some(({ action }) => action === "search"),
    false,
  );
  refuses(runtime, start, { type: "search", roomId: "stair-foot" }, "no-traps");
});

test("every search shows the same DC, so a room without a trap looks no different", () => {
  const runtime = runtimeFor();
  const stair = runtime.handleAction(
    play(runtime, [BEGIN]),
    { type: "search", roomId: "crypt-stair" },
    dice(11),
  );
  assert.equal(
    renderFifthResult(stair),
    "Perception check: d20 11 + 0 + 2 proficiency = 13 against DC 13. Success.\nYou find no traps.",
  );
});
