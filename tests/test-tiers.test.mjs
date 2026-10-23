// The test tiers (scripts/test-tiers.mjs) and the runner's choice of files
// (scripts/run-tests.mjs): which tier each test file falls in, what a
// change calls for, what each command line runs, and how CI splits the files.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CI_PARTS,
  parseArguments,
  plan,
  testFiles,
} from "../scripts/run-tests.mjs";
import { selectForChanges, tiersOf } from "../scripts/test-tiers.mjs";
import { CONTENT_TESTS } from "./fixtures/content-tests.mjs";
import { gateShares } from "./fixtures/gate-workers.mjs";

const NONE = new Map();

test("a test that starts a browser or the launcher is browser, a content test content, and the rest quick", () => {
  const content = new Map([["tests/x.test.mjs", "why"]]);
  assert.deepEqual(tiersOf("tests/x.test.mjs", "", content), ["content"]);
  for (const source of [
    'import {\n  assertNoSideScroll,\n  launch,\n} from "./fixtures/session-layout.mjs";',
    'import { launch } from "./fixtures/session-layout.mjs";',
    'import { chromium } from "playwright";',
    'import { launchDefault } from "./fixtures/default-launch.mjs";',
    'const cli = new URL("../dist/browser-cli.js", import.meta.url);',
  ]) {
    assert.deepEqual(tiersOf("tests/x.test.mjs", source, NONE), ["browser"]);
    // A release handoff is both.
    assert.deepEqual(tiersOf("tests/x.test.mjs", source, content), [
      "browser",
      "content",
    ]);
  }
  for (const source of [
    'import { firstFighter } from "./fixtures/session-layout.mjs";',
    'import { launch } from "./fixtures/other.mjs";',
    'import { startFifthBrowserServer } from "../dist/browser-5e-server.js";',
  ]) {
    assert.deepEqual(tiersOf("tests/x.test.mjs", source, NONE), ["quick"]);
  }
});

test("every browser test file is in the browser tier, and every content test in the content tier", () => {
  const files = testFiles();
  const tiers = (path) => files.find((file) => file.path === path).tiers;
  for (const { path } of files) {
    if (path.endsWith("-browser.test.mjs")) {
      assert.ok(tiers(path).includes("browser"), path);
    }
  }
  for (const path of [...CONTENT_TESTS.keys()].filter((key) =>
    key.endsWith(".test.mjs"),
  )) {
    assert.ok(tiers(path).includes("content"), path);
  }
  assert.ok(files.filter((file) => file.tiers[0] === "quick").length > 50);
});

test("a change picks the tiers it can break, and anything else runs every test", () => {
  assert.deepEqual(selectForChanges(["adventures/5e/thornwood-lodge.json"]), {
    full: false,
    tiers: ["content"],
    files: [],
    modules: ["thornwood-lodge"],
    reasons: [
      "adventures/5e/thornwood-lodge.json: the content tests, gating thornwood-lodge",
    ],
  });
  const bestiary = selectForChanges([
    "adventures/5e/bestiary.json",
    "adventures/5e/abandoned-delve.json",
  ]);
  assert.deepEqual(bestiary.tiers, ["quick", "browser", "content"]);
  assert.deepEqual(bestiary.modules, []);
  assert.deepEqual(
    selectForChanges(["adventures/5e/gate-verdicts.json"]).modules,
    [],
  );
  const ui = selectForChanges([
    "src/browser-5e-page.ts",
    "tests/fixtures/modules.mjs",
    "tests/issue-335-browser.test.mjs",
    "README.md",
    "docs/rules/README.md",
  ]);
  assert.equal(ui.full, false);
  assert.deepEqual(ui.tiers, ["quick", "browser"]);
  assert.deepEqual(ui.files, ["tests/issue-335-browser.test.mjs"]);
  assert.deepEqual(selectForChanges(["scripts/test-tiers.mjs"]).files, [
    "tests/test-tiers.test.mjs",
  ]);
  const docs = selectForChanges([".github/README.md", "AGENTS.md"]);
  assert.deepEqual([docs.full, docs.tiers, docs.files], [false, [], []]);
  // The workflow's CI parts are checked against the runner's.
  assert.deepEqual(selectForChanges([".github/workflows/verify.yml"]).files, [
    "tests/test-tiers.test.mjs",
  ]);
  for (const path of [
    "src/runtime-5e.ts",
    "package.json",
    "scripts/balance-5e.mjs",
    "adventures/eval/obstacle-yard.json",
  ]) {
    const selected = selectForChanges([
      "adventures/5e/thornwood-lodge.json",
      path,
    ]);
    assert.equal(selected.full, true, path);
    assert.deepEqual(selected.modules, [], path);
    assert.equal(selected.reasons[1], `${path}: may break any test`);
  }
});

test("the command line names tiers, modules, files or a base to compare with", () => {
  assert.deepEqual(parseArguments([]), {
    tiers: [],
    modules: [],
    files: [],
    changed: undefined,
    ciPart: undefined,
    nodeArgs: [],
  });
  assert.deepEqual(
    parseArguments(["--tier", "quick,browser", "tests/random.test.mjs"]),
    {
      tiers: ["quick", "browser"],
      modules: [],
      files: ["tests/random.test.mjs"],
      changed: undefined,
      ciPart: undefined,
      nodeArgs: [],
    },
  );
  // A Windows path, and a name pattern passed on to node --test.
  assert.deepEqual(
    parseArguments([
      String.raw`tests\random.test.mjs`,
      "--test-name-pattern",
      "seeded",
      "--test-name-pattern=dice",
    ]),
    {
      tiers: [],
      modules: [],
      files: ["tests/random.test.mjs"],
      changed: undefined,
      ciPart: undefined,
      nodeArgs: ["--test-name-pattern", "seeded", "--test-name-pattern=dice"],
    },
  );
  // Modules alone ask for their content tests.
  assert.deepEqual(parseArguments(["--modules", "a,b"]).tiers, ["content"]);
  assert.equal(parseArguments(["--ci-part", "gate-2"]).ciPart, "gate-2");
  assert.equal(parseArguments(["--changed"]).changed, "origin/main");
  assert.equal(parseArguments(["--changed", "main"]).changed, "main");
  for (const args of [
    ["--tier", "slow"],
    ["--tier"],
    ["--test-name-pattern"],
    ["--changed", "--tier", "quick"],
    ["--changed", "main", "tests/random.test.mjs"],
    ["--ci-part"],
    ["--ci-part", "gate-3"],
    ["--ci-part", "checks", "--tier", "quick"],
    ["--ci-part", "checks", "--changed"],
    ["tests/random.test.mjs", "--ci-part", "browser-1"],
    ["random.test.mjs"],
    ["--watch"],
  ]) {
    assert.throws(
      () => parseArguments(args),
      /^Error: Usage:/u,
      args.join(" "),
    );
  }
});

test("the runner runs every file by default, or the tiers, files and modules asked for", () => {
  const files = [
    { path: "tests/a.test.mjs", tiers: ["quick"] },
    { path: "tests/b-browser.test.mjs", tiers: ["browser"] },
    { path: "tests/c-browser.test.mjs", tiers: ["browser", "content"] },
    { path: "tests/shipped-modules.test.mjs", tiers: ["content"] },
  ];
  const all = files.map(({ path }) => path);
  assert.deepEqual(plan(parseArguments([]), files).files, all);
  assert.deepEqual(plan(parseArguments(["--tier", "quick"]), files), {
    files: ["tests/a.test.mjs"],
    modules: [],
    lines: ["Running the quick tier: 1 files."],
  });
  assert.deepEqual(
    plan(parseArguments(["--modules", "x", "--tier", "content"]), files),
    {
      files: ["tests/c-browser.test.mjs", "tests/shipped-modules.test.mjs"],
      modules: ["x"],
      lines: ["Running the content tier, gating x: 2 files."],
    },
  );
  assert.deepEqual(plan(parseArguments(["--tier", "browser"]), files).files, [
    "tests/b-browser.test.mjs",
    "tests/c-browser.test.mjs",
  ]);
  assert.deepEqual(
    plan(parseArguments(["tests/b-browser.test.mjs"]), files).files,
    ["tests/b-browser.test.mjs"],
  );
  assert.throws(
    () => plan(parseArguments(["tests/d.test.mjs"]), files),
    /No such test file: tests\/d\.test\.mjs/u,
  );

  const changed = (paths) => (base) => {
    assert.equal(base, "origin/main");
    return paths;
  };
  const engine = plan(
    parseArguments(["--changed"]),
    files,
    changed(["src/runtime-5e.ts"]),
  );
  assert.deepEqual(engine.files, all);
  assert.deepEqual(engine.lines, [
    "Changes since origin/main:",
    "  src/runtime-5e.ts: may break any test",
    "Running every test file: 4 files.",
  ]);
  const module = plan(
    parseArguments(["--changed"]),
    files,
    changed(["adventures/5e/x.json"]),
  );
  assert.deepEqual(
    [module.files, module.modules],
    [["tests/c-browser.test.mjs", "tests/shipped-modules.test.mjs"], ["x"]],
  );
  assert.deepEqual(
    plan(parseArguments(["--changed"]), files, changed(["README.md"])),
    {
      files: [],
      modules: [],
      lines: [
        "Changes since origin/main:",
        "  README.md: no test (verify checks its format)",
        "No test file covers these changes.",
      ],
    },
  );
});

test("a CI part runs the files that start no browser, every other browser file, or a gate share", () => {
  const files = [
    { path: "tests/a.test.mjs", tiers: ["quick"] },
    { path: "tests/b-browser.test.mjs", tiers: ["browser"] },
    { path: "tests/c-browser.test.mjs", tiers: ["browser", "content"] },
    { path: "tests/d.test.mjs", tiers: ["content"] },
    { path: "tests/e-browser.test.mjs", tiers: ["browser"] },
    { path: "tests/shipped-modules.test.mjs", tiers: ["content"] },
  ];
  const shares = [["x", "z"], ["y"]];
  const part = (name) =>
    plan(parseArguments(["--ci-part", name]), files, undefined, shares);
  assert.deepEqual(part("checks"), {
    files: ["tests/a.test.mjs", "tests/d.test.mjs"],
    modules: [],
    lines: ["Running CI part checks: 2 files."],
  });
  assert.deepEqual(part("browser-1").files, [
    "tests/b-browser.test.mjs",
    "tests/e-browser.test.mjs",
  ]);
  assert.deepEqual(part("browser-2").files, ["tests/c-browser.test.mjs"]);
  assert.deepEqual(part("gate-2"), {
    files: ["tests/shipped-modules.test.mjs"],
    modules: ["y"],
    lines: ["Running CI part gate-2, gating y: 1 files."],
  });
  // A gate part with no share would gate every module, so it fails.
  assert.throws(
    () =>
      plan(parseArguments(["--ci-part", "gate-2"]), files, undefined, [["x"]]),
    /^Error: CI part gate-2 has no shipped modules to gate\.$/u,
  );
});

test("CI's parts run every test file once, but the gate's, which gates a share of the modules in each", () => {
  const files = testFiles();
  const shares = [["a"], ["b"]];
  const runs = new Map();
  for (const name of CI_PARTS) {
    for (const path of plan(
      parseArguments(["--ci-part", name]),
      files,
      undefined,
      shares,
    ).files) {
      runs.set(path, [...(runs.get(path) ?? []), name]);
    }
  }
  assert.deepEqual(
    [...runs.keys()].sort(),
    files.map(({ path }) => path),
  );
  for (const [path, parts] of runs) {
    assert.deepEqual(
      parts,
      path === "tests/shipped-modules.test.mjs"
        ? ["gate-1", "gate-2"]
        : [parts[0]],
      path,
    );
  }
});

test("the gate's shares split the modules by gating, heaviest first onto the lightest share", () => {
  const module = (id, fights, min, max) => ({
    id,
    encounters: Array.from({ length: fights }),
    recommendedLevels: { min, max },
  });
  // Weights 22, 20, 7 and 6, as the shipped modules were.
  const modules = [
    module("delve", 7, 2, 2),
    module("cider", 6, 1, 1),
    module("weir", 11, 3, 4),
    module("lodge", 10, 4, 5),
  ];
  assert.deepEqual(gateShares(modules, 2), [
    ["cider", "weir"],
    ["delve", "lodge"],
  ]);
  assert.deepEqual(gateShares(modules.slice(0, 1), 2), [["delve"], []]);
});

test("the workflow runs every CI part, and its verify check passes only when all of them pass", () => {
  const workflow = readFileSync(".github/workflows/verify.yml", "utf8");
  const parts = /^ {8}part: \[([^\]]*)\]$/mu.exec(workflow)?.[1];
  assert.deepEqual(parts?.split(", "), [...CI_PARTS]);
  assert.match(workflow, /run: npm run verify -- --ci-part checks\n/u);
  assert.match(
    workflow,
    /run: npm test -- --ci-part \$\{\{ matrix\.part \}\}\n/u,
  );
  assert.match(
    workflow,
    /\n {2}verify:\n {4}needs: part\n {4}if: always\(\)\n[^]*test "\$RESULT" = success\n[^]*RESULT: \$\{\{ needs\.part\.result \}\}\n/u,
  );
});

test("the browser parts, and only they, run in the Playwright image of the version package.json pins", () => {
  const workflow = readFileSync(".github/workflows/verify.yml", "utf8");
  const { devDependencies, dependencies } = JSON.parse(
    readFileSync("package.json", "utf8"),
  );
  const version = { ...dependencies, ...devDependencies }.playwright;
  assert.match(version, /^\d+\.\d+\.\d+$/u, "playwright is pinned exactly");
  const images = [
    ...workflow.matchAll(/^ {10}- part: (\S+)\n {12}image: (\S+)$/gmu),
  ].map(([, part, image]) => [part, image]);
  assert.deepEqual(
    images,
    CI_PARTS.filter((part) => part.startsWith("browser-")).map((part) => [
      part,
      `mcr.microsoft.com/playwright:v${version}-noble`,
    ]),
  );
  assert.match(
    workflow,
    /\n {4}container:\n {6}image: \$\{\{ matrix\.image \}\}\n/u,
  );
});
