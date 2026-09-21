# Issue 40: external exploration and self-contained replay

## Scope

The generic exploration runtime uses validated authored locations, directed
connections, features, aliases, prose, and initial player placement. It does not
branch on the adventure's ID. The checked-in Signet slice is intentionally not
the completed Signet quest. Built-in defaults and historical format 1–3 gameplay
stay unchanged. The only shared projection change widens public location/feature
IDs to support authored identifiers; legacy private entity types stay intact.

The pure loader accepts text or UTF-8 bytes and returns immutable definitions,
indexes, canonical JSON, digest, and stable diagnostics. File reads live in a
separate bounded adapter. Machine schema and executable structural validation
share one schema definition, with a test checking the published JSON copy.
Alias validation covers implicit IDs and explicit aliases across simultaneously
visible features and exits, including cross-namespace ambiguity. Semantic
validation also checks initial placement and directed reachability.

Format 4 binds the validated snapshot to its content identity/digest and supported
engine/rules/schema/prompt/tools/RNG tuple. Replay re-executes commands and calls
from a fresh session and compares authoritative evidence. Existing AI orchestration
owns read/mutation budgets, sanitized narration, and post-commit provider failure.
The source file and provider are unnecessary for replay.

## Repeatable manual checks

Prerequisites: Node 24.x, installed dependencies (`npm.cmd ci`), and
`npm.cmd run build`. No credentials are needed below. Run in the repository root.

1. Validate both path forms:

   ```powershell
   node dist/cli.js --validate-adventure adventures/signet-exploration.json
   node dist/cli.js --validate-adventure=adventures/signet-exploration.json
   ```

   Expect JSON `ok: true`, empty diagnostics, and the same SHA-256 digest.

2. Explore and export:

   ```powershell
   @("help", "inspect carving", "move guard-room", "look", "inspect benches", "move entrance", "attack goblin", "quit") |
     node dist/cli.js --adventure-file adventures/signet-exploration.json --seed 0 --trace .scratch/issue-40-command.json
   node dist/cli.js --replay .scratch/issue-40-command.json
   ```

   Create `.scratch` first if needed. Expect the authored carving, guardroom and
   benches descriptions, no combat from `attack goblin`, a goodbye, and successful
   replay. `move guard-room` and `move guardroom` select the same destination.

3. Exercise scripted AI and local controls:

   ```powershell
   $env:DUNGEON_ONE_TEST_DM_SCRIPT = "docs/acceptance/inputs/signet-exploration-ai.script.json"
   Get-Content docs/acceptance/inputs/signet-exploration-ai.txt |
     node dist/cli.js --adventure-file adventures/signet-exploration.json --ai --seed 0 --trace .scratch/issue-40-ai.json
   Remove-Item Env:\DUNGEON_ONE_TEST_DM_SCRIPT
   node dist/cli.js --replay .scratch/issue-40-ai.json
   ```

   Expect help/status/inventory without consuming scripted replies, authoritative
   look/inspect/move results, and successful replay without a model.

4. Copy the adventure to `.scratch/adventure with spaces.json`, play with that
   quoted path and export a trace, then delete only the copy before replaying.
   Expect replay success. Change an embedded description without updating the
   digest: expect a content identity/digest divergence and exit 1. Change an action,
   call result, or expected state: expect replay rejection.

5. Use `--adventure chapel --adventure-file adventures/signet-exploration.json`,
   `--validate-adventure adventures/signet-exploration.json --ai`, and a missing
   adventure file with `--ai`. Expect exit 2 before any provider or session startup.

## Automated evidence

Focused boundary coverage: `npm.cmd run build` followed by
`node --test tests/issue-40.test.mjs`. Ten passing tests cover loader failures and
immutability, canonical round trips, schema/example consistency, selector errors,
paths with spaces, command and scripted-AI journeys, source deletion, evidence
tampering, arbitrary authored IDs, session isolation, model projection privacy,
strict tool arguments, rejected malformed argument evidence, and provider failure
after committed movement. Command and scripted-AI manual journeys above were run
successfully, including export and replay. Historical golden fixtures were not
regenerated; the unknown-format negative test now uses format 5 because format 4
is supported.

## Limits

No live-provider quality claim. Arbitrary prose can still contain misleading text;
the prompt treats it as untrusted, and dispatch only permits implemented tools.
There are no private facts, actors, doors, item ownership, scripts, conditions,
effects, progression analysis, combat, saves, or quest endings in this schema.
Those constructs fail as unknown fields. Prose placeholders have no supported
expansions in this slice. Validation is structural exploration validation, not a
proof that future puzzle/combat content is solvable. A trace digest is not a
signature; a coherently rewritten document and trace can pass.
