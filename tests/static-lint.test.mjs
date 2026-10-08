// The static-analysis lint (`npm run static`) catches undefined identifiers in
// the plain JavaScript files, which no type checker sees (#271).
import assert from "node:assert/strict";
import test from "node:test";

import { ESLint } from "eslint";

const eslint = new ESLint({ overrideConfigFile: "eslint.bugs.config.mjs" });

async function undefinedNames(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map(({ ruleId, message }) => {
    assert.equal(ruleId, "no-undef", message);
    return message.match(/'(\w+)'/)[1];
  });
}

const PLAIN_JS = [
  "tests/example.test.mjs",
  "tests/fixtures/example.mjs",
  "scripts/example.mjs",
  "example.config.mjs",
];

test("an undefined identifier fails every kind of .mjs file", async () => {
  for (const file of PLAIN_JS) {
    assert.deepEqual(
      await undefinedNames("await click(page);\n", file),
      ["click", "page"],
      file,
    );
  }
});

test("Node globals are defined in every .mjs file", async () => {
  const code =
    "process.exitCode = 0;\n" +
    "Buffer.from(new URL(import.meta.url).href);\n" +
    "setTimeout(() => structuredClone({}), 0);\n" +
    "console.error(globalThis);\n";
  for (const file of PLAIN_JS) {
    assert.deepEqual(await undefinedNames(code, file), [], file);
  }
});

test("tests may use page globals inside page.evaluate callbacks", async () => {
  const code =
    "await page.evaluate(() => {\n" +
    "  const log = document.querySelector('#log');\n" +
    "  requestAnimationFrame(() => window.scrollTo(0, 0));\n" +
    "  return getComputedStyle(log).overflowX + location.hash;\n" +
    "});\n";
  assert.deepEqual(await undefinedNames(code, "tests/example.test.mjs"), [
    "page",
  ]);
  assert.deepEqual(await undefinedNames(code, "scripts/example.mjs"), [
    "page",
    "document",
    "requestAnimationFrame",
    "window",
    "getComputedStyle",
    "location",
  ]);
});

test("browser globals that look like helper names stay undefined", async () => {
  // `globals.browser` would define these and hide a missing helper (#267).
  const code = "focus(); close(); open(); find(); stop(); print(name);\n";
  assert.deepEqual(await undefinedNames(code, "tests/example.test.mjs"), [
    "focus",
    "close",
    "open",
    "find",
    "stop",
    "print",
    "name",
  ]);
});

test("TypeScript is left to tsc", async () => {
  assert.deepEqual(
    await undefinedNames("export const x = click();\n", "src/example.ts"),
    [],
  );
});
