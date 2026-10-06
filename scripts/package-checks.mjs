import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function run(args, capture = false) {
  const command = process.env.npm_execpath ? process.execPath : "npm";
  const commandArgs = process.env.npm_execpath
    ? [process.env.npm_execpath, ...args]
    : args;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: path.join(
        process.cwd(),
        ".verify-artifacts",
        "npm-cache",
      ),
    },
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    if (capture) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

rmSync("dist", { force: true, recursive: true });
run(["run", "build"]);

const packageManifest = JSON.parse(readFileSync("package.json", "utf8"));
const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8"));
const openAiRange = packageManifest.dependencies?.openai;
const lockedOpenAiVersion = lockfile.packages?.["node_modules/openai"]?.version;
if (
  typeof openAiRange !== "string" ||
  !/^\d+\.\d+\.\d+$/u.test(openAiRange) ||
  openAiRange !== lockedOpenAiVersion
) {
  throw new Error(
    "Package validation failed: openai must be an exact dependency matching the lockfile.",
  );
}

const packOutput = run(["pack", "--dry-run", "--json"], true);
const [manifest] = JSON.parse(packOutput);
const packagedFiles = new Set(manifest.files.map((entry) => entry.path));

// 5e adventure modules: the browser loads them at startup.
const { FIFTH_ADVENTURE_FILES, loadFifthAdventure } =
  await import("../dist/adventure-5e.js");
const fifthAdventures = Object.values(FIFTH_ADVENTURE_FILES).map(
  (file) => `adventures/5e/${file}`,
);
for (const adventure of fifthAdventures) {
  await loadFifthAdventure(adventure);
}

for (const required of [
  "dist/cli-5e.js",
  "dist/browser-cli.js",
  "dist/browser-launch.js",
  "dist/openai-dm-model.js",
  "dist/browser-5e-server.js",
  ...fifthAdventures,
  "package.json",
  "README.md",
]) {
  if (!packagedFiles.has(required)) {
    throw new Error(`Package validation failed: ${required} is missing`);
  }
}

process.stdout.write(
  `Clean build and package validation passed (${manifest.entryCount} files, ${manifest.size} bytes).\n`,
);

const temporary = mkdtempSync(path.join(tmpdir(), "dungeon one package "));
try {
  const [packed] = JSON.parse(
    run(["pack", "--json", "--pack-destination", temporary], true),
  );
  const archive = path.join(temporary, packed.filename);
  const extracted = path.join(temporary, "extracted package");
  const caller = path.join(temporary, "caller with spaces");
  mkdirSync(extracted);
  mkdirSync(caller);
  const unpack = spawnSync("tar", ["-xzf", archive, "-C", extracted], {
    encoding: "utf8",
  });
  if (unpack.status !== 0) {
    throw new Error(`Package extraction failed: ${unpack.stderr}`);
  }
  const installed = path.join(extracted, "package");
  mkdirSync(path.join(installed, "node_modules"));
  cpSync(
    "node_modules/openai",
    path.join(installed, "node_modules", "openai"),
    {
      recursive: true,
    },
  );
  // The browser server loads its adventure modules from the installed package.
  const { startFifthBrowserServer } = await import(
    pathToFileURL(path.join(installed, "dist", "browser-5e-server.js")).href
  );
  const fifthServer = await startFifthBrowserServer({
    libraryPath: path.join(caller, "characters.json"),
    seed: 42,
  });
  await fifthServer.close();
  // The CLI test adapter plays and replays a built-in module from the
  // installed package, run from another directory.
  const cli = path.join(installed, "dist", "cli-5e.js");
  const runExtracted = (args, input = "") => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: caller,
      encoding: "utf8",
      input,
      env: { ...process.env, OPENAI_API_KEY: "" },
    });
    if (result.status !== 0) {
      throw new Error(`Extracted package run failed: ${result.stderr}`);
    }
    return result.stdout;
  };
  const trace = path.join(caller, "delve trace.json");
  runExtracted(["--seed", "0", "--trace", trace], "1\nquit\n");
  if (JSON.parse(readFileSync(trace, "utf8")).kind !== "dungeon-one-5e-trace") {
    throw new Error("Extracted package did not write a 5e trace.");
  }
  runExtracted(["--replay", trace]);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
