// Fixes for the first issue 95 playtest
// (docs/acceptance/issue-95-sessions/player-01.md): click options and the
// character-mode page explain themselves in plain language.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadAdventure } from "../dist/adventure-loader.js";
import { browserActions } from "../dist/browser-actions.js";
import { createCharacter } from "../dist/character-rules.js";
import { createDataRuntime } from "../dist/data-runtime.js";
import { SaveSession } from "../dist/save.js";

const adventure = async (file) =>
  loadAdventure(
    await readFile(
      fileURLToPath(new URL(`../adventures/${file}`, import.meta.url)),
    ),
  ).adventure;

async function withSession(file, commands, body) {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-95-ui-"));
  try {
    const runtime = createDataRuntime(
      await adventure(file),
      createCharacter("Ada", "balanced"),
    );
    const session = await SaveSession.start(
      join(directory, "save.json"),
      runtime,
      0,
    );
    for (const command of commands) {
      await session.commit(command, runtime.parseCommand(command));
    }
    await body(browserActions(session, "test"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const V13 = "hollow-beacon-examine.json";

test("character mode: a person you are not fighting offers no Attack click", () =>
  withSession(V13, [], (actions) => {
    const iona = actions.filter(({ contextId }) => contextId === "npc:iona");
    assert.ok(iona.length > 0);
    assert.ok(!iona.some(({ call }) => call.name === "attack"));
  }));

test("character mode: an ability check is offered as a plain one-try roll", () =>
  withSession(V13, [], (actions) => {
    const check = actions.find(
      ({ call }) =>
        call.name === "check_ability" &&
        JSON.parse(call.argumentsJson).checkId === "read-beacon",
    );
    assert.equal(check.label, "Roll Wisdom");
    // The message the AI receives is unchanged.
    assert.equal(check.message, "Try the wisdom check at beacon lamp");
    assert.doesNotMatch(check.stakes, /DC|pending|preserves|once per/);
    assert.match(check.stakes, /d20/);
    assert.match(check.stakes, /12 or more/);
    assert.match(check.stakes, /one try/i);
    assert.match(check.stakes, /20 XP/);
  }));

test("character mode: a route with a fight on arrival names the route", () =>
  withSession(V13, [], (actions) => {
    const ridge = actions.find(
      ({ call }) =>
        call.name === "move" &&
        JSON.parse(call.argumentsJson).destinationId === "ridge-trail",
    );
    assert.match(ridge.stakes, /Ridge Trail/);
    assert.match(ridge.stakes, /fight/);
    assert.doesNotMatch(ridge.stakes, /Combat on arrival/);
  }));

test("character mode: the opponent you are fighting can still be attacked by click", () =>
  withSession(
    V13,
    [
      "move valley-road",
      "move ridge-shelter",
      "move drainage-walk",
      "move beacon-tower",
      "attack vey",
    ],
    (actions) => {
      assert.ok(
        actions.some(
          ({ call }) =>
            call.name === "attack" &&
            JSON.parse(call.argumentsJson).opponent_id === "vey",
        ),
      );
    },
  ));

test("--legacy content keeps its released options", () =>
  withSession("hollow-beacon-finale.json", [], (actions) => {
    assert.ok(
      actions.some(
        ({ contextId, call }) =>
          contextId === "npc:iona" && call.name === "attack",
      ),
    );
  }));
