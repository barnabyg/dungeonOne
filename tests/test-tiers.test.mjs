// The test tiers (scripts/test-tiers.mjs) and the runner's choice of files
// (scripts/run-tests.mjs): which tier each test file falls in, what a
// change calls for, and what each command line runs.
import assert from "node:assert/strict";
import test from "node:test";
import { parseArguments, plan, testFiles } from "../scripts/run-tests.mjs";
import { selectForChanges, tiersOf } from "../scripts/test-tiers.mjs";
import { CONTENT_TESTS } from "./fixtures/content-tests.mjs";

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
    "adventures/5e/drowned-chapel.json",
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
    "docs/character-rules.md",
  ]);
  assert.equal(ui.full, false);
  assert.deepEqual(ui.tiers, ["quick", "browser"]);
  assert.deepEqual(ui.files, ["tests/issue-335-browser.test.mjs"]);
  assert.deepEqual(selectForChanges(["scripts/test-tiers.mjs"]).files, [
    "tests/test-tiers.test.mjs",
  ]);
  const docs = selectForChanges([".github/workflows/verify.yml", "AGENTS.md"]);
  assert.deepEqual([docs.full, docs.tiers, docs.files], [false, [], []]);
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
    nodeArgs: [],
  });
  assert.deepEqual(
    parseArguments(["--tier", "quick,browser", "tests/random.test.mjs"]),
    {
      tiers: ["quick", "browser"],
      modules: [],
      files: ["tests/random.test.mjs"],
      changed: undefined,
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
      nodeArgs: ["--test-name-pattern", "seeded", "--test-name-pattern=dice"],
    },
  );
  // Modules alone ask for their content tests.
  assert.deepEqual(parseArguments(["--modules", "a,b"]).tiers, ["content"]);
  assert.equal(parseArguments(["--changed"]).changed, "origin/main");
  assert.equal(parseArguments(["--changed", "main"]).changed, "main");
  for (const args of [
    ["--tier", "slow"],
    ["--tier"],
    ["--test-name-pattern"],
    ["--changed", "--tier", "quick"],
    ["--changed", "main", "tests/random.test.mjs"],
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
