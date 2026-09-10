import tseslint from "typescript-eslint";

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
);
