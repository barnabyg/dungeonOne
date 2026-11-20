// The DM's model and thinking level (#510, #587): the model list fetched from
// OpenAI and filtered to the models the DM can use, a model or level off the
// offer refused, the file taking any well-formed model id, a typed message
// using its session's model and level; and the Settings page's sound
// controls, or their absence with sound off.
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
} from "../dist/settings-5e.js";
import {
  OPENAI_DM_DEFAULT_MODEL,
  dmModelChoices,
} from "../dist/openai-dm-models.js";
import { OPENAI_DM_DEFAULT_MODEL as REEXPORTED } from "../dist/openai-dm-model.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { fifthBrowserHtml } from "../dist/browser-5e-page.js";
import { FifthSession } from "../dist/session-5e.js";
import { barrowFile } from "./fixtures/armoury-barrow.mjs";
import { validateModule } from "./fixtures/bestiary.mjs";
import { withLibrary } from "./fixtures/library.mjs";

const post = async (url, path, body) => {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

// OpenAI's model list for one account in November 2026, abridged.
const LISTED_MODELS = [
  "chat-latest",
  "chatgpt-image-latest",
  "gpt-4.1",
  "gpt-4.1-2025-04-14",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4o-mini-transcribe",
  "gpt-4o-mini-tts",
  "gpt-4o-transcribe-diarize",
  "gpt-5",
  "gpt-5-2025-08-07",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-pro",
  "gpt-5-pro-2025-10-06",
  "gpt-5-search-api",
  "gpt-5.1",
  "gpt-5.2",
  "gpt-5.2-pro",
  "gpt-5.3-codex",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.4-pro",
  "gpt-5.5",
  "gpt-5.5-pro",
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-6-astra",
  "gpt-6-luna",
  "gpt-6-sol",
  "gpt-6.1-sol",
  "gpt-6.1-terra",
  "gpt-6.2-astra",
  "gpt-6.2-sol",
  "gpt-audio",
  "gpt-audio-1.5",
  "gpt-audio-mini",
  "gpt-image-1-mini",
  "gpt-image-2",
  "gpt-image-2.5-flare",
  "gpt-live-1",
  "gpt-live-transcribe",
  "gpt-realtime",
  "gpt-realtime-2.1-mini",
  "gpt-realtime-translate",
  "gpt-realtime-whisper",
  "gpt-transcribe",
  "o3",
  "o3-2025-04-16",
  "omni-moderation-latest",
  "text-embedding-3-large",
  "tts-1",
  "tts-1-hd",
  "whisper-1",
];

const fakeModel = (opened) => (model, effort) => {
  opened.push([model, effort]);
  return {
    identity: { provider: "test", model },
    async respond() {
      return { text: `Answered by ${model} at ${effort ?? "default"}.` };
    },
  };
};

const dmModelView = async (url) =>
  (await (await fetch(`${url}/api/5e/settings`)).json()).settings.find(
    ({ id }) => id === "dmModel",
  );

test("the DM is offered GPT 5 and later and the o series, newest first, without specialist models (#587)", () => {
  assert.equal(OPENAI_DM_DEFAULT_MODEL, "gpt-6-luna");
  assert.equal(REEXPORTED, OPENAI_DM_DEFAULT_MODEL);
  assert.equal(DEFAULT_SETTINGS.dmModel, OPENAI_DM_DEFAULT_MODEL);
  assert.equal(DEFAULT_SETTINGS.dmReasoning, "default");
  assert.deepEqual(dmModelChoices(LISTED_MODELS), [
    "gpt-6.2-astra",
    "gpt-6.2-sol",
    "gpt-6.1-sol",
    "gpt-6.1-terra",
    "gpt-6-astra",
    "gpt-6-luna",
    "gpt-6-sol",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "o3",
  ]);
  assert.deepEqual(
    dmModelChoices(["o4-mini", "o1-pro", "x", "gpt-5", "gpt-5"]),
    ["gpt-5", "o4-mini"],
  );
  assert.deepEqual(
    SETTINGS.dmReasoning.choices.map(({ value }) => value),
    ["default", "none", "low", "medium", "high", "xhigh", "max"],
  );
});

test("a settings file may name any well-formed model, but not a malformed one", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dm-model-settings-"));
  try {
    const path = join(directory, "settings.json");
    const write = (settings) =>
      writeFile(
        path,
        JSON.stringify({
          kind: "dungeon-one-settings",
          formatVersion: SETTINGS_FORMAT,
          settings,
        }),
      );
    await write({ dmModel: "gpt-5.6-luna", dmReasoning: "high" });
    const read = await new FifthSettingsStore(path).read();
    assert.equal(read.dmModel, "gpt-5.6-luna");
    assert.equal(read.dmReasoning, "high");
    await write({ dmModel: "GPT 5!" });
    await assert.rejects(new FifthSettingsStore(path).read(), {
      message: `${path} is not a settings file this build can read: its dungeon master model is "GPT 5!", which is not one of the choices. Move it aside to play at the default settings; the file has not been changed.`,
    });
    await write({ dmReasoning: "minimal" });
    await assert.rejects(new FifthSettingsStore(path).read(), {
      message:
        /its dungeon master thinking is "minimal", which is not one of the choices/u,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a session file with a malformed model, or no thinking level, is invalid", async () =>
  withLibrary(async (library, sheet) => {
    const barrow = validateModule(barrowFile);
    const session = await FifthSession.create(
      join(library.path, "..", "session.json"),
      "c".repeat(32),
      1,
      barrow,
      sheet,
      DEFAULT_SETTINGS,
    );
    const file = JSON.parse(await readFile(session.path, "utf8"));
    assert.equal(file.settings.dmModel, "gpt-6-luna");
    assert.equal(file.settings.dmReasoning, "default");
    const withoutReasoning = { ...file.settings };
    delete withoutReasoning.dmReasoning;
    for (const settings of [
      { ...file.settings, dmModel: "not a model" },
      withoutReasoning,
    ]) {
      await writeFile(session.path, JSON.stringify({ ...file, settings }));
      await assert.rejects(FifthSession.load(session.path, [barrow]), {
        message: `Invalid adventure session ${session.path}.`,
      });
    }
  }));

test("Settings offers the listed models as a menu; a typed message uses its session's model and thinking level (#587)", async () =>
  withLibrary(async (library, sheet, revision) => {
    const barrow = validateModule(barrowFile);
    const opened = [];
    let lists = 0;
    const server = await startFifthBrowserServer({
      libraryPath: library.path,
      seed: 0,
      adventures: [barrow],
      qualifies: () => true,
      openDmModel: fakeModel(opened),
      listDmModels: async () => {
        lists += 1;
        return LISTED_MODELS;
      },
    });
    try {
      assert.equal(server.dmAvailable, true);
      const model = await dmModelView(server.url);
      assert.equal(model.menu, true);
      assert.equal(model.note, undefined);
      assert.equal(model.value, "gpt-6-luna");
      assert.deepEqual(model.choices.slice(0, 2), [
        { value: "gpt-6.2-astra", label: "gpt-6.2-astra" },
        { value: "gpt-6.2-sol", label: "gpt-6.2-sol" },
      ]);
      assert.deepEqual(
        model.choices.find(({ value }) => value === "gpt-6-luna"),
        { value: "gpt-6-luna", label: "gpt-6-luna", default: true },
      );
      assert.equal(model.choices.length, 20);

      for (const value of ["gpt-4.1", "gpt-image-2", "gpt-9"]) {
        const refused = await post(server.url, "/api/5e/settings", {
          id: "dmModel",
          value,
        });
        assert.equal(refused.status, 409);
        assert.equal(
          refused.body.error,
          "Dungeon Master model has no such choice.",
        );
      }
      const thinking = await post(server.url, "/api/5e/settings", {
        id: "dmReasoning",
        value: "minimal",
      });
      assert.equal(thinking.status, 409);
      assert.equal(
        thinking.body.error,
        "Dungeon Master thinking has no such choice.",
      );

      for (const [id, value] of [
        ["dmModel", "gpt-5.4-mini"],
        ["dmReasoning", "high"],
      ]) {
        const changed = await post(server.url, "/api/5e/settings", {
          id,
          value,
        });
        assert.equal(changed.status, 200, JSON.stringify(changed.body));
      }
      // Fetched once for the launch.
      assert.equal(lists, 1);

      const started = await post(server.url, "/api/5e/adventures/start", {
        revision,
        characterId: sheet.id,
        adventureId: barrow.id,
      });
      assert.equal(started.status, 200, JSON.stringify(started.body));
      const { id: sessionId } = started.body.session;
      const saved = JSON.parse(
        await readFile(library.sessionPath(sessionId), "utf8"),
      );
      assert.equal(saved.settings.dmModel, "gpt-5.4-mini");
      assert.equal(saved.settings.dmReasoning, "high");
      assert.deepEqual(opened, []);

      let sequence = started.body.session.sequence;
      for (const message of ["I look around", "I listen"]) {
        const sent = await post(server.url, "/api/5e/session/message", {
          sessionId,
          sequence,
          message,
        });
        assert.equal(sent.status, 200, JSON.stringify(sent.body));
        assert.equal(
          sent.body.session.history.at(-1).reply,
          "Answered by gpt-5.4-mini at high.",
        );
        sequence = sent.body.session.sequence;
      }
      // Opened when first needed, and kept for the next message.
      assert.deepEqual(opened, [["gpt-5.4-mini", "high"]]);
    } finally {
      await server.close();
    }
  }));

test("without a key, or when the list fails, Settings offers the default and the current model and says why (#587)", async () =>
  withLibrary(async (library) => {
    const noKey = await startFifthBrowserServer({
      libraryPath: library.path,
      seed: 0,
      adventures: [validateModule(barrowFile)],
      qualifies: () => true,
    });
    try {
      const model = await dmModelView(noKey.url);
      assert.deepEqual(model.choices, [
        { value: "gpt-6-luna", label: "gpt-6-luna", default: true },
      ]);
      assert.equal(
        model.note,
        "Set OPENAI_API_KEY and restart to choose from OpenAI's models.",
      );
    } finally {
      await noKey.close();
    }

    let fail = true;
    const failing = await startFifthBrowserServer({
      libraryPath: library.path,
      seed: 0,
      adventures: [validateModule(barrowFile)],
      qualifies: () => true,
      openDmModel: fakeModel([]),
      listDmModels: async () => {
        if (fail) {
          throw new Error("offline");
        }
        return ["gpt-5"];
      },
    });
    try {
      assert.equal(
        (await dmModelView(failing.url)).note,
        "OpenAI's model list could not be loaded. Open Settings again to retry.",
      );
      fail = false;
      const model = await dmModelView(failing.url);
      assert.equal(model.note, undefined);
      assert.deepEqual(
        model.choices.map(({ value }) => value),
        ["gpt-5", "gpt-6-luna"],
      );
    } finally {
      await failing.close();
    }
  }));

test("the Settings page has the sound controls, or with sound off says so and has none", () => {
  const on = fifthBrowserHtml(true);
  assert.match(
    on,
    /<section id="settings"[^]*<fieldset id="settings-sound"[^]*id="settings-sound-on" type="checkbox"[^]*id="settings-sound-volume" type="range" min="0" max="100" step="5"[^]*id="settings-list"/u,
  );
  const off = fifthBrowserHtml(false);
  assert.match(
    off,
    /<fieldset id="settings-sound"[^>]*><legend>Sound<\/legend><p id="settings-sound-text" class="hint">Sound is off for this launch\./u,
  );
  assert.doesNotMatch(off, /settings-sound-on|settings-sound-volume/u);
});

// What each model takes, as a probe would learn it (#589).
const MODEL_EFFORTS = {
  "gpt-6-luna": ["none", "low", "medium", "high", "xhigh", "max"],
  "gpt-6.2-astra": ["low", "medium", "high", "xhigh", "max"],
  o3: ["low", "medium", "high"],
};

const levelsView = async (url) =>
  (await (await fetch(`${url}/api/5e/settings`)).json()).settings.find(
    ({ id }) => id === "dmReasoning",
  );

test("Settings offers each model only the thinking levels it takes, and a model change drops a level it doesn't (#589)", async () =>
  withLibrary(async (library) => {
    const probed = [];
    const server = await startFifthBrowserServer({
      libraryPath: library.path,
      seed: 0,
      adventures: [validateModule(barrowFile)],
      qualifies: () => true,
      openDmModel: fakeModel([]),
      listDmModels: async () => LISTED_MODELS,
      probeDmEfforts: async (model) => {
        probed.push(model);
        return MODEL_EFFORTS[model];
      },
    });
    const change = (id, value) =>
      post(server.url, "/api/5e/settings", { id, value });
    try {
      const levels = await levelsView(server.url);
      assert.deepEqual(
        levels.choices.map(({ value }) => value),
        ["default", "none", "low", "medium", "high", "xhigh", "max"],
      );
      assert.equal(levels.choices.at(-1).label, "Maximum");
      assert.equal(levels.note, undefined);

      // None is fine on gpt-6-luna; gpt-6.2-astra doesn't take it.
      assert.equal((await change("dmReasoning", "none")).status, 200);
      const moved = await change("dmModel", "gpt-6.2-astra");
      assert.equal(moved.status, 200, JSON.stringify(moved.body));
      assert.equal(
        moved.body.notice,
        "Dungeon Master model: gpt-6.2-astra. Saved. It doesn't take None, so Dungeon Master thinking is back to Model default.",
      );
      const after = moved.body.settings.find(({ id }) => id === "dmReasoning");
      assert.equal(after.value, "default");
      assert.deepEqual(
        after.choices.map(({ value }) => value),
        ["default", "low", "medium", "high", "xhigh", "max"],
      );
      const refused = await change("dmReasoning", "none");
      assert.equal(refused.status, 409);
      assert.equal(
        refused.body.error,
        "Dungeon Master thinking has no such choice.",
      );

      // A level the new model takes is kept, with no notice.
      assert.equal((await change("dmReasoning", "high")).status, 200);
      const kept = await change("dmModel", "o3");
      assert.equal(kept.body.notice, undefined);
      assert.equal(
        kept.body.settings.find(({ id }) => id === "dmReasoning").value,
        "high",
      );
      assert.equal((await change("dmReasoning", "max")).status, 409);
      // Each model is probed once for the launch.
      assert.deepEqual(probed, ["gpt-6-luna", "gpt-6.2-astra", "o3"]);
    } finally {
      await server.close();
    }
  }));

test("a model whose levels can't be learned offers them all with a note, and is probed again; a saved level the model rejects is shown with a warning (#589)", async () =>
  withLibrary(async (library) => {
    const directory = join(library.path, "..");
    await writeFile(
      join(directory, "settings.json"),
      JSON.stringify({
        kind: "dungeon-one-settings",
        formatVersion: SETTINGS_FORMAT,
        settings: { dmModel: "gpt-6.2-astra", dmReasoning: "none" },
      }),
    );
    let fail = true;
    const probed = [];
    const server = await startFifthBrowserServer({
      libraryPath: library.path,
      seed: 0,
      adventures: [validateModule(barrowFile)],
      qualifies: () => true,
      openDmModel: fakeModel([]),
      listDmModels: async () => LISTED_MODELS,
      probeDmEfforts: async (model) => {
        probed.push(model);
        if (fail) {
          throw new Error("offline");
        }
        return MODEL_EFFORTS[model];
      },
    });
    try {
      const unknown = await levelsView(server.url);
      assert.equal(unknown.choices.length, 7);
      assert.equal(
        unknown.note,
        "This model's thinking levels couldn't be checked; a level it doesn't take will stop the Dungeon Master answering.",
      );
      fail = false;
      const known = await levelsView(server.url);
      assert.deepEqual(
        known.choices.map(({ value }) => value),
        ["default", "none", "low", "medium", "high", "xhigh", "max"],
      );
      assert.equal(known.value, "none");
      assert.equal(
        known.note,
        "gpt-6.2-astra doesn't take None: typed messages will fail until you choose another level.",
      );
      assert.deepEqual(probed, ["gpt-6.2-astra", "gpt-6.2-astra"]);
      // Choosing a level it takes clears the warning and drops None.
      const fixed = await post(server.url, "/api/5e/settings", {
        id: "dmReasoning",
        value: "low",
      });
      const levels = fixed.body.settings.find(({ id }) => id === "dmReasoning");
      assert.equal(levels.note, undefined);
      assert.equal(
        levels.choices.some(({ value }) => value === "none"),
        false,
      );
    } finally {
      await server.close();
    }
  }));
