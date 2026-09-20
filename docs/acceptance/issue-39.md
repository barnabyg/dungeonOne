# Issue 39 — historical compatibility and migration contract

The startup selector remains chapel by default. `historical-runtime.ts` contains
the pre-extraction runtime implementations and exact historical rules/content
selection. `runtime.ts` selects ordinary play independently; replay imports its
selector directly from the historical module. Existing imports remain compatible.
This is a selection boundary, not yet a complete copy of every transitive engine
dependency: subsequent generic-runtime work must leave the old engine functions
and replay validation semantics intact.

The [migration contract](../migration-contract.md) specifies the supported
format 1–3 tuples, authored behavior mappings and regression scenarios, finite
data vocabulary, ordering/atomicity, identities, aliases, bounded analysis and
the future format-4 digest/replay contract. Format 4 is not implemented by this
ticket. Neither external content nor save/resume is enabled.

Five synthetic chapel CLI trace/output pairs were captured from baseline
`94ce38807c7a9647e33a496d146ca2b18b82ad80` before extraction. No pre-existing golden
was regenerated. `issue-39.test.mjs` checks exact terminal output (excluding only
the export path line), JSON state/events/draws/tools, model-free replay, all four
v9 prompt identities and rejection of missing/mixed/unknown identities. Existing
tests retain older chapel and signet coverage, including absent signet IDs.

Validation on 20 September 2026: six focused issue-39 tests and type checking
passed. `CI=true npm.cmd run verify` passed all seven gates with zero warnings,
286 tests passing, zero dependency vulnerabilities, and clean build/package
validation. Compatibility coverage is intentionally green against the captured
baseline; this preservation refactor does not introduce a new gameplay behavior
requiring a red-to-green feature change.

## Manual checks

Prerequisites: Node 24, installed lockfile dependencies, `npm.cmd run build` from
the repository root. No provider credentials are needed.

1. Run `npm.cmd start -- --seed 7 --trace .\chapel-check.json`. Enter the lines
   from `docs/acceptance/inputs/chapel-public-social-fallback.txt`. Expect chapel
   startup, a failed social check, the physical evidence route and public ending.
   Run `npm.cmd start -- --replay .\chapel-check.json`; expect successful verification.
2. Repeat with seed 15 and `chapel-potion-defeat.txt`; expect healing followed by
   lethal guardian retaliation in one recorded action, then successful replay.
3. Run `npm.cmd start -- --adventure stolen-signet --seed 0`; follow
   `docs/acceptance/inputs/victory.txt`. Expect the signet journey and victory.
4. In PowerShell set `$env:DUNGEON_ONE_TEST_DM_SCRIPT` to the absolute path of
   `docs/acceptance/inputs/chapel-ai-failure-after.script.json`, run
   `npm.cmd start -- --seed 0`, and enter its matching `.txt` lines. Expect the
   committed discovery to survive the scripted failure; journal/status/inventory
   and help remain usable. Remove that environment variable after the check.

These journeys are automated at the real CLI boundary. No new live-provider or
unfamiliar-player study was conducted. New generic-runtime equivalence and loader
analysis tests belong to their implementing tickets; this ticket specifies those
contracts without claiming full adventure solvability.
