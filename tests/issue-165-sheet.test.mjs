// #165: the character sheet leads with its adventure choices, ordered by
// recommended level range then difficulty, with a permanent-defeat warning.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { orderFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

const module = (id, min, max, difficulty) => ({
  id,
  title: id,
  recommendedLevels: { min, max },
  difficulty,
});

test("modules are offered by level range, then easy, medium, hard", () => {
  const given = [
    module("b-hard", 1, 1, "hard"),
    module("c-two", 2, 3, "easy"),
    module("a-medium", 1, 1, "medium"),
    module("d-wide", 1, 2, "easy"),
    module("e-easy", 1, 1, "easy"),
  ];
  const ordered = orderFifthAdventures(given, () => true);
  assert.deepEqual(
    ordered.map(({ id }) => id),
    ["e-easy", "a-medium", "b-hard", "d-wide", "c-two"],
  );
  assert.equal(given[0].id, "b-hard", "the input is left unchanged");
});

test("modules that don't qualify are left out before ordering (#135)", () => {
  const given = [
    module("b-hard", 1, 1, "hard"),
    module("a-medium", 1, 1, "medium"),
    module("e-easy", 1, 1, "easy"),
  ];
  const asked = [];
  const ordered = orderFifthAdventures(given, (adventure) => {
    asked.push(adventure.id);
    return adventure.id !== "a-medium";
  });
  assert.deepEqual(
    ordered.map(({ id }) => id),
    ["e-easy", "b-hard"],
  );
  assert.deepEqual(asked, ["b-hard", "a-medium", "e-easy"]);
});

async function withServer(work, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "issue-165-"));
  const libraryPath = join(directory, "characters.json");
  const server = await startFifthBrowserServer({
    libraryPath,
    seed: 0,
    ...options,
  });
  const browser = await launch();
  try {
    await work({ server, browser, libraryPath });
  } finally {
    await browser.close();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function create(page, url, name) {
  await page.goto(url);
  await page.locator("#open-creation").click();
  await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
  await page.locator("#character-name").fill(name);
  await page.locator("#save-character").click();
  await page.locator("#sheet-name").filter({ hasText: name }).waitFor();
}

/** Whether the whole element is inside the viewport without scrolling. */
const inView = (locator) =>
  locator.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return (
      window.scrollY === 0 &&
      box.top >= 0 &&
      box.bottom <= window.innerHeight &&
      box.width > 0
    );
  });

test("the server projects the modules in offer order", async () => {
  await withServer(async ({ server }) => {
    const response = await fetch(`${server.url}/api/5e/library`);
    const { adventures } = await response.json();
    assert.deepEqual(
      adventures.map(({ id }) => id),
      [
        "cellar-goblin",
        "robbers-barrow",
        "smugglers-cellar",
        "tinkers-toll",
        "goblin-storeroom",
        "abandoned-delve",
        "warden-crypt",
        "goblin-warren",
      ],
    );
  });
});

test(
  "the sheet leads with Start buttons, tags and the defeat warning at 1280×850",
  { timeout: 60000 },
  async () => {
    await withServer(async ({ server, browser }) => {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 850 },
      });
      page.setDefaultTimeout(5000);
      await create(page, server.url, "Ada");

      const cards = await page.evaluate(() =>
        [...document.querySelectorAll(".adventure-choice")].map((card) => ({
          tags: [...card.querySelectorAll(".tag")].map(
            (tag) => tag.textContent,
          ),
          button: card.querySelector("button").textContent,
        })),
      );
      assert.deepEqual(cards, [
        { tags: ["Level 1", "Hard"], button: "Start" },
        { tags: ["Level 1", "Hard"], button: "Start" },
        { tags: ["Level 1", "Hard"], button: "Start" },
        { tags: ["Level 1", "Hard"], button: "Start" },
        { tags: ["Level 2", "Medium"], button: "Start" },
        { tags: ["Level 2", "Hard"], button: "Start" },
        { tags: ["Level 2", "Hard"], button: "Start" },
        { tags: ["Levels 2–3", "Hard"], button: "Start" },
      ]);
      const start = page.getByRole("button", {
        name: "Start The Smugglers' Cellar",
        exact: true,
      });
      assert.equal(await start.count(), 1);
      for (const button of await page.locator(".start-adventure").all()) {
        assert.ok(await inView(button), "every Start button is in view");
      }
      const warning = page.locator("#defeat-warning");
      assert.equal(
        await warning.textContent(),
        "At 0 HP, Ada is defeated for good and can never start another adventure.",
      );
      assert.ok(await inView(warning));
      // The choices come before the reference information.
      assert.ok(
        await page.evaluate(
          () =>
            document
              .getElementById("sheet-adventures")
              .compareDocumentPosition(document.getElementById("sheet-body")) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      );

      // At phone width, with a wide font as CI's Linux fonts are, the cards
      // stack without a horizontal scroll.
      await page.setViewportSize({ width: 375, height: 812 });
      await page.evaluate(() => {
        document.body.style.fontFamily = "Verdana";
        for (const node of document.querySelectorAll("#sheet *")) {
          node.style.fontFamily = "Verdana";
        }
      });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "no horizontal scroll at phone width",
      );
      await page.setViewportSize({ width: 1280, height: 850 });

      await start.click();
      await page.locator("#adventure").waitFor({ state: "visible" });
      await page.locator('#breadcrumb a[data-view="sheet"]').click();
      const resume = page.locator("#continue-adventure");
      await resume.waitFor();
      assert.ok(await inView(resume), "Continue is in view");
      assert.ok(await page.locator("#defeat-warning").isVisible());
    });
  },
);

test(
  "a defeated character's sheet states defeat at the top",
  { timeout: 60000 },
  async () => {
    await withServer(async ({ server, browser, libraryPath }) => {
      const page = await browser.newPage({
        viewport: { width: 375, height: 812 },
      });
      page.setDefaultTimeout(5000);
      await create(page, server.url, "Ada");
      // Stand in for a lost fight: the library records the defeat.
      const data = JSON.parse(await readFile(libraryPath, "utf8"));
      data.characters[0].defeated = true;
      data.characters[0].sheet.hp = 0;
      await writeFile(libraryPath, JSON.stringify(data));
      await page.reload();
      const notice = page.locator("#adventure-choices .defeat-notice");
      await notice.waitFor();
      assert.equal(
        await notice.textContent(),
        "Ada was defeated and cannot start another adventure.",
      );
      assert.ok(await inView(notice), "the defeat is stated at the top");
      assert.equal(await page.locator(".start-adventure").count(), 0);
      assert.ok(!(await page.locator("#defeat-warning").isVisible()));
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        "no horizontal scroll at phone width",
      );
    });
  },
);

test(
  "a module that doesn't qualify is not offered, and starting it is refused (#135)",
  { timeout: 60000 },
  async () => {
    await withServer(
      async ({ server, browser, libraryPath }) => {
        const page = await browser.newPage({
          viewport: { width: 1280, height: 850 },
        });
        page.setDefaultTimeout(5000);
        await create(page, server.url, "Ada");
        const starts = await page
          .locator(".start-adventure")
          .evaluateAll((buttons) =>
            buttons.map((button) => button.dataset.adventure),
          );
        assert.equal(starts.length, 7);
        assert.ok(!starts.includes("goblin-warren"));
        const library = JSON.parse(await readFile(libraryPath, "utf8"));
        const refused = await page.evaluate(
          async (body) => {
            const response = await fetch("/api/5e/adventures/start", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            return { status: response.status, body: await response.json() };
          },
          {
            revision: library.revision,
            characterId: library.characters[0].sheet.id,
            adventureId: "goblin-warren",
          },
        );
        assert.equal(refused.status, 409);
        assert.equal(refused.body.error, "There is no such adventure.");
      },
      { qualifies: ({ id }) => id !== "goblin-warren" },
    );
  },
);
