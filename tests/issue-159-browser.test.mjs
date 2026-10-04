// #159: each kind of conversation-history entry looks different and is
// labelled, result cards show their rolls grouped beside the line they
// belong to, the newest entry is marked and focusable, and a reload restores
// the same rendering. A storeroom fight with Sap and typed messages to the
// scripted DM, at desktop and phone widths.
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { loadBuiltInFifthAdventures } from "../dist/adventure-5e.js";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { buildFighter, rollAbilitySet } from "../dist/fighter-5e.js";
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
const DEFAULT_CHOICES = {
  placement: {
    strength: 0,
    dexterity: 1,
    constitution: 2,
    intelligence: 3,
    wisdom: 4,
    charisma: 5,
  },
  increase: { strength: 2, constitution: 1 },
  skills: ["athletics", "perception"],
  fightingStyle: "defense",
};

/** The first Fighter a browser on `seed` creates with the default choices. */
function firstFighter(seed) {
  const stream = createHash("sha256")
    .update(`5e-ability-rolls:${seed}:1`)
    .digest()
    .readUInt32LE(0);
  return buildFighter(
    "a".repeat(32),
    "Ada",
    rollAbilitySet(createSeededRandom(stream)),
    DEFAULT_CHOICES,
  );
}

/**
 * The storeroom fight on `seed`, played as the test plays it: a typed
 * attack on the first target, then clicks on the first target, or End turn
 * once the action is spent. The first target, and whether a sapped
 * opponent attacked.
 */
function simulate(seed) {
  const runtime = createFifthRuntime(storeroom, firstFighter(seed));
  const random = createSeededRandom(sessionSeed(seed, 1));
  let state = runtime.handleAction(
    runtime.createSession(),
    { type: "begin" },
    random,
  ).state;
  const first = runtime.attackTargets(state)[0]?.id;
  let sapped = false;
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
    sapped ||= result.events.some(
      (event) =>
        event.type === "attack" && event.mode?.disadvantage.includes("Sap"),
    );
    state = result.state;
    steps++;
  }
  return { first, sapped, steps };
}

let seed = 0;
let expected = simulate(seed);
while (!expected.sapped || expected.first === undefined || expected.steps < 3) {
  expected = simulate(++seed);
  assert.ok(seed < 5000, "no storeroom fight with a sapped attack");
}

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

const rolls = (page) =>
  page
    .locator("#log .roll")
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
          { text: "Three goblins crouch among the crates, blades out." },
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
        for (const row of (await rolls(page)).filter((text) =>
          text.startsWith("Initiative"),
        )) {
          assert.match(row, /^Initiative, .+: d20 \d+ [+−] \d+ = \d+/);
        }
        assert.ok(
          (await rolls(page)).some((text) =>
            /^Initiative, Ada: d20 \d+ [+−] \d+ = \d+/.test(text),
          ),
        );

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
          "You: I size up the goblinsThree goblins crouch among the crates, blades out.",
        );
        assert.match(
          await page
            .locator("#log > li")
            .nth(2)
            .locator(".roll")
            .first()
            .textContent(),
          /^Attack: d20 \d+ \+ \d+ = \d+ against AC \d+ (Hit|Critical hit|Miss)$/,
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
        const rows = await rolls(page);
        const attacks = rows.filter((text) => text.startsWith("Attack"));
        for (const row of attacks) {
          assert.match(
            row,
            /^Attack(, disadvantage \(Sap\))?: d20 \d+( \(not kept\))?(, d20 \d+( \(not kept\))?)? \+ \d+ = \d+ against AC \d+ (Hit|Critical hit|Miss)$/,
          );
        }
        // Sap: both d20s beside the attack, one of them not kept.
        assert.ok(
          attacks.some((text) =>
            /^Attack, disadvantage \(Sap\): d20 \d+( \(not kept\))?, d20 \d+( \(not kept\))? /.test(
              text,
            ),
          ),
          attacks.join("\n"),
        );
        const damage = rows.filter((text) => text.startsWith("Damage"));
        assert.ok(damage.length > 0);
        for (const row of damage) {
          assert.match(
            row,
            /^Damage: d\d+ \d+( \+ d\d+ \d+)* [+−] \d+ = \d+ \w+ → .+ \d+\/\d+ HP$/,
          );
        }
        // Damage is emphasised; the hit or miss is a tag.
        assert.equal(
          await page.locator("#log .roll.damage strong").count(),
          damage.length,
        );
        assert.equal(
          await page.locator("#log .roll.attack .tag").count(),
          attacks.length,
        );

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
        assert.equal(file.formatVersion, 5);
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
