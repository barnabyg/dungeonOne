import assert from "node:assert/strict";
import test from "node:test";

import { startDashboard } from "../scripts/verification/dashboard.mjs";

test("dashboard exposes live state and health on localhost", async (context) => {
  const dashboard = await startDashboard();
  context.after(() => dashboard.close());

  dashboard.setStage("automated tests", { completed: 2, total: 5 });
  dashboard.appendOutput("two tests passed");
  dashboard.fail("one test failed");

  const health = await fetch(`${dashboard.url}/health`);
  const page = await fetch(dashboard.url);
  const response = await fetch(`${dashboard.url}/api/state`);
  const state = await response.json();

  assert.equal(health.status, 200);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Dungeon One verification/);
  assert.equal(response.status, 200);
  assert.equal(new URL(dashboard.url).hostname, "127.0.0.1");
  assert.equal(state.activeStage, "automated tests");
  assert.deepEqual(state.testProgress, { completed: 2, total: 5 });
  assert.deepEqual(state.recentOutput, ["two tests passed"]);
  assert.deepEqual(state.failures, ["one test failed"]);
  assert.equal(state.result, "running");
  assert.equal(typeof state.elapsedMs, "number");

  dashboard.finish("failed");
  const finalState = await fetch(`${dashboard.url}/api/state`).then((result) =>
    result.json(),
  );
  assert.equal(finalState.result, "failed");
  assert.equal(finalState.activeStage, null);
});

test("concurrent dashboards use isolated free ports", async (context) => {
  const first = await startDashboard();
  const second = await startDashboard();
  context.after(() => Promise.all([first.close(), second.close()]));

  assert.notEqual(first.url, second.url);
});
