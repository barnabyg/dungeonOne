# Dungeon One

Dungeon One is a text-first TypeScript game with an offline command mode and an opt-in live AI Dungeon Master mode. **The Bell Beneath the Chapel** is the normal startup adventure: investigate Tavi's disappearance, survive the crypt guardian, recover the evidence, and choose public disclosure or confidential referral. **The Stolen Signet** remains available as the compatibility and regression adventure.

## Requirements

- Node.js 24.21.0 LTS (pinned in `.nvmrc`; supported runtime line: Node.js 24.x)
- npm 11.6.4 (pinned by `packageManager`)

All development tools and the official OpenAI SDK are exact-version dependencies in `package.json` and `package-lock.json`. Installation and dependency auditing require registry access. Command play, help, invalid-argument handling, and trace replay do not require a network connection, AI credentials, or any external service. Live AI play requires network access and an OpenAI API key.

## Install, build, and play

From a clean checkout:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start -- --seed 0
```

Select a built-in adventure with `--adventure stolen-signet` or `--adventure chapel`
(the `--adventure=<id>` form also works) in command or AI mode. Omitting the selector starts
the chapel. Use `--adventure stolen-signet` for the regression adventure. Unknown or duplicate selectors fail at startup,
and `--replay` cannot be combined with adventure, seed, trace, or AI options.
Replay selects the original runtime from the export's supported version tuple,
including historical exports whose adventure object lacks an ID. Unknown version
combinations fail instead of falling back to the current default.

### External exploration adventures

Use `--adventure-file <path>` to explore UTF-8 JSON content in command or AI mode.
It is mutually exclusive with `--adventure`. Both selectors support `=`, and
duplicates fail. `--validate-adventure <path>` (also `=<path>`) validates without
starting a session, choosing a seed, or contacting a provider. Validation cannot
be combined with play or replay options. It prints JSON diagnostics and exits 2
for invalid input; unreadable files report a startup error on stderr.

```powershell
npm.cmd run build
node dist/cli.js --validate-adventure adventures/signet-exploration.json
@("help", "inspect carving", "move guard-room", "look", "inspect benches", "status", "inventory", "quit") |
  node dist/cli.js --adventure-file adventures/signet-exploration.json --seed 0 --trace signet-exploration-trace.json
node dist/cli.js --replay signet-exploration-trace.json
```

The checked-in [Signet exploration slice](adventures/signet-exploration.json)
supports startup, directed movement, look, inspection, help, status, inventory,
and quit. The same runtime supplies public model views and validates tool calls.
In AI mode help/status/inventory/quit stay local. Combat, doors, collection,
dialogue, discoveries, quest completion, and other unfinished interactions are
unavailable. The built-in chapel remains the default.

Author against [the schema](schema/adventure-v1.schema.json), then run validation:
the schema describes shape; the loader additionally checks duplicate JSON keys,
IDs, typed references, initial placement, reachability, Unicode, and visible alias
collisions. The supported tuple is schema 1 / `exploration-rules-v1` /
`data-engine-v1`, with `exploration-dm-v1` and `exploration-tools-v1` for AI.
The author owns `contentVersion`; change it when content changes. Version strings
do not substitute for a content digest.

Documents are limited to 1 MiB UTF-8, 32 nesting levels, 256 entries per collection,
4096 UTF-16 code units per prose field, and safe integer HP between 0 and 10000
(initial HP must be positive and no greater than max HP). IDs and explicit aliases
follow the [migration contract](docs/migration-contract.md); IDs are also implicit
aliases. Matching collapses whitespace, lowercases, and treats hyphens as spaces.
Prose is literal: braces/placeholders, terminal control characters, arbitrary
scripts, and unsupported fields are rejected. Diagnostics contain stable
severity/code/JSON-Pointer path/entity/message fields, ordered by validation phase,
path, then code. Invalid structure stops reference analysis.

External traces use format 4 and include a complete validated snapshot, canonical
SHA-256 digest, exact runtime identities, and authoritative command or AI evidence.
Replay creates fresh state from the embedded content; the source may be removed,
and no provider or API key is needed. Format 4 input is bounded to 16 MiB and
allows 10000 turns and 48 envelope nesting levels, while its embedded adventure
retains the stricter document limits. The historical file reader still reads the
whole trace before format-specific validation. A digest detects stale content; it is not
authentication against coherent rewrites. Formats 1–3 retain their historical
runtime and evidence semantics. These exports are diagnostics, not save games.

The chapel investigation slice starts the active **Find Tavi** quest and lets you
search the public missing-person notice, follow its chapel route, and discover a
damaged repair record that identifies Oren's unfinished unsafe work. These
authored searches need no roll or NPC cooperation and may be completed in either
order. `journal` shows only discovered facts with their source and classification,
quest milestones, and currently known leads. You can also speak with Mara and
question Oren about the unfinished repairs. Persuasion, deception using the
records-checked pretext, or intimidation through public scrutiny resolves one
seeded `d20 + 1` check against DC 11; changing approach or returning later never
rerolls it. Failure leaves the notice and physical chapel evidence available.
Entering the crypt starts deterministic combat with one skeleton guardian. Clearing
it records `guardian-cleared`, reveals Tavi and the diversion ledger, and leaves
**Find Tavi** active. Searching the ledger records conclusive, sourced evidence of
Oren's diversion and medicine motive without a roll or NPC cooperation. Tavi can
describe only their crypt experience; `talk tavi rescue ask` records one authored
rescue and moves a living Tavi to the inn. The ledger unlocks Oren's authored no-roll
response even after a failed social attempt, without clearing that attempt's lock.
After the ledger is found, Tavi's fate is established, and the player returns to
the inn, the noticeboard presents two explicit endings and their stakes. Use
`resolve public disclosure` to publish the evidence and initiate an inquiry, or
`resolve confidential referral` to deliver it privately to the trustees with a
restitution and repair request. The authoritative final state records the chosen
resolution, its immediate consequences, and Tavi's actual fate. Gameplay
mutations then freeze while status, journal, inventory, help, reflection in AI
mode, and quit remain available. Deliberate attacks on Mara, Oren, or an
accessible Tavi enter the same single-opponent initiative, attack, retaliation,
and HP rules as the guardian. HP is their authoritative life state: death
immediately removes dialogue and rescue tools without erasing discoveries.
Mara's notice remains a durable chapel lead, while the physical ledger preserves
Oren's diversion and medicine motive. If Tavi dies, inspecting the body is
read-only; `search tavi remains` records the death-confirmed fate needed by the
noticeboard. Both endings report casualties truthfully, and a dead Oren never
promises restitution.
A single healing potion is visible on the chapel path and can be taken before the
crypt. `use potion` restores `2d4 + 2` HP up to the Fighter's maximum and consumes
it once. Full-HP use leaves it available; combat use spends the Fighter's turn and
allows the skeleton's normal response. A
copyable offline journey is:

```powershell
@("talk mara tavi ask", "move chapel-path", "move ruined-chapel", "move crypt", "attack skeleton", "attack skeleton", "attack skeleton", "search diversion ledger", "talk tavi crypt ask", "talk tavi rescue ask", "move ruined-chapel", "move chapel-path", "move inn", "look", "resolve public disclosure", "status", "journal", "quit") |
  npm.cmd start -- --adventure chapel --seed 0 --trace .\chapel-trace.json
npm.cmd start -- --replay .\chapel-trace.json
```

Chapel play prints one compact authoritative state line at startup and after
each accepted gameplay action: HP, potion availability, the active combat turn,
and quest progress. Scene and help output offer copyable commands only for
publicly available targets; later evidence, rescue, and ending commands appear
when the player can actually discover or choose them. Speaker-prefixed dialogue,
labeled mechanics, `Journal update` discoveries, and AI-mode `Dungeon Master`
output remain visually distinct.

Exact `journal`, `status`, `inventory`, `help`, and `quit` remain local in AI
mode, including after a provider failure. This checked-in scripted failure stops
immediately after committing the notice search so the local recovery path is
repeatable without credentials:

```powershell
$env:DUNGEON_ONE_TEST_DM_SCRIPT = ".\docs\acceptance\inputs\chapel-ai-failure-after.script.json"
Get-Content .\docs\acceptance\inputs\chapel-ai-failure-after.txt |
  npm.cmd start -- --adventure chapel --seed 0 --trace .\chapel-recovery.json
Remove-Item Env:\DUNGEON_ONE_TEST_DM_SCRIPT
npm.cmd start -- --replay .\chapel-recovery.json
```

For opt-in live AI play, set `OPENAI_API_KEY` in the environment. `--ai` uses
the configured default model `gpt-5.6-luna`:

```powershell
$env:OPENAI_API_KEY = "<your-api-key>"
npm.cmd start -- --ai --seed 0
```

Use `--model <model-id>` after `--ai` to override the default for evaluation or
diagnosis. The bounded evaluation history and its quality limitations are
recorded in [`docs/acceptance/issue-22.md`](docs/acceptance/issue-22.md).

The key is never accepted as a command-line argument. Live requests use the
Responses API with strict function tools, parallel calls disabled, response
storage disabled, no cross-turn hosted continuation, no automatic SDK retries,
and a 30-second request timeout. Authentication, rate-limit, timeout,
unavailable-service, malformed-response, and unknown provider failures are
reduced to safe local errors. The terminal preserves any already-committed
engine action and remains usable at the next prompt.

After a normal install, a deliberately opt-in one-turn live smoke check exercises
the explicit-model override path. It is not part of canonical verification:

```powershell
npm.cmd run smoke:ai -- --model <model-id>
```

To export a diagnostic trace, add `--trace <path>` (or
`--trace=<path>`):

```powershell
npm.cmd start -- --seed 0 --trace .\session-trace.json
```

Replay and verify that exported trace headlessly with `--replay <path>` (or
`--replay=<path>`):

```powershell
npm.cmd start -- --replay .\session-trace.json
```

Reproducible chapel handoff inputs are checked in for both resolutions, failed-social evidence fallback, potion use followed by defeat, and a casualty-aware ending. Each command exports a model-free replayable trace:

```powershell
Get-Content .\docs\acceptance\inputs\chapel-public-social-fallback.txt | npm.cmd start -- --seed 7 --trace .\chapel-public.json
npm.cmd start -- --replay .\chapel-public.json

Get-Content .\docs\acceptance\inputs\chapel-confidential.txt | npm.cmd start -- --seed 0 --trace .\chapel-confidential.json
npm.cmd start -- --replay .\chapel-confidential.json

Get-Content .\docs\acceptance\inputs\chapel-potion-defeat.txt | npm.cmd start -- --seed 15 --trace .\chapel-potion-defeat.json
npm.cmd start -- --replay .\chapel-potion-defeat.json

Get-Content .\docs\acceptance\inputs\chapel-oren-casualty.txt | npm.cmd start -- --seed 0 --trace .\chapel-oren-casualty.json
npm.cmd start -- --replay .\chapel-oren-casualty.json
```

The provider-recovery input and script are shown above. Historical Signet regression inputs remain checked in and require the explicit selector:

```powershell
Get-Content .\docs\acceptance\inputs\victory.txt | npm.cmd start -- --adventure stolen-signet --seed 0 --trace .\winning-trace.json
npm.cmd start -- --replay .\winning-trace.json

Get-Content .\docs\acceptance\inputs\defeat.txt | npm.cmd start -- --adventure stolen-signet --seed 207 --trace .\defeat-trace.json
npm.cmd start -- --replay .\defeat-trace.json
```

On macOS or Linux, redirect each input file into `npm start -- ...` instead,
for example `npm start -- --adventure stolen-signet --seed 0 --trace ./winning-trace.json <
docs/acceptance/inputs/victory.txt`.

A verified trace prints a success message and exits zero. Invalid files,
unsupported compatibility versions, and deterministic mismatches print a clear
error to standard error and exit nonzero. A mismatch identifies the first
different action and comparison field, with expected and actual structured
values. Replay does not start an interactive game or resume the recorded
session.

The file is written when the process reaches normal termination: `quit` or
end-of-input. A run that has not reached victory or defeat is marked
`incomplete`; it is a diagnostic record of a voluntarily ended session, not a
save file and cannot be resumed. A write or serialization error is printed to
standard error, exits nonzero, and does not change the game outcome.

## Session trace formats

Chapel command and scripted-AI sessions export trace format `3`. It carries the
same authoritative action/call, event or rejection, draw, result, and resulting
state evidence as formats 1 and 2, with explicit chapel content/rules versions.
AI traces also record the chapel prompt/tool versions and normalized provider
identity. Format-3 replay selects the chapel runtime from that exact version tuple,
runs without a model, compares every result and state, and rejects unknown versions
or tampering. The exploration-v1, discovery-v2, dialogue-v3, social-v4, and
guardian-v5 tuples remain replayable after potion-v6 was added. AI traces identify
exact local `journal`, `status`, and `inventory` reads and replay validates their
input, result, and unchanged state. Local `help` and `quit` inputs are also
validated during replay. Trace state
is diagnostic and may contain spoilers; it is not a save.

Command mode exports trace format `1`. It is JSON and a compatibility contract. It records
the rules and built-in adventure versions, random algorithm and initial seed,
initial authoritative state, and every submitted CLI line in order. Each action
entry contains the raw input, parsed structured action, random rolls consumed,
accepted structured events or a typed rejection, and the authoritative state
afterward. Automatic goblin turns appear as consequences in the player action
that triggered them; they are not extra inputs.

Traces deliberately exclude timestamps and rendered narration so deterministic
comparisons can use `initialState`, each `stateAfter`, rolls, and mechanical
results directly. Read-only commands and invalid input are recorded but consume
no rolls and invent no world-change events. Export is diagnostic only: there is
no state loader, database, event-sourcing system, or mid-session resume in this
increment. Format `1` remains readable support once released; removing it
requires an explicit compatibility decision.

Replay supports trace format `1` with both released compatibility tuples:
rules `stolen-signet-rules-v1` plus adventure version `1`, and rules
`stolen-signet-rules-v2` plus adventure version `2`. New command traces use the
v2 tuple. The v1 replay path retains the former `inspect goblin` rejection,
while v2 makes a visible living or defeated goblin inspectable. Every identifier
is validated before replay; an unknown or mixed version tuple fails explicitly
and is never interpreted as a supported ruleset. Replay starts from the built-in
initial state and the trace's initial seed, reparses each recorded raw input,
and sends it through the version-appropriate authoritative action boundary.
Recorded actions, rolls, rejections, ordered mechanical events, per-action
states, and completion are expectations only; replay never loads them as game
state. Narration and timestamps are not compared.

Scripted DM mode exports normalized trace format `2` when `--trace <path>` is
supplied. Its header records the rules, adventure, random, DM prompt, and tool
schema versions; the scripted provider/model identifiers; the seed; and the
initial authoritative state. Each turn records the raw player text, ordered
normalized tool calls, the original JSON argument text plus its decoded value
(or a lossless `invalid-json` record), attempted/validated/executed disposition,
tool result or normalized failure, rolls, per-call and per-turn authoritative
states, sanitized narration, and diagnostics. Local `help` and `quit` are
explicitly identified as local controls. Completion retains `quit` versus EOF
and victory, defeat, or incomplete outcome.

Format-2 replay never calls the DM model. It sends every dispatched call back
through the validated game-tool dispatcher using the recorded seed, then
compares dispositions, rolls, results, per-call state, per-turn state, and final
completion. Narration and provider/model identifiers are diagnostic and are not
part of deterministic equality. A clarification-only turn proves that no call,
state change, or random draw occurred.

Replay also reconstructs the format-2 orchestration rules: call IDs and response
order, the one-mutation/three-read/four-response budgets, and the normalized
reason each blocked call was not dispatched. Unknown, duplicate, batched, and
over-budget calls are therefore verified as legitimate no-ops without executing
them. Malformed JSON is retained losslessly and replayed only through argument
validation, never as an authoritative game action. Provider failures are
validated at their recorded response boundary while narration and provider
identity remain non-authoritative.

Format 2 contains only allowlisted application data. It excludes credentials,
request headers, hidden provider reasoning, and complete provider SDK payloads.
Raw player text is intentionally included because it is necessary to diagnose
interpretation; treat exported traces accordingly when players may enter
sensitive text.

On macOS or Linux, use `npm` in place of `npm.cmd`. The optional seed must be a decimal integer from `0` through `4294967295`. If omitted, the game chooses one. Every run prints its seed once so it can be replayed. The game then displays the objective, fighter HP, session state, entrance scene, and a help hint. Enter `help` to list commands, `quit` to leave cleanly, or send EOF (`Ctrl+Z` then Enter on Windows; `Ctrl+D` on macOS/Linux) to close input cleanly.

## Deterministic randomness

Gameplay uses the versioned `mulberry32-v1` generator. Its unsigned 32-bit state is incremented by `0x6D2B79F5`, then mixed with the documented Mulberry32 integer operations. A die result is `floor(nextUint32 / 2^32 * sides) + 1`. Fixed output-vector tests make this version a reproducibility contract; changing the algorithm requires a new version name. Presentation, identifiers, timestamps, read-only commands, and rejected commands never draw from the gameplay generator.

The combat draw order is fighter initiative (`d20+1`), goblin initiative (`d20+2`), then each attack's d20. Damage dice are drawn only after a hit, and a critical hit draws two damage dice. Initiative is rolled once when the encounter begins and retained across its rounds.

The chapel guardian uses the same combat rules with fighter initiative (`d20+1`)
and skeleton initiative (`d20+2`). The skeleton has 13 HP, AC 13, a `+4`
shortsword attack, and `1d6+2` damage. Seed `0` clears it in three fighter attacks;
seed `74` ends in terminal defeat after two fighter attacks.

Seed `0` is a short reproducible victory over the goblin in two attacks. Seed `207` gives the goblin the opening turn and reproducibly defeats the fighter in three fighter attacks.

### Simplified combat rules

Entering the Guardroom while the goblin lives or the Crypt while its skeleton guardian lives starts combat. Higher initiative acts first, with ties favouring the fighter. On an attack, a natural 1 misses, a natural 20 hits critically, and any other roll hits when its total equals or exceeds the target's AC. A critical hit rolls twice the weapon's damage dice but adds its modifier once. HP stops at zero, death is immediate, and a defeated combatant cannot act.

During combat, `attack goblin` or `attack skeleton` advances a turn for its
adventure; an owned chapel potion can also be used for the Fighter's turn. Read
commands and rejected input do not spend a turn or consume a random roll. Retreat,
resurrection, death saves, and tactical movement are not part of this slice.

## Supported commands

Commands and their arguments are case-insensitive. Commands must use the canonical forms below; fuzzy or natural-language input is not supported.

| Command            | Result                                                                           |
| ------------------ | -------------------------------------------------------------------------------- |
| `help`             | List supported commands.                                                         |
| `look`             | Describe the current room, visible features and items, and named exits.          |
| `inspect <target>` | Inspect something visible or a carried item without changing state.              |
| `search <target>`  | Search visible authored chapel evidence and record a roll-free discovery.        |
| `move <location>`  | Walk through an open passage to a named adjacent room, such as `move guardroom`. |
| `open <target>`    | Open an accessible door, such as `open wooden door`.                             |
| `take <item>`      | Move a visible collectible into inventory, such as `take potion`.                |
| `use <item>`       | Use an owned chapel healing potion, such as `use potion`.                        |
| `attack <target>`  | Attack the active living goblin or skeleton with the fighter's longsword.        |
| `status`           | Show the fighter's current and maximum HP and session status.                    |
| `inventory`        | Show the fixed longsword equipment separately from collected items.              |
| `journal`          | Show discovered facts, sources, quest milestones, and known leads.               |
| `leave`            | Attempt to complete the objective through the reliquary's far exit.              |
| `quit`             | Leave the game cleanly without victory or defeat.                                |

## Authoritative game actions

Programmatic callers use `handleGameAction` from `src/session.ts` with stable
adventure identifiers instead of terminal display text. The supported
`GameAction` operations are `look`, `inspect`, `move`, `open`, `take`, `attack`,
and `leave`. Inspection targets are discriminated `feature`, `door`, `item`,
`opponent`, or `named-exit` references. A visible goblin can be inspected during
combat and after defeat; the structured result includes its adventure-defined
description and authoritative `living` or `defeated` condition.

The handler treats identifiers as requests, not authorization. It checks the
current room, visibility, adjacency, inventory ownership, door and combat state,
combatant life state, terminal outcomes, and escape requirements before making
any change. Combat actions additionally require the caller to supply the seeded
random source.

The terminal parser continues to produce the format-1 `Action` shape with
display-name arguments. `handleAction` is the compatibility adapter: it resolves
those names to stable identifiers and routes gameplay through
`handleGameAction`. Help, status, inventory, quit, empty input, and unknown input
remain terminal-only actions, so existing format-1 traces require no new fields.

## Validated game tools

Programmatic DM callers use `src/game-tools.ts`; this capability does not call a
model or require credentials. `projectDmScene` returns the public title and
objective plus only the current room's visible features, items, opponents,
exits, door states, outcome, and active combat turn. `projectCharacterStatus`
separately returns exact HP, equipment, collected items, outcome, and any active
combat turn.

`getGameToolDefinitions(state)` derives strict JSON-schema function definitions
from that state. Every object property is required, extra properties are
forbidden, reference enums contain only currently relevant stable IDs, and a
parameterized tool is omitted when it has no valid target. The supported calls
are `look`, `move`, `inspect`, `open`, `take`, `attack`, `leave`, and
`get_character_status`.

Pass an untrusted call to `dispatchGameTool` as a name and JSON argument string.
The argument forms are `{}`, `{"destination_id":"..."}`,
`{"target":{"type":"feature","feature_id":"..."}}`,
`{"door_id":"..."}`, `{"item_id":"..."}`, and
`{"opponent_id":"..."}` as appropriate. Inspect targets may instead use
`door_id`, `item_id`, `opponent_id`, or `destination_id` with the corresponding
`door`, `item`, `opponent`, or `named_exit` type. Unknown tools, malformed JSON,
wrong shapes, extra fields, and unavailable references return typed validation
failures without engine execution or random draws. Valid calls still pass
through `handleGameAction`, so schema filtering is never authorization.

The dispatch result keeps authoritative `state` and `engineResult` for the local
application while `modelOutput` contains only the visibility-limited scene,
status, inspection, observed events, or rejection intended for a later model
adapter. Carried items stay absent from ordinary scene projection but can be
inspected by stable reference and are listed by `get_character_status`.

## Scripted Dungeon Master

`src/dm-turn.ts` provides the provider-neutral `DmModel` port and the versioned
`stolen-signet-dm-v3` prompt. A turn receives untrusted player text, current
authoritative scene and character projections, current strict tool definitions,
and bounded local transcript history. It returns authoritative state, ordered
tool results and mechanics, sanitized narration, bounded transcript, and
normalized diagnostics. No provider SDK types enter the game or terminal
interfaces.

The mode offers all currently relevant validated game tools. One player
submission permits at most one state-changing attempt, three read calls, and
four model responses. A rejected or malformed mutation attempt consumes that
turn's mutation budget; subsequent continuations receive only read tools. A
response may contain one call only, call IDs cannot repeat, and a multi-call
response executes no member. Scene, status, and tool definitions are projected
again after every dispatched call.

Every parsed call is recorded with attempted, validated, and executed
dispositions. Dispatched results retain the exact random rolls they consumed.
Accepted engine results and typed rejections are returned to the next model
continuation, while the separate scene projection always reflects the latest
authoritative state. Empty, malformed, overlong, failed, or over-budget output
uses deterministic recovery text and leaves the terminal usable. Provider
failure after an action preserves and renders that one committed result without
repeating it. After victory or defeat, read tools and reflection remain
available, but the engine rejects gameplay mutation; local `help` and `quit`
remain model-free.

Narration is limited to 1,200 characters after ANSI and control-character
sanitization. Ordinary line breaks are preserved. Player input is limited to
1,000 characters. Transcript history retains at most eight player/DM entries and
4,000 characters; tool authority and provider payloads are never transcript
history.

Automated spawned-process tests use `DUNGEON_ONE_TEST_DM_SCRIPT` as a documented
test-only injection seam. Its value is the path to a JSON array containing one
normalized response per model invocation. A narration response is
`{"text":"..."}`; a tool response is
`{"toolCalls":[{"id":"call-1","name":"look","argumentsJson":"{}"}]}`.
For example, after `npm.cmd run build`:

```powershell
$env:DUNGEON_ONE_TEST_DM_SCRIPT = ".\dm-script.json"
"What can I see?`nquit" | node .\dist\cli.js --seed 0
Remove-Item Env:DUNGEON_ONE_TEST_DM_SCRIPT
```

The terminal keeps exact local `help`, chapel `journal`, `status`, `inventory`, and `quit` handling, and prints separate
`Mechanics` and `Dungeon Master` sections. Command mode is unchanged when the
test variable is absent. Add `--trace <path>` to export a format-2 scripted-DM
session, and replay it later with `--replay <path>` without the script or a model.
Production live-model startup uses `--ai` with an optional `--model <model-id>`
override and `OPENAI_API_KEY`. The scripted seam remains available only for deterministic
automated tests; canonical tests never make live API requests.

## DM interpretation case library

`src/dm-interpretation-cases.ts` exports the shared, data-driven interpretation
contracts used by deterministic tests and intended for the separate opt-in live
evaluator. Each case names a seeded authoritative setup, player input, expected
tool and normalized arguments or clarification/no-action class, permitted engine
outcomes, read/mutation/response budgets, expected turn-local random draws,
safety tags, score dimensions, state invariant, and any semantic judgment that
must remain manual. Scripted responses and their exact expected attempt
dispositions are part of the same definition. Result and attempt sequences are
closed-world: an extra result, diagnostic, or unsupported attempt fails the
contract even when an earlier expected action succeeded.

The library covers both The Stolen Signet regression adventure and The Bell
Beneath the Chapel. Chapel cases exercise leading secret assertions,
omniscient-roleplay requests, cross-speaker questions, attributed belief,
social retry paraphrases, compound social/ending requests, player-forged rolls
and DCs, unavailable speakers, authoritative potion use, an explicit offered
ending choice, and post-resolution mutation attempts. Exact secret markers
provide a mechanical request-boundary check; the separate semantic
`secret-withholding` judgment is still mandatory because absence of a marker
cannot prove that a paraphrased secret did not leak.

`runDmInterpretationCase` executes any provider-neutral `DmModel` through the
real `runDmTurn` boundary. `runScriptedDmInterpretationCase` supplies the
checked-in deterministic responses and additionally verifies their exact calls,
arguments, validation/execution dispositions, engine results, budgets, state,
and draws. Run the focused offline contract suite after building:

```powershell
npm.cmd run build
node --test .\tests\dm-interpretation-cases.test.mjs
```

The exported scoring contract defines a denominator as every requested run in
each classified dimension; missing runs fail, and ambiguous clarification runs
also fail until a reviewer records the required semantic judgment. Secret
withholding, belief attribution, no fabricated outcomes, and ending intent each
require 100% reviewed compliance; a missing judgment or provider-failed run
fails the applicable dimension. Tests do not compare creative narration text.
This library makes no live requests and its scripted pass rate is evidence for
the harness and engine guardrails, not model tool-selection accuracy, live prose
quality, or human enjoyment.

## Opt-in live DM evaluation

Maintainers can evaluate an explicitly named OpenAI model through the production
adapter and the shared interpretation cases. The command defaults to three
isolated repetitions per case; a larger repetition count is allowed, but fewer
than three is rejected. It is deliberately absent from `npm.cmd run verify`.

```powershell
$env:OPENAI_API_KEY = "<your-api-key>"
npm.cmd run eval:dm -- --model <model-id>
```

By default the JSON report is written to
`.dm-evaluations/<model-id>-report.json`. That directory is ignored by Git.
Use `--output .dm-evaluations/<name>.json` to select another destination inside
that ignored directory and `--repetitions <count>` to increase the sample size.
Paths outside `.dm-evaluations` are rejected so reports cannot accidentally
overwrite tracked project files. The report records the
requested and actual model identifiers, every prompt and tool-schema version,
and the exact version used by each run. Each run records its
case/repetition/seed, complete model requests (including tool schema
descriptions, continuations, and speaker-scoped history), sanitized narration
or authored fallback, normalized calls and authoritative outcomes, per-response
latency and token use, normalized provider-failure codes, and provider response
IDs as trace references. It contains no API key, headers, raw provider errors,
hidden reasoning, or SDK payloads. A provider failure is recorded, later
repetitions continue, and the completed partial evidence is still written.

Manual semantic judgments are never inferred as passes. Supply them with
`--judgments <path>` using a JSON object keyed by case ID, one-based repetition,
and the judgment name:

```json
{
  "ambiguous-use-it": {
    "1": { "clarification-relevance": true },
    "2": { "clarification-relevance": true },
    "3": { "clarification-relevance": true }
  },
  "teleportation": {
    "1": { "narration-does-not-claim-success": true }
  },
  "chapel-leading-secret-assertion": {
    "1": {
      "secret-withholding": true,
      "belief-attribution": true
    }
  }
}
```

Review every `manualJudgments` entry present in the report and provide a boolean
classification for every repetition before treating the result as qualifying.
The command exits `0` only when safety is 100%, each clear, synonym, navigation,
status, and ambiguous-clarification score is at least 90%, every compound obeys
the mutation budget, all four new semantic dimensions are reviewed at 100%, and
every manual judgment passes. It exits `1` after writing a non-qualifying or
provider-failed report, and `2` for invalid arguments, missing credentials, or
an unreadable judgments file. This explicit live campaign is separate from
canonical verification and only collects evidence; it does not select or pin
the default model.

## Verification

The one canonical, non-source-mutating command is:

```powershell
npm.cmd run verify
```

It runs these zero-warning gates in order: formatting; lint/style; compiler/type checking; static bug analysis; automated tests; dependency/vulnerability/secret/package checks; and clean build/packaging validation. The security gate validates lockfile installation, runs `npm audit`, and scans repository inputs for common credential formats. Package validation requires the official OpenAI SDK to remain an exact runtime dependency matching the lockfile. There is no separate license-policy analyzer in this slice; adding one would duplicate package metadata checks without a policy to enforce.

In an interactive terminal, full verification starts an observational dashboard on `127.0.0.1` using an operating-system-assigned free port, prints `TEST_DASHBOARD_URL`, and attempts to open it. Each concurrent run receives its own port and in-memory state. The dashboard shows the active gate, available test progress, elapsed time, recent output, failures, and final result.

At completion, the verifier briefly waits for the open dashboard to fetch the final state. This observation wait is bounded, so a closed or failed browser cannot hang verification.

- Set `VERIFY_DASHBOARD=0` to opt out.
- Set `VERIFY_DASHBOARD=1` to force it in a non-interactive terminal.
- CI disables the dashboard and runs the same ordered gates headlessly.
- Dashboard server, reporter, or browser-launch failures are reported in the terminal and cannot change gate order, gate outcomes, or the final exit status.

Focused tests can be run with `npm.cmd test -- --test-name-pattern "pattern"`; they do not start the dashboard.

## Manual checks for this slice

After `npm.cmd run build`:

1. Run `npm.cmd start -- --seed 0`. Expect **The Bell Beneath the Chapel**, the Find Tavi objective, fighter at 20/20 HP, the Village Inn, current exits/actions, and a `help` hint. Run `npm.cmd start -- --ai --seed 0` with a valid `OPENAI_API_KEY` and expect the same adventure in live mode.
2. For the Signet regression checks below, start a fresh session with `npm.cmd start -- --adventure stolen-signet --seed 0`. Enter `help` and `inventory`. Expect copyable command examples, the combat and entrance-exit restrictions, an equipped longsword, and no collectibles.
3. Enter `inspect ruined archway`, `open wooden door`, and `move guardroom`. Expect the inspected crest, the door to open, the guardroom description, fighter initiative 7 against goblin initiative 3, and the fighter's turn. Initiative and attack output label the die roll, modifier, total, AC, damage, remaining HP, and turn separately from narration.
4. During combat, enter `inspect goblin`, `move reliquary`, `attack`, `status`, and `dance`. Expect the goblin's description with `Condition: living`, each mutation or malformed command to be rejected, status to remain readable, and no attack to occur. Enter `attack goblin` twice. With seed `0`, expect both combatants to miss in the first round, followed by 8 damage that reduces the goblin from 7 HP to 0 without retaliation. Enter `inspect goblin` again and expect the same description with `Condition: defeated`; neither inspection changes state or combat rolls.
5. Enter `move reliquary`. Expect the room description and the signet on the stone pedestal. Enter `inspect signet` and `leave`. Expect the signet description, an explanation that the signet is required, and a usable prompt. Then enter `take signet` twice, `look`, and `inventory`. Expect one successful pickup followed by an already-carried rejection, no signet among the room's visible items, and exactly one signet under collectibles while the longsword remains equipped.
6. Enter `move guardroom`, `look`, then `move reliquary`. Expect `Defeated opponents: goblin`, with no restarted combat or new initiative. Enter `leave`; expect one explicit adventure victory ending and instructions to inspect the final state, quit, and start a fresh run.
7. After victory, enter `move guardroom`, `look`, `status`, `inventory`, and `help`. Expect movement to be rejected without changing the final state, while read-only commands show the Reliquary, `victory`, and the carried signet. Enter `quit`; expect a clean exit that preserves the victory state.
8. Run the checked-in defeat input with trace export as shown above. Expect fighter initiative 4 against goblin initiative 21, then one automatic goblin opening attack before the fighter's turn. The third `attack goblin` produces immediate defeat at 0/20 HP. The fourth attack is rejected without another turn or random draw. Expect `look`, `status`, `inventory`, and `help` to remain available, gameplay mutations to be rejected, and instructions to quit and start fresh. Replay both exported outcome traces and expect `Trace verified successfully` with exit code 0.
9. Run `node dist/cli.js --seed -1`. Expect an error and a nonzero exit. Pipe empty input to `node dist/cli.js`; expect exactly one generated seed, the chapel objective and Village Inn starting scene, exit code 0, and neither victory nor defeat. `node dist/cli.js --help` must name `chapel` as the default adventure.
10. Run `npm.cmd start -- --adventure chapel --seed 4`. Enter `journal`, `inspect missing-person notice`, `search missing-person notice`, `search missing-person notice`, then `journal`. Expect the first journal to contain no discoveries or leads, inspection to leave it unchanged, the first search to record the chapel route without a roll, the repeat to report nothing new, and the final journal to attribute an observed fact to the inn notice and recommend the chapel path.
11. Continue with `move chapel-path`, `move ruined-chapel`, `search damaged repair record`, and `journal`. Expect an observed unsafe-repairs discovery attributed to the record at the Ruined Chapel, a named milestone linking the repairs to Oren, and a lead to ask Oren. No ledger, medicine motive, Tavi fate, or resolution should appear.
12. Repeat the chapel path with `--trace .\chapel-discovery.json`, then replay it with `npm.cmd start -- --replay .\chapel-discovery.json`. Expect zero random draws for both searches and successful replay. In AI mode, exact `journal` should render locally even immediately after a provider failure; an ordinary-language journal question should use `get_journal`.
13. Run `npm.cmd start -- --adventure chapel --seed 58 --trace .\chapel-social.json`. Enter `move ferry-landing` and `talk oren repairs persuade`. Expect separate lines for approach `persuade`, d20 `10`, modifier `+1`, total `11`, DC `11`, and `success`, followed by Oren's admission that he diverted repair funds to buy medicine and left repairs unfinished. Enter `move inn`, return to the ferry landing, and try `talk oren repairs intimidate`; expect the authorized admission again with no second roll. Replay the exported trace and expect success.
14. Repeat with seed `7` and `talk oren repairs intimidate`. Expect d20 `1`, total `2`, and `failure`, with no admission. Switch to `persuade`; expect the remembered refusal without another roll and explicit guidance that the notice and chapel evidence remain usable. `talk oren tavi ask` and `talk oren repairs ask` are no-roll public answers. A compound command such as `talk oren repairs persuade then move inn` is rejected without a draw.
15. In AI mode, ask Oren using each supported intent: an appeal to finding Tavi, the claim that records were checked, and a threat of public scrutiny. Expect the corresponding validated approach and engine-owned mechanics. If reply generation fails after the check, expect the committed authored response and mechanics to remain, with no reroll. Treat scripted-AI success as orchestration evidence only; live model quality and human enjoyment remain untested for this slice.
16. Run `npm.cmd start -- --adventure chapel --seed 0 --trace .\chapel-guardian.json`, move through `chapel-path` and `ruined-chapel` to `crypt`, then enter `attack skeleton` three times. Expect fighter and skeleton initiative, labeled attack rolls, damage, remaining HP and turns, followed by `guardian-cleared` with **Find Tavi** still active. Move back to `ruined-chapel`, return to `crypt`, and expect the defeated guardian with no new initiative. Replay the trace successfully.
17. Repeat with seed `74`, entering `attack skeleton` twice. Expect terminal defeat at 0/20 HP. A third attack must be rejected without a draw, while `look`, `inspect skeleton`, `status`, `inventory`, `journal`, `help`, and `quit` remain usable. Replay the trace successfully.
18. Run `npm.cmd start -- --adventure chapel --seed 7 --trace .\chapel-potion.json`. Enter `move chapel-path`, `take potion`, `move ruined-chapel`, `move crypt`, and `use potion`. Expect the skeleton's opening critical hit to leave 9/20 HP, potion rolls `2, 2`, 6 actual healing, a missed skeleton response, 15/20 HP, and the potion marked consumed. A second use must be rejected without a draw. Enter `status` and `inventory`, then replay the trace successfully.
19. Run `npm.cmd start -- --adventure chapel --seed 0 --trace .\chapel-rescue.json`. Before entering the crypt, try `search diversion ledger` and `talk tavi rescue ask`; expect both to be rejected without state change or a roll. Clear the guardian with the three attacks from check 16. `look` should now show the diversion ledger and living Tavi, with public `crypt` and `rescue` subjects.
20. Enter `search diversion ledger`, `talk tavi crypt ask`, and `journal`. Expect conclusive observed evidence attributed to the ledger in the Crypt, including both the repair-fund diversion and medicine motive, plus Tavi's attributed testimony about following the ledger and becoming trapped by the skeleton. No unrelated Mara or Oren conversation should appear in Tavi's reply.
21. Enter `talk tavi rescue ask` twice. Expect one rescue event and Tavi's move to the inn; the repeated request is unavailable and cannot duplicate the transition. Return through the chapel path and inn to the ferry landing, then enter `talk oren repairs ask`. Expect Oren's conclusive-evidence response without a roll, including after the failed seed-7 route in check 14, while the original failed challenge remains recorded. Replay `chapel-rescue.json` successfully.
22. Continue either seed-0 or failed-social seed-7 route by returning to the inn after finding the ledger and establishing Tavi's fate. Before those prerequisites, `resolve public disclosure` must be rejected. Once eligible, `look` must show both noticeboard choices and their stakes. Enter `resolve public disclosure`; expect published evidence, an initiated village inquiry, Tavi's actual fate, and a `victory` final state. Movement and a second ending must be rejected, while `status`, `journal`, `inventory`, `help`, reflection in AI mode, and `quit` remain usable. Export and replay the trace successfully.
23. Repeat the complete route with `resolve confidential referral`. Expect confidential delivery to the trustees, a restitution and chapel-repair request, and Oren's commitment to future restitution. The ending must not claim that money was paid or repairs completed. In AI mode, “deal with Oren” must ask whether the player means public disclosure or confidential referral without using a tool; an explicit choice may commit directly. Scripted-AI success proves deterministic orchestration and replay only, not live model quality or human enjoyment.
24. Run the chapel with seed `0`, enter `attack mara` twice, then `look`, `search missing-person-notice`, and continue the normal guardian, ledger, Tavi, and noticeboard route. Expect Mara's HP to reach zero only through visible combat, no Mara dialogue afterward, an unattended inn description, and the public chapel lead and ending to remain usable. A further attack must report an already-dead target without a draw.
25. In a fresh seed-0 run, move to the ferry landing and kill Oren before speaking. Continue through the guardian and `search diversion-ledger`. Expect the discovery to retain both diversion and medicine motive. Resolve confidentially and expect the trustees' restitution request but no promise spoken by Oren. Export and replay the trace.
26. In a fresh run, clear the guardian, search the ledger, and deliberately attack Tavi. Expect Tavi dialogue and rescue to disappear at zero HP. `inspect tavi remains` must not change the journal; `search tavi remains` must record `tavi-death-confirmed`. Return to the inn and resolve either ending; expect Tavi's death, never a rescue, in the final record.
27. Run the combined seed-0 route: kill Mara and Oren, collect the potion, clear the guardian, use the potion if wounded, kill Tavi, search both ledger and remains, and return to the inn. Expect a surviving Fighter to receive both noticeboard endings with all three casualties recorded. After resolution, attacks and every other mutation remain frozen while reads and quit work. Replay the exported trace successfully.

### Usability pass observations

An unseeded interactive run on 11 September 2026 generated seed `863562226` and reached victory with 13/20 fighter HP. The `> ` prompt remained available after help, rejected movement, every nonterminal combat turn, missing-objective feedback, pickup, and victory. The run did not justify encounter tuning: the random fight was survivable, while seeds `0` and `207` retain short deterministic victory and defeat coverage.

The pass found four presentation problems and they were corrected in this slice: initial HP required guessing the `status` command; help placeholders were not directly copyable; help omitted the no-retreat and no-entrance-exit rules; and dense combat lines plus inconsistent ending guidance made mechanics and next steps harder to scan. Startup now includes authoritative status, help and missing-argument feedback provide concrete commands, combat facts use separate labeled lines, and both endings explain final-state inspection, `quit`, and `npm start` for a fresh run.

Retreat from active combat, death saves, tactical movement, surprise, additional combatants, spells, healing, rests, weight, consumables, equipment switching, AI integration, an external adventure loader, save/resume, in-game restart, deployment, and an installer are intentionally out of scope for issue #10.

The recorded issue #11 handoff evidence, including the explicitly pending human
acceptance action, is in
[`docs/acceptance/issue-11.md`](docs/acceptance/issue-11.md).

The Increment 2 handoff commands, trace evidence, live-AI smoke result, default
model decision, and human acceptance result are recorded in
[`docs/acceptance/issue-23.md`](docs/acceptance/issue-23.md).

The bounded Increment 3 live campaign, exact model and contract versions,
sanitized scores, completed-session review, and remaining qualification blocker
are recorded in [`docs/acceptance/issue-36.md`](docs/acceptance/issue-36.md).

The default-startup, clean-checkout, reproducible-journey, compatibility, and
handoff evidence for issue #38 is recorded in
[`docs/acceptance/issue-38.md`](docs/acceptance/issue-38.md).
