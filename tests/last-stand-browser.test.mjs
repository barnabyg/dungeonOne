// Last Stand (#499), browser → API → storage: Ada takes a Potion of Healing, goes down
// to the lone goblin and only waits until it brings her to 0 HP. On a
// seed whose death saving throw succeeds, the fall waits: the action bar holds only the Last Stand row, Drink and Fall, and
// the turn line says so, before and after a reload. Drinking raises her and
// the fight goes on; on another run, Fall ends the adventure.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFifthBrowserServer } from "../dist/browser-5e-server.js";
import { FifthSession, sessionSeed } from "../dist/session-5e.js";
import {
  actionButton,
  clickAction,
  createAndStart,
  settled,
} from "./fixtures/browser-journey.mjs";
import { sessionFile } from "./fixtures/save-files.mjs";
import { waitsAtLastStand } from "./fixtures/last-stand.mjs";
import {
  assertTogether,
  firstFighter,
  launch,
} from "./fixtures/session-layout.mjs";
import { potionCellar } from "./fixtures/modules.mjs";

const viewport = { width: 1280, height: 850 };

/** The first browser seed whose Ada reaches Last Stand in the cellar. */
const seed = (() => {
  for (let candidate = 0; candidate < 200; candidate++) {
    const session = FifthSession.begin(
      sessionSeed(candidate, 1),
      potionCellar,
      firstFighter(candidate),
    );
    if (waitsAtLastStand(session)) {
      return candidate;
    }
  }
  throw new Error("no seed below 200 reaches Last Stand");
})();

async function serve() {
  const directory = await mkdtemp(join(tmpdir(), "last-stand-"));
  const server = await startFifthBrowserServer({
    adventures: [potionCellar],
    // Fixtures are engine material, not gated content.
    qualifies: () => true,
    libraryPath: join(directory, "characters.json"),
    seed,
  });
  return { directory, server };
}

/** Ada with the potion in the goblin's fight, waiting until Last Stand. */
async function toLastStand(page, url) {
  await createAndStart(page, url, "potion-cellar");
  await clickAction(page, "take", "healing-potion");
  await clickAction(page, "move", "cellar");
  const row = page.getByRole("group", { name: "Last Stand" });
  while ((await row.count()) === 0) {
    assert.notEqual(
      await page.locator("#turn").textContent(),
      "The fight is over.",
    );
    await settled(page, () =>
      page.locator('#encounter button[data-action="end-turn"]').click(),
    );
  }
  return row;
}

/** The action bar's buttons, by their text. */
const barButtons = (page) =>
  page.locator("#action-bar button.act").allTextContents();

test(
  `Last Stand: Drink and Fall alone in the bar, kept over a reload; drinking raises Ada (${viewport.width}px)`,
  { timeout: 120000 },
  async () => {
    const { directory, server } = await serve();
    const browser = await launch();
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(5000);
    try {
      const row = await toLastStand(page, server.url);
      const check = async (label) => {
        assert.match(
          await page.locator("#turn").textContent(),
          /^Round \d+: Goblin Warrior brings you to 0 HP: Last Stand\.$/u,
        );
        assert.deepEqual(await barButtons(page), [
          "Drink Potion of Healing",
          "Fall",
        ]);
        assert.equal(await row.locator("button.act").count(), 2);
        await assertTogether(page, label);
      };
      await check("the Last Stand");
      assert.match(
        await page.locator("#log li").last().innerText(),
        /Last Stand: Ada drops to 0 HP and makes a death saving throw: \d+ against DC 11\. Success: Ada clings on, and can drink the Potion of Healing with the reaction to rise again, or fall\./u,
      );
      // A reload offers the same choice.
      await page.reload();
      await page.locator("#adventure").waitFor({ state: "visible" });
      await check("the Last Stand after a reload");
      await settled(page, () =>
        actionButton(page, "use", "healing-potion").click(),
      );
      assert.match(
        await page.locator("#log li").last().innerText(),
        /Last Stand: you drink the Potion of Healing with your reaction: .* you rise again with \d+\/\d+ HP\./u,
      );
      assert.equal(await row.count(), 0);
      assert.match(await page.locator("#turn").textContent(), /your turn\.$/u);
      const saved = await sessionFile(directory);
      assert.equal(saved.state.encounter.pendingReaction, undefined);
      assert.ok(saved.state.character.hp > 0);
      assert.ok(!saved.state.inventory.includes("healing-potion"));
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "Last Stand: Fall ends the adventure in defeat",
  { timeout: 120000 },
  async () => {
    const { directory, server } = await serve();
    const browser = await launch();
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(5000);
    try {
      await toLastStand(page, server.url);
      await settled(page, () => actionButton(page, "fall").click());
      assert.equal(await page.locator("#action-bar").isHidden(), true);
      const saved = await sessionFile(directory);
      assert.equal(saved.state.status, "defeat");
    } finally {
      await browser.close();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
