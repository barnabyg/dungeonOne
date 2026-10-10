// Sorts the test files into tiers, and picks the tiers a change calls for, so
// a session can run the tests its change can break before it runs them all
// (AGENTS.md). scripts/run-tests.mjs runs what these choose.
//
// - quick: engine, rules, harness and server tests on fixture modules, with
//   no browser and no shipped content;
// - browser: the tests that drive a browser or start the real launcher;
// - content: the tests of the shipped modules (tests/fixtures/content-tests.mjs),
//   whose gate run --modules can narrow.
//
// A release handoff, which plays a shipped module in the browser, is in both
// browser and content.

/** The tiers, in the order a full run's files fall into them. */
export const TIERS = ["quick", "browser", "content"];

/**
 * The tiers of the test file at `path` with source `source`: quick, or
 * browser, content or both (a release handoff drives a shipped module
 * through the browser).
 */
export function tiersOf(path, source, contentTests) {
  const flat = source.replace(/\s+/gu, " ");
  const tiers = [];
  if (
    /import \{[^}]*\blaunch\b[^}]*\} from "\.\/fixtures\/session-layout\.mjs"/u.test(
      flat,
    ) ||
    /from "playwright"/u.test(flat) ||
    /\blaunchDefault\b|browser-cli\.js/u.test(flat)
  ) {
    tiers.push("browser");
  }
  if (contentTests.has(path)) {
    tiers.push("content");
  }
  return tiers.length === 0 ? ["quick"] : tiers;
}

/** The module id a shipped module's file holds, as adventures/5e/<id>.json. */
const shippedModule = (path) =>
  /^adventures\/5e\/([a-z0-9-]+)\.json$/u.exec(path)?.[1];

/**
 * What the changes to `paths` (repository-relative, forward slashes) call
 * for: `full` when any change could break any test; otherwise the tiers to
 * run, the test files to run besides them, and, when only shipped modules
 * changed among the content, which modules to gate. Each reason says why.
 */
export function selectForChanges(paths) {
  const tiers = new Set();
  const files = new Set();
  const modules = new Set();
  let allModules = false;
  const reasons = [];
  let full = false;
  for (const path of paths) {
    const module = shippedModule(path);
    if (path === "adventures/5e/bestiary.json") {
      tiers.add("quick").add("browser").add("content");
      allModules = true;
      reasons.push(`${path}: the fixtures and every module use the bestiary`);
    } else if (path === "adventures/5e/gate-verdicts.json") {
      tiers.add("content");
      allModules = true;
      reasons.push(`${path}: checked against every module's gate`);
    } else if (module !== undefined) {
      tiers.add("content");
      modules.add(module);
      reasons.push(`${path}: the content tests, gating ${module}`);
    } else if (/^tests\/[^/]+\.test\.mjs$/u.test(path)) {
      files.add(path);
      reasons.push(`${path}: itself`);
    } else if (path.startsWith("tests/fixtures/")) {
      tiers.add("quick").add("browser");
      reasons.push(`${path}: the tests on fixtures`);
    } else if (
      path === "src/browser-5e-page.ts" ||
      path === "src/browser-5e-server.ts"
    ) {
      tiers.add("quick").add("browser");
      reasons.push(`${path}: the server and browser tests`);
    } else if (
      path === "scripts/run-tests.mjs" ||
      path === "scripts/test-tiers.mjs"
    ) {
      files.add("tests/test-tiers.test.mjs");
      reasons.push(`${path}: its tests`);
    } else if (
      /\.md$/u.test(path) ||
      path.startsWith(".github/") ||
      path.startsWith("agent-guidance/")
    ) {
      reasons.push(`${path}: no test (verify checks its format)`);
    } else {
      full = true;
      reasons.push(`${path}: may break any test`);
    }
  }
  return {
    full,
    tiers: TIERS.filter((tier) => tiers.has(tier)),
    files: [...files].sort(),
    modules: allModules || full ? [] : [...modules].sort(),
    reasons,
  };
}
