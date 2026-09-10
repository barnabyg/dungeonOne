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
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts}"],
    rules: {
      curly: ["error", "all"],
      eqeqeq: ["error", "always"],
    },
  },
);
