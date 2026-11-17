import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { permitsDevAuditException } from "./dev-audit-exception.mjs";

function runNpm(args, capture = false) {
  const cli = process.env.npm_execpath;
  const result = spawnSync(
    cli ? process.execPath : "npm",
    cli ? [cli, ...args] : args,
    {
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
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (!capture && result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

runNpm(["ci", "--ignore-scripts", "--dry-run"]);
const audit = runNpm(["audit", "--audit-level=high", "--json"], true);
if (audit.status !== 0) {
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  if (
    audit.status !== 1 ||
    !permitsDevAuditException(JSON.parse(audit.stdout), lock.packages)
  ) {
    process.stderr.write(audit.stdout);
    process.exit(audit.status ?? 1);
  }
  process.stdout.write(
    "Applied temporary development-only audit exception GHSA-fc5q-39xc-vjpf.\n",
  );
}

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
