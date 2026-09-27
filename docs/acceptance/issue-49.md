# Issue #49: authored progression validation

The built-in `chapel-clues.json` currently has nine `analysis-incomplete`
warnings. They are resolved by the following route evidence, rather than by
assuming that combat, social checks, relocation, or actor death always succeed.
Run `npm.cmd run verify` on Windows to exercise the cited CLI tests.

| Diagnostic entity | Route evidence |
| --- | --- |
| `guardian-cleared` | `tests/issue-44.test.mjs` defeats the crypt guardian with seed 0; `tests/chapel.test.mjs` also covers combat. |
| `ledger-evidence`, `ledger-recovered` | `tests/issue-44.test.mjs` defeats the guardian, searches the ledger, and checks the resulting discovery; `tests/ledger-rescue.test.mjs` covers the full route. |
| `tavi-crypt-testimony`, `tavi-account-recorded` | `tests/issue-44.test.mjs` questions Tavi after defeating the guardian. |
| `tavi-rescued` | `tests/ledger-rescue.test.mjs` covers the dialogue and relocation route. |
| `tavi-remains`, `tavi-death-confirmed` | `tests/casualties.test.mjs` covers searching Tavi's remains after a casualty. |
| `/endings/any` | `tests/resolution.test.mjs` and `tests/issue-48.test.mjs` complete the authored endings through live CLI sessions and format-4 replay. |

These scenarios show obtainable routes, not universal solvability across seeds
or all player choices. New authored content that raises an analysis warning needs
its own route evidence through the CLI before handoff. `--validate-adventure`
never starts a session or calls a random source or provider; `tests/issue-49.test.mjs`
checks both validation and startup rejection for impossible required progress.
