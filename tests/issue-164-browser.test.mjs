// #164: the character library shows each character's status as a tag, dims
// a defeated character, and offers Continue on the row of a character with an
// adventure in progress, beside (never inside) the control that opens the
// sheet. Browser → API → storage at desktop and phone widths.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { assertNoSideScroll, launch } from "./fixtures/session-layout.mjs";
import { ratlessTunnels } from "./fixtures/modules.mjs";
import { createFighter, startAdventure } from "./fixtures/browser-journey.mjs";

const libraryFile = async (path) => JSON.parse(await readFile(path, "utf8"));

/** Each library row: its controls, its tags and whether it is dimmed. */
const rows = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#characters > li")].map((row) => ({
      name: row.querySelector("strong")?.textContent,
      tags: [...row.querySelectorAll(".tag")].map((tag) => tag.textContent),
      buttons: [...row.querySelectorAll("button")].map((button) => ({
        text: button.textContent,
        label: button.getAttribute("aria-label"),
        className: button.className,
        parent: button.parentElement === row,
      })),
      nested: row.querySelectorAll("button button, button a, a button").length,
      defeated: row.classList.contains("defeated"),
    })),
  );

/** The lowest contrast of any text in the named row against its background. */
const lowestContrast = (page, name) =>
  page.evaluate((wanted) => {
    const parse = (value) =>
      /rgba?\(([^)]+)\)/
        .exec(value)[1]
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
    const background = (element) => {
      for (let node = element; node; node = node.parentElement) {
        const colour = parse(getComputedStyle(node).backgroundColor);
        if ((colour[3] ?? 1) === 1) {
          return colour;
        }
      }
      return [255, 255, 255];
    };
    const opacity = (element) => {
      let value = 1;
      for (let node = element; node; node = node.parentElement) {
        value *= Number(getComputedStyle(node).opacity);
      }
      return value;
    };
    const luminance = (rgb) =>
      rgb
        .slice(0, 3)
        .map((channel) => {
          const c = channel / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index]);
    const row = [...document.querySelectorAll("#characters > li")].find(
      (item) => item.querySelector("strong")?.textContent === wanted,
    );
    let lowest = Infinity;
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) {
        continue;
      }
      const element = node.parentElement;
      const behind = background(element);
      const colour = parse(getComputedStyle(element).color);
      const alpha = (colour[3] ?? 1) * opacity(element);
      const shown = [0, 1, 2].map(
        (index) => colour[index] * alpha + behind[index] * (1 - alpha),
      );
      const [high, low] = [luminance(shown), luminance(behind)].sort(
        (a, b) => b - a,
      );
      lowest = Math.min(lowest, (high + 0.05) / (low + 0.05));
    }
    return lowest;
  }, name);

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `the library tags each character's status and Continue resumes an adventure (${viewport.width}px)`,
    { timeout: 60000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-164-"));
      const libraryPath = join(directory, "characters.json");
      let server = await startFifthBrowserServer({
        adventures: [ratlessTunnels],
        libraryPath,
        seed: 0,
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await page.goto(server.url);
        await page.locator("#no-characters").waitFor();
        await createFighter(page, "Bea");
        await page.locator('#breadcrumb a[data-view="library"]').click();
        await createFighter(page, "Ada");
        await startAdventure(page, "quiet-tunnels");
        // Act once so there is progress to resume.
        await page.locator("#explore-controls button:enabled").first().click();
        await page.waitForFunction(
          () => document.querySelectorAll("#log > li").length > 1,
        );
        const before = {
          room: await page.locator("#room-title").textContent(),
          hp: await page.locator("#character-hp").textContent(),
          log: await page.locator("#log").innerText(),
        };
        const { session } = (await libraryFile(libraryPath)).characters[1];
        const sessionPath = join(
          directory,
          "characters-adventures",
          `${session.id}.json`,
        );
        const saved = await readFile(sessionPath);

        // Back in the library: Ada is tagged and has Continue; Bea has neither.
        await page.locator('#breadcrumb a[data-view="library"]').click();
        await page.locator("#characters .continue-adventure").waitFor();
        const shown = await rows(page);
        assert.deepEqual(
          shown.map(({ name, tags, defeated }) => ({ name, tags, defeated })),
          [
            { name: "Bea", tags: [], defeated: false },
            { name: "Ada", tags: ["On an adventure"], defeated: false },
          ],
        );
        for (const row of shown) {
          assert.equal(row.nested, 0, `${row.name}: no nested controls`);
          assert.ok(
            row.buttons.every(({ parent }) => parent),
            `${row.name}: the row's controls are siblings`,
          );
        }
        assert.equal(shown[0].buttons.length, 1);
        const [open, resume] = shown[1].buttons;
        assert.match(open.text, /^Ada/);
        assert.match(open.className, /\bsecondary\b/);
        assert.equal(resume.text, "Continue");
        assert.equal(resume.className, "continue-adventure secondary");
        assert.equal(
          resume.label,
          "Continue Ada's adventure, The Quiet Tunnels",
        );
        await assertNoSideScroll(page, "no horizontal scroll");

        // Both controls are keyboard-reachable: the sheet control, then Continue.
        await page.locator("#characters .open-character").nth(1).focus();
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(() => document.activeElement.className),
          "continue-adventure secondary",
        );
        // One key press resumes the adventure exactly where it was.
        await page.keyboard.press("Enter");
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#log li").first().waitFor();
        assert.equal(new URL(page.url()).hash, `#adventure-${session.id}`);
        assert.deepEqual(
          {
            room: await page.locator("#room-title").textContent(),
            hp: await page.locator("#character-hp").textContent(),
            log: await page.locator("#log").innerText(),
          },
          before,
        );
        assert.deepEqual(await readFile(sessionPath), saved);

        // Back returns to the library; the row control still opens the sheet.
        await page.goBack();
        await page.locator("#library").waitFor({ state: "visible" });
        assert.equal(new URL(page.url()).hash, "");
        await page.locator("#characters .open-character").nth(1).click();
        await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();

        // A defeated character is tagged, dimmed, readable and offers no Continue.
        await server.close();
        const data = await libraryFile(libraryPath);
        data.characters[0].defeated = true;
        await writeFile(libraryPath, JSON.stringify(data));
        server = await startFifthBrowserServer({
          adventures: [ratlessTunnels],
          libraryPath,
          seed: 0,
        });
        await page.goto(server.url);
        await page.locator("#characters .continue-adventure").waitFor();
        const [bea] = await rows(page);
        assert.deepEqual(bea.tags, ["Defeated"]);
        assert.equal(bea.defeated, true);
        assert.equal(bea.buttons.length, 1);
        assert.notEqual(
          await page
            .locator("#characters > li.defeated")
            .evaluate(
              (row) => getComputedStyle(row.querySelector("strong")).color,
            ),
          await page
            .locator("#characters > li:not(.defeated) strong")
            .evaluate((strong) => getComputedStyle(strong).color),
          "the defeated row is dimmed",
        );
        const contrast = await lowestContrast(page, "Bea");
        assert.ok(
          contrast >= 4.5,
          `defeated row text ${contrast.toFixed(2)}:1`,
        );
        await page.locator("#characters .open-character").first().click();
        await page.locator("#sheet-name").filter({ hasText: "Bea" }).waitFor();
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
