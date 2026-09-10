import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

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

const packOutput = run(["pack", "--dry-run", "--json"], true);
const [manifest] = JSON.parse(packOutput);
const packagedFiles = new Set(manifest.files.map((entry) => entry.path));

for (const required of [
  "dist/cli.js",
  "dist/session.js",
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
