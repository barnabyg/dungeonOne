import assert from "node:assert/strict";
import test from "node:test";

import {
  GATES,
  launchBrowserProcess,
  runVerification,
} from "../scripts/verify.mjs";

test("verification gates have the required order", () => {
  assert.deepEqual(
    GATES.map((gate) => gate.name),
    [
      "formatting",
      "lint/style",
      "compiler/type checking",
      "static bug analysis",
      "automated tests",
      "dependency/vulnerability/secret/package checks",
      "build/packaging validation",
    ],
  );
});

test("verification runs gates in order and preserves a gate failure", async () => {
  const visited = [];
  const exitCode = await runVerification({
    dashboardEnabled: false,
    gates: GATES,
    output: { write() {} },
    runGate: async (gate) => {
      visited.push(gate.name);
      return gate.name === "static bug analysis" ? 7 : 0;
    },
  });

  assert.equal(exitCode, 7);
  assert.deepEqual(
    visited,
    GATES.slice(0, 4).map((gate) => gate.name),
  );
});

test("dashboard, reporter, and browser failures do not change verification", async () => {
  const visited = [];
  const exitCode = await runVerification({
    dashboardEnabled: true,
    gates: GATES,
    openBrowser: async () => {
      throw new Error("browser unavailable");
    },
    output: { write() {} },
    runGate: async (gate, report) => {
      visited.push(gate.name);
      report("gate output");
      return 0;
    },
    startDashboard: async () => ({
      url: "http://127.0.0.1:1234",
      setStage() {
        throw new Error("reporter unavailable");
      },
      appendOutput() {
        throw new Error("reporter unavailable");
      },
      fail() {
        throw new Error("reporter unavailable");
      },
      finish() {
        throw new Error("reporter unavailable");
      },
    }),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(
    visited,
    GATES.map((gate) => gate.name),
  );
});

test("verification reports available automated-test progress", async () => {
  const stages = [];
  await runVerification({
    dashboardEnabled: true,
    gates: [{ name: "automated tests", command: "test", args: [] }],
    openBrowser: async () => {},
    output: { write() {} },
    runGate: async (_gate, report) => {
      report("✔ first behavior");
      report("✖ second behavior");
      return 1;
    },
    startDashboard: async () => ({
      url: "http://127.0.0.1:1234",
      setStage(name, progress) {
        stages.push({ name, progress });
      },
      appendOutput() {},
      fail() {},
      finish() {},
    }),
  });

  assert.deepEqual(stages.at(-1), {
    name: "automated tests",
    progress: { completed: 2, total: null },
  });
});

test("browser launcher rejects a started process that exits unsuccessfully", async () => {
  await assert.rejects(
    launchBrowserProcess(process.execPath, ["-e", "process.exit(9)"]),
    /exit code 9/i,
  );
});

test("verification waits for the dashboard to observe its final result", async () => {
  const lifecycle = [];
  await runVerification({
    dashboardEnabled: true,
    gates: [],
    openBrowser: async () => {},
    output: { write() {} },
    startDashboard: async () => ({
      url: "http://127.0.0.1:1234",
      setStage() {},
      appendOutput() {},
      fail() {},
      finish(result) {
        lifecycle.push(`finish:${result}`);
      },
      async waitForFinalObservation() {
        lifecycle.push("observed");
        return true;
      },
    }),
  });

  assert.deepEqual(lifecycle, ["finish:passed", "observed"]);
});
