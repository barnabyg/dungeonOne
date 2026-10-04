import tseslint from "typescript-eslint";

// Pre-5e game modules (#126): the old runtimes and their adapters, plus the
// old-game tooling built on them (CLI command mode, generator, DM evaluator).
// #138 rebuilds the CLI and #139 deletes the rest. Shared infrastructure must
// reach a runtime only through runtime-contract.ts and the registry,
// data-runtime.ts, so these modules can be deleted without touching it.
const OLD_GAME_MODULES = [
  "adventure",
  "chapel",
  "chapel-clues-records",
  "chapel-clues-runtime",
  "chapel-tools",
  "character-runtime",
  "cli",
  "combat",
  "data-dm-cases",
  "dm-evaluator",
  "dm-interpretation-cases",
  "exploration-runtime",
  "game-tools",
  "generation",
  "generation-continuity",
  "generation-readiness",
  "generation-routes",
  "historical-runtime",
  "legacy-replay",
  "legacy-runtime-contract",
  "parser",
  "presenter",
  "session",
  "signet-runtime",
];
const RUNTIME_REGISTRY = "data-runtime";

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
    files: ["src/**/*.ts"],
    ignores: [...OLD_GAME_MODULES, RUNTIME_REGISTRY].map(
      (name) => `src/${name}.ts`,
    ),
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: OLD_GAME_MODULES.map((name) => ({
            name: `./${name}.js`,
            message:
              "Shared infrastructure must not import a pre-5e game module. Use runtime-contract.ts, and obtain runtimes from data-runtime.ts.",
          })),
        },
      ],
    },
  },
);
