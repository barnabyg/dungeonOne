// #510: the DM model setting (one listed model, gpt-6-luna, the default),
// refused off the list in the settings file, the change route and a session
// file; a typed message uses the model its session's settings name; and the
// Settings page's sound controls, or their absence with sound off.
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
  OPENAI_DM_MODELS,
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

test("the DM model setting lists gpt-6-luna alone, the default the tools use", () => {
  assert.equal(OPENAI_DM_DEFAULT_MODEL, "gpt-6-luna");
  assert.equal(REEXPORTED, OPENAI_DM_DEFAULT_MODEL);
  assert.deepEqual(OPENAI_DM_MODELS, ["gpt-6-luna"]);
  assert.equal(SETTINGS.dmModel.name, "Dungeon Master model");
  assert.deepEqual(SETTINGS.dmModel.choices, [
    { value: "gpt-6-luna", label: "gpt-6-luna" },
  ]);
  assert.equal(DEFAULT_SETTINGS.dmModel, OPENAI_DM_DEFAULT_MODEL);
});

test("a settings file naming a model off the list is refused, naming the file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-510-"));
  try {
    const path = join(directory, "settings.json");
    await writeFile(
      path,
      JSON.stringify({
        kind: "dungeon-one-settings",
        formatVersion: SETTINGS_FORMAT,
        settings: { dmModel: "gpt-5.6-luna" },
      }),
    );
    await assert.rejects(new FifthSettingsStore(path).read(), {
      message: `${path} is not a settings file this build can read: its dungeon master model is "gpt-5.6-luna", which is not one of the choices. Move it aside to play at the default settings; the file has not been changed.`,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a session file naming a model off the list is invalid", async () =>
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
    await writeFile(
      session.path,
      JSON.stringify({
        ...file,
        settings: { ...file.settings, dmModel: "gpt-5.6-luna" },
      }),
    );
    await assert.rejects(FifthSession.load(session.path, [barrow]), {
      message: `Invalid adventure session ${session.path}.`,
    });
  }));

test("the change route refuses a model off the list; a typed message opens its session's model once", async () =>
  withLibrary(async (library, sheet, revision) => {
    const barrow = validateModule(barrowFile);
    const opened = [];
    const server = await startFifthBrowserServer({
      libraryPath: library.path,
      seed: 0,
      adventures: [barrow],
      qualifies: () => true,
      openDmModel: (model) => {
        opened.push(model);
        return {
          identity: { provider: "test", model },
          async respond() {
            return { text: `Answered by ${model}.` };
          },
        };
      },
    });
    try {
      assert.equal(server.dmAvailable, true);
      const shown = await (await fetch(`${server.url}/api/5e/settings`)).json();
      assert.deepEqual(
        shown.settings.find(({ id }) => id === "dmModel"),
        {
          id: "dmModel",
          name: "Dungeon Master model",
          text: SETTINGS.dmModel.text,
          value: "gpt-6-luna",
          choices: [
            { value: "gpt-6-luna", label: "gpt-6-luna", default: true },
          ],
        },
      );
      const refused = await post(server.url, "/api/5e/settings", {
        id: "dmModel",
        value: "gpt-5.6-luna",
      });
      assert.equal(refused.status, 409);
      assert.equal(
        refused.body.error,
        "Dungeon Master model has no such choice.",
      );

      const started = await post(server.url, "/api/5e/adventures/start", {
        revision,
        characterId: sheet.id,
        adventureId: barrow.id,
      });
      assert.equal(started.status, 200, JSON.stringify(started.body));
      const { id: sessionId } = started.body.session;
      // The session file records the model the adventure uses.
      const saved = JSON.parse(
        await readFile(library.sessionPath(sessionId), "utf8"),
      );
      assert.equal(saved.settings.dmModel, "gpt-6-luna");
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
          "Answered by gpt-6-luna.",
        );
        sequence = sent.body.session.sequence;
      }
      // Opened when first needed, and kept for the next message.
      assert.deepEqual(opened, ["gpt-6-luna"]);
    } finally {
      await server.close();
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
