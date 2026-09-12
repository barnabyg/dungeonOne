# Issue 24 — Explicit adventure selection

The built-in `--adventure stolen-signet` selector works in command and AI modes;
omission preserves the default. Runtime selection is session-local and binds
command parsing, authoritative actions, presentation, DM projections/dispatch,
and trace metadata. Replay validates the format/rules/adventure/RNG/DM tuple and
selects the historical signet runtime explicitly. Missing adventure IDs are
accepted only within known tuples. Persisted states, events, tool schemas,
prompts, RNG, and trace formats remain unchanged.

The chapel story in the increment description belongs to later content tickets.
This ticket adds no new adventure, loader, save/resume, or effects language.

## Verification

Historical fixtures were captured from starting commit
`2e9a28cc416f42fa57b070e7d96ae6f2582de05d` before implementation. See
`tests/fixtures/README.md` for provenance and privacy details. New CLI tests first
failed for unsupported selection/missing historical IDs, then passed. Focused
CLI, DM orchestration, and trace tests passed (72 tests). Final canonical
verification and review results are recorded in the implementation handoff.

## Manual checks

Prerequisites: Node 24.x, dependencies installed with `npm.cmd ci`, then
`npm.cmd run build`. Command/scripted modes need no API key.

1. Run `npm.cmd start -- --adventure stolen-signet --seed 0`. Enter `open wooden
   door`, `move guardroom`, `attack goblin` twice, `move reliquary`, `take signet`,
   `leave`, then `quit`. Expect victory with the familiar signet presentation.
   Repeat without `--adventure`; the same seed must produce the same rolls.
2. Run `Get-Content docs/acceptance/inputs/defeat.txt | npm.cmd start --
   --adventure stolen-signet --seed 207 --trace .scratch/issue-24-defeat.json`
   (create `.scratch` first). Expect defeat and frozen subsequent gameplay.
   Run `npm.cmd start -- --replay .scratch/issue-24-defeat.json`; expect success.
3. With `OPENAI_API_KEY` configured, run `npm.cmd start -- --ai --adventure
   stolen-signet --model gpt-5.6-luna --seed 0`. Ask about the room, open the
   wooden door, then use local `help` and `quit`. Expect authoritative mechanics
   and ordinary DM narration; help/quit must stay local. This live check was not
   performed as part of this change; automated AI checks use scripted transport.
4. Run `npm.cmd start -- --ai --adventure unknown`, then `npm.cmd start --
   --replay missing.json --adventure stolen-signet`. Expect startup errors before
   credentials are requested, files opened, or provider requests made.

Scripted output equality verifies compatibility, not live model quality or human
enjoyment. No new live model evaluation was performed.

## Final automated verification and review

`npm.cmd run verify` passed all seven gates with zero warnings: formatting,
lint/style, type checking, static bug analysis, all 169 tests, dependency and
secret checks (zero vulnerabilities), and clean build/package validation.
This used the existing development checkout; no clean-install or release claim
is made. `git diff --check` also passed.

### Standards

Read-only review found no documented standards violations or correctness defects.
One nonblocking duplication concern was addressed by moving the rules/adventure
version constants into the runtime module and preserving the trace module's
public re-exports. Format-specific replay validation remains explicit.

### Spec

Read-only review found no actionable gaps, scope creep, or incorrect behavior
against issue #24. Golden captures were not independently reproduced by the
reviewers; the implementation run captured them before editing runtime code.

Final unresolved findings: standards 0; spec 0.
