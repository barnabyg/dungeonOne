import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { startDashboard as defaultStartDashboard } from "./verification/dashboard.mjs";

const npmCli = process.env.npm_execpath;

function npmGate(name, args) {
  if (npmCli) {
    return { name, command: process.execPath, args: [npmCli, ...args] };
  }
  return { name, command: "npm", args };
}

export const GATES = Object.freeze([
  npmGate("formatting", ["run", "format:check"]),
  npmGate("lint/style", ["run", "lint"]),
  npmGate("compiler/type checking", ["run", "typecheck"]),
  npmGate("static bug analysis", ["run", "static"]),
  npmGate("automated tests", ["test"]),
  npmGate("dependency/vulnerability/secret/package checks", [
    "run",
    "check:security",
  ]),
  npmGate("build/packaging validation", ["run", "check:package"]),
]);

function write(output, message) {
  output.write(`${message}\n`);
}

async function defaultRunGate(gate, report, output) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(gate.command, gate.args, {
        cwd: process.cwd(),
        env: { ...process.env, CI: "1", VERIFY_DASHBOARD: "0" },
        shell: false,
      });
    } catch (error) {
      output.write(`${error.message}\n`);
      resolve(1);
      return;
    }

    const relay = (chunk) => {
      const value = chunk.toString();
      output.write(value);
      for (const line of value.split(/\r?\n/u).filter(Boolean)) {
        report(line);
      }
    };

    child.stdout.on("data", relay);
    child.stderr.on("data", relay);
    child.once("error", (error) => {
      relay(`${error.message}\n`);
      resolve(1);
    });
    child.once("close", (code) => resolve(code ?? 1));
  });
}

export async function openBrowser(url) {
  const [command, args] =
    process.platform === "win32"
      ? ["cmd.exe", ["/d", "/s", "/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];

  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function dashboardDefault(output, environment) {
  if (environment.VERIFY_DASHBOARD === "1") {
    return true;
  }
  if (environment.VERIFY_DASHBOARD === "0" || environment.CI) {
    return false;
  }
  return Boolean(output.isTTY);
}

export async function runVerification(options = {}) {
  const output = options.output ?? process.stdout;
  const environment = options.environment ?? process.env;
  const gates = options.gates ?? GATES;
  const runGate = options.runGate ?? defaultRunGate;
  const startDashboard = options.startDashboard ?? defaultStartDashboard;
  const launchBrowser = options.openBrowser ?? openBrowser;
  const dashboardEnabled =
    options.dashboardEnabled ?? dashboardDefault(output, environment);
  let dashboard = null;
  let reporterHealthy = true;

  if (dashboardEnabled) {
    try {
      dashboard = await startDashboard({
        onError(error) {
          write(
            output,
            `Dashboard runtime failure; continuing in terminal: ${error.message}`,
          );
        },
      });
      write(output, `TEST_DASHBOARD_URL=${dashboard.url}`);
      try {
        await launchBrowser(dashboard.url);
      } catch (error) {
        write(
          output,
          `Dashboard browser unavailable; continuing in terminal: ${error.message}`,
        );
      }
    } catch (error) {
      write(
        output,
        `Dashboard unavailable; continuing in terminal: ${error.message}`,
      );
    }
  }

  const report = (method, ...args) => {
    if (!dashboard || !reporterHealthy) {
      return;
    }
    try {
      dashboard[method](...args);
    } catch (error) {
      reporterHealthy = false;
      write(
        output,
        `Dashboard reporter unavailable; continuing in terminal: ${error.message}`,
      );
    }
  };

  for (const [index, gate] of gates.entries()) {
    write(output, `[${index + 1}/${gates.length}] ${gate.name}`);
    report("setStage", gate.name);
    let completedTests = 0;
    const exitCode = await runGate(
      gate,
      (line) => {
        report("appendOutput", line);
        if (
          gate.name === "automated tests" &&
          /^[✔✖]/u.test(line.trimStart())
        ) {
          completedTests += 1;
          report("setStage", gate.name, {
            completed: completedTests,
            total: null,
          });
        }
      },
      output,
    );

    if (exitCode !== 0) {
      const message = `${gate.name} failed with exit code ${exitCode}`;
      write(output, message);
      report("fail", message);
      report("finish", "failed");
      return exitCode;
    }
  }

  report("finish", "passed");
  write(output, "Verification passed with zero warnings.");
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  process.exitCode = await runVerification();
}
