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

/** Opens Flee's menu (#525) in the fight panel, unless it is open. */
export async function openFlee(page) {
  const toggle = page.locator("#flee-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await page.locator("#flee-menu").waitFor();
}

/**
 * Clicks `actionButton` and waits for its settled history entry. A flight
 * (#525) is chosen from Flee's menu, opened first.
 */
export const clickAction = (page, action, target) =>
  settled(page, async () => {
    if (action === "flee") {
      await openFlee(page);
    }
    await actionButton(page, action, target).click();
  });

/**
 * Takes one fight turn: attacks the first target offered, or ends the turn
 * once Ada's action is spent; waits for its settled history entry.
 */
export const fightTurn = (page) =>
  settled(page, async () => {
    const attack = page.locator("#encounter button.attack:enabled");
    await (
      (await attack.count()) > 0
        ? attack.first()
        : page.locator('#encounter button[data-action="end-turn"]')
    ).click();
  });

/**
 * Takes fight turns until the turn line says the fight is over, calling
 * `after` once each turn has settled.
 */
export async function fight(page, after = async () => {}) {
  while ((await page.locator("#turn").textContent()) !== "The fight is over.") {
    await fightTurn(page);
    await after();
  }
}

/**
 * The shop's row (#515) for what `action` trades: the ware to buy, or the
 * pack's entry to sell, equipped or stowed as the sale says.
 */
export const shopItem = (page, action, target) => {
  const slot =
    { sell: '[data-slot="stowed"]', "sell-equipped": '[data-slot="equipped"]' }[
      action
    ] ?? "";
  return page.locator(
    action === "buy"
      ? `#shop-ware-list li[data-ware="${target}"] button`
      : `#shop-pack-groups li[data-id="${target}"]${slot} button`,
  );
};

/** Opens the shop from the merchant's Trade (#515), unless it is open. */
export async function openShop(page) {
  if (await page.locator("#shop").isHidden()) {
    await page.locator("#open-shop").click();
    await page.locator("#shop").waitFor();
  }
}

/** Leaves the shop for the room (#515). */
export async function leaveShop(page) {
  await page.locator("#leave-shop").click();
  await page.locator("#session-layout").waitFor();
}

/**
 * Trades in the shop (#515): opens it, chooses the item and clicks its Buy
 * or Sell, confirming the sale of equipped gear, and waits for the trade's
 * settled history entry. The shop stays open.
 */
export async function trade(page, action, target) {
  await openShop(page);
  await shopItem(page, action, target).click();
  await settled(page, async () => {
    await actionButton(page, action, target).click();
    if (action === "sell-equipped") {
      await page.locator("#confirm-sale").click();
    }
  });
}
