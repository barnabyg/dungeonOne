// #152: one button hierarchy and WCAG contrast in the `--5e` browser.
// axe-core is not a dependency, so this measures the same contrast rules
// from computed styles: text 4.5:1 (3:1 when large) and control boundaries
// 3:1 (WCAG 1.4.11) on every screen, at desktop and phone widths.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

const VARIANTS = ["primary", "secondary", "quiet", "danger"];
// The regions that may each show at most one primary button.
const REGIONS = [
  "#library",
  "#creation",
  "#sheet",
  "#room",
  "#encounter",
  "#message-form",
  "#delete-dialog",
];

/**
 * Every contrast failure on the visible page, and the visible buttons
 * without exactly one variant or regions with more than one primary.
 */
const audit = (page) =>
  page.evaluate(
    ([variants, regions]) => {
      // The body's gradient: its lighter end is the worst case for light text.
      const BODY = [48, 64, 67, 1];
      const parse = (value) => {
        const match = /rgba?\(([^)]+)\)/.exec(value);
        if (!match) {
          return [0, 0, 0, 0];
        }
        const parts = match[1]
          .split(/[\s,/]+/)
          .filter(Boolean)
          .map(Number);
        return [parts[0], parts[1], parts[2], parts[3] ?? 1];
      };
      const over = (top, bottom) => {
        const alpha = top[3];
        return [0, 1, 2]
          .map((index) => top[index] * alpha + bottom[index] * (1 - alpha))
          .concat(1);
      };
      const background = (element) => {
        const layers = [];
        for (let node = element; node; node = node.parentElement) {
          const colour = parse(getComputedStyle(node).backgroundColor);
          if (colour[3] > 0) {
            layers.push(colour);
          }
          if (colour[3] === 1) {
            break;
          }
          if (node === document.body) {
            layers.push(BODY);
            break;
          }
        }
        return layers.reduceRight((below, layer) => over(layer, below));
      };
      const opacity = (element) => {
        let value = 1;
        for (let node = element; node; node = node.parentElement) {
          value *= Number(getComputedStyle(node).opacity);
        }
        return value;
      };
      const luminance = ([r, g, b]) =>
        [r, g, b]
          .map((channel) => {
            const c = channel / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index]);
      const ratio = (a, b) => {
        const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (high + 0.05) / (low + 0.05);
      };
      const describe = (element) =>
        element.tagName.toLowerCase() +
        (element.id ? "#" + element.id : "") +
        (element.className
          ? "." + String(element.className).split(" ").join(".")
          : "") +
        ' "' +
        (element.textContent || "").trim().slice(0, 30) +
        '"';
      const disabled = (element) =>
        Boolean(
          element.closest("button:disabled, input:disabled, select:disabled"),
        );
      const failures = [];

      // Text, against what is painted behind it.
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const element = node.parentElement;
        if (!node.textContent.trim() || !element.checkVisibility()) {
          continue;
        }
        if (element.closest("option, script") || disabled(element)) {
          continue;
        }
        const style = getComputedStyle(element);
        const behind = background(element);
        const colour = parse(style.color);
        const shown = over(
          [colour[0], colour[1], colour[2], colour[3] * opacity(element)],
          behind,
        );
        const size = parseFloat(style.fontSize);
        const large =
          size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        const value = ratio(shown, behind);
        if (value < (large ? 3 : 4.5)) {
          failures.push(`text ${describe(element)} ${value.toFixed(2)}:1`);
        }
      }

      // Control boundaries, against the background around the control.
      const visible = (selector) =>
        [...document.querySelectorAll(selector)].filter((element) =>
          element.checkVisibility(),
        );
      for (const control of visible(
        "button, input:not([type=checkbox]):not([type=radio]), select",
      )) {
        if (control.disabled) {
          continue;
        }
        const style = getComputedStyle(control);
        const around = background(control.parentElement);
        const border = parse(style.borderTopColor);
        const fill = parse(style.backgroundColor);
        const edge =
          parseFloat(style.borderTopWidth) > 0 && border[3] > 0
            ? border
            : fill[3] > 0
              ? fill
              : undefined;
        // Quiet buttons read as underlined links and need no boundary.
        if (control.classList.contains("quiet")) {
          continue;
        }
        if (!edge) {
          failures.push(`no boundary ${describe(control)}`);
          continue;
        }
        const value = ratio(over(edge, around), around);
        if (value < 3) {
          failures.push(`boundary ${describe(control)} ${value.toFixed(2)}:1`);
        }
      }

      const unstyled = visible("button")
        .filter(
          (button) =>
            variants.filter((name) => button.classList.contains(name))
              .length !== 1,
        )
        .filter(
          (button) =>
            !(
              button.classList.contains("primary") &&
              button.classList.contains("danger")
            ),
        )
        .map(describe);
      const crowded = regions
        .map((selector) => [selector, document.querySelector(selector)])
        .filter(([, region]) => region && region.checkVisibility())
        .map(([selector, region]) => [
          selector,
          [...region.querySelectorAll("button.primary")].filter((button) =>
            button.checkVisibility(),
          ).length,
        ])
        .filter(([, count]) => count > 1)
        .map(([selector, count]) => `${selector} has ${count} primary buttons`);
      return { failures, unstyled, crowded };
    },
    [VARIANTS, REGIONS],
  );

async function check(page, screen) {
  // Measure the resting styles, not a hover.
  await page.mouse.move(0, 0);
  const result = await audit(page);
  assert.deepEqual(result.failures, [], `${screen}: contrast`);
  assert.deepEqual(
    result.unstyled,
    [],
    `${screen}: every button has one variant`,
  );
  assert.deepEqual(result.crowded, [], `${screen}: at most one primary button`);
}

async function create(page, name) {
  await page.locator("#open-creation").click();
  await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
  await page.locator("#character-name").fill(name);
  await page.locator("#save-character").click();
  await page.locator("#sheet-name").filter({ hasText: name }).waitFor();
}

/** Attacks, or ends the turn once the action is spent, until the fight ends. */
async function fightToTheEnd(page) {
  while (!(await page.locator("#ending").isVisible())) {
    const count = await page.locator("#log li").count();
    const attack = page.locator("#attack-controls button.attack:enabled");
    await (
      (await attack.count()) > 0
        ? attack.first()
        : page.locator('#feature-controls button[data-action="end-turn"]')
    ).click();
    await page.waitForFunction(
      (seen) => document.querySelectorAll("#log li").length > seen,
      count,
    );
  }
}

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `every screen meets contrast and has one button hierarchy at ${viewport.width}px`,
    { timeout: 90000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-152-"));
      const server = await startFifthBrowserServer({
        libraryPath: join(directory, "characters.json"),
        seed: 0,
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await page.goto(server.url);
        await page.locator("#no-characters").waitFor();
        await check(page, "empty library");

        await page.locator("#open-creation").click();
        await page
          .locator("#preview-body")
          .filter({ hasText: "AC:" })
          .waitFor();
        await check(page, "creation");
        await page.locator("#character-name").fill("Ada");
        await page.locator("#save-character").click();
        await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
        await check(page, "sheet");

        // A heading focused by script shows no ring; a keyboard-focused
        // control keeps a visible one.
        const outline = () =>
          page.evaluate(() => {
            const style = getComputedStyle(document.activeElement);
            return {
              id: document.activeElement.id,
              className: document.activeElement.className,
              style: style.outlineStyle,
              width: parseFloat(style.outlineWidth),
            };
          });
        const heading = await outline();
        assert.equal(heading.id, "sheet-name");
        assert.equal(heading.style, "none");
        // A table that overflows (wider fonts in CI) is itself a tab stop,
        // so tab on to the first button.
        let control = heading;
        for (
          let i = 0;
          i < 5 && !/start-adventure/.test(control.className);
          i++
        ) {
          await page.keyboard.press("Tab");
          control = await outline();
        }
        assert.match(control.className, /start-adventure/);
        assert.notEqual(control.style, "none");
        assert.ok(
          control.width >= 2,
          "a keyboard focus ring at least 2 px wide",
        );

        await page.locator("#delete-character").click();
        await page.locator("#delete-confirm-name").fill("Ada");
        await check(page, "delete dialog");
        await page.locator("#cancel-delete").click();

        await page
          .locator('.start-adventure[data-adventure="smugglers-cellar"]')
          .click();
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#action-bar button.explore").first().waitFor();
        await check(page, "room");
        await page.locator('#breadcrumb a[data-view="sheet"]').click();
        await page.locator("#continue-adventure").waitFor();
        await check(page, "sheet with an adventure in progress");
        await page.locator('#breadcrumb a[data-view="library"]').click();
        await page.locator("#characters button").first().waitFor();
        await check(page, "library");

        await create(page, "Bea");
        await page
          .locator('.start-adventure[data-adventure="cellar-goblin"]')
          .click();
        await page.locator("#encounter").waitFor({ state: "visible" });
        await check(page, "fight");
        await fightToTheEnd(page);
        await check(page, "fight over");

        // A defeated combatant is tagged and dimmed, never struck through.
        const defeated = await page.evaluate(() =>
          [...document.querySelectorAll("#initiative-rows tr.defeated")].map(
            (row) => ({
              tag: row.querySelector(".tag")?.textContent,
              struck: [...row.cells].some((cell) =>
                getComputedStyle(cell).textDecorationLine.includes(
                  "line-through",
                ),
              ),
            }),
          ),
        );
        assert.equal(defeated.length, 1);
        assert.deepEqual(defeated[0], { tag: "Defeated", struck: false });

        // Headings follow one scale, largest first.
        const sizes = await page.evaluate(() =>
          ["h1", "h2", "h3", "h4"].map((tag) =>
            parseFloat(getComputedStyle(document.querySelector(tag)).fontSize),
          ),
        );
        for (let index = 1; index < sizes.length; index++) {
          assert.ok(
            sizes[index - 1] > sizes[index],
            `heading sizes ${sizes.join(" > ")}`,
          );
        }
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
