import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

function run(command, args) {
  const result = spawnSync(command, args, {
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
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNpm(args) {
  if (process.env.npm_execpath) {
    run(process.execPath, [process.env.npm_execpath, ...args]);
    return;
  }
  run("npm", args);
}

runNpm(["ci", "--ignore-scripts", "--dry-run"]);
runNpm(["audit", "--audit-level=high"]);

const listed = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { cwd: process.cwd(), encoding: "utf8" },
);
if (listed.error) {
  throw listed.error;
}
if (listed.status !== 0) {
  process.stderr.write(listed.stderr);
  process.exit(listed.status ?? 1);
}

const patterns = [
  new RegExp("A" + "KIA[0-9A-Z]{16}", "u"),
  new RegExp("gh" + "p_[A-Za-z0-9]{36}", "u"),
  new RegExp("sk" + "-[A-Za-z0-9]{32,}", "u"),
  new RegExp("-----BEGIN " + "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----", "u"),
];
const excludedPrefixes = [".git/", ".scratch/", "dist/", "node_modules/"];
const findings = [];

for (const file of listed.stdout.split(/\r?\n/u).filter(Boolean)) {
  const normalized = file.replaceAll("\\", "/");
  if (excludedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
    continue;
  }

  let contents;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (contents.includes("\0")) {
    continue;
  }

  for (const pattern of patterns) {
    if (pattern.test(contents)) {
      findings.push(
        `${normalized}: possible secret matching ${pattern.source}`,
      );
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`${findings.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Lockfile, dependency audit, and secret checks passed.\n");
