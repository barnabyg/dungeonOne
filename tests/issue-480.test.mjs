// #480, server: every bundled sound has a recorded source and licence, a CC
// BY one is credited in Settings, and the server serves exactly the named
// sound files while sound is on. Launched with sound off, the page has no
// sound controls and no sound file is served.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { SOUNDS, soundCredits } from "../dist/sounds-5e.js";
import { loneGoblin } from "./fixtures/modules.mjs";

const LICENCES = ["CC0 1.0", "CC BY 3.0", "CC BY 4.0"];

async function withServer(options, work) {
  const directory = await mkdtemp(join(tmpdir(), "issue-480-"));
  const server = await startFifthBrowserServer({
    libraryPath: join(directory, "characters.json"),
    seed: 0,
    adventures: [loneGoblin],
    qualifies: () => true,
    ...options,
  });
  try {
    await work(server.url);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("every sound is a short, small file with its source and licence", async () => {
  // The reply-ready tone was removed: the owner found it irritating in play.
  assert.equal(Object.hasOwn(SOUNDS, "reply-ready"), false);
  for (const [id, sound] of Object.entries(SOUNDS)) {
    assert.ok(sound.source.length > 0, id);
    assert.ok(LICENCES.includes(sound.licence), `${id}: ${sound.licence}`);
    if (sound.licence !== "CC0 1.0") {
      assert.ok(sound.author, `${id} needs an author to credit`);
    }
    const { size } = await stat(
      new URL(`../sounds/${sound.file}`, import.meta.url),
    );
    // The longest, the long rest's lute phrase (3.2 s), is about 140 KB.
    assert.ok(size > 44 && size <= 150 * 1024, `${id}: ${size} bytes`);
  }
});

test("Settings credits each CC BY sound's author, and no CC0 one", () => {
  assert.equal(
    soundCredits({
      bell: { file: "bell.wav", source: "x", licence: "CC0 1.0" },
      clang: {
        file: "clang.ogg",
        source: "y",
        licence: "CC BY 4.0",
        author: "Rowan",
      },
      thud: {
        file: "thud.ogg",
        source: "z",
        licence: "CC BY 4.0",
        author: "Ash",
      },
      creak: {
        file: "creak.ogg",
        source: "w",
        licence: "CC BY 3.0",
        author: "Ash",
      },
    }),
    "Sounds by Ash under CC BY 3.0. Sounds by Ash, Rowan under CC BY 4.0.",
  );
  assert.equal(
    soundCredits({ bell: { file: "b.wav", source: "x", licence: "CC0 1.0" } }),
    "",
  );
});

test("with sound on, the header has its controls and the server serves only the named sounds", async () =>
  withServer({}, async (url) => {
    const page = await fetch(url);
    // Audio from the page's own server is allowed, and nothing else.
    assert.match(
      page.headers.get("content-security-policy"),
      /(^|; )media-src 'self'(;|$)/u,
    );
    const html = await page.text();
    assert.match(html, /<header class="masthead">.*id="sound-controls"/su);
    assert.match(html, /id="sound-mute"[^>]*aria-pressed="false"/u);
    assert.match(html, /id="sound-volume"[^>]*type="range"/u);
    assert.match(
      html,
      /<section id="credits"[^>]*><h3[^>]*>Credits<\/h3><p class="hint">Icons by /u,
    );
    assert.ok(html.includes(soundCredits()));

    for (const sound of Object.values(SOUNDS)) {
      const served = await fetch(`${url}/sounds/${sound.file}`);
      assert.equal(served.status, 200, sound.file);
      assert.equal(served.headers.get("content-type"), "audio/wav");
      assert.deepEqual(
        Buffer.from(await served.arrayBuffer()),
        await readFile(new URL(`../sounds/${sound.file}`, import.meta.url)),
      );
    }
    for (const path of [
      "/sounds/missing.wav",
      "/sounds/reply-ready.wav",
      "/sounds/../package.json",
      "/sounds/%2e%2e/package.json",
      "/sounds/",
    ]) {
      assert.equal((await fetch(`${url}${path}`)).status, 404, path);
    }
  }));

test("with sound off, the page has no sound controls and no sound is served", async () =>
  withServer({ sound: false }, async (url) => {
    const html = await (await fetch(url)).text();
    assert.doesNotMatch(html, /sound-controls|sound-mute|sound-volume/u);
    assert.equal(
      (await fetch(`${url}/sounds/hit-bludgeoning.wav`)).status,
      404,
    );
  }));
