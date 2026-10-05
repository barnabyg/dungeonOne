import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { resolveStartupSeed } from "./random.js";
import { announceBrowser } from "./browser-launch.js";
import {
  FIFTH_DM_SETUP_HINT,
  startFifthBrowserServer,
} from "./browser-5e-server.js";

const USAGE = `Usage: npm.cmd run browser -- [--seed <0-4294967295>] [--characters <library.json>]
Create or choose a saved 5e Fighter, then take it into an adventure. Default library: characters.json; its adventures are saved in the adjacent characters-adventures directory and continue when you rerun the same command.
Set OPENAI_API_KEY in the environment before launch to let players type to the Dungeon Master; without it the buttons still work.`;

/** Flags from before 5e became the only mode, and why each is refused. */
const REMOVED_FLAGS: Readonly<Record<string, string>> = {
  "--legacy":
    "--legacy has been removed: the pre-5e game, with its single save slot, no longer runs in the browser.",
  "--5e":
    "--5e is no longer needed: 5e is the browser's only mode. Launch without it.",
  "--save":
    "--save has been removed with the pre-5e game's single save slot. Characters and their adventures live in the --characters library.",
  "--artwork":
    "--artwork has been removed with the pre-5e game, which was the only one to use it.",
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  // A removed flag is refused before anything is read, wherever it appears.
  for (const argument of args) {
    const name = argument.split("=", 1)[0]!;
    const reason = REMOVED_FLAGS[name];
    if (reason !== undefined) {
      throw new Error(`${reason} Nothing was read or changed.\n${USAGE}`);
    }
  }
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    const equals = argument.indexOf("=");
    const name = equals < 0 ? argument : argument.slice(0, equals);
    const value = equals < 0 ? args[++index] : argument.slice(equals + 1);
    if (
      (name !== "--seed" && name !== "--characters") ||
      values.has(name) ||
      !value ||
      value.startsWith("--")
    ) {
      throw new Error(USAGE);
    }
    values.set(name, value);
  }
  const seedValue = values.get("--seed");
  const seed = resolveStartupSeed(
    seedValue === undefined ? [] : ["--seed", seedValue],
    () => randomBytes(4).readUInt32LE(0),
  );
  const server = await startFifthBrowserServer({
    libraryPath: resolve(values.get("--characters") ?? "characters.json"),
    seed,
    apiKey: process.env.OPENAI_API_KEY ?? "",
  });
  const stop = () => {
    void server.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  if (!server.dmAvailable) {
    process.stdout.write(FIFTH_DM_SETUP_HINT);
  }
  await announceBrowser(server.url, (message) => {
    process.stdout.write(message);
  });
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Browser startup failed."}\n`,
  );
  process.exitCode = 2;
}
