import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { resolveStartupSeed } from "./random.js";
import { announceBrowser } from "./browser-launch.js";
import { startBrowserServer } from "./browser-server.js";
import { startFifthBrowserServer } from "./browser-5e-server.js";
import { BROWSER_RELEASES, BROWSER_START_VERSION } from "./browser-releases.js";

const LEGACY_VERSIONS = BROWSER_RELEASES.filter(
  ({ mode }) => mode === "single-slot",
).map(({ version }) => version);

const USAGE = `Usage: npm.cmd run browser -- [--seed <0-4294967295>] [--characters <library.json>] [--save <path>] [--artwork <manifest.json>] [--legacy | --5e]
Create or choose a saved Fighter, then select an adventure. Default library: characters.json; its adventures are saved in the adjacent character-adventures directory and continue when you rerun the same command.
--legacy uses only the --save slot: it starts Hollow Beacon v${BROWSER_START_VERSION}; existing v${LEGACY_VERSIONS[0]}-v${LEGACY_VERSIONS.at(-1)} slots continue unchanged.
--5e (temporary, until 5e is the only mode) creates and reads 5e Fighters in their own library, by default characters-5e.json; adventures are not playable there yet. Only --seed and --characters apply.
Set OPENAI_API_KEY in the environment before launch.`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (
      (argument === "--legacy" || argument === "--5e") &&
      !values.has(argument)
    ) {
      values.set(argument, "true");
      continue;
    }
    const equals = argument.indexOf("=");
    const name = equals < 0 ? argument : argument.slice(0, equals);
    const value = equals < 0 ? args[++index] : argument.slice(equals + 1);
    if (
      (name !== "--seed" &&
        name !== "--save" &&
        name !== "--artwork" &&
        name !== "--characters") ||
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
  if (
    values.has("--5e") &&
    ["--legacy", "--save", "--artwork"].some((name) => values.has(name))
  ) {
    throw new Error(USAGE);
  }
  const server = values.has("--5e")
    ? await startFifthBrowserServer({
        libraryPath: resolve(
          values.get("--characters") ?? "characters-5e.json",
        ),
        seed,
      })
    : await startBrowserServer({
        contentVersion: BROWSER_START_VERSION,
        ...(values.has("--legacy")
          ? {}
          : {
              libraryPath: resolve(
                values.get("--characters") ?? "characters.json",
              ),
            }),
        seed,
        savePath: resolve(
          values.get("--save") ?? "hollow-beacon-browser-save.json",
        ),
        apiKey: process.env.OPENAI_API_KEY ?? "",
        ...(values.has("--artwork")
          ? { artworkPath: resolve(values.get("--artwork")!) }
          : {}),
      });
  const stop = () => {
    void server.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
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
