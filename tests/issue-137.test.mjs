// #137: 5e is the browser's only mode. The default launch serves the 5e
// library; --legacy, --5e, --save and --artwork are refused with a message;
// an old library or adventure file is refused and left byte-identical; and
// the launcher loads no pre-5e module.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { FIFTH_DM_SETUP_HINT } from "../dist/browser-5e-server.js";
import { FifthCharacterLibrary } from "../dist/character-library-5e.js";
import { startFifthAdventure } from "../dist/session-5e.js";
import { launchDefault } from "./fixtures/default-launch.mjs";

// A pre-5e character library, as the deleted pre-5e game wrote it (#139).
const PRE_5E_LIBRARY = JSON.stringify({
  kind: "dungeon-one-characters",
  formatVersion: 1,
  revision: "0".repeat(32),
  characters: [{ id: "a".repeat(32), name: "Ada" }],
});

const cli = fileURLToPath(new URL("../dist/browser-cli.js", import.meta.url));

const CHOICES = {
  placement: {
    strength: 0,
    dexterity: 1,
    constitution: 2,
    intelligence: 3,
    wisdom: 4,
    charisma: 5,
  },
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
};

const withDirectory = async (work) => {
  const directory = await mkdtemp(join(tmpdir(), "issue-137-"));
  try {
    await work(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const run = (cwd, args) =>
  spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, OPENAI_API_KEY: "" },
    timeout: 10000,
  });

const post = async (url, path, body) => {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { Origin: url, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

test("the default launch serves the 5e library at characters.json and prints the AI DM hint", async () =>
  withDirectory(async (directory) => {
    const launched = await launchDefault(directory, ["--seed", "0"]);
    try {
      assert.ok(launched.output().startsWith(FIFTH_DM_SETUP_HINT));
      assert.match(
        launched.output(),
        /Keep this launcher running\. Press Ctrl\+C to stop; your characters and adventures are saved\./,
      );
      assert.doesNotMatch(launched.output(), /Hollow Beacon|save slot/);
      const page = await (await fetch(launched.url)).text();
      assert.doesNotMatch(page, /5E PREVIEW/);
      const created = await post(launched.url, "/api/5e/creation", {});
      assert.equal(created.status, 200);
      const library = JSON.parse(
        await readFile(join(directory, "characters.json"), "utf8"),
      );
      // Only a 5e library holds rolled dice for a pending creation.
      assert.equal(library.pendingCreation.dice.length, 6);
    } finally {
      await launched.stop();
    }
    assert.deepEqual(await readdir(directory), ["characters.json"]);
  }));

test("an OpenAI key turns the AI DM hint off", async () =>
  withDirectory(async (directory) => {
    const launched = await launchDefault(
      directory,
      ["--seed", "0"],
      "test-credential",
    );
    try {
      assert.ok(!launched.output().includes(FIFTH_DM_SETUP_HINT));
    } finally {
      await launched.stop();
    }
  }));

test("the removed flags are refused with a message and nothing is read or written", async () =>
  withDirectory(async (directory) => {
    // Old files at the old defaults stay exactly as they were.
    const oldSave = join(directory, "hollow-beacon-browser-save.json");
    await writeFile(oldSave, '{"old":"slot"}');
    for (const [args, message] of [
      [["--legacy"], /--legacy has been removed.*pre-5e game/s],
      [["--5e", "--seed", "0"], /--5e is no longer needed.*only mode/s],
      [["--seed", "0", "--5e"], /--5e is no longer needed/],
      [["--save", oldSave], /--save has been removed/],
      [["--artwork", "art.json"], /--artwork has been removed/],
    ]) {
      const result = run(directory, args);
      assert.equal(result.status, 2, args.join(" "));
      assert.match(result.stderr, message, args.join(" "));
      assert.match(result.stderr, /Nothing was read or changed\./);
      assert.match(result.stderr, /Usage: npm\.cmd run browser/);
      assert.equal(result.stdout, "");
    }
    assert.deepEqual(await readdir(directory), [
      "hollow-beacon-browser-save.json",
    ]);
    assert.equal(await readFile(oldSave, "utf8"), '{"old":"slot"}');
  }));

test("help describes only the 5e browser", () => {
  const result = spawnSync(process.execPath, [cli, "--help"], {
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--characters <library\.json>/);
  assert.match(result.stdout, /Default library: characters\.json/);
  assert.match(result.stdout, /characters-adventures/);
  assert.doesNotMatch(result.stdout, /--legacy|--5e|--save|--artwork/);
});

test("a pre-5e library at the default path is refused at launch and left byte-identical", async () =>
  withDirectory(async (directory) => {
    const libraryPath = join(directory, "characters.json");
    await writeFile(libraryPath, PRE_5E_LIBRARY);
    const before = await readFile(libraryPath);
    const result = run(directory, ["--seed", "0"]);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes(resolve(libraryPath)));
    assert.match(
      result.stderr,
      /pre-5e character library \(format version 1\).*Move it aside/,
    );
    assert.equal(result.stdout, "");
    assert.deepEqual(await readFile(libraryPath), before);
    assert.deepEqual((await readdir(directory)).sort(), ["characters.json"]);
  }));

test("an adventure saved in an older format is refused when opened and left byte-identical", async () =>
  withDirectory(async (directory) => {
    const libraryPath = join(directory, "characters.json");
    const library = new FifthCharacterLibrary(libraryPath, 0);
    const pending = await library.startCreation();
    const saved = await library.create("Ada", CHOICES, pending.revision);
    const delve = (await loadBuiltInFifthAdventures()).find(
      ({ id }) => id === "abandoned-delve",
    );
    const session = await startFifthAdventure(
      library,
      0,
      saved.characters[0].sheet.id,
      delve,
      saved.revision,
    );
    const sessionPath = library.sessionPath(session.id);
    assert.equal(
      dirname(sessionPath),
      join(directory, "characters-adventures"),
    );
    const file = JSON.parse(await readFile(sessionPath, "utf8"));
    file.formatVersion = 3;
    await writeFile(sessionPath, JSON.stringify(file));
    const before = await readFile(sessionPath);
    const libraryBefore = await readFile(libraryPath);

    const launched = await launchDefault(directory, ["--seed", "0"]);
    try {
      const opened = await post(launched.url, "/api/5e/session", {
        sessionId: session.id,
      });
      assert.equal(opened.status, 409);
      assert.ok(opened.body.error.includes(sessionPath));
      assert.match(
        opened.body.error,
        /format version 3, not \d+\. This build cannot continue it\. Move it aside; the file has not been changed\./,
      );
    } finally {
      await launched.stop();
    }
    assert.deepEqual(await readFile(sessionPath), before);
    assert.deepEqual(await readFile(libraryPath), libraryBefore);
  }));
