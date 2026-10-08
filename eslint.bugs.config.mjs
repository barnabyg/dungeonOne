import globals from "globals";
import tseslint from "typescript-eslint";

// Browser globals that tests use inside Playwright page.evaluate callbacks.
// Not globals.browser: it defines names such as focus, close, find and name,
// which would hide a call to a missing test helper (#267).
const PAGE_GLOBALS = Object.fromEntries(
  [
    "document",
    "getComputedStyle",
    "location",
    "Node",
    "NodeFilter",
    "requestAnimationFrame",
    "window",
  ].map((name) => [name, "readonly"]),
);

export default tseslint.config(
  {
    ignores: [
      ".scratch/**",
      ".verify-artifacts/**",
      "dist/**",
      "node_modules/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,ts}"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "constructor-super": "error",
      "for-direction": "error",
      "getter-return": "error",
      "no-async-promise-executor": "error",
      "no-constant-condition": "error",
      "no-dupe-args": "error",
      "no-dupe-else-if": "error",
      "no-dupe-keys": "error",
      "no-func-assign": "error",
      "no-import-assign": "error",
      "no-loss-of-precision": "error",
      "no-promise-executor-return": "error",
      "no-self-assign": "error",
      "no-setter-return": "error",
      "no-unreachable": "error",
      "no-unreachable-loop": "error",
      "no-unsafe-finally": "error",
      "no-unsafe-negation": "error",
      "no-unused-private-class-members": "error",
      "no-useless-backreference": "error",
      "require-atomic-updates": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
    },
  },
  // tsc already reports undefined names in TypeScript, but nothing checks the
  // plain JavaScript tests, scripts and configs (#271).
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: globals.node },
    rules: { "no-undef": "error" },
  },
  {
    files: ["tests/**/*.mjs"],
    languageOptions: { globals: PAGE_GLOBALS },
  },
);
