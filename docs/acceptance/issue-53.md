# Issue #53: increment 4 author and player handoff

This handoff was checked on 27 September 2026 at `5a371e6`, after issues
[#51](https://github.com/barnabyg/dungeonOne/issues/51) and
[#52](https://github.com/barnabyg/dungeonOne/issues/52) closed. It describes the
tracked increment 4 content and the current runtime. The older
[migration contract](../migration-contract.md) records design and historical
compatibility; its proposed general condition/effect vocabulary is not a promise
that arbitrary scripts or every proposed operation is implemented.

## Authoring contract

Start with the exact [exploration](../../schema/adventure-v1.schema.json),
[Signet](../../schema/adventure-v2.schema.json), or
[chapel](../../schema/adventure-v3.schema.json) JSON schema. The supported rules
tuples are schema 1 / `exploration-rules-v1`, schema 2 / `signet-rules-v1`, and
schema 3 / `chapel-clues-rules-v1` through `v4`. Schema 1 offers directed travel
and public inspection; schema 2 adds a door, equipment, one living monster per
room, collection, combat, and an authored exit. Schema 3 adds discoveries,
searches, journal, dialogue, social challenges, encounters, healing, actor
casualties, and authored choices. Rules v4 requires the endings section. The
[README](../../README.md) describes the actual commands and each profile's
behavior; [the independent observatory](../../adventures/tide-observatory.json)
is a small schema-3 example with IDs and aliases unrelated to the chapel.

In schema 3, supported `when` predicates are `discovery-known`,
`milestone-recorded`, `actor-alive`, `actor-dead`, and `actor-dead-at` (with a
location ID). Conditions in one list are conjunctive; ending `any` holds
alternative lists. Supported search, reply, remains, and encounter effects are
`grant-discovery`, `record-milestone`, and `relocate-npc` where allowed. Combat,
healing, social checks, item transfers, death, quest completion, and resolution
are implemented operations with authored profiles, not author-supplied scripts.
Replies and narration are ordered; the first eligible variant wins. Every topic
needs an unconditional final fallback. A guarded fact needs a successful check
or explicit evidence conditions before its reply may expose it.

Entity IDs match `[a-z][a-z0-9]*(?:-[a-z0-9]+)*` and have at most 64 ASCII
characters. Explicit aliases are one to eight such tokens separated by single
spaces, at most 128 characters. IDs are implicit aliases. Input matching trims,
lowercases, collapses whitespace, and treats hyphens as spaces; the loader
rejects colliding visible aliases and invalid typed references. Keep display
prose separate from stable IDs. The loader rejects duplicate JSON keys, unknown
fields, unsupported rules, unsafe Unicode/control characters, invalid
placements, and unreachable structural references. Documents are limited to
1 MiB UTF-8, depth 32, 256 entries per collection, and 4096 UTF-16 code units
per prose field. See the schemas and README for the narrower field bounds.

Run `node dist/cli.js --validate-adventure <path>` after building. Validation
returns JSON with `ok` and ordered diagnostics containing `severity`, `code`,
JSON Pointer `path`, `entity`, and `message`. Invalid content exits 2; unreadable
files produce a startup error. Errors block play. Warnings require route
evidence. Positive progression analysis follows directed connections and
ordered producers from initial discoveries and milestones. It stops at a fixed
point, 512 additions, or 65,536 condition evaluations. It can diagnose missing
or cyclic required facts; `analysis-incomplete` means mechanics such as combat,
checks, actor state, or relocation prevent a proof, and `analysis-limit` means
the budget prevented a conclusion. It does not prove success for all seeds,
choices, or resource combinations. The chapel's nine warnings are covered by
[played routes](issue-49.md); the independent adventure's six by
[its route evidence](issue-50.md).

`--adventure chapel` and `--adventure stolen-signet` select bundled documents;
omission selects chapel. `--adventure-file <path>` uses a UTF-8 file resolved
from the caller's working directory. Built-in assets resolve beside the
installed module. The two adventure selectors conflict, duplicate selectors
fail, and `--validate-adventure` accepts no play or replay options. `--replay`
cannot be combined with seed, adventure, trace, or AI options. Both `--name
value` and `--name=value` forms are supported for selectors and replay. Use a
decimal unsigned 32-bit seed to reproduce a journey.

Changing content requires a new author-owned `contentVersion`; changing
mechanics requires a supported rules identity. Format-4 exports embed the
complete validated snapshot and its `sha256:` digest. Canonicalization sorts
object keys by UTF-16 code-unit order at every depth, preserves array order,
uses compact JSON and UTF-8, and renders safe integers in decimal (including
negative zero as zero). The digest identifies content independently of a file
path or version label. Replay checks the snapshot, digest, version tuple,
actions/calls, draws, results, and resulting states before accepting the trace.
Formats 1–3 continue to use their exact historical adapters and supported
tuples; old exports are not upgraded in place.

An adventure document can be copied, validated, edited, and run again. A trace
is a diagnostic round trip: replay reconstructs fresh state from its embedded
document and evidence, even after the original file is removed. It is not a
document editor or a save/resume file. A session ended by `quit` or EOF may be
marked incomplete and cannot be resumed. Snapshots may include secrets and
hidden content; AI traces may contain raw player text. Handle both as
potentially sensitive.
A digest detects accidental drift, not authorship or authenticity: a coherently
rewritten snapshot and evidence can pass replay. Format-4 input is bounded to
16 MiB, 10,000 turns, and 48 envelope nesting levels; the embedded document
keeps its stricter bounds.

## Copyable journeys

Run from the repository root after `npm.cmd ci` and `npm.cmd run build`. Trace
files below go under the ignored `.verify-artifacts` directory. Every input is
checked in and all command journeys use the shared runtime. These commands are
PowerShell; on Unix use `npm` and redirect each input file into `node`.

```powershell
New-Item -ItemType Directory -Force .verify-artifacts/issue-53 | Out-Null
Get-Content docs/acceptance/inputs/chapel-public-social-fallback.txt | node dist/cli.js --adventure chapel --seed 7 --trace .verify-artifacts/issue-53/public.json
node dist/cli.js --replay .verify-artifacts/issue-53/public.json
Get-Content docs/acceptance/inputs/chapel-confidential.txt | node dist/cli.js --adventure chapel --seed 0 --trace .verify-artifacts/issue-53/confidential.json
node dist/cli.js --replay .verify-artifacts/issue-53/confidential.json
Get-Content docs/acceptance/inputs/chapel-potion-defeat.txt | node dist/cli.js --adventure chapel --seed 15 --trace .verify-artifacts/issue-53/defeat.json
node dist/cli.js --replay .verify-artifacts/issue-53/defeat.json
Get-Content docs/acceptance/inputs/chapel-oren-casualty.txt | node dist/cli.js --adventure chapel --seed 0 --trace .verify-artifacts/issue-53/casualty.json
node dist/cli.js --replay .verify-artifacts/issue-53/casualty.json
```

The first journey fails Oren's social check, finds public physical evidence,
rescues Tavi, and chooses public disclosure. The second reaches confidential
referral. The third uses healing in combat and ends in defeat. The fourth kills
Oren and reaches a confidential ending without a false restitution promise.
Expect format-4 traces, outcomes `victory`, `victory`, `defeat`, and `victory`,
and `Trace verified successfully` after each replay. See the separate
[issue #52 evidence](issue-52.md) for bounded live DM review of both endings
and ordinary-language behavior.

The checked-in scripted failure is a provider-free recovery check. After its
notice search commits, local journal/status/inventory/help remain usable and
its incomplete diagnostic trace replays:

```powershell
$env:DUNGEON_ONE_TEST_DM_SCRIPT = 'docs/acceptance/inputs/chapel-ai-failure-after.script.json'
Get-Content docs/acceptance/inputs/chapel-ai-failure-after.txt | node dist/cli.js --adventure chapel --seed 0 --trace .verify-artifacts/issue-53/recovery.json
Remove-Item Env:DUNGEON_ONE_TEST_DM_SCRIPT
node dist/cli.js --replay .verify-artifacts/issue-53/recovery.json
```

To test source-file independence, copy the chapel document, start through the
explicit file selector, remove only that copy, then replay the exported trace:

```powershell
Copy-Item adventures/chapel-clues.json '.verify-artifacts/issue-53/external chapel.json'
node dist/cli.js --validate-adventure '.verify-artifacts/issue-53/external chapel.json'
Get-Content docs/acceptance/inputs/chapel-confidential.txt | node dist/cli.js --adventure-file '.verify-artifacts/issue-53/external chapel.json' --seed 0 --trace .verify-artifacts/issue-53/external.json
Remove-Item -LiteralPath '.verify-artifacts/issue-53/external chapel.json'
node dist/cli.js --replay .verify-artifacts/issue-53/external.json
```

## Clean-checkout qualification

A managed detached worktree at `5a371e6` was used so untracked files in the
author's main checkout did not supply evidence. On 27 September 2026:

| Check | Result |
| --- | --- |
| `npm.cmd ci` | Installed 99 packages; audit found 0 vulnerabilities. |
| `npm.cmd run verify` | All seven gates passed with zero warnings; 366 tests passed, 0 failed/skipped. |
| `npm.cmd run build` | Passed explicitly after verification. |
| Default and built-in startup | Default printed The Bell Beneath the Chapel; package gate started both bundled selectors outside the checkout. |
| Validation | Chapel: `ok`, 0 errors, 9 analysis warnings; Signet: `ok`, 0 errors/warnings; independent observatory: `ok`, 0 errors, 6 analysis warnings. |
| Manual command journeys | Public, confidential, potion defeat, and Oren casualty outcomes matched the expected outcomes above; every format-4 trace replayed. |
| Scripted AI recovery | Notice remained in journal after the scripted failure; local reads worked; incomplete format-4 trace replayed. |
| External-file independence | Copied chapel file validated and completed a confidential journey; replay passed after the copy was removed. |
| Extracted package | Verification's package gate packed and extracted 111 files outside the checkout, validated an external file, started default and both built-ins, and replayed built-in and external format-4 traces. |

Live DM qualification is the recorded [issue #52 campaign](issue-52.md): 21
isolated final runs, 33 reviewed manual judgments, and a confidential operator
journey on the data runtime. That campaign was not rerun for this documentation
handoff because live calls require credentials and new human review. The
synthetic and live evidence covers these bounded journeys, not arbitrary
adventure solvability, model improvisation, timing, or player enjoyment. This
increment adds no generation, save/resume, arbitrary scripts, clocks, or new
rules. This record is local qualification; publication and normal-clone
availability require separate authorization and proof that the remote default
branch contains the change.
