// #399: features and topics that change with flags. A feature may read
// differently while a flag is set (`changed`); its discovery and check stay
// as they were. A creature's topic may be offered only once a flag is set
// (`offeredWhile`) or only until one is (`offeredUntil`). The validator
// refuses unknown flags, and a topic that gives an item must stay there to
// ask: never withdrawn, and offered only once a flag set for sure is set.
// The room panel, the AI DM's scene and the offered actions follow the
// flags, and a reload replays them. Adventure 34.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FIFTH_ADVENTURE_FORMAT } from "../dist/adventure-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { FifthSession } from "../dist/session-5e.js";
import { TEST_FIGHTER } from "../dist/test-fighter-5e.js";
import { FifthTraceRun } from "../dist/trace-5e.js";
import { validateModule } from "./fixtures/bestiary.mjs";
import { uncheckedDice } from "./fixtures/engine-dice.mjs";
import { hermitTunnels, hermitTunnelsFile, room } from "./fixtures/modules.mjs";
import {
  mercyOf,
  surrenderingGoblinsJson,
} from "./fixtures/surrendering-goblins.mjs";

const MOVE = (destinationId) => ({ type: "move", destinationId });
const EXAMINE = (targetId) => ({ type: "examine", targetId });
const TALK = (topicId) => ({ type: "talk", topicId });

function accepted(runtime, state, action, ...rolls) {
  const result = runtime.handleAction(state, action, uncheckedDice(...rolls));
  assert.equal(result.rejection, undefined, result.rejection?.reason);
  return result;
}

/** The state at the foot of the stair, once the winch has been pulled. */
function raised(runtime) {
  const start = runtime.createSession();
  const alcove = accepted(runtime, start, MOVE("alcove")).state;
  const pulled = accepted(runtime, alcove, EXAMINE("rusted-winch")).state;
  return accepted(runtime, pulled, MOVE("stair-foot")).state;
}

const LANTERN =
  "A rusted lantern hangs from a hook by the stair, its glass cracked.";
const SWINGING =
  "The rusted lantern swings on its hook, still shaking from the portcullis.";

const lantern = (runtime, state) =>
  runtime.projectRoom(state).features.find(({ id }) => id === "rusted-lantern");
const hermitTopics = (runtime, state) =>
  runtime
    .projectRoom(state)
    .creatures.find(({ id }) => id === "hermit")
    .topics.map(({ id }) => id);
const offeredTalk = (runtime, state) =>
  runtime
    .projectActions(state)
    .filter(({ action, available }) => action === "talk" && available)
    .map(({ target }) => target.id);

test("the adventure format bumps", () => {
  assert.equal(FIFTH_ADVENTURE_FORMAT, 38);
});

// The validator.

test("a feature's changed description and a topic's offer are read", () => {
  const foot = room(hermitTunnels, "stair-foot");
  assert.deepEqual(foot.features[0].changed, {
    when: "portcullis-raised",
    description: SWINGING,
  });
  const [winch, cellar, weather] = foot.creatures[0].topics;
  assert.equal(winch.offeredUntil, "portcullis-raised");
  assert.equal(cellar.offeredWhile, "portcullis-raised");
  assert.equal("offeredWhile" in weather || "offeredUntil" in weather, false);
});

test("the validator refuses an unknown flag on a feature or a topic", () => {
  const cases = [
    [
      (module) =>
        (room(module, "stair-foot").features[0].changed.when = "no-such-flag"),
      /feature rusted-lantern names unknown flag no-such-flag\./u,
    ],
    [
      (module) =>
        (room(module, "stair-foot").creatures[0].topics[0].offeredUntil =
          "no-such-flag"),
      /topic hermit-winch names unknown flag no-such-flag\./u,
    ],
    [
      (module) =>
        (room(module, "stair-foot").creatures[0].topics[1].offeredWhile =
          "no-such-flag"),
      /topic hermit-cellar names unknown flag no-such-flag\./u,
    ],
  ];
  for (const [change, message] of cases) {
    const module = structuredClone(hermitTunnelsFile);
    change(module);
    assert.throws(() => validateModule(module), message);
  }
});

test("the validator refuses a malformed change or a topic offered while and until one flag", () => {
  const noWords = structuredClone(hermitTunnelsFile);
  delete room(noWords, "stair-foot").features[0].changed.description;
  assert.throws(() => validateModule(noWords), /changed/u);
  const both = structuredClone(hermitTunnelsFile);
  room(both, "stair-foot").creatures[0].topics[0].offeredWhile =
    "portcullis-raised";
  assert.throws(
    () => validateModule(both),
    /topic hermit-winch is offered while and until the same flag\./u,
  );
});

test("a feature or a topic alone uses a flag", () => {
  const module = structuredClone(hermitTunnelsFile);
  delete module.passages.find(({ id }) => id === "stair-to-cellar").openWhen;
  // The hermit's topics and the changed features still use it.
  assert.doesNotThrow(() => validateModule(module));
  for (const entry of room(module, "stair-foot").creatures[0].topics) {
    delete entry.offeredWhile;
    delete entry.offeredUntil;
  }
  delete room(module, "alcove").features.at(-1).changed;
  assert.doesNotThrow(() => validateModule(module));
  delete room(module, "stair-foot").features[0].changed;
  assert.throws(
    () => validateModule(module),
    /flag portcullis-raised is never used: a passage, a circumstance, an encounter, a feature or a topic must name it, or leave it out\./u,
  );
});

/** The surrendering goblins with a flag the lintel's reading sets. */
function giftingGoblins(change) {
  const module = structuredClone(surrenderingGoblinsJson);
  module.flags = ["lintel-read"];
  room(module, "barrow-mouth").features[0].sets = "lintel-read";
  change(module.encounters[0].opponents[0].surrender.topics[0], module);
  return module;
}

test("a topic that gives may wait on a flag set for sure", () => {
  const module = giftingGoblins((mercy) => {
    assert.equal(mercy.id, mercyOf("goblin-1"));
    mercy.offeredWhile = "lintel-read";
  });
  assert.doesNotThrow(() => validateModule(module));
});

test("a topic that gives is refused when it can be withdrawn or never offered", () => {
  const withdrawn = giftingGoblins((mercy) => {
    mercy.offeredUntil = "lintel-read";
  });
  assert.throws(
    () => validateModule(withdrawn),
    /topic goblin-1-mercy gives goblin-1-ring, but is withdrawn once flag lintel-read is set: what it gives could be lost\./u,
  );
  // Only fleeing the goblins sets it: never for sure.
  const unsure = giftingGoblins((mercy, module) => {
    delete room(module, "barrow-mouth").features[0].sets;
    module.encounters[0].sets = { fled: "lintel-read" };
    mercy.offeredWhile = "lintel-read";
  });
  assert.throws(
    () => validateModule(unsure),
    /topic goblin-1-mercy gives goblin-1-ring, but is offered only once flag lintel-read is set, which nothing sets for sure\./u,
  );
});

test("a topic's check counts toward reaching a room only while it is surely offered", () => {
  // A hidden way the hermit's answer opens is no sure route while he may
  // never be asked: an essential room behind it is refused.
  const module = structuredClone(hermitTunnelsFile);
  const topic = room(module, "stair-foot").creatures[0].topics[0];
  topic.check = { skill: "persuasion", dc: 5, bands: {} };
  topic.failure = "He shrugs.";
  const den = room(module, "den");
  module.passages.push({
    id: "stair-to-den",
    between: ["stair-foot", "den"],
    description: "A crawl behind the hermit's blanket.",
    hidden: true,
  });
  topic.check.bands = {
    success: { effects: [{ type: "open", passage: "stair-to-den" }] },
    "success-by-5": { effects: [{ type: "open", passage: "stair-to-den" }] },
    failure: { effects: [{ type: "open", passage: "stair-to-den" }] },
    "failure-by-5": { effects: [{ type: "open", passage: "stair-to-den" }] },
  };
  assert.ok(den.encounterId);
  // Without the way down through the cellar, the den is reached only by the
  // hermit's crawl.
  module.passages = module.passages.filter(({ id }) => id !== "cellar-to-den");
  module.passages.push({
    id: "cellar-to-alcove",
    between: ["rat-cellar", "alcove"],
    description: "A rat run.",
  });
  delete topic.offeredUntil;
  assert.doesNotThrow(() => validateModule(module));
  topic.offeredUntil = "portcullis-raised";
  assert.throws(
    () => validateModule(module),
    /room den is essential, but every route to it needs a check or passes a trap/u,
  );
});

// The runtime.

test("a feature reads differently once its flag is set; its discovery stays", () => {
  const runtime = createFifthRuntime(hermitTunnels, TEST_FIGHTER);
  const start = runtime.createSession();
  assert.equal(lantern(runtime, start).description, LANTERN);
  const looked = accepted(runtime, start, EXAMINE("rusted-lantern"));
  assert.equal(looked.events[0].description, LANTERN);
  const discovery = looked.events[0].discovery;
  assert.match(discovery, /Rats in the cellar/u);

  const after = raised(runtime);
  assert.equal(lantern(runtime, after).description, SWINGING);
  const again = accepted(runtime, after, EXAMINE("rusted-lantern"));
  assert.equal(again.events[0].description, SWINGING);
  assert.equal(again.events[0].discovery, discovery);
  // The winch the character pulled reads as pulled.
  const alcove = accepted(runtime, after, MOVE("alcove")).state;
  assert.equal(
    runtime.projectRoom(alcove).features.find(({ id }) => id === "rusted-winch")
      .description,
    "The rusted winch is wound tight, its chain taut.",
  );
});

test("a topic is gained once its flag is set, and another withdrawn", () => {
  const runtime = createFifthRuntime(hermitTunnels, TEST_FIGHTER);
  const start = runtime.createSession();
  assert.deepEqual(offeredTalk(runtime, start), [
    "hermit-winch",
    "hermit-weather",
  ]);
  assert.deepEqual(hermitTopics(runtime, start), [
    "hermit-winch",
    "hermit-weather",
  ]);
  const early = runtime.handleAction(start, TALK("hermit-cellar"));
  assert.equal(early.rejection.code, "no-topic");
  const asked = accepted(runtime, start, TALK("hermit-winch")).state;

  const alcove = accepted(runtime, asked, MOVE("alcove")).state;
  const pulled = accepted(runtime, alcove, EXAMINE("rusted-winch")).state;
  const after = accepted(runtime, pulled, MOVE("stair-foot")).state;
  assert.deepEqual(offeredTalk(runtime, after), [
    "hermit-cellar",
    "hermit-weather",
  ]);
  // The panel keeps what the hermit said about the winch.
  const topics = runtime
    .projectRoom(after)
    .creatures.find(({ id }) => id === "hermit").topics;
  assert.deepEqual(
    topics.map(({ id, said }) => [id, said]),
    [
      [
        "hermit-winch",
        "The winch in the alcove lifts the portcullis. Put your back into it.",
      ],
      ["hermit-cellar", undefined],
      ["hermit-weather", undefined],
    ],
  );
  const late = runtime.handleAction(after, TALK("hermit-winch"));
  assert.equal(late.rejection.code, "no-topic");
  const cellar = accepted(runtime, after, TALK("hermit-cellar"));
  assert.equal(
    cellar.events[0].words,
    "Now it's open, mind the rat. It bites.",
  );
});

test("a topic never asked and since withdrawn is gone from the panel", () => {
  const runtime = createFifthRuntime(hermitTunnels, TEST_FIGHTER);
  assert.deepEqual(hermitTopics(runtime, raised(runtime)), [
    "hermit-cellar",
    "hermit-weather",
  ]);
});

test("the AI DM's scene carries the current description and only offered topics", () => {
  const runtime = createFifthRuntime(hermitTunnels, TEST_FIGHTER);
  const scene = (state) => runtime.projectDmScene(state).room;
  const subjects = (state) =>
    scene(state)
      .npcs.find(({ id }) => id === "hermit")
      .subjects.map(({ id }) => id);
  const start = runtime.createSession();
  assert.equal(
    scene(start).features.find(({ id }) => id === "rusted-lantern").description,
    LANTERN,
  );
  assert.deepEqual(subjects(start), ["hermit-winch", "hermit-weather"]);
  const after = raised(runtime);
  assert.equal(
    scene(after).features.find(({ id }) => id === "rusted-lantern").description,
    SWINGING,
  );
  assert.deepEqual(subjects(after), ["hermit-cellar", "hermit-weather"]);
  const talk = runtime
    .getGameToolDefinitions(after)
    .find(({ name }) => name === "talk");
  const offered = JSON.stringify(talk);
  assert.ok(offered.includes("hermit-cellar"));
  assert.ok(!offered.includes("hermit-winch"));
});

test("a reload shows the changed feature and the topics offered now", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-399-"));
  try {
    const path = join(directory, "session.json");
    const run = new FifthTraceRun(
      await FifthSession.create(
        path,
        "a".repeat(32),
        3,
        hermitTunnels,
        TEST_FIGHTER,
      ),
    );
    for (const action of [
      MOVE("alcove"),
      EXAMINE("rusted-winch"),
      MOVE("stair-foot"),
    ]) {
      const { result } = run.click(action);
      assert.equal(result.rejection, undefined, result.rejection?.reason);
    }
    await run.session.persist();
    const loaded = await FifthSession.load(path, [hermitTunnels]);
    const runtime = createFifthRuntime(hermitTunnels, TEST_FIGHTER);
    assert.equal(lantern(runtime, loaded.state).description, SWINGING);
    assert.deepEqual(offeredTalk(runtime, loaded.state), [
      "hermit-cellar",
      "hermit-weather",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
