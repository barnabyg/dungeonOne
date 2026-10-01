// Run with Node 24, passing the absolute path to a Playwright entry point.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { startBrowserServer } from "../../dist/browser-server.js";

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const directory = await mkdtemp(join(tmpdir(), "dungeon-99-browser-"));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const servers = [];
const pages = [];
const paths = [];
let expected;
let count = 0;
const model = {
  async respond(request) {
    count++;
    if ("reply" in request) {
      return {
        text: JSON.stringify({
          delivery: "steady",
          opening: "none",
          closing: "none",
          factIds: request.reply.approvedFacts.map(({ id }) => id),
        }),
      };
    }
    if (request.toolResults.length) {
      return { text: "Done." };
    }
    assert.equal(request.playerInput, expected.message);
    return { toolCalls: [{ ...expected.call, id: "selected" }] };
  },
};
const state = async (index) =>
  (await fetch(servers[index].url + "/api/state")).json();
const checkpoint = async (index) =>
  JSON.parse(await readFile(paths[index], "utf8")).checkpoint;
try {
  for (let i = 0; i < 2; i++) {
    paths.push(join(directory, i + ".json"));
    servers.push(
      await startBrowserServer({
        savePath: paths[i],
        seed: 0,
        apiKey: "test",
        dmModel: model,
      }),
    );
    const page = await browser.newPage();
    pages.push(page);
    page.on("pageerror", (error) => console.error("page", error));
    await page.goto(servers[i].url);
    await page
      .getByRole("button", { name: "Start adventure", exact: true })
      .click();
    await page.waitForFunction(
      () => document.getElementById("location").textContent === "Watch Yard",
    );
  }
  const stale = await browser.newPage();
  stale.on("pageerror", (error) => console.error("stale page", error));
  await stale.goto(servers[0].url);
  await stale.waitForFunction(
    () => document.getElementById("location").textContent === "Watch Yard",
  );
  const draft = "An unfinished question about the keeper";
  await pages[0].getByLabel("What do you do or ask?").fill(draft);
  await stale.getByLabel("What do you do or ask?").fill(draft);
  const routes = [
    ["talk", { speakerId: "iona", topicId: "brief", approach: "ask" }],
    ["move", { destinationId: "watch-loft" }],
    ["talk", { speakerId: "pell", topicId: "shift", approach: "persuade" }],
    ["move", { destinationId: "signal-records" }],
    ["inspect", { target: "setting-plate" }],
    ["search", { target: "setting-plate" }],
  ];
  for (const [name, args] of routes) {
    const view = await state(0);
    expected = view.actions.find(
      ({ call }) =>
        call.name === name &&
        JSON.stringify(JSON.parse(call.argumentsJson)) === JSON.stringify(args),
    );
    assert.ok(expected, name);
    if (name !== "move") {
      const target =
        name === "talk"
          ? view.scene.room.npcs.find(({ id }) => id === args.speakerId)
          : view.scene.room.features.find(({ id }) => id === args.target);
      await pages[0]
        .getByRole("button", { name: target.name, exact: true })
        .click();
    }
    const clickedResponse = pages[0].waitForResponse((response) =>
      response.url().endsWith("/api/turn"),
    );
    const buttonName =
      name === "move"
        ? view.scene.room.exits.find(
            ({ destinationId }) => destinationId === args.destinationId,
          ).name
        : expected.label;
    const button = pages[0].getByRole("button", {
      name: buttonName,
      exact: true,
    });
    // Native keyboard activation uses the same click handler.
    await button.focus();
    await button.press("Enter");
    const clicked = await (await clickedResponse).json();
    await pages[0].waitForFunction(
      () => !document.getElementById("send").disabled,
    );
    const typedResponse = pages[1].waitForResponse((response) =>
      response.url().endsWith("/api/turn"),
    );
    await pages[1].getByLabel("What do you do or ask?").fill(expected.message);
    await pages[1]
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    const typed = await (await typedResponse).json();
    await pages[1].waitForFunction(
      () => !document.getElementById("send").disabled,
    );
    assert.deepEqual(await checkpoint(0), await checkpoint(1));
    assert.equal(
      await pages[0].getByLabel("What do you do or ask?").inputValue(),
      draft,
    );
    assert.deepEqual(clicked.cards, typed.cards);
    assert.equal(clicked.reply, typed.reply);
    if (name === "talk") {
      assert.ok(
        await pages[0]
          .getByRole("heading", {
            name: "NPC dialogue · " + clicked.speaker,
            exact: true,
          })
          .count(),
      );
    }
  }
  assert.equal((await checkpoint(0)).randomPosition, 1);
  const before = await readFile(paths[0], "utf8");
  const calls = count;
  const rejection = stale.waitForResponse((response) =>
    response.url().endsWith("/api/turn"),
  );
  await stale.getByRole("button", { name: /Watch Loft/ }).click();
  const rejected = await rejection;
  assert.equal(rejected.status(), 409);
  await stale.waitForFunction(
    () =>
      document.getElementById("location").textContent ===
        "Signal Records Room" && !document.getElementById("send").disabled,
  );
  assert.match(
    await stale.locator("#feedback").textContent(),
    /no longer available/,
  );
  assert.equal(await readFile(paths[0], "utf8"), before);
  assert.equal(count, calls);
  assert.equal(
    await stale.getByLabel("What do you do or ask?").inputValue(),
    draft,
  );
  console.log(
    "Real Edge browser: keyboard travel, attributed dialogue, inspection, search and stale intent passed; clicked/typed checkpoints and RNG equal (one draw).",
  );
} finally {
  await browser.close();
  await Promise.all(servers.map((server) => server.close()));
  await rm(directory, { recursive: true, force: true });
}
