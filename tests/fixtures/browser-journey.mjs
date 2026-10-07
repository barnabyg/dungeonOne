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
