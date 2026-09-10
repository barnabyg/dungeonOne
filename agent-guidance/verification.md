# Verification guidance

Run `npm.cmd run verify` as the canonical full verification command (`npm run verify` outside Windows). It must not rewrite source files and must pass with zero warnings.

The required gate order is defined in `scripts/verify.mjs` and must remain:

1. formatting;
2. lint/style;
3. compiler/type checking;
4. static bug analysis;
5. automated tests;
6. dependency/vulnerability/secret/package checks; and
7. build/packaging validation.

Focused tests may build generated output but must stay lightweight and must not start the dashboard. CI must invoke the same canonical command with `CI=true`. Any skipped or inapplicable analyzer must be documented in `README.md`; do not add two tools that enforce the same concern.

Before release claims, validate `npm ci`, the canonical verification command, build, and startup from a clean checkout using only tracked files.
