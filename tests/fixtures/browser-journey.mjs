// The steps most 5e browser tests take before the part they check: open
// creation, save a Fighter with the default choices, start an adventure.
// Tests that check one of these steps closely keep their own clicks.

/** Opens creation and waits for its preview, once the dice are placed. */
export async function openCreation(page) {
  await page.locator("#open-creation").click();
  await page.locator("#preview-body").filter({ hasText: "AC:" }).waitFor();
}

/** Names the Fighter being created, saves it and waits for its sheet. */
export async function saveFighter(page, name = "Ada") {
  await page.locator("#character-name").fill(name);
  await page.locator("#save-character").click();
  await page.locator("#sheet-name").filter({ hasText: name }).waitFor();
}

/** Creates a Fighter with the default choices, from the library. */
export async function createFighter(page, name = "Ada") {
  await openCreation(page);
  await saveFighter(page, name);
}

/**
 * Starts an adventure from the sheet and waits for the session and its
 * first history entry.
 */
export async function startAdventure(page, adventureId) {
  await page
    .locator(`.start-adventure[data-adventure="${adventureId}"]`)
    .click();
  await page.locator("#adventure").waitFor({ state: "visible" });
  await page.locator("#log li").first().waitFor();
}

/** Opens `url`, creates Ada and starts the adventure `adventureId`. */
export async function createAndStart(page, url, adventureId) {
  await page.goto(url);
  await createFighter(page);
  await startAdventure(page, adventureId);
}

/** An element's text with its blank lines collapsed. */
export const text = async (locator) =>
  (await locator.innerText()).replace(/\n+/gu, "\n");

/**
 * Runs `run` and waits for a new history entry that has settled: an entry
 * the page shows as pending while the server answers does not count.
 */
export async function settled(page, run) {
  const count = await page.locator("#log li").count();
  await run();
  await page.waitForFunction(
    (seen) =>
      document.querySelectorAll("#log li:not([data-pending])").length > seen,
    count,
  );
}

/**
 * The button for an action on a target, in the action bar or on a carried
 * item (#198). Without `target`, the action's only button.
 */
export const actionButton = (page, action, target) =>
  page.locator(
    `button.act[data-action="${action}"]${target === undefined ? "" : `[data-target="${target}"]`}`,
  );

/** Clicks `actionButton` and waits for its settled history entry. */
export const clickAction = (page, action, target) =>
  settled(page, () => actionButton(page, action, target).click());

/**
 * Takes one fight turn: attacks the first target offered, or ends the turn
 * once Ada's action is spent; waits for its settled history entry.
 */
export const fightTurn = (page) =>
  settled(page, async () => {
    const attack = page.locator("#attack-controls button.attack:enabled");
    await (
      (await attack.count()) > 0
        ? attack.first()
        : page.locator('#feature-controls button[data-action="end-turn"]')
    ).click();
  });

/** Takes fight turns until the turn line says the fight is over. */
export async function fight(page) {
  while ((await page.locator("#turn").textContent()) !== "The fight is over.") {
    await fightTurn(page);
  }
}
