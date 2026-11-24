import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  findableValue,
  loadBuiltInFifthAdventures,
} from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  actionButton,
  clickAction,
  fight,
  startAdventure,
} from "./fixtures/browser-journey.mjs";
import { readAda } from "./fixtures/save-files.mjs";
import { launch } from "./fixtures/session-layout.mjs";

const well = "well-of-the-hollow-moon";

test("the four floors hold increasingly valuable caches and monster encounters", async () => {
  const adventure = (await loadBuiltInFifthAdventures()).find(
    ({ id }) => id === well,
  );
  const floors = [0, -1, -2, -3].map((floor) =>
    adventure.rooms.filter((room) => room.floor === floor),
  );
  assert.deepEqual(
    floors.map((rooms) => rooms.length),
    [8, 8, 8, 8],
  );
  assert.deepEqual(
    floors.map((rooms) => findableValue({ rooms })),
    [28, 4000, 24000, 80000],
  );
  for (const rooms of floors) {
    assert.ok(rooms.some((room) => room.restSite));
    assert.ok(rooms.some((room) => room.exit));
    assert.ok(rooms.every((room) => room.creatures.length === 0));
  }
  assert.deepEqual(
    floors.map((rooms) =>
      rooms.flatMap(({ encounterId }) => {
        const fight = adventure.encounters.find(({ id }) => id === encounterId);
        return fight
          ? [fight.opponents.map(({ statBlock }) => statBlock.name)]
          : [];
      }),
    ),
    [
      [["Giant Rat", "Giant Rat"]],
      [["Giant Spider"], ["Giant Spider"]],
      [
        ["Wolf", "Dire Wolf"],
        ["Dire Wolf", "Dire Wolf"],
      ],
      [["Giant Spider", "Giant Spider"], ["Owlbear"]],
    ],
  );
});

async function expedition(t, seed) {
  const directory = await mkdtemp(join(tmpdir(), "hollow-moon-"));
  let server;
  let browser;
  t.after(async () => {
    await browser?.close();
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  });
  const libraryPath = join(directory, "characters.json");
  await copyFile(
    new URL("./fixtures/libraries/level-5-ada.json", import.meta.url),
    libraryPath,
  );
  server = await startFifthBrowserServer({
    libraryPath,
    seed,
    qualifies: () => true,
  });
  browser = await launch();
  const page = await browser.newPage();
  await page.goto(server.url);
  await page.locator("#characters .open-character").first().click();
  await startAdventure(page, well);
  const act = (action, target) => clickAction(page, action, target);
  async function move(...rooms) {
    for (const room of rooms) {
      await act("move", room);
    }
  }
  async function leave(title) {
    await page.locator("#leave-controls button").click();
    await page.locator("#confirm-leave").click();
    await page.locator("#ending").waitFor({ state: "visible" });
    assert.equal(await page.locator("#ending-title").innerText(), title);
    return (await readAda(libraryPath)).sheet;
  }
  return { page, act, move, leave };
}

test(
  "an early retreat from the well keeps only the rats' small change",
  { timeout: 180000 },
  async (t) => {
    const { page, act, move, leave } = await expedition(t, 24);
    await move("echo-lip", "gnawed-tithe-box");
    await fight(page);
    await act("examine", "chewed-drawer");
    await act("take", "rat-purse");
    await move("echo-lip", "well-mouth");
    const sheet = await leave("The well keeps its moon");
    assert.equal(sheet.purse, 28);
    assert.deepEqual(sheet.treasure, []);
  },
);

for (const walk of ["gauge", "filter"]) {
  test(
    `the ${walk} walk reaches the moon and banks the deep hoard on departure`,
    { timeout: 240000 },
    async (t) => {
      const { page, act, move, leave } = await expedition(t, 24);
      await move("echo-lip", "split-basin");
      if (walk === "gauge") {
        await act("take", "horn-scoop");
        await act("use-on", "fill-the-model-basin");
        await move("tilted-gauge");
        await act("examine", "read-the-water-marks");
        await move("lip-stair", "drip-landing", "white-seam");
        await act("examine", "wind-the-lure");
        await move("silk-curtain", "chalk-shelf", "siphon-bell");
      } else {
        await move(
          "dry-niche",
          "rope-rack",
          "lip-stair",
          "drip-landing",
          "white-seam",
          "blind-spout",
          "spider-loom",
        );
        await fight(page);
        await act("examine", "inner-filter");
        await act("take", "silver-mesh-comb");
      }
      await move(
        "sluice-stair",
        "sluice-foot",
        "rib-bridge",
        "high-rib",
        walk === "gauge" ? "daylight-fissure" : "wind-pocket",
        "chain-stair",
        "chain-foot",
        "stillwater-cell",
      );
      await act("examine", "float-cradle");
      await act("take", "brass-pilot-float");
      await page.reload();
      await page
        .locator("#room-title")
        .filter({ hasText: "Stillwater Cell" })
        .waitFor();
      await move("chain-foot", "moon-dial");
      assert.equal(await actionButton(page, "move", "balance-tube").count(), 0);
      await act("use-on", "pilot-cup");
      await move("balance-tube", "moon-cup");
      await act("examine", "twin-sockets");
      assert.equal(await actionButton(page, "take", "socket-coral").count(), 0);
      assert.equal(
        await actionButton(page, "take", "socket-tourmaline").count(),
        0,
      );
      await act("examine", "stone-cup");
      await act("take", "hollow-moon");
      await act("take", "socket-coral");
      await act("take", "socket-tourmaline");
      await move("balance-tube");
      await act("examine", "sight-through-the-pivot");
      assert.match(
        await page.locator("#log li").last().innerText(),
        /bare black stone/u,
      );
      if (walk === "gauge") {
        await move(
          "moon-dial",
          "chain-foot",
          "chain-stair",
          "daylight-fissure",
          "high-rib",
          "rib-bridge",
          "sluice-foot",
          "sluice-stair",
          "siphon-bell",
          "chalk-shelf",
          "silk-curtain",
          "drip-landing",
          "lip-stair",
          "split-basin",
          "echo-lip",
          "well-mouth",
        );
        await act("examine", "drop-a-pebble");
        assert.match(
          await page.locator("#log li").last().innerText(),
          /moon rests in your pack/u,
        );
      } else {
        await move("moon-dial", "blind-overflow");
      }
      const sheet = await leave("A moon in daylight");
      const prizes = ["hollow-moon", "socket-coral", "socket-tourmaline"];
      if (walk === "filter") {
        prizes.push("silver-mesh-comb");
      }
      assert.deepEqual(
        sheet.treasure.map(({ id }) => id).sort(),
        prizes.map((id) => `${well}/${id}`).sort(),
      );
    },
  );
}
