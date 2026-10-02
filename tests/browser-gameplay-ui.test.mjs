import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { startBrowserServer } from "../dist/browser-server.js";
import { browserActionModel } from "./fixtures/browser-action-model.mjs";

const pixel =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1EAAAAASUVORK5CYII=";

test(
  "narrative emphasis is styled safely and restores without rewriting saved prose",
  { timeout: 30000 },
  () =>
    withPage(
      async ({ page, savePath }) => {
        const original = JSON.parse(
          await readFile(savePath, "utf8"),
        ).checkpoint;
        const response = page.waitForResponse((r) =>
          r.url().endsWith("/api/turn"),
        );
        await page.locator("#message").fill("Describe where I am");
        await page.locator("#message").press("Enter");
        const result = await (await response).json();
        assert.equal(result.committed, false);
        await idle(page);
        const reply = page.locator("#conversation .reply p");
        const visible = await reply.innerText();
        assert.match(visible, /Watch Yard.*dark.*look closely/s);
        assert.doesNotMatch(visible, /\*\*/);
        assert.deepEqual(await reply.locator("strong").allTextContents(), [
          "Watch Yard",
          "look closely",
          '<img src=x onerror="window.emphasisInjected=1">',
        ]);
        assert.equal(
          await reply.locator("em.text-emphasis").innerText(),
          "dark",
        );
        assert.equal(
          await reply.locator("strong em").innerText(),
          "look closely",
        );
        assert.ok(
          await reply
            .locator("strong")
            .first()
            .evaluate(
              (element) => Number(getComputedStyle(element).fontWeight) >= 600,
            ),
        );
        assert.equal(await reply.locator("img,script,a").count(), 0);
        assert.equal(
          await page.evaluate(() => window.emphasisInjected),
          undefined,
        );
        const saved = await readFile(savePath, "utf8");
        const parsed = JSON.parse(saved);
        assert.equal(parsed.browserHistory.turns.at(-1).reply, result.reply);
        assert.match(result.reply, /\*\* Watch Yard \*\*/);
        assert.deepEqual(parsed.checkpoint, original);
        await page.reload();
        await idle(page);
        assert.equal(await reply.innerText(), visible);
        assert.equal(await reply.locator("img,script,a").count(), 0);
        assert.equal(await readFile(savePath, "utf8"), saved);
      },
      "11",
      async () => ({
        dmModel: {
          async respond() {
            return {
              text: 'You are at ** Watch Yard **. The lamp is *dark*; ***look closely***. **<img src=x onerror="window.emphasisInjected=1">** remains literal text. An unmatched * stays visible.',
            };
          },
        },
      }),
    ),
);

const idle = (page) =>
  page.waitForFunction(
    () =>
      document.getElementById("conversation").getAttribute("aria-busy") ===
      "false",
  );
const view = async (server) => (await fetch(server.url + "/api/state")).json();
async function turn(page, button) {
  const response = page.waitForResponse((r) => r.url().endsWith("/api/turn"));
  await button.click();
  const result = await (await response).json();
  await idle(page);
  return result;
}
async function closePanel(page) {
  if (await page.locator("#information").isVisible()) {
    await page.locator("#close-information").click();
  }
}
async function travel(page, destination) {
  await closePanel(page);
  const result = await turn(
    page,
    page.locator("#exits").getByRole("button", {
      name: destination,
      exact: true,
    }),
  );
  assert.equal(result.committed, true);
  return result;
}
async function targetAction(page, target, action) {
  await closePanel(page);
  await page.getByRole("button", { name: target, exact: true }).click();
  return turn(
    page,
    page.locator("#context-actions").getByRole("button", {
      name: action,
      exact: true,
    }),
  );
}
async function withPage(
  run,
  contentVersion = "11",
  prepare = async () => ({}),
) {
  const directory = await mkdtemp(join(tmpdir(), "dungeon-gameplay-ui-"));
  const savePath = join(directory, "slot.json");
  const { model, controls } = browserActionModel(savePath);
  let browser, server;
  try {
    const options = await prepare(directory);
    server = await startBrowserServer({
      seed: 0,
      savePath,
      apiKey: "offline-ui",
      dmModel: model,
      ...(contentVersion === "11" ? { contentVersion } : {}),
      ...options,
    });
    browser = await chromium.launch(
      process.platform === "win32" ? { channel: "msedge" } : {},
    );
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(server.url);
    await idle(page);
    await page.locator("#start").click();
    await idle(page);
    await run({ page, server, savePath, browser, controls });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  }
}

test(
  "scene, genuine dialogue choices and Journal views remain readable without spending actions",
  { timeout: 30000 },
  () =>
    withPage(async ({ page, server, savePath, controls }) => {
      assert.match(
        await page.locator("#scene-summary").textContent(),
        /beacon.*dark.*caravan.*day 3/i,
      );
      assert.doesNotMatch(
        await page.locator("#description").textContent(),
        /Clocks:|\/14/,
      );
      assert.match(
        await page.locator("#deadline").textContent(),
        /Day 3.*3 days remaining/,
      );
      assert.equal(await page.locator("#time").textContent(), "Day 0");
      assert.equal(await page.locator("#seed").isVisible(), false);
      assert.equal(await page.locator("#feedback").isVisible(), false);
      assert.ok(
        (await page.locator("#conversation").boundingBox()).height >= 180,
      );
      const before = JSON.parse(await readFile(savePath, "utf8")).checkpoint;
      await page
        .getByRole("button", { name: "Captain Iona", exact: true })
        .click();
      const choices = await page
        .locator("#context-actions button")
        .allTextContents();
      assert.equal(choices[0], "Ask about the beacon and watch leads");
      assert.ok(!choices.some((choice) => choice.startsWith("Persuade: Ask")));
      assert.ok(
        choices.includes("Persuade: Claim the familiar signal is safe"),
      );
      assert.equal(choices.at(-1), "Attack (1 action)");
      assert.equal(await page.locator("#context-actions .danger").count(), 1);
      await page.keyboard.press("Escape");
      for (const panel of ["inventory", "character", "journal"]) {
        await page.locator("#open-" + panel).click();
        assert.equal(
          await page
            .locator("#information-title")
            .evaluate((e) => e === document.activeElement),
          true,
        );
        if (panel === "inventory") {
          assert.doesNotMatch(
            await page.locator("#information-body").innerText(),
            /No equipment|camp dressing/,
          );
        }
        if (panel === "character") {
          assert.match(
            await page.locator("#information-body").innerText(),
            /Fighter.*HP: 20.*AC 16/s,
          );
        }
        if (panel === "journal") {
          assert.match(
            await page.locator("#information-body").innerText(),
            /Observed evidence/,
          );
          await page.locator("#open-leads").click();
          assert.match(
            await page.locator("#information-body").innerText(),
            /Current leads.*setting plate/s,
          );
          assert.doesNotMatch(
            await page.locator("#information-body").innerText(),
            /Observed evidence|Testimony leads/,
          );
        }
        await page.keyboard.press("Escape");
        assert.equal(
          await page
            .locator("#open-" + panel)
            .evaluate((e) => e === document.activeElement),
          true,
        );
      }
      assert.equal(controls.calls, 0);
      assert.deepEqual(
        JSON.parse(await readFile(savePath, "utf8")).checkpoint,
        before,
      );
      assert.equal((await view(server)).position, 0);
    }),
);

test(
  "carried-item actions and persistent combat controls commit once and restore through reload",
  { timeout: 60000 },
  () =>
    withPage(async ({ page, server, savePath, browser }) => {
      await travel(page, "Watch Loft (0 days)");
      await travel(page, "Signal Records Room (0 days)");
      assert.equal(
        (await targetAction(page, "beacon setting plate", "Search")).committed,
        true,
      );
      assert.equal(
        (await targetAction(page, "spare signal component", "Take")).committed,
        true,
      );
      await page.locator("#open-inventory").click();
      assert.match(
        await page.locator("#information-body").innerText(),
        /spare signal component/,
      );
      const beforeInspect = JSON.parse(
        await readFile(savePath, "utf8"),
      ).checkpoint;
      const inspected = await turn(
        page,
        page
          .locator("#information-body")
          .getByRole("button", { name: "Inspect", exact: true }),
      );
      assert.equal(inspected.committed, false);
      assert.deepEqual(
        JSON.parse(await readFile(savePath, "utf8")).checkpoint,
        beforeInspect,
      );
      await travel(page, "Watch Loft (0 days)");
      await travel(page, "Watch Yard (0 days)");
      assert.match(
        await page.locator("#exits").innerText(),
        /Combat on arrival.*No retreat/s,
      );
      await travel(page, "Ridge Trail (2 days)");
      assert.equal(await page.locator("#combat-panel").isVisible(), true);
      assert.match(
        await page.locator("#combat-health").innerText(),
        /18 \/ 18/,
      );
      assert.equal(await page.locator("#combat-turn").innerText(), "Your turn");
      assert.equal(
        await page.locator("#combat-actions button").first().innerText(),
        "Attack (1 action)",
      );
      const stale = await browser.newPage();
      await stale.goto(server.url);
      await idle(stale);
      await page
        .locator("#exits")
        .getByRole("button", {
          name: "Inspect route: Ridge Shelter (0 days)",
          exact: true,
        })
        .click();
      assert.equal(
        await page
          .locator("#context-actions")
          .getByRole("button", { name: "Inspect exit" })
          .count(),
        1,
      );
      await page.keyboard.press("Escape");
      let before = await view(server);
      const attack = page
        .locator("#combat-actions")
        .getByRole("button", { name: "Attack (1 action)", exact: true });
      assert.equal((await turn(page, attack)).committed, true);
      assert.equal((await view(server)).position, before.position + 1);
      assert.equal(await attack.isVisible(), true);
      const durable = await readFile(savePath, "utf8");
      const rejected = await turn(
        stale,
        stale
          .locator("#combat-actions")
          .getByRole("button", { name: "Attack (1 action)", exact: true }),
      );
      assert.match(rejected.error, /stale/);
      assert.equal(await readFile(savePath, "utf8"), durable);
      before = await view(server);
      assert.equal(
        (
          await turn(
            page,
            page.locator("#combat-actions").getByRole("button", {
              name: "Brace cover (1 action)",
              exact: true,
            }),
          )
        ).committed,
        true,
      );
      assert.equal((await view(server)).position, before.position + 1);
      assert.equal(
        await page
          .locator("#combat-actions")
          .getByRole("button", { name: "Brace cover (1 action)", exact: true })
          .count(),
        0,
      );
      const history = await page.locator("#conversation").innerText();
      const checkpoint = JSON.parse(
        await readFile(savePath, "utf8"),
      ).checkpoint;
      await page.reload();
      await idle(page);
      assert.equal(await page.locator("#conversation").innerText(), history);
      assert.equal(await attack.isVisible(), true);
      assert.equal(await page.locator("#conversation .notice").count(), 0);
      assert.deepEqual(
        JSON.parse(await readFile(savePath, "utf8")).checkpoint,
        checkpoint,
      );
      for (
        let rounds = 0;
        (await view(server)).scene.combat && rounds < 12;
        rounds++
      ) {
        assert.equal((await turn(page, attack)).committed, true);
      }
      assert.equal((await view(server)).scene.combat, undefined);
      assert.equal(await page.locator("#combat-panel").isVisible(), false);
      assert.equal(
        await page
          .locator("#exits")
          .getByRole("button", { name: "Ridge Shelter (0 days)", exact: true })
          .isVisible(),
        true,
      );
    }),
);

test(
  "phone and reduced-height composition have no overflow and retain keyboard panel access",
  { timeout: 30000 },
  () =>
    withPage(async ({ page, savePath, controls }) => {
      const checkpoint = JSON.parse(
        await readFile(savePath, "utf8"),
      ).checkpoint;
      for (const height of [844, 520]) {
        await page.setViewportSize({ width: 390, height });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        if (height === 844) {
          const scene = await page.locator("#scene-context").boundingBox();
          const story = await page.locator("#story").boundingBox();
          const choices = await page
            .locator("#information-navigation")
            .boundingBox();
          assert.ok(scene.y < story.y && story.y < choices.y && story.y < 600);
        }
        await page.locator("#message").click();
        const composer = await page.locator("#turn").boundingBox();
        assert.ok(
          composer.y >= 0 && composer.y + composer.height <= height + 1,
        );
        await page.locator("#message").fill("Look toward the beacon");
        await page.locator("#message").press("Shift+Enter");
        assert.match(await page.locator("#message").inputValue(), /\n$/);
        await page.locator("#open-journal").click();
        await page.locator("#open-leads").click();
        await page.locator("body").click({ position: { x: 1, y: 1 } });
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("#information").isVisible(), false);
        assert.equal(
          await page
            .locator("#open-journal")
            .evaluate((e) => e === document.activeElement),
          true,
        );
      }
      assert.equal(controls.calls, 0);
      assert.deepEqual(
        JSON.parse(await readFile(savePath, "utf8")).checkpoint,
        checkpoint,
      );
    }),
);

test(
  "authored location images switch with verified location and fall back without changing saves",
  { timeout: 30000 },
  () =>
    withPage(
      async ({ page, server, savePath, controls }) => {
        const before = await readFile(savePath, "utf8");
        const projected = await view(server);
        assert.equal(projected.artwork.alt, "Watch yard illustration");
        assert.equal(
          JSON.stringify(projected).includes("Secret-room illustration"),
          false,
        );
        const image = page.locator("#location-artwork");
        assert.equal(await image.isVisible(), true);
        await page.waitForFunction(
          () => document.getElementById("location-artwork").naturalWidth === 1,
        );
        assert.equal(await page.locator("#scene-art").isVisible(), false);
        await page.reload();
        await idle(page);
        assert.equal(await readFile(savePath, "utf8"), before);
        assert.equal(controls.calls, 0);
        await travel(page, "Watch Loft (0 days)");
        assert.equal(
          await image.getAttribute("alt"),
          "Watch loft illustration",
        );
        await travel(page, "Signal Records Room (0 days)");
        assert.equal((await view(server)).artwork, undefined);
        assert.equal(await image.isVisible(), false);
        assert.equal(await page.locator("#scene-art").isVisible(), true);
      },
      "11",
      async (directory) => {
        const artworkPath = join(directory, "artwork.json");
        await writeFile(
          join(directory, "scene.png"),
          Buffer.from(pixel, "base64"),
        );
        await writeFile(
          artworkPath,
          JSON.stringify({
            adventureId: "hollow-beacon",
            version: "11",
            locations: [
              {
                id: "watch-yard",
                file: "scene.png",
                alt: "Watch yard illustration",
              },
              {
                id: "watch-loft",
                file: "scene.png",
                alt: "Watch loft illustration",
              },
              {
                id: "secret-room",
                file: "scene.png",
                alt: "Secret-room illustration",
              },
            ],
          }),
        );
        return { artworkPath };
      },
    ),
);

test(
  "renderer consumes another adventure's presentation without beacon or caravan assumptions",
  { timeout: 30000 },
  () =>
    withPage(async ({ page, server, savePath, controls }) => {
      const checkpoint = await readFile(savePath, "utf8");
      const actual = await view(server);
      // A presentation-contract fixture, not a claim that the browser launcher
      // already supports this adventure's engine or persisted saves.
      const other = {
        ...actual,
        title: "The Emerald Labyrinth",
        introduction:
          "Ancient roots conceal the entrance. Find the lost navigator.",
        characterLabel: "Ranger",
        deadline: undefined,
        artwork: undefined,
        clocks: [],
        actions: [],
        scene: {
          ...actual.scene,
          objective: "Find the navigator",
          room: {
            id: "grotto",
            name: "Moonlit Grotto",
            description: "Water glimmers on the roots.",
            exits: [],
            features: [],
            items: [],
            opponents: [],
            npcs: [],
          },
          journal: {
            ...actual.scene.journal,
            quest: {
              ...actual.scene.journal.quest,
              title: "Find the navigator",
            },
            discoveries: [],
            actionableLeads: [],
          },
        },
        information: {
          ...actual.information,
          usesFinalePresentation: false,
          currentLeads: [],
          sceneDescription: "Water glimmers on the roots.",
        },
      };
      await page.route("**/api/state", (route) =>
        route.fulfill({ json: other }),
      );
      await page.reload();
      await idle(page);
      assert.equal(await page.title(), "The Emerald Labyrinth · Dungeon One");
      assert.equal(
        await page.locator("#adventure-title").innerText(),
        other.title,
      );
      assert.equal(
        await page.locator("#scene-summary").innerText(),
        other.introduction,
      );
      assert.equal(
        await page.locator("#scene-title").innerText(),
        "Moonlit Grotto",
      );
      assert.equal(await page.locator("#hp-label").innerText(), "Ranger HP");
      assert.equal(await page.locator("#deadline-status").isVisible(), false);
      assert.doesNotMatch(
        await page.locator("body").innerText(),
        /Hollow Beacon|Caravan|Fighter/,
      );
      // Corrupt artwork must not leave a broken-image placeholder over the scene.
      await page.unroute("**/api/state");
      await page.route("**/api/state", (route) =>
        route.fulfill({
          json: {
            ...other,
            artwork: {
              src: "data:image/png;base64,YmFk",
              alt: "Grotto illustration",
            },
          },
        }),
      );
      await page.reload();
      await idle(page);
      await page.waitForFunction(
        () => document.getElementById("location-artwork").hidden,
      );
      assert.equal(await page.locator("#scene-art").isVisible(), true);
      assert.equal(await readFile(savePath, "utf8"), checkpoint);
      assert.equal(controls.calls, 0);
    }),
);
