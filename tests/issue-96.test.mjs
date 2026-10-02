import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { request } from "node:http";
import { createConnection } from "node:net";
import test from "node:test";
import { startBrowserServer } from "../dist/browser-server.js";
import { SaveSession } from "../dist/save.js";
import { announceBrowser } from "../dist/browser-launch.js";

test("a local player starts an empty slot and reads the same verified state after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-96-"));
  const savePath = join(directory, "slot.json");
  let server;
  try {
    server = await startBrowserServer({
      savePath,
      seed: 0,
      apiKey: "test-credential",
    });
    const initial = await (await fetch(`${server.url}/api/state`)).json();
    assert.equal(initial.slot, "empty");
    const response = await fetch(`${server.url}/api/start`, {
      method: "POST",
      headers: { Origin: server.url },
    });
    assert.equal(response.status, 200);
    const view = await response.json();
    assert.equal(view.slot, "occupied");
    assert.equal(view.seed, 0);
    assert.equal(view.scene.room.name, "Watch Yard");
    assert.equal(view.hp.current, 20);
    assert.equal(view.hp.maximum, 20);
    assert.deepEqual(view.clocks, [
      {
        id: "caravan-deadline",
        name: "Caravan Deadline",
        unit: "day",
        value: 0,
      },
    ]);
    assert.equal(view.deadline.day, 3);
    assert.deepEqual(
      view.scene.room.exits.map((exit) => exit.destinationId),
      [
        "refugee-camp",
        "keeper-path",
        "ridge-trail",
        "valley-road",
        "watch-loft",
      ],
    );
    const saved = await SaveSession.load(savePath);
    assert.equal(saved.runtime.version, "4");
    assert.deepEqual(view.scene, saved.runtime.projectDmScene(saved.state));
    const before = await readFile(savePath, "utf8");
    await server.close();
    server = await startBrowserServer({
      savePath,
      seed: 99,
      apiKey: "test-credential",
    });
    assert.deepEqual(await (await fetch(`${server.url}/api/state`)).json(), {
      ...view,
      newGameSeed: 99,
    });
    await fetch(`${server.url}/api/start`, {
      method: "POST",
      headers: { Origin: server.url },
    });
    assert.equal(await readFile(savePath, "utf8"), before);
  } finally {
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

async function withSlot(body) {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-96-"));
  const savePath = join(directory, "slot.json");
  let server;
  try {
    server = await startBrowserServer({
      savePath,
      seed: 0,
      apiKey: "test-private-credential",
    });
    await body(server, savePath);
  } finally {
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test("unrelated origins and hosts cannot start a slot; GET never starts it", () =>
  withSlot(async (server, savePath) => {
    for (const headers of [
      {},
      { Origin: "https://unrelated.example" },
      { Origin: "null" },
      { Origin: server.url, "Sec-Fetch-Site": "cross-site" },
    ]) {
      assert.equal(
        (await fetch(`${server.url}/api/start`, { method: "POST", headers }))
          .status,
        403,
      );
    }
    const hostStatus = await new Promise((resolve, reject) => {
      const call = request(
        `${server.url}/api/start`,
        {
          method: "POST",
          headers: { Origin: server.url, Host: "unrelated.example" },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      call.on("error", reject);
      call.end();
    });
    assert.equal(hostStatus, 403);
    assert.equal((await fetch(`${server.url}/api/start`)).status, 404);
    assert.equal(
      (await (await fetch(`${server.url}/api/state`)).json()).slot,
      "empty",
    );
    await assert.rejects(readFile(savePath), { code: "ENOENT" });
  }));

test("two simultaneous starts preserve one complete verified save", () =>
  withSlot(async (server, savePath) => {
    const views = await Promise.all(
      Array.from({ length: 4 }, async () => {
        const response = await fetch(`${server.url}/api/start`, {
          method: "POST",
          headers: { Origin: server.url },
        });
        assert.equal(response.status, 200);
        return response.json();
      }),
    );
    assert.equal(views[0].slot, "occupied");
    for (const view of views) {
      assert.deepEqual(view, views[0]);
    }
    assert.equal(
      (await SaveSession.load(savePath)).state.locationId,
      "watch-yard",
    );
  }));

test("a read reflects authoritative later progress, time, and closed exits without exposing internals", () =>
  withSlot(async (server, savePath) => {
    await fetch(`${server.url}/api/start`, {
      method: "POST",
      headers: { Origin: server.url },
    });
    const saved = await SaveSession.load(savePath);
    await saved.commit(
      "wait days 3",
      saved.runtime.parseCommand("wait days 3"),
    );
    const response = await fetch(`${server.url}/api/state`);
    const body = await response.text();
    const view = JSON.parse(body);
    assert.equal(view.clocks[0].value, 3);
    assert.equal(view.scene.room.name, "Watch Yard");
    assert.equal(
      view.scene.room.exits.some(
        (exit) => exit.destinationId === "ridge-trail",
      ),
      false,
    );
    assert.deepEqual(view.scene, saved.runtime.projectDmScene(saved.state));
    for (const hidden of [
      "test-private-credential",
      "stateDigest",
      "checkpoint",
      "contentVersion",
      "guardedFactIds",
      "pell-approved-setting",
      "thresholds",
      "transitions",
      savePath,
    ]) {
      assert.equal(body.includes(hidden), false, hidden);
    }
    for (const path of ["/", "/app.js", "/app.css"]) {
      const asset = await fetch(server.url + path);
      assert.equal(asset.status, 200);
      assert.equal(
        (await asset.text()).includes("test-private-credential"),
        false,
      );
      assert.match(
        asset.headers.get("content-security-policy"),
        /frame-ancestors 'none'/,
      );
    }
    for (const path of [
      "/slot.json",
      "/adventures/hollow-beacon-watch.json",
      "/../save.json",
    ]) {
      assert.equal((await fetch(server.url + path)).status, 404);
    }
  }));

test("invalid occupied saves fail safely and are never replaced", () =>
  withSlot(async (server, savePath) => {
    await writeFile(savePath, "broken save with private content");
    const response = await fetch(`${server.url}/api/start`, {
      method: "POST",
      headers: { Origin: server.url },
    });
    assert.equal(response.status, 500);
    assert.equal((await response.text()).includes("private content"), false);
    assert.equal(
      await readFile(savePath, "utf8"),
      "broken save with private content",
    );
    await assert.rejects(
      startBrowserServer({ savePath, seed: 0, apiKey: "test" }),
    );
  }));

test("exclusive initial save creation also protects a different adventure in an occupied slot", () =>
  withSlot(async (server, savePath) => {
    const { loadAdventureFile } = await import("../dist/adventure-file.js");
    const { createDataRuntime } = await import("../dist/data-runtime.js");
    const loaded = await loadAdventureFile(
      fileURLToPath(
        new URL("../adventures/chapel-clues.json", import.meta.url),
      ),
    );
    assert.equal(loaded.ok, true);
    await SaveSession.start(savePath, createDataRuntime(loaded.adventure), 42, {
      exclusive: true,
    });
    const before = await readFile(savePath, "utf8");
    const response = await fetch(`${server.url}/api/start`, {
      method: "POST",
      headers: { Origin: server.url },
    });
    assert.equal(response.status, 500);
    assert.equal(await readFile(savePath, "utf8"), before);
    await assert.rejects(
      startBrowserServer({ savePath, seed: 0, apiKey: "test" }),
      /occupied slot was left unchanged/,
    );
  }));

test("missing configuration leaves no save and reports a clear setup error", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-96-"));
  const savePath = join(directory, "slot.json");
  try {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../dist/browser-cli.js", import.meta.url)),
        "--legacy",
        "--seed",
        "0",
        "--save",
        savePath,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, OPENAI_API_KEY: "" },
        timeout: 5000,
      },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /OPENAI_API_KEY.*before starting/);
    assert.equal(result.stdout, "");
    await assert.rejects(readFile(savePath), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a failed browser opener leaves an already printed usable URL", async () => {
  let output = "";
  await announceBrowser(
    "http://127.0.0.1:12345",
    (message) => {
      output += message;
    },
    async (url) => {
      assert.match(output, /http:\/\/127\.0\.0\.1:12345/);
      assert.equal(url, "http://127.0.0.1:12345");
      throw new Error("opener failed");
    },
  );
  assert.match(output, /Could not open.*http:\/\/127\.0\.0\.1:12345/);
});

test(
  "browser shutdown closes speculative connections without waiting for a request",
  { timeout: 2000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "dungeon-issue-96-"));
    let server;
    let socket;
    try {
      server = await startBrowserServer({
        savePath: join(directory, "slot.json"),
        seed: 0,
        apiKey: "test",
      });
      socket = createConnection({
        host: "127.0.0.1",
        port: Number(new URL(server.url).port),
      });
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });
      await server.close();
      server = undefined;
    } finally {
      socket?.destroy();
      await server?.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("browser help and invalid arguments leave ordinary CLI help available", () => {
  for (const [args, status] of [
    [["--help"], 0],
    [["--seed", "-1"], 2],
    [["--save", "--seed", "0"], 2],
    [["--model", "unused"], 2],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("../dist/browser-cli.js", import.meta.url)),
        ...args,
      ],
      {
        encoding: "utf8",
        timeout: 5000,
        env: { ...process.env, OPENAI_API_KEY: "" },
      },
    );
    assert.equal(result.status, status);
  }
  const cli = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../dist/cli.js", import.meta.url)), "--help"],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(cli.status, 0);
  assert.match(cli.stdout, /--resume/);
});
