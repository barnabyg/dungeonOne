// Issue #95 clean-checkout handoff check. Run it in a fresh clone after
// `npm.cmd ci`, `npm.cmd run verify` and `npm.cmd run build`. It follows the
// player handoff in a real headless browser:
//
// 1. The shipped launcher (`dist/browser-cli.js`, seed 0, an explicit
//    --characters library) starts; the page creates Ada and starts Hollow
//    Beacon. Ctrl+C (SIGINT) stops it.
// 2. The same launcher command reopens the same adventure without a turn.
// 3. The tracked journey (`beaconExamine`) is typed into the page. Gameplay
//    needs a provider, so this step uses the shipped server in its own process
//    with the tracked scripted provider (tests/fixtures/issue-93-server.mjs),
//    over the same library. No live request is made.
// 4. The same launcher command opens completed Review: input disabled, XP
//    1,000 credited once, library and save bytes unchanged.
// 5. Starting over in the page: Rest between adventures, start again, cancel
//    and then confirm Abandon adventure, Rest, and start again.
// 6. Diagnostic CLI replay of a tracked trace, checked separately.
//
// The launcher runs through tests/fixtures/issue-93-launcher.mjs, which only
// stops it opening a desktop browser window. Its credential is a placeholder:
// steps 1, 2, 4 and 5 make no provider request.
// Usage: node scripts/qualify-handoff.mjs [receipt.json]
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { browserActions } from "../dist/browser-actions.js";
import { SaveSession } from "../dist/save.js";
import {
  beaconExamine,
  commandCall,
} from "../tests/fixtures/character-journeys.mjs";
import { launchScriptedServer } from "../tests/fixtures/scripted-server-process.mjs";

const repository = fileURLToPath(new URL("..", import.meta.url));
const tracked = (path) => join(repository, path);
/** The seed every step uses, as in player 01's command. */
const SEED = 0;

function check(condition, message) {
  if (!condition) {
    throw new Error("Handoff check failed: " + message);
  }
}

/** Starts the launcher with the player's arguments; resolves its URL. */
async function launch(directory, libraryPath) {
  const child = spawn(
    process.execPath,
    [
      tracked("tests/fixtures/issue-93-launcher.mjs"),
      "--seed",
      String(SEED),
      "--characters",
      libraryPath,
    ],
    {
      cwd: directory,
      env: { ...process.env, OPENAI_API_KEY: "handoff-placeholder" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  const url = await new Promise((resolveUrl, reject) => {
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = /(http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (match) {
        resolveUrl(match[1]);
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.once("exit", () => reject(new Error(output)));
  });
  return {
    url,
    output: () => output,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }
      const exited = new Promise((resolveExit) => {
        child.once("exit", resolveExit);
      });
      child.kill("SIGINT");
      await exited;
    },
  };
}

/** The library and every adventure save, as text, to compare bytes. */
async function snapshotSaves(directory, libraryPath) {
  const library = await readFile(libraryPath, "utf8");
  const sessions = await Promise.all(
    JSON.parse(library).sessions.map(({ id }) =>
      readFile(join(directory, "character-adventures", `${id}.json`), "utf8"),
    ),
  );
  return [library, ...sessions];
}

const getJson = async (url, path) => (await fetch(url + path)).json();
const idle = (page) =>
  page.waitForFunction(
    () =>
      document.getElementById("conversation").getAttribute("aria-busy") ===
      "false",
  );
const libraryButton = (page, list, text) =>
  page.locator(`#${list} button`).filter({ hasText: text });

/**
 * Runs the handoff in `directory` and returns the receipt. Throws on the
 * first failed check.
 */
export async function qualifyHandoff(directory) {
  const libraryPath = join(directory, "characters.json");
  const checks = [];
  const launcherUrls = [];
  const browser = await chromium.launch(
    process.platform === "win32"
      ? { channel: "msedge", headless: true }
      : { headless: true },
  );
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const live = new Set();
  const relaunch = async () => {
    const launcher = await launch(directory, libraryPath);
    live.add(launcher);
    launcherUrls.push(launcher.url);
    await page.goto(launcher.url);
    return launcher;
  };
  const stop = async (launcher) => {
    live.delete(launcher);
    await launcher.stop();
  };
  try {
    // 1. Fresh start: create a character and start the adventure.
    let launcher = await relaunch();
    check(
      /Press Ctrl\+C to stop/.test(launcher.output()),
      "the launcher prints how to stop it",
    );
    await page.locator("#open-characters").click();
    await page.locator("#character-name").waitFor({ state: "visible" });
    await page.locator("#character-name").fill("Ada");
    await page.locator("#create-character button[type=submit]").click();
    await page
      .locator("#library-feedback")
      .filter({ hasText: "Character saved" })
      .waitFor();
    const startLabel = await libraryButton(
      page,
      "library-adventures",
      "Start Hollow Beacon",
    ).innerText();
    check(
      /Recommended levels 1–2/.test(
        await page.locator("#library-adventures").innerText(),
      ),
      "Hollow Beacon shows recommended levels 1–2",
    );
    await libraryButton(page, "library-adventures", "Start Hollow").click();
    await page.locator("#character-library").waitFor({ state: "hidden" });
    const opening = await getJson(launcher.url, "/api/state");
    check(opening.slot === "occupied", "the adventure started");
    check(
      opening.character.sheet.level === 1 && opening.character.sheet.xp === 0,
      "a new level-1 Fighter with 0 XP",
    );
    checks.push(
      `Launcher started; browser created Ada (level 1, 0 XP) and clicked “${startLabel}”`,
    );

    // 2. Automatic continuation by rerunning the same command.
    await stop(launcher);
    launcher = await relaunch();
    const continued = await getJson(launcher.url, "/api/state");
    check(
      JSON.stringify(continued) === JSON.stringify(opening),
      "rerunning the launcher reopens the same adventure exactly",
    );
    await page.locator("#message").waitFor({ state: "visible" });
    check(
      await page.locator("#message").isEnabled(),
      "the message box is enabled after continuing",
    );
    checks.push("Ctrl+C and the same command reopened the identical adventure");
    await stop(launcher);

    // 3. The tracked journey, typed into the page.
    const server = await launchScriptedServer({
      savePath: join(directory, "unused-slot.json"),
      seed: SEED,
      libraryPath,
    });
    let completionCards = "";
    try {
      await page.goto(server.url);
      for (const command of beaconExamine) {
        const data = JSON.parse(await readFile(libraryPath, "utf8"));
        const session = await SaveSession.load(
          join(
            directory,
            "character-adventures",
            `${data.selectedSessionId}.json`,
          ),
        );
        const expected = commandCall(command);
        const action = browserActions(session, "handoff").find(
          ({ call }) =>
            call.name === expected.name &&
            JSON.stringify(JSON.parse(call.argumentsJson)) ===
              JSON.stringify(expected.arguments),
        );
        check(action !== undefined, `${command} is offered`);
        const response = page.waitForResponse((result) =>
          result.url().endsWith("/api/turn"),
        );
        await page.locator("#message").fill(action.message);
        await page.locator("#message").press("Enter");
        const result = await (await response).json();
        check(result.committed === true, `${command} committed`);
        await idle(page);
        completionCards = result.cards.map(({ text }) => text).join("\n");
      }
    } finally {
      await server.stop();
    }
    check(/Level 1 → 2/.test(completionCards), "the ending levels Ada up");
    checks.push(
      `Typed ${beaconExamine.length} tracked turns through the shipped server and scripted provider (${server.calls()} scripted calls) to the slower human warning`,
    );
    const finished = await snapshotSaves(directory, libraryPath);

    // 4. The launcher reopens completed Review.
    launcher = await relaunch();
    await page.locator("#completion").waitFor({ state: "visible" });
    check(
      !(await page.locator("#message").isEnabled()),
      "Review disables the message box",
    );
    const review = await getJson(launcher.url, "/api/state");
    check(review.scene.outcome === "victory", "Review shows the victory");
    check(
      review.character.sheet.xp === 1000 && review.character.sheet.level === 2,
      "1,000 XP credited once, level 2",
    );
    const unchanged = await snapshotSaves(directory, libraryPath);
    check(
      JSON.stringify(unchanged) === JSON.stringify(finished),
      "reopening Review changes no saved byte",
    );
    checks.push(
      "The same command reopened Review: input disabled, level 2, 1,000 XP, saves unchanged",
    );

    // 5. Starting over: rest, start, cancel and confirm Abandon, rest, start.
    await page.locator("#open-characters").click();
    await libraryButton(page, "library-characters", "Ada").click();
    await libraryButton(page, "library-adventures", "Rest between").click();
    await libraryButton(page, "library-adventures", "Start Hollow").click();
    await page.locator("#character-library").waitFor({ state: "hidden" });
    await page.locator("#open-characters").click();
    await libraryButton(page, "library-characters", "Ada").click();
    page.once("dialog", (dialog) => dialog.dismiss());
    await libraryButton(page, "library-adventures", "Abandon").click();
    check(
      (await getJson(launcher.url, "/api/characters")).characters[0]
        .availability === "active",
      "cancelled abandonment keeps the adventure active",
    );
    page.once("dialog", (dialog) => dialog.accept());
    await libraryButton(page, "library-adventures", "Abandon").click();
    await libraryButton(page, "library-adventures", "Rest between").click();
    await libraryButton(page, "library-adventures", "Start Hollow").click();
    await page.locator("#character-library").waitFor({ state: "hidden" });
    const sessions = (await getJson(launcher.url, "/api/characters")).sessions;
    check(sessions.length === 3, "the finished and abandoned journeys remain");
    check(
      (await getJson(launcher.url, "/api/state")).character.sheet.xp === 1000,
      "starting over keeps career XP",
    );
    checks.push(
      "Rest, start, cancelled then confirmed Abandon, Rest and a new start; 3 journeys listed, XP kept",
    );
    check(errors.length === 0, "no page errors: " + errors.join("; "));
  } finally {
    for (const launcher of live) {
      await launcher.stop();
    }
    await browser.close();
  }

  // 6. Diagnostic CLI replay, separate from the browser.
  const replay = execFileSync(
    process.execPath,
    [
      tracked("dist/cli.js"),
      "--replay",
      tracked("tests/fixtures/historical-ai-victory.json"),
    ],
    { encoding: "utf8" },
  );
  checks.push(
    "CLI replay of tests/fixtures/historical-ai-victory.json: " +
      replay.trim().split("\n").at(-1),
  );
  return { seed: SEED, launcherUrls, checks, completed: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = resolve(
    process.argv[2] ?? ".verify-artifacts/issue-95-handoff.json",
  );
  const root = resolve(".verify-artifacts");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "issue-95-handoff-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trim();
  const receipt = {
    commit: git("rev-parse", "HEAD"),
    trackedChanges: git("status", "--porcelain", "--untracked-files=no"),
    node: process.version,
    directory: relative(repository, directory),
    ...(await qualifyHandoff(directory)),
  };
  await writeFile(output, JSON.stringify(receipt, null, 2) + "\n");
  process.stdout.write(`Handoff checks passed. Receipt: ${output}\n`);
}
