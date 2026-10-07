// #159: each kind of conversation-history entry looks different and is
// labelled, result cards show their rolls grouped beside the line they
// belong to, the newest entry is marked and focusable, and a reload restores
// the same rendering. #186: attack and initiative lines are compact, built
// from their roll groups, with the engine text for screen readers and behind
// a Full text disclosure; a card is no taller than its plain engine text. A
// storeroom fight with Sap and typed messages to the scripted DM, at desktop
// and phone widths.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import {
  buildFighter,
  defaultPlacement,
  rollAbilitySet,
} from "../dist/fighter-5e.js";
import { createSeededRandom } from "../dist/random.js";
import { createFifthRuntime } from "../dist/runtime-5e.js";
import { loadScriptedDmModel } from "../dist/scripted-dm-model.js";
import { sessionSeed } from "../dist/session-5e.js";

// Edge on Windows; elsewhere the pinned Playwright Chromium, as CI installs.
const launch = () =>
  chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );

const storeroom = (await loadBuiltInFifthAdventures()).find(
  ({ id }) => id === "goblin-storeroom",
);
const END_TURN = { type: "end-turn", actorId: "pc" };
// The creation screen's default choices; the placement follows the dice.
const DEFAULT_CHOICES = {
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
  kit: "mace",
  masteries: ["dagger", "mace", "shortsword"],
};

/** The first Fighter a browser on `seed` creates with the default choices. */
function firstFighter(seed) {
  const stream = createHash("sha256")
    .update(`5e-ability-rolls:${seed}:1`)
    .digest()
    .readUInt32LE(0);
  const dice = rollAbilitySet(createSeededRandom(stream));
  return buildFighter("a".repeat(32), "Ada", dice, {
    ...DEFAULT_CHOICES,
    placement: defaultPlacement(dice),
  });
}

/**
 * The storeroom fight on `seed`, played as the test plays it: a typed
 * attack on the first target, then clicks on the first target, or End turn
 * once the action is spent. The first target, whether a sapped opponent
 * attacked, how many attacks the opening made and how often Ada missed with
 * her turn still going (the card ends "It is still your turn").
 */
function simulate(seed) {
  const runtime = createFifthRuntime(storeroom, firstFighter(seed));
  const random = createSeededRandom(sessionSeed(seed, 1));
  const begun = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  );
  let state = begun.state;
  const first = runtime.attackTargets(state)[0]?.id;
  const openingAttacks = begun.events.filter(
    ({ type }) => type === "attack",
  ).length;
  let sapped = false;
  let misses = 0;
  let steps = 0;
  while (state.status === "playing") {
    const targets = runtime.attackTargets(state);
    const result = runtime.handleAction(
      state,
      targets.length === 0
        ? END_TURN
        : { type: "attack", actorId: "pc", targetId: targets[0].id },
      random,
    );
    // A fresh turn ends with a turn event; without one, Ada's turn goes on.
    const stillAdasTurn =
      result.state.status === "playing" &&
      result.events.at(-1)?.type !== "turn";
    if (stillAdasTurn) {
      misses += result.events.filter(
        (event) =>
          event.type === "attack" && event.actorId === "pc" && !event.hit,
      ).length;
    }
    sapped ||= result.events.some(
      (event) =>
        event.type === "attack" && event.mode?.disadvantage.includes("Sap"),
    );
    state = result.state;
    steps++;
  }
  return { first, sapped, steps, openingAttacks, misses };
}

let seed = 0;
let expected = simulate(seed);
// An opponent attacks in the opening card, after initiative, and Ada misses
// at least once, with her "still your turn" line: both cards were once a line
// taller than their engine text (#196).
while (
  !expected.sapped ||
  expected.first === undefined ||
  expected.steps < 3 ||
  expected.openingAttacks === 0 ||
  expected.misses === 0
) {
  expected = simulate(++seed);
  assert.ok(seed < 5000, "no storeroom fight with both card shapes");
}

// Fonts and letter spacings the height check is repeated in, as CI's
// fallback fonts are wider than Windows' (#196).
const FONTS = [
  ["", "0"],
  ["", "0.06em"],
  ["Arial", "0"],
  ["Arial", "0.06em"],
  ["Arial", "0.09em"],
  ["Verdana", "0"],
];

/** Waits for the history to gain an entry after `run`. */
async function added(page, run) {
  const count = await page.locator("#log > li").count();
  await run();
  await page.waitForFunction(
    (seen) =>
      document.querySelectorAll("#log > li:not([data-pending])").length > seen,
    count,
  );
}

const say = (page, message) =>
  added(page, async () => {
    await page.locator("#message").fill(message);
    await page.locator("#message").press("Enter");
  });

/** Each entry: its kind, its parts' labels and the newest marker. */
const entries = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#log > li")].map((item) => ({
      kind: item.dataset.kind,
      parts: [...item.children].map((part) => [
        part.getAttribute("role"),
        part.getAttribute("aria-label"),
      ]),
      newest: item.classList.contains("newest"),
      tabIndex: item.getAttribute("tabindex"),
    })),
  );

/** Each compact card line's visible text. */
const compactTexts = (page) =>
  page
    .locator("#log .compact")
    .evaluateAll((rows) => rows.map((row) => row.textContent));

for (const viewport of [
  { width: 1280, height: 850 },
  { width: 375, height: 812 },
]) {
  test(
    `history entries are distinct and rolls sit beside their lines (${viewport.width}px)`,
    { timeout: 120000 },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "issue-159-"));
      const script = join(directory, "dm.json");
      await writeFile(
        script,
        JSON.stringify([
          { text: "Two goblins crouch among the crates, blades out." },
          {
            toolCalls: [
              {
                id: "call-1",
                name: "attack",
                argumentsJson: JSON.stringify({ target: expected.first }),
              },
            ],
          },
        ]),
      );
      const server = await startFifthBrowserServer({
        libraryPath: join(directory, "characters.json"),
        seed,
        dmModel: await loadScriptedDmModel(script),
      });
      const browser = await launch();
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(5000);
      try {
        await page.goto(server.url);
        await page.locator("#open-creation").click();
        await page
          .locator("#preview-body")
          .filter({ hasText: "AC:" })
          .waitFor();
        await page.locator("#character-name").fill("Ada");
        await page.locator("#save-character").click();
        await page.locator("#sheet-name").filter({ hasText: "Ada" }).waitFor();
        await page
          .locator('.start-adventure[data-adventure="goblin-storeroom"]')
          .click();
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#log > li").first().waitFor();

        // The opening: unboxed narration, then the initiative card.
        assert.deepEqual(await entries(page), [
          {
            kind: "narration",
            parts: [
              ["note", "Narration"],
              ["note", "Resolved action"],
            ],
            newest: true,
            tabIndex: "-1",
          },
        ]);
        const [initiative] = await compactTexts(page);
        assert.match(
          initiative,
          /^Initiative: [^·]+ \d+ [+−] \d+ = \d+( \(roll-off [\d, ]+\))?( · [^·]+ \d+ [+−] \d+ = \d+( \(roll-off [\d, ]+\))?)+$/,
        );
        assert.match(initiative, /(: | · )Ada \d+ [+−] \d+ = \d+/);

        // A typed message the DM answers in words, then one it acts on.
        await say(page, "I size up the goblins");
        await say(page, "I swing my mace at the nearest goblin");
        const shown = await entries(page);
        assert.deepEqual(shown.slice(1), [
          {
            kind: "message",
            parts: [
              ["note", "You said"],
              ["note", "Dungeon Master"],
            ],
            newest: false,
            tabIndex: null,
          },
          {
            kind: "message",
            parts: [
              ["note", "You said"],
              ["note", "Resolved action"],
            ],
            newest: true,
            tabIndex: "-1",
          },
        ]);
        assert.equal(
          await page.locator("#log > li").nth(1).textContent(),
          "You: I size up the goblinsTwo goblins crouch among the crates, blades out.",
        );
        assert.match(
          await page
            .locator("#log > li")
            .nth(2)
            .locator(".compact")
            .first()
            .textContent(),
          /^Ada → .+ (Hit|Critical hit|Miss) d20 \d+ \+ \d+ = \d+ vs AC \d+/,
        );

        // Mid-fight, a reload renders the same history.
        const before = await page.locator("#log").innerHTML();
        await page.reload();
        await page.locator("#adventure").waitFor({ state: "visible" });
        await page.locator("#log > li").first().waitFor();
        assert.equal(await page.locator("#log").innerHTML(), before);

        // Clicks until the fight ends.
        while (!(await page.locator("#ending").isVisible())) {
          const attack = page.locator("#attack-controls button.attack:enabled");
          await added(page, async () =>
            ((await attack.count()) > 0
              ? attack.first()
              : page.locator('#feature-controls button[data-action="end-turn"]')
            ).click(),
          );
        }
        // Each attack: actor and target, the outcome as a tag, the attack's
        // dice; a hit adds its damage and the target's HP after.
        const attacks = (await compactTexts(page)).filter((text) =>
          text.includes(" → "),
        );
        for (const row of attacks) {
          assert.match(
            row,
            /^[^·]+ → [^·]+ (Miss (target die d\d+ \d+ · )?(disadvantage \(Sap\) )?d20 \d+(, d20 \d+)? \+ \d+ = \d+ vs AC \d+|(Hit|Critical hit) (target die d\d+ \d+ · )?(disadvantage \(Sap\) )?d20 \d+(, d20 \d+)? \+ \d+ = \d+ vs AC \d+ · \d+ \w+ \(d\d+ \d+( \+ d\d+ \d+)*( [+−] \d+)?\) → \d+\/\d+ HP)$/,
          );
        }
        // Sap: both d20s beside the attack, one of them struck through.
        assert.ok(
          attacks.some((text) =>
            /disadvantage \(Sap\) d20 \d+, d20 \d+ /.test(text),
          ),
          attacks.join("\n"),
        );
        assert.ok(
          (await page
            .locator("#log .compact .roll.attack .roll-die.dropped")
            .count()) > 0,
        );
        const hits = attacks.filter((text) => !/ Miss /.test(text));
        assert.ok(hits.length > 0);
        // Damage is emphasised; the hit or miss is a tag, as is a saving
        // throw's success or failure (morale, #237).
        assert.equal(
          await page.locator("#log .compact .roll.damage strong").count(),
          hits.length,
        );
        const saves = (await compactTexts(page)).filter((text) =>
          text.includes(" saving throw "),
        );
        assert.equal(
          await page.locator("#log .compact .tag").count(),
          attacks.length + saves.length,
        );

        // Screen readers get every line's engine text, not the compact form,
        // and the Full text disclosure shows the card's engine text.
        const spokenCards = await page.evaluate(() =>
          [...document.querySelectorAll("#log .card.result")]
            .filter((card) => card.querySelector(".compact"))
            .map((card) => ({
              hidden: [...card.querySelectorAll(".compact")].every(
                (node) => node.getAttribute("aria-hidden") === "true",
              ),
              spoken: [...card.querySelectorAll(".card-line > p:first-child")]
                .map((line) =>
                  [...line.childNodes]
                    .filter(
                      (node) =>
                        node.nodeType === Node.TEXT_NODE ||
                        !node.matches("[aria-hidden], button"),
                    )
                    .map((node) => node.textContent)
                    .join("")
                    .trim(),
                )
                .join("\n"),
              full: card.querySelector(".full-text").textContent,
              fullHidden: card.querySelector(".full-text").hidden,
            })),
        );
        assert.ok(spokenCards.length > 1);
        // Both shapes from #196: an opponent's attack in the opening card, and
        // Ada's miss followed by her "still your turn" line.
        assert.match(
          spokenCards[0].full,
          /\n.+ attacks Ada with .+\. Miss\.\n/,
        );
        assert.ok(
          spokenCards.some(({ full }) =>
            /^Ada attacks .+\. Miss\.\nIt is still your turn/m.test(full),
          ),
          spokenCards.map(({ full }) => full).join("\n\n"),
        );
        for (const card of spokenCards) {
          assert.deepEqual(card, {
            hidden: true,
            spoken: card.full,
            full: card.full,
            fullHidden: true,
          });
        }
        const more = page.locator("#log .card-more").last();
        assert.equal(await more.getAttribute("aria-expanded"), "false");
        await more.click();
        assert.equal(await more.getAttribute("aria-expanded"), "true");
        assert.ok(
          await page.locator("#log .card.result .full-text").last().isVisible(),
        );
        await more.click();
        assert.equal(await more.getAttribute("aria-expanded"), "false");

        // A card with an attack is no taller than its engine text alone, as
        // cards were before #159, with slack for CI's wider fonts (#196).
        const taller = await page.evaluate((fonts) => {
          const log = document.querySelector("#log");
          const found = [];
          for (const [family, spacing] of fonts) {
            log.style.fontFamily = family;
            log.style.letterSpacing = spacing;
            for (const card of log.querySelectorAll(".card.result")) {
              if (!card.querySelector(".compact .roll.attack")) {
                continue;
              }
              const probe = document.createElement("div");
              probe.className = "card result";
              const text = document.createElement("p");
              text.style.whiteSpace = "pre-line";
              text.textContent = card.querySelector(".full-text").textContent;
              probe.append(text);
              card.after(probe);
              if (card.offsetHeight > probe.offsetHeight + 1) {
                found.push([
                  family,
                  spacing,
                  card.offsetHeight,
                  probe.offsetHeight,
                  text.textContent,
                ]);
              }
              probe.remove();
            }
          }
          log.style.fontFamily = "";
          log.style.letterSpacing = "";
          return found;
        }, FONTS);
        assert.deepEqual(taller, []);

        // Each kind looks different.
        const looks = await page.evaluate(() => {
          const style = (selector) =>
            getComputedStyle(document.querySelector(`#log ${selector}`));
          return {
            narration: style(".narration").borderTopStyle,
            card: style(".card.result").borderTopStyle,
            player: style(".player").backgroundColor,
            reply: style(".reply").borderLeftStyle,
            replyLabel: getComputedStyle(
              document.querySelector("#log .reply"),
              "::before",
            ).content,
          };
        });
        assert.equal(looks.narration, "none");
        assert.equal(looks.card, "solid");
        assert.notEqual(looks.player, "rgba(0, 0, 0, 0)");
        assert.equal(looks.reply, "solid");
        assert.match(looks.replyLabel, /Dungeon Master/);

        // Only the newest entry is marked, and it takes focus.
        assert.deepEqual(
          (await entries(page)).map(({ newest }) => newest).lastIndexOf(true),
          (await entries(page)).length - 1,
        );
        assert.equal(await page.locator("#log > li.newest").count(), 1);
        assert.equal(
          await page.evaluate(() => {
            focusNewestEntry();
            return (
              document.activeElement ===
              document.querySelector("#log > li:last-child")
            );
          }),
          true,
        );

        // Nothing in the history scrolls sideways, even in a wide font.
        assert.equal(
          await page.locator("#log").evaluate((log) => {
            log.style.fontFamily = "Verdana";
            const fits = log.scrollWidth <= log.clientWidth;
            log.style.fontFamily = "";
            return fits;
          }),
          true,
        );

        // The save holds the grouped rolls.
        const [name] = (
          await readdir(join(directory, "characters-adventures"))
        ).filter((file) => file.endsWith(".json"));
        const file = JSON.parse(
          await readFile(
            join(directory, "characters-adventures", name),
            "utf8",
          ),
        );
        assert.equal(file.formatVersion, 19);
        assert.ok(
          file.history.some(({ cards }) =>
            cards.some(({ lines }) =>
              lines.some(({ rolls: groups }) =>
                groups.some(({ mode }) => mode === "disadvantage (Sap)"),
              ),
            ),
          ),
        );
      } finally {
        await browser.close();
        await server.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
}
