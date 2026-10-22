// #490, browser → API → storage: a creature's talk topics share one row,
// on its card (#520) under "Ask about", a group named "Ask Gate Guard
// about", with a button per topic (one per approach, its skill under it)
// that keeps its full accessible name. A topic asked stays in its row, greyed out, with
// "Already asked" as its description and title but no caption; a topic the
// module offers again says "Try again" beside it, with its reason. The
// rows are the same after a reload.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateModule } from "./fixtures/bestiary.mjs";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  actionButton,
  clickAction,
  createAndStart,
  settled,
} from "./fixtures/browser-journey.mjs";
import { launch } from "./fixtures/session-layout.mjs";
import { moduleFile, room } from "./fixtures/modules.mjs";

/**
 * The obstacle yard, whose Gate Guard also talks about the garden and,
 * after a failed ask, again once the duty roster is read; and a stable boy
 * with a topic of his own.
 */
const talkingYard = (() => {
  const file = moduleFile("obstacle-yard");
  const gate = room(file, "yard-gate");
  gate.features.push({
    id: "duty-roster",
    name: "Duty Roster",
    description: "A board of names by the guardhouse door.",
    discovery: "The guard's name is chalked on it: Harl.",
  });
  gate.creatures[0].topics.push(
    {
      id: "the-garden",
      name: "the garden",
      reply: '"Weeds, mostly."',
    },
    {
      id: "the-guardhouse",
      name: "the guardhouse",
      reply: '"Barracks and a strongbox."',
      failure: '"None of your business."',
      check: {
        skill: "persuasion",
        dc: 30,
        retry: {
          after: {
            type: "discovered",
            feature: "duty-roster",
            name: "the duty roster",
          },
        },
      },
    },
  );
  gate.creatures.push({
    id: "stable-boy",
    name: "Stable Boy",
    description: "A boy forking straw.",
    topics: [{ id: "the-horses", name: "the horses", reply: '"Two nags."' }],
  });
  return validateModule(file);
})();

/**
 * Each creature card's talk row (#520): its name and each button's name,
 * label and state.
 */
const talkRows = (page) =>
  page
    .locator("#creatures .ask-row:has(button[data-action=talk])")
    .evaluateAll((rows) =>
      rows.map((row) => ({
        name: row.getAttribute("aria-label"),
        buttons: [...row.querySelectorAll("button")].map((button) => {
          const wrap = button.parentElement;
          const described = (button.getAttribute("aria-describedby") ?? "")
            .split(" ")
            .filter(Boolean)
            .map((id) => document.getElementById(id).textContent)
            .join(" ");
          return {
            name: button.getAttribute("aria-label"),
            label: button.querySelector("span").textContent,
            // What the row shows under the button.
            caption: [...wrap.querySelectorAll(".approach, .retry, .reason")]
              .filter((node) => node.checkVisibility())
              .map((node) => node.textContent)
              .join(" "),
            description: described,
            title: button.title,
            disabled: button.disabled,
          };
        }),
      })),
    );

const topic = (name, label, more = {}) => ({
  name,
  label,
  caption: "",
  description: "",
  title: "",
  disabled: false,
  ...more,
});
const asked = (name, label) =>
  topic(name, label, {
    description: "Already asked",
    title: "Already asked",
    disabled: true,
  });

test(
  "a creature's topics share one row and an asked topic greys out in place",
  { timeout: 120000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "issue-490-"));
    const server = await startFifthBrowserServer({
      adventures: [talkingYard],
      libraryPath: join(directory, "characters.json"),
      seed: 0,
      qualifies: () => true,
    });
    const browser = await launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 850 },
    });
    page.setDefaultTimeout(5000);
    try {
      await createAndStart(page, server.url, "obstacle-yard");
      const guard = (garden, guardhouse) => ({
        name: "Ask Gate Guard about",
        buttons: [
          topic(
            "Talk to Gate Guard about letting you pass with Persuasion",
            "letting you pass",
            { caption: "Persuasion" },
          ),
          topic(
            "Talk to Gate Guard about letting you pass with Intimidation",
            "letting you pass",
            { caption: "Intimidation" },
          ),
          garden,
          guardhouse,
        ],
      });
      const boy = {
        name: "Ask Stable Boy about",
        buttons: [topic("Talk to Stable Boy about the horses", "the horses")],
      };
      assert.deepEqual(await talkRows(page), [
        guard(
          topic("Talk to Gate Guard about the garden", "the garden"),
          topic("Talk to Gate Guard about the guardhouse", "the guardhouse"),
        ),
        boy,
      ]);
      // Each button keeps its full accessible name.
      assert.equal(
        await page
          .getByRole("button", {
            name: "Talk to Gate Guard about letting you pass with Persuasion",
            exact: true,
          })
          .count(),
        1,
      );

      await clickAction(page, "talk", "the-garden");
      await clickAction(page, "talk", "the-guardhouse");
      assert.deepEqual(await talkRows(page), [
        guard(
          asked("Talk to Gate Guard about the garden", "the garden"),
          asked("Talk to Gate Guard about the guardhouse", "the guardhouse"),
        ),
        boy,
      ]);
      const garden = page.getByRole("button", {
        name: "Talk to Gate Guard about the garden",
        exact: true,
      });
      assert.equal(await garden.isDisabled(), true);

      // Reading the roster offers the failed ask again, with why, beside
      // the greyed-out ask.
      await clickAction(page, "examine", "duty-roster");
      const [, , , greyed, again] = (await talkRows(page))[0].buttons;
      assert.deepEqual(
        greyed,
        asked("Talk to Gate Guard about the guardhouse", "the guardhouse"),
      );
      assert.deepEqual(again, {
        name: "Try again: Talk to Gate Guard about the guardhouse",
        label: "Try again",
        caption: "The duty roster",
        description: "The duty roster",
        title: "",
        disabled: false,
      });
      const rows = await talkRows(page);
      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      assert.deepEqual(await talkRows(page), rows);

      // Trying again rolls the check again.
      await settled(page, () =>
        actionButton(page, "talk", "the-guardhouse")
          .and(page.locator("[data-retry=true]"))
          .click(),
      );
      const [line] = await page
        .locator("#log li")
        .last()
        .locator(".compact")
        .evaluateAll((nodes) => nodes.map((node) => node.textContent));
      assert.match(line, /^Ada Persuasion check Failure /);
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
