// #524, browser → API: one plain history. Every entry, the AI DM's words,
// the player's own and the engine's cards, is one card style in one font;
// arriving in a room (the opening too) is an ordinary entry that starts with
// the room's name in bold, then its description. The room panel no longer
// repeats the description: "Description in history" beside the room's name
// scrolls the history to the newest arrival in the room and focuses it. A
// reload keeps the history as it was, and nothing scrolls sideways.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { ratTunnels } from "./fixtures/modules.mjs";
import { clickAction, createAndStart } from "./fixtures/browser-journey.mjs";
import {
  assertNoSideScroll,
  launch,
  narratingDm,
  say,
} from "./fixtures/session-layout.mjs";

const WIDTHS = [
  { width: 1880, height: 1000 },
  { width: 1280, height: 760 },
  { width: 900, height: 560 },
];

const room = (id) => ratTunnels.rooms.find((each) => each.id === id);

/** Each history entry: its kind and its parts' classes. */
const entries = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#log > li")].map((item) => ({
      kind: item.dataset.kind,
      parts: [...item.children].map((part) => part.className),
      arrival: [...item.querySelectorAll("[data-arrival]")].map(
        (card) => card.dataset.arrival,
      ),
    })),
  );

/**
 * The looks of every entry's parts and of all the text in them: one font,
 * never italic, and one card style (a rejection aside).
 */
const looks = (page) =>
  page.evaluate(() => {
    const parts = [
      ...document.querySelectorAll(
        "#log > li > :is(.player, .reply, .narration, .card)",
      ),
    ];
    const card = (node) => {
      const style = getComputedStyle(node);
      return [
        style.fontFamily,
        style.fontStyle,
        style.fontSize,
        style.backgroundColor,
        style.borderTopStyle,
        style.borderTopColor,
        style.borderTopLeftRadius,
      ].join(" | ");
    };
    const text = [...document.querySelectorAll("#log li *")].filter(
      (node) => node.closest("svg") === null,
    );
    return {
      classes: [...new Set(parts.map((node) => node.className))].sort(),
      cards: [...new Set(parts.map(card))],
      families: [
        ...new Set(text.map((node) => getComputedStyle(node).fontFamily)),
      ],
      italic: text.filter(
        (node) => getComputedStyle(node).fontStyle !== "normal",
      ).length,
    };
  });

/** The newest arrival in `name`: its index among the entries, and its first line. */
const arrival = (page, name) =>
  page.evaluate((name) => {
    const items = [...document.querySelectorAll("#log > li")];
    const index = items.findLastIndex((item) =>
      [...item.querySelectorAll("[data-arrival]")].some(
        (card) => card.dataset.arrival === name,
      ),
    );
    const line = items[index]?.querySelector(`[data-arrival] .card-line > p`);
    return {
      index,
      text: line?.textContent,
      lead: line?.firstChild?.textContent,
      leadWeight: Number(getComputedStyle(line.firstChild).fontWeight),
    };
  }, name);

/**
 * Clicks "Description in history" with the log scrolled to `from` (top or
 * bottom): which entry has focus, and where it sits in the log.
 */
const jump = async (page, from) => {
  await page.evaluate((from) => {
    const log = document.getElementById("log");
    log.scrollTop = from === "top" ? 0 : log.scrollHeight;
  }, from);
  await page.locator("#room-history-link").click();
  return page.evaluate(() => {
    const log = document.getElementById("log");
    const focused = document.activeElement;
    const box = focused.getBoundingClientRect();
    const port = log.getBoundingClientRect();
    return {
      focused: [...log.children].indexOf(focused),
      top: Math.round(box.top - port.top),
      shown: box.top >= port.top - 1 && box.top < port.bottom,
    };
  });
};

/**
 * Makes every entry tall, so the log scrolls at every width; or, with
 * `tall` false, as it was.
 */
const pad = (page, tall = true) =>
  page.evaluate((tall) => {
    for (const item of document.querySelectorAll("#log > li")) {
      if (tall) {
        item.style.minHeight = "600px";
      } else {
        item.removeAttribute("style");
      }
    }
  }, tall);

/** The room panel's text, and whether it still has a description. */
const panel = (page) =>
  page.evaluate(() => ({
    text: document.getElementById("room").innerText,
    description: document.getElementById("room-description") !== null,
    link: document.getElementById("room-history-link").checkVisibility(),
    linkBeside:
      document.getElementById("room-history-link").parentElement.id ===
      "room-heading",
  }));

test(
  "one plain history, with arrival an ordinary entry the room panel links to",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-524-"));
    const server = await startFifthBrowserServer({
      adventures: [ratTunnels],
      qualifies: () => true,
      libraryPath: join(directory, "characters.json"),
      seed: 0,
      dmModel: narratingDm(),
    });
    const browser = await launch();
    const page = await browser.newPage({ viewport: WIDTHS[0] });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "rat-tunnels");
      const stair = room("stair-foot");
      const alcove = room("alcove");

      // The opening is an arrival: the room's name in bold, its description.
      assert.deepEqual(await entries(page), [
        { kind: "narration", parts: ["narration"], arrival: [stair.name] },
      ]);
      const opening = await arrival(page, stair.name);
      assert.equal(opening.text, `${stair.name} — ${stair.description}`);
      assert.equal(opening.lead, stair.name);
      assert.ok(opening.leadWeight >= 600, "the room's name is bold");

      // The room panel names the room but does not repeat its description.
      const shown = await panel(page);
      assert.equal(shown.description, false);
      assert.equal(shown.text.includes(stair.description), false);
      assert.match(shown.text, new RegExp(stair.name, "u"));
      assert.equal(shown.link, true);
      assert.equal(shown.linkBeside, true);

      // The DM's words, the player's, the engine's cards and an arrival.
      await say(page, "I listen at the stair");
      await clickAction(page, "move", "alcove");
      await clickAction(page, "examine", "iron-chest");
      await say(page, "I look around the alcove");
      const alcoveArrival = await arrival(page, alcove.name);
      assert.equal(
        alcoveArrival.text,
        `${alcove.name} — ${alcove.description}`,
      );
      assert.equal(alcoveArrival.lead, alcove.name);

      // One font and one card style throughout; nothing italic.
      const seen = await looks(page);
      assert.deepEqual(seen.classes, [
        "card result",
        "narration",
        "player",
        "reply",
      ]);
      assert.equal(seen.cards.length, 1, JSON.stringify(seen.cards));
      assert.equal(seen.families.length, 1, JSON.stringify(seen.families));
      assert.equal(seen.italic, 0);

      // Entries tall enough that the log scrolls at every width.
      await pad(page);

      // From the foot of the history, the link goes back to the arrival.
      for (const viewport of WIDTHS) {
        await page.setViewportSize(viewport);
        const went = await jump(page, "bottom");
        assert.equal(went.focused, alcoveArrival.index, `${viewport.width}`);
        assert.ok(Math.abs(went.top) <= 2, `${viewport.width}: ${went.top}`);
        await assertNoSideScroll(page, `${viewport.width}: no side scroll`);
      }
      await page.setViewportSize(WIDTHS[0]);

      // Back at the stair, the link finds the newest arrival there, not the
      // opening.
      await clickAction(page, "move", "stair-foot");
      await pad(page);
      const back = await arrival(page, stair.name);
      assert.ok(back.index > 0);
      assert.equal(back.text, `${stair.name} — ${stair.description}`);
      const again = await jump(page, "top");
      assert.equal(again.focused, back.index);
      assert.equal(again.shown, true);

      // A reload keeps the history as it was, and the link still works.
      await pad(page, false);
      const before = await page.locator("#log").innerHTML();
      const kinds = await entries(page);
      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      await page.locator("#log > li").first().waitFor();
      assert.deepEqual(await entries(page), kinds);
      assert.equal(
        (await page.locator("#log").innerHTML()).replaceAll(
          / (tabindex|style)="[^"]*"/gu,
          "",
        ),
        before.replaceAll(/ (tabindex|style)="[^"]*"/gu, ""),
      );
      await pad(page);
      assert.equal((await jump(page, "top")).focused, back.index);
      for (const viewport of WIDTHS) {
        await page.setViewportSize(viewport);
        await assertNoSideScroll(page, `${viewport.width} after a reload`);
      }
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
