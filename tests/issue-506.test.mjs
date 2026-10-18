// #506: the settings file beside the library, its refusals, the server's
// settings routes, each adventure's frozen copy, and carrying capacity, the
// first setting.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_SETTINGS,
  FifthSettingsStore,
  SETTINGS,
  SETTINGS_FORMAT,
  settingsPathFor,
} from "../dist/settings-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { buildCharacter, characterCarrying } from "../dist/character-5e.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { FifthSession, FIFTH_SESSION_FORMAT } from "../dist/session-5e.js";
import { buyItem } from "../dist/equipment-5e.js";
import { armoury, barrowFile } from "./fixtures/armoury-barrow.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import { withLibrary } from "./fixtures/library.mjs";

const withDirectory = async (run) => {
  const directory = await mkdtemp(join(tmpdir(), "issue-506-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const settingsFile = (settings, extra = {}) =>
  JSON.stringify({
    kind: "dungeon-one-settings",
    formatVersion: SETTINGS_FORMAT,
    settings,
    ...extra,
  });

test("the defaults are today's game: carrying capacity Strength × 15 lb", () => {
  assert.equal(DEFAULT_SETTINGS.carryingCapacity, 15);
  assert.deepEqual(
    SETTINGS.carryingCapacity.choices.map(({ value }) => value),
    [5, 10, 15, 20, "unlimited"],
  );
});

test("the settings file sits beside the library; with none, every setting is at its default", async () =>
  withDirectory(async (directory) => {
    const path = settingsPathFor(join(directory, "characters.json"));
    assert.equal(path, join(directory, "settings.json"));
    assert.deepEqual(
      await new FifthSettingsStore(path).read(),
      DEFAULT_SETTINGS,
    );
  }));

test("a change is saved and read back; reset puts every default back", async () =>
  withDirectory(async (directory) => {
    const path = join(directory, "settings.json");
    const store = new FifthSettingsStore(path);
    const unlimited = { ...DEFAULT_SETTINGS, carryingCapacity: "unlimited" };
    assert.deepEqual(
      await store.change("carryingCapacity", "unlimited"),
      unlimited,
    );
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), {
      kind: "dungeon-one-settings",
      formatVersion: SETTINGS_FORMAT,
      settings: unlimited,
    });
    assert.deepEqual(await new FifthSettingsStore(path).read(), unlimited);
    assert.deepEqual(await store.reset(), DEFAULT_SETTINGS);
    assert.deepEqual(await store.read(), DEFAULT_SETTINGS);
    await assert.rejects(store.change("carryingCapacity", 25), {
      message: "Carrying capacity has no such choice.",
    });
    await assert.rejects(store.change("gravity", 1), {
      message: "There is no such setting.",
    });
  }));

test("a setting missing from the file is at its default", async () =>
  withDirectory(async (directory) => {
    const path = join(directory, "settings.json");
    await writeFile(path, settingsFile({}));
    assert.deepEqual(
      await new FifthSettingsStore(path).read(),
      DEFAULT_SETTINGS,
    );
  }));

test("a malformed file, an unknown key, a bad value or another format version is refused, naming the file", async () =>
  withDirectory(async (directory) => {
    const path = join(directory, "settings.json");
    const refusedWith = async (bytes, problem) => {
      await writeFile(path, bytes);
      await assert.rejects(new FifthSettingsStore(path).read(), {
        message: `${path} is not a settings file this build can read: ${problem}. Move it aside to play at the default settings; the file has not been changed.`,
      });
      assert.equal(await readFile(path, "utf8"), bytes);
    };
    await refusedWith("{", "it is not valid JSON");
    await refusedWith(
      JSON.stringify({ kind: "other" }),
      "it is not a Dungeon One settings file",
    );
    await refusedWith(
      settingsFile({ gravity: 2 }),
      'it has an unknown setting "gravity"',
    );
    await refusedWith(
      settingsFile({ carryingCapacity: 12 }),
      "its carrying capacity is 12, which is not one of the choices",
    );
    await refusedWith(
      JSON.stringify({
        kind: "dungeon-one-settings",
        formatVersion: 2,
        settings: {},
      }),
      "it is in format version 2, not 1",
    );
    await refusedWith(
      settingsFile({}, { extra: true }),
      "it has fields a settings file doesn't",
    );
  }));

test("the browser server refuses to start with an invalid settings file", async () =>
  withDirectory(async (directory) => {
    const path = join(directory, "settings.json");
    await writeFile(path, settingsFile({ carryingCapacity: 12 }));
    await assert.rejects(
      startFifthBrowserServer({
        libraryPath: join(directory, "characters.json"),
        seed: 0,
        adventures: [validateModule(barrowFile)],
        qualifies: () => true,
      }),
      {
        message: new RegExp(
          `^${path.replace(/\\/g, "\\\\")} is not a settings file`,
        ),
      },
    );
  }));

const post = async (url, path, body) => {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

test("the server lists each setting with its default marked, validates changes, and starts each adventure on the settings of the moment", async () =>
  withLibrary(async (library, sheet, revision, directory) => {
    const barrow = validateModule(barrowFile);
    const server = await startFifthBrowserServer({
      libraryPath: library.path,
      seed: 0,
      adventures: [barrow],
      qualifies: () => true,
    });
    try {
      const shown = await (await fetch(`${server.url}/api/5e/settings`)).json();
      assert.equal(shown.adventureInProgress, false);
      assert.deepEqual(
        shown.settings.find(({ id }) => id === "carryingCapacity"),
        {
          id: "carryingCapacity",
          name: "Carrying capacity",
          text: SETTINGS.carryingCapacity.text,
          value: 15,
          choices: [
            { value: 5, label: "Strength × 5 lb" },
            { value: 10, label: "Strength × 10 lb" },
            { value: 15, label: "Strength × 15 lb", default: true },
            { value: 20, label: "Strength × 20 lb" },
            { value: "unlimited", label: "Unlimited" },
          ],
        },
      );
      // The page computes nothing: a value no setting offers is refused.
      const refused = await post(server.url, "/api/5e/settings", {
        id: "carryingCapacity",
        value: "15",
      });
      assert.equal(refused.status, 409);
      assert.equal(refused.body.error, "Carrying capacity has no such choice.");

      const changed = await post(server.url, "/api/5e/settings", {
        id: "carryingCapacity",
        value: 10,
      });
      assert.equal(changed.status, 200);
      const capacityOf = (body) =>
        body.settings.find(({ id }) => id === "carryingCapacity").value;
      assert.equal(capacityOf(changed.body), 10);
      // Str 17: the sheet between adventures uses the settings of the moment.
      const libraryNow = await (
        await fetch(`${server.url}/api/5e/library`)
      ).json();
      const capacity = sheet.abilities.strength * 10;
      assert.equal(libraryNow.characters[0].carrying.capacity, capacity);

      const started = await post(server.url, "/api/5e/adventures/start", {
        revision,
        characterId: sheet.id,
        adventureId: barrow.id,
      });
      assert.equal(started.status, 200, JSON.stringify(started.body));
      const sessionId = started.body.session.id;
      assert.equal(started.body.session.room.carrying.capacity, capacity);
      const saved = JSON.parse(
        await readFile(library.sessionPath(sessionId), "utf8"),
      );
      assert.equal(saved.formatVersion, FIFTH_SESSION_FORMAT);
      assert.deepEqual(saved.settings, {
        ...DEFAULT_SETTINGS,
        carryingCapacity: 10,
      });

      // A change during the adventure is saved, and the adventure keeps its own.
      const during = await post(server.url, "/api/5e/settings", {
        id: "carryingCapacity",
        value: "unlimited",
      });
      assert.equal(during.body.adventureInProgress, true);
      const reloaded = await post(server.url, "/api/5e/session", {
        sessionId,
      });
      assert.equal(reloaded.body.session.room.carrying.capacity, capacity);
      const reset = await post(server.url, "/api/5e/settings/reset", {});
      assert.deepEqual(
        reset.body.settings.map(({ value }) => value),
        Object.values(DEFAULT_SETTINGS),
      );
    } finally {
      await server.close();
    }
    // A restart reloads the adventure with its own copy.
    const restarted = await FifthSession.load(
      library.sessionPath((await library.read()).characters[0].session.id),
      [barrow],
    );
    assert.deepEqual(restarted.settings, {
      ...DEFAULT_SETTINGS,
      carryingCapacity: 10,
    });
    assert.equal(
      restarted.runtime.projectRoom(restarted.state).carrying.capacity,
      sheet.abilities.strength * 10,
    );
    void directory;
  }));

test("an older session file is refused with the move-aside message; one without its settings is invalid", async () =>
  withLibrary(async (library, sheet) => {
    const barrow = validateModule(barrowFile);
    const session = await FifthSession.create(
      join(library.path, "..", "session.json"),
      "c".repeat(32),
      1,
      barrow,
      sheet,
      { ...DEFAULT_SETTINGS, carryingCapacity: 20 },
    );
    const file = JSON.parse(await readFile(session.path, "utf8"));
    assert.deepEqual(file.settings, {
      ...DEFAULT_SETTINGS,
      carryingCapacity: 20,
    });
    await writeFile(
      session.path,
      JSON.stringify({ ...file, formatVersion: FIFTH_SESSION_FORMAT - 1 }),
    );
    await assert.rejects(FifthSession.load(session.path, [barrow]), {
      message: `${session.path} is an adventure session in format version ${FIFTH_SESSION_FORMAT - 1}, not ${FIFTH_SESSION_FORMAT}. This build cannot continue it. Move it aside; the file has not been changed.`,
    });
    const { settings, ...unset } = file;
    void settings;
    for (const broken of [
      unset,
      { ...file, settings: {} },
      { ...file, settings: { ...DEFAULT_SETTINGS, carryingCapacity: 12 } },
    ]) {
      await writeFile(session.path, JSON.stringify(broken));
      await assert.rejects(FifthSession.load(session.path, [barrow]), {
        message: `Invalid adventure session ${session.path}.`,
      });
    }
  }));

// A Fighter with Strength 5 and the mace kit (14 lb).
const weak = buildCharacter(
  "a".repeat(32),
  "Wren",
  [
    [6, 6, 4, 1],
    [4, 4, 4, 1],
    [4, 4, 4, 1],
    [3, 3, 3, 1],
    [3, 3, 3, 1],
    [2, 2, 1, 1],
  ],
  {
    placement: {
      strength: 5,
      dexterity: 1,
      constitution: 0,
      intelligence: 3,
      wisdom: 4,
      charisma: 2,
    },
    increase: { constitution: 2, intelligence: 1 },
    skills: ["athletics", "perception"],
    fightingStyle: "defense",
    kit: "mace",
    masteries: ["dagger", "mace", "shortsword"],
  },
);
const barrow = validateModule(armoury);
const takeMail = [
  { type: "begin" },
  { type: "examine", targetId: "scratched-lintel" },
  { type: "take", itemId: "lintel-mail" },
];

/** Plays `actions` under `settings`; returns the runtime and the last result. */
function play(settings, actions) {
  const runtime = createFifthRuntime(
    barrow,
    weak,
    {},
    {
      ...DEFAULT_SETTINGS,
      ...settings,
    },
  );
  let result = { state: runtime.createSession(), events: [] };
  for (const action of actions) {
    result = runtime.handleAction(result.state, action);
  }
  return { runtime, result };
}

test("taking past the chosen capacity is refused with the chosen numbers; unlimited never refuses for weight", () => {
  assert.equal(weak.abilities.strength, 5);
  // With a longsword and a shield taken first (23 lb), the mail is 78 lb.
  const armed = [
    ...takeMail.slice(0, 2),
    { type: "take", itemId: "lintel-longsword" },
    { type: "take", itemId: "lintel-shield" },
    takeMail[2],
  ];
  for (const [perStrength, actions, carried, capacity] of [
    [5, takeMail, 14, 25],
    [10, takeMail, 14, 50],
    [15, armed, 23, 75],
  ]) {
    const { result } = play({ carryingCapacity: perStrength }, actions);
    assert.deepEqual(result.rejection, {
      code: "too-heavy",
      reason: `The Chain Mail weighs 55 lb, and you carry ${carried} lb of the ${capacity} lb your Strength allows: drop something first.`,
    });
  }
  assert.equal(
    play({ carryingCapacity: 20 }, armed).result.rejection,
    undefined,
  );
  const strong = play({ carryingCapacity: 20 }, takeMail);
  assert.equal(strong.result.rejection, undefined);
  assert.deepEqual(strong.runtime.projectRoom(strong.result.state).carrying, {
    weight: 69,
    capacity: 100,
  });
  const unlimited = play({ carryingCapacity: "unlimited" }, [
    ...takeMail,
    { type: "take", itemId: "lintel-greatsword" },
  ]);
  assert.equal(unlimited.result.rejection, undefined);
  // No capacity is shown, to the player or the AI DM.
  assert.deepEqual(
    unlimited.runtime.projectRoom(unlimited.result.state).carrying,
    { weight: 75 },
  );
  assert.equal(
    unlimited.runtime.projectCharacterStatus(unlimited.result.state).carrying,
    "75 lb",
  );
  const begun = play(DEFAULT_SETTINGS, [{ type: "begin" }]);
  assert.equal(
    begun.runtime.projectCharacterStatus(begun.result.state).carrying,
    "14 lb of the 75 lb its Strength allows",
  );
});

test("buying past the chosen capacity is refused with the chosen numbers; the sheet's load follows the setting", () => {
  const holding = { equipment: ["leather", "mace"], stowed: [], purse: 10000 };
  assert.equal(
    buyItem(holding, "chain-shirt", { capacity: 30, other: 0 }).refusal.reason,
    "The chain shirt weighs 20 lb, and you carry 16 lb of the 30 lb your Strength allows: sell or drop something first.",
  );
  assert.equal(
    buyItem({ ...holding, purse: 200000 }, "plate", {
      capacity: Infinity,
      other: 0,
    }).refusal,
    undefined,
  );
  assert.deepEqual(characterCarrying(weak), { weight: 14, capacity: 75 });
  assert.deepEqual(characterCarrying(weak, 20), { weight: 14, capacity: 100 });
  assert.deepEqual(characterCarrying(weak, "unlimited"), { weight: 14 });
});
