// #480, the launcher: --no-sound is a flag without a value that turns sound
// off, so the page has no sound controls and no sound file is served.
import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchDefault } from "./fixtures/default-launch.mjs";

const cli = fileURLToPath(new URL("../dist/browser-cli.js", import.meta.url));

test("the launcher's --no-sound turns sound off, and is a flag without a value", async () => {
  const directory = await mkdtemp(join(tmpdir(), "issue-480-launch-"));
  try {
    const run = (args) =>
      spawnSync(process.execPath, [cli, ...args], {
        cwd: directory,
        encoding: "utf8",
        env: { ...process.env, OPENAI_API_KEY: "" },
        timeout: 10000,
      });
    assert.match(run(["--help"]).stdout, /\[--no-sound\]/u);
    for (const args of [
      ["--no-sound", "--no-sound"],
      ["--no-sound=yes"],
      ["--seed", "--no-sound"],
    ]) {
      const result = run(args);
      assert.equal(result.status, 2, args.join(" "));
      assert.match(result.stderr, /^Usage: /u, args.join(" "));
    }

    const launched = await launchDefault(directory, [
      "--no-sound",
      "--seed",
      "0",
    ]);
    try {
      const html = await (await fetch(launched.url)).text();
      assert.doesNotMatch(html, /sound-controls/u);
      assert.equal((await fetch(`${launched.url}/sounds/hit.wav`)).status, 404);
    } finally {
      await launched.stop();
    }
    const sounding = await launchDefault(directory, ["--seed", "0"]);
    try {
      const html = await (await fetch(sounding.url)).text();
      assert.match(html, /id="sound-controls"/u);
    } finally {
      await sounding.stop();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
