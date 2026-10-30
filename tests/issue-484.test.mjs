// #484: the engine tags a result line with a named sound where its rolls
// cannot show what happened, and items are the first: finding coin or a
// magic item plays the find's harp; taking coin clinks, and so does buying
// or selling; taking a magic item chimes, and an ordinary item taken is
// picked up. The tag is saved with its line; older saves and traces are
// refused.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFifthRuntime, describeFifthResult } from "../dist/runtime-5e.js";
import { FIFTH_SESSION_FORMAT, FifthSession } from "../dist/session-5e.js";
import { SOUNDS, resultSounds } from "../dist/sounds-5e.js";
import { FIFTH_TRACE_FORMAT, verifyFifthTraceFile } from "../dist/trace-5e.js";
import { BEA } from "./fixtures/charismatic-fighter.mjs";
import { dice } from "./fixtures/engine-dice.mjs";
import { findsYard } from "./fixtures/finds-yard.mjs";
import { banditToll } from "./fixtures/modules.mjs";

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

const examine = (targetId) => ({ type: "examine", targetId });
const take = (itemId) => ({ type: "take", itemId });

/** Each line's text and sound, where it has one. */
const sounded = (card) =>
  card.lines.map(({ text, sound }) =>
    sound === undefined ? [text] : [text, sound],
  );

test("each item sound is a named, bundled sound", () => {
  for (const id of ["find", "coins", "magic-item", "pickup"]) {
    assert.ok(Object.hasOwn(SOUNDS, id), id);
  }
});

test("finding coin or a magic item plays the find's sound; an ordinary find is silent until taken", () => {
  const session = FifthSession.begin(7, findsYard, BEA);
  const [woodpile, butt, cart] = play(
    session,
    examine("woodpile"),
    examine("water-butt"),
    examine("handcart"),
  );
  // The dagger and the scroll: the scroll makes it a find worth sounding.
  assert.match(
    woodpile.lines.at(-1).text,
    /You find the Dagger and Sealed Parchment\.$/u,
  );
  assert.equal(woodpile.lines.at(-1).sound, "find");
  assert.match(butt.lines.at(-1).text, /You find the Lost Purse\.$/u);
  assert.equal(butt.lines.at(-1).sound, "find");
  assert.match(
    cart.lines.at(-1).text,
    /You find the Azurite and Silver Ring\.$/u,
  );
  assert.ok(cart.lines.every(({ sound }) => sound === undefined));
});

test("taking coin clinks, a magic item chimes and an ordinary item is picked up", () => {
  const session = FifthSession.begin(7, findsYard, BEA);
  play(
    session,
    examine("woodpile"),
    examine("water-butt"),
    examine("handcart"),
    examine("trough"),
  );
  const taken = play(
    session,
    take("lost-purse"),
    take("yard-dagger"),
    take("yard-scroll"),
    take("yard-potion"),
    take("yard-sword"),
    take("yard-ring"),
  );
  assert.deepEqual(
    taken.map((card) => card.lines.map(({ sound }) => sound)),
    [
      ["coins"],
      ["pickup"],
      ["magic-item"],
      ["magic-item"],
      ["magic-item"],
      ["pickup"],
    ],
  );
  assert.deepEqual(sounded(taken[0]), [
    ["You take the Lost Purse and put 5 sp in your purse.", "coins"],
  ]);
});

test("buying, selling and selling a treasure clink coin", () => {
  const session = FifthSession.begin(7, findsYard, BEA);
  play(session, examine("handcart"), take("yard-ring"));
  // The ring's price buys the dagger, which is sold back.
  const cards = play(
    session,
    { type: "sell-treasure", itemId: "yard-ring" },
    { type: "buy", itemId: "dagger" },
    { type: "sell", itemId: "dagger" },
  );
  for (const card of cards) {
    assert.deepEqual(
      card.lines.map(({ sound }) => sound),
      ["coins"],
      card.text,
    );
  }
});

test("items a creature gives or a check reveals sound as found ones do", () => {
  // Told through the runtime's own lookup: reaching a surrender's gift or a
  // check band's reveal in play takes a module of its own (#238, #281).
  const runtime = createFifthRuntime(findsYard, BEA);
  const { state } = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice(),
  );
  const talked = (given) => ({
    type: "talked",
    topicId: "mercy",
    creature: "Pedlar",
    words: '"Take it."',
    given,
  });
  const revealed = (itemId, name) => ({ type: "revealed", itemId, name });
  const lines = describeFifthResult(
    {
      state,
      events: [
        talked(["Dagger", "Sealed Parchment"]),
        talked(["Lost Purse"]),
        talked(["Azurite"]),
        revealed("yard-potion", "Potion of Healing"),
        revealed("lost-purse", "Lost Purse"),
        revealed("cart-gem", "Azurite"),
      ],
    },
    [],
    "Bea",
    runtime.lineLookup,
  );
  assert.deepEqual(
    lines.map(({ sound }) => sound),
    ["find", "find", undefined, "find", "find", undefined],
  );
});

test("paying a toll clinks coin", () => {
  const runtime = createFifthRuntime(banditToll, { ...BEA, purse: 200 });
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    dice(),
  ).state;
  // Bea's reaction roll of 2 + 3 leaves the bandit unfriendly.
  const facing = runtime.handleAction(
    begun,
    { type: "move", destinationId: "rat-cellar" },
    dice([6, 1], [6, 1]),
  ).state;
  const sounds = (action) =>
    describeFifthResult(
      runtime.handleAction(facing, action, dice()),
      [],
      "Bea",
      runtime.lineLookup,
    ).map(({ text, sound }) => [text.split(".")[0], sound]);
  assert.deepEqual(sounds({ type: "react", option: "toll" }), [
    ["You pay the toll of 5 sp", "coins"],
  ]);
});

test("talking, moving and fighting lines carry no item sound", () => {
  const session = FifthSession.begin(7, findsYard, BEA);
  const cards = play(
    session,
    { type: "talk", topicId: "the-barrow" },
    { type: "move", destinationId: "cellar" },
  );
  for (const card of cards) {
    assert.ok(
      card.lines.every(({ sound }) => sound === undefined),
      card.text,
    );
  }
});

test("a line's sound plays before the sounds its rolls ask for", () => {
  const line = {
    text: "You take the Lost Purse.",
    sound: "coins",
    rolls: [
      {
        purpose: "check",
        roller: "Bea",
        label: "Athletics check",
        dice: [{ sides: 20, value: 12 }],
        modifier: 2,
        total: 14,
        dc: 12,
        outcome: "success",
      },
    ],
  };
  assert.deepEqual(
    resultSounds({
      character: "Bea",
      cards: [{ kind: "result", text: line.text, lines: [line] }],
    }),
    ["coins", "dice", "success"],
  );
});

test("a saved line keeps its sound; an unknown sound, an older save and an older trace are refused", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-484-"));
  try {
    const path = join(directory, "session.json");
    const session = await FifthSession.create(
      path,
      "c".repeat(32),
      7,
      findsYard,
      BEA,
    );
    play(session, take("yard-potion"));
    await session.persist();
    const loaded = await FifthSession.load(path, [findsYard]);
    assert.deepEqual(loaded.history, session.history);
    const file = JSON.parse(await readFile(path, "utf8"));
    assert.equal(file.formatVersion, FIFTH_SESSION_FORMAT);
    assert.equal(file.history.at(-1).cards[0].lines[0].sound, "magic-item");

    // An unknown sound, or a field no line has, is refused.
    for (const change of [
      { sound: "fanfare" },
      { sound: 3 },
      { sound: null },
      { volume: 1 },
    ]) {
      const tampered = structuredClone(file);
      Object.assign(tampered.history.at(-1).cards[0].lines[0], change);
      await writeFile(path, JSON.stringify(tampered));
      await assert.rejects(
        FifthSession.load(path, [findsYard]),
        /Invalid adventure session/u,
      );
    }

    const tracePath = join(directory, "trace.json");
    const trace = JSON.stringify({
      kind: "dungeon-one-5e-trace",
      formatVersion: 56,
    });
    await writeFile(tracePath, trace);
    await assert.rejects(
      verifyFifthTraceFile(tracePath, [findsYard]),
      new RegExp(
        String.raw`trace\.json is a trace in format version 56, not ${FIFTH_TRACE_FORMAT}\. This build cannot replay it\. Move it aside; the file has not been changed\.`,
        "u",
      ),
    );
    assert.equal(await readFile(tracePath, "utf8"), trace);

    const older = { ...file, formatVersion: 62 };
    await writeFile(path, JSON.stringify(older));
    await assert.rejects(
      FifthSession.load(path, [findsYard]),
      new RegExp(
        String.raw`session\.json is an adventure session in format version 62, not ${FIFTH_SESSION_FORMAT}\. This build cannot continue it\. Move it aside; the file has not been changed\.`,
        "u",
      ),
    );
    assert.equal(await readFile(path, "utf8"), JSON.stringify(older));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
