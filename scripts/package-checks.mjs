import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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
const { loadAdventure } = await import("../dist/adventure-loader.js");

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

const authoredAssets = [
  "adventures/chapel-clues.json",
  "adventures/generation-example.json",
  "adventures/stolen-signet.json",
  "adventures/signet-exploration.json",
  "adventures/tide-observatory.json",
  "adventures/remembering-guard.json",
  "adventures/deadline-rescue.json",
  "adventures/barricaded-crossroads.json",
  "adventures/day-raider-crossroads.json",
  "adventures/deceptive-crossroads.json",
  "adventures/bribed-crossroads.json",
  "adventures/hollow-beacon.json",
  "adventures/hollow-beacon-journey.json",
  "adventures/hollow-beacon-watch.json",
  "adventures/hollow-beacon-refugees.json",
  "adventures/hollow-beacon-trust.json",
  "adventures/hollow-beacon-threat.json",
  "adventures/hollow-beacon-recovery.json",
  "schema/adventure-v1.schema.json",
  "schema/adventure-v2.schema.json",
  "schema/adventure-v3.schema.json",
  "schema/adventure-v4.schema.json",
  "schema/adventure-v5.schema.json",
  "schema/adventure-v6.schema.json",
  "schema/adventure-v7.schema.json",
  "schema/adventure-v8.schema.json",
  "schema/adventure-v9.schema.json",
  "schema/adventure-v10.schema.json",
  "schema/adventure-v11.schema.json",
  "schema/adventure-v12.schema.json",
  "schema/adventure-v13.schema.json",
];

for (const adventure of authoredAssets.filter((asset) =>
  asset.startsWith("adventures/"),
)) {
  const result = loadAdventure(readFileSync(adventure));
  if (!result.ok) {
    throw new Error(
      `Package validation failed: invalid ${adventure}: ${JSON.stringify(result.diagnostics)}`,
    );
  }
}
for (const schema of authoredAssets.filter((asset) =>
  asset.startsWith("schema/"),
)) {
  JSON.parse(readFileSync(schema, "utf8"));
}

for (const required of [
  "dist/cli.js",
  "dist/browser-cli.js",
  "dist/browser-server.js",
  "dist/browser-page.js",
  "dist/browser-launch.js",
  "dist/openai-dm-model.js",
  "dist/session.js",
  "dist/signet-runtime.js",
  ...authoredAssets,
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
  const cli = path.join(installed, "dist", "cli.js");
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
  const external = path.join(caller, "external chapel.json");
  writeFileSync(
    external,
    readFileSync(path.join(installed, "adventures", "chapel-clues.json")),
  );
  const validated = JSON.parse(
    runExtracted(["--validate-adventure", "external chapel.json"]),
  );
  if (!validated.ok) {
    throw new Error("Extracted package external validation failed.");
  }
  for (const selector of [
    [],
    ["--adventure", "chapel"],
    ["--adventure", "stolen-signet"],
  ]) {
    const trace = path.join(
      caller,
      `trace ${selector.at(-1) ?? "default"}.json`,
    );
    runExtracted(
      [...selector, "--seed", "0", "--trace", trace],
      "look\nquit\n",
    );
    if (JSON.parse(readFileSync(trace, "utf8")).formatVersion !== 4) {
      throw new Error("Extracted built-in did not export format 4.");
    }
    runExtracted(["--replay", trace]);
  }
  const externalTrace = path.join(caller, "external trace.json");
  runExtracted(
    [
      "--adventure-file",
      "external chapel.json",
      "--seed",
      "0",
      "--trace",
      externalTrace,
    ],
    "look\nquit\n",
  );
  runExtracted(["--replay", externalTrace]);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
