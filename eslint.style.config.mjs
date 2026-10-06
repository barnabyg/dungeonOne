import tseslint from "typescript-eslint";

// Shared infrastructure that must stay independent of the 5e game, so it can
// be tested with any runtime: it reaches a runtime only through
// runtime-contract.ts, as an argument.
const SHARED_MODULES = [
  "atomic-file",
  "bounded-json",
  "browser-http",
  "browser-launch",
  "dm-turn",
  "file-lock",
  "json-shape",
  "openai-dm-model",
  "random",
  "runtime-contract",
  "scripted-dm-model",
];

export default tseslint.config(
  {
    ignores: [
      ".scratch/**",
      ".verify-artifacts/**",
      "dist/**",
      "node_modules/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts}"],
    rules: {
      curly: ["error", "all"],
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: SHARED_MODULES.map((name) => `src/${name}.ts`),
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./*-5e.js"],
              message:
                "Shared infrastructure must not import the 5e game. Take the runtime as an AdventureRuntime from runtime-contract.ts.",
            },
          ],
        },
      ],
    },
  },
);
