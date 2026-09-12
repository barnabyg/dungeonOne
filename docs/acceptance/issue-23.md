# Issue #23 tester handoff evidence

Run date: 12 September 2026

This record covers the reproducible agent-executable acceptance work for GitHub
issue #23. The issue is not ready to close: no default model is currently
selected, and the required unfamiliar-human acceptance evidence remains
pending.

## Clean-checkout installation and verification

Platform: Windows, PowerShell 7

Repository prerequisites are Node.js 24.21.0 LTS (with the supported runtime
line declared as Node.js 24.x) and npm 11.6.4. The acceptance host provided
Node.js 24.13.0 and npm 11.6.4, so the run exercised the supported Node.js line
but not the exact `.nvmrc` version.

The candidate was cloned into a new temporary directory with no copied
dependencies, build output, traces, or ignored files. These commands used only
tracked project inputs:

```powershell
npm.cmd ci
$env:VERIFY_DASHBOARD = "0"
npm.cmd run verify
npm.cmd run build
'' | npm.cmd start -- --seed 0
```

Outcomes:

- `npm.cmd ci` installed 99 packages from the lockfile and reported zero
  vulnerabilities.
- All seven verification gates passed with zero warnings. The automated test
  gate passed 161 tests with no failures, skips, or todos, and clean package
  validation reported 50 files and 84,697 bytes.
- The separate build completed successfully.
- Offline startup printed seed `0`, `mulberry32-v1`, the objective, 20/20 HP,
  `playing`, the Entrance scene, and a recovery hint before exiting zero at
  end-of-input.

The README documents installation, offline and configured-AI startup, API-key
setup, explicit `--model`, `--seed`, `--trace`, and `--replay`, trace privacy,
and recovery after provider failures.

## Command-mode outcomes and both format-1 compatibility paths

The checked-in command inputs were run from the clean checkout:

```powershell
Get-Content .\docs\acceptance\inputs\victory.txt | npm.cmd start -- --seed 0 --trace .\winning-trace.json
npm.cmd start -- --replay .\winning-trace.json

Get-Content .\docs\acceptance\inputs\defeat.txt | npm.cmd start -- --seed 207 --trace .\defeat-trace.json
npm.cmd start -- --replay .\defeat-trace.json

npm.cmd start -- --replay .\tests\fixtures\format-1-command-rejections.json
```

All commands exited zero. The seed-0 run showed distinct mechanical output for
initiative, misses, damage, remaining HP, combat victory, signet pickup,
backtracking, and explicit exit victory. The seed-207 run showed goblin-first
initiative, terminal defeat at 0/20 HP, readable final state, and clean quit.
Both new v2 traces and the released v1 fixture reported `Trace verified
successfully`.

The full verification also exercised living and defeated goblin inspection. A
separate scripted victory below used “Search the corpse” and returned the
authoritative defeated condition without a mutation or random draw.

## Scripted natural-language traces

The checked-in `.txt` and `.script.json` pairs provide reproducible natural
language at the terminal boundary without a network call. After building, each
pair can be exported with the test-only scripted adapter and replayed after
removing that adapter:

```powershell
$env:DUNGEON_ONE_TEST_DM_SCRIPT = ".\docs\acceptance\inputs\ai-victory.script.json"
Get-Content .\docs\acceptance\inputs\ai-victory.txt | node .\dist\cli.js --seed 0 --trace .\ai-victory-trace.json
Remove-Item Env:DUNGEON_ONE_TEST_DM_SCRIPT
node .\dist\cli.js --replay .\ai-victory-trace.json
```

Repeat with the matching `ai-defeat`, `ai-clarification`,
`ai-failure-before`, and `ai-failure-after` file stems. The observed results
were:

| Session | Seed | Turns | Completion | Evidence |
| --- | ---: | ---: | --- | --- |
| victory | 0 | 11 | victory / quit | Free-text door opening, combat, “Search the corpse”, signet recovery, backtracking, explicit exit, and local quit. |
| defeat | 207 | 8 | defeat / quit | Understandable 0/20 HP defeat, a readable status query, rejected post-defeat movement with frozen state, and local quit. |
| clarification | 42 | 2 | incomplete / quit | Ambiguous “Use it” caused no tool call or state change and received a focused question. |
| failure before action | 0 | 2 | incomplete / quit | `model-failure`, zero calls, unchanged state, and continued local quit. |
| failure after attack | 0 | 4 | incomplete / quit | Exactly one attack committed with the expected two d20 draws, then `model-failure`; the next local quit remained usable. |

All five format-2 traces replayed successfully without a model or API key. Each
recorded `stolen-signet-rules-v2`, adventure version `2`, random algorithm
`mulberry32-v1`, prompt `stolen-signet-dm-v3`, and tool schema
`stolen-signet-tools-v1`. Inspection found no API key, authorization header,
request-header field, hidden reasoning, SDK payload, or provider-configuration
field. The allowlisted diagnostic `provider: scripted` and
`model: scripted-dm-v1` fields were present as designed.

## Safety and interpretation probes

This focused command passed 43 tests:

```powershell
node --test .\tests\dm-interpretation-cases.test.mjs .\tests\dm-turn.test.mjs
```

The cases covered ambiguity, impossible teleportation, remote signet pickup,
compound door-and-entry input, direct HP injection, fabricated victory,
explicit early leaving, terminal victory reads, terminal defeat movement, and
prompt/tool-boundary injection behavior. They also confirmed zero committed
actions for a provider failure before dispatch, one committed action after an
attack, deterministic rolls, bounded reads/responses, and continued recovery.
These are scripted safety and mechanics results; they are not evidence of live
model quality or unfamiliar-human usability.

## Configured AI startup and evaluation status

An opt-in live smoke check used the configured environment credential without
printing or recording it:

```powershell
npm.cmd run smoke:ai -- --model gpt-5.5-2026-04-23
```

It exited zero, started seed 0, performed a `look` through the production
Responses adapter, rendered mechanics and Dungeon Master narration, and quit
cleanly. With the key deliberately removed in a child process, explicit-model
startup and evaluation both exited `2` with the documented
`OPENAI_API_KEY is required` error.

There is no qualifying default model. `npm.cmd start -- --ai` exits `2` and
requires `--model <model-id>`. Issue #22's bounded evidence records that
`gpt-5.5-2026-04-23` passed the case evaluator but failed completed-playthrough
narration review because it contradicted committed mechanics. Consequently the
project correctly did not pin it as the default. Re-running the already
exhausted campaign would not repair that blocker; the recorded next experiment
is a separately authorized prompt-v4 evaluation.

## Human acceptance — pending

No unfamiliar human tester participated in this implementation session. The
scripted and agent-operated playthroughs above do not substitute for the issue's
human criterion. A tester unfamiliar with the implementation must still:

1. install and start the project from tracked files;
2. complete a full live-AI victory using ordinary language, without canonical
   gameplay syntax or developer intervention;
3. observe and explain an understandable defeat and local quit; and
4. record the date, platform/runtime, exact configured model, outcome, any
   unclear instructions, and any intervention.

## Resolution status

Issue #23 must remain open. Its agent-executable mechanics, safety, trace,
privacy, clean-checkout, and explicit-model smoke evidence pass, but two
acceptance requirements are outstanding:

- select a default model only after a candidate passes the required live
  completed-playthrough narration review; and
- obtain actual unfamiliar-human acceptance evidence.

No content, rules, deployment, or unrelated refactor was added.
