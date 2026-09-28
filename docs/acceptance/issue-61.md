# Issue #61: increment 5 clean-checkout handoff

This handoff applies to the tracked code at the revision recorded under
**Verification** below. Generation creates a local, validated schema-3 /
`chapel-clues-rules-v4` JSON file before play. The live DM consumes that file;
it does not generate or repair canon during a turn. A generated file can be
played in command mode without a network connection or credentials. `--ai`
uses a separate, networked live DM. Traces are diagnostic replays, not saves.

## Prerequisites, cost, and scope

- Use Node.js 24.x (`.nvmrc` pins 24.21.0) and npm 11.6.4. Run `npm.cmd ci`
  from a clean checkout, then `npm.cmd run verify` and `npm.cmd run build`.
  Installation and the security gate need registry access. On non-Windows
  systems, use `npm` in place of `npm.cmd`.
- For generation only, set `OPENAI_API_KEY` in the process environment and
  pass an explicit `--model`; the qualified batch used `gpt-5.6-terra`.
  Your API project needs access to that model and the Responses API. Generation
  sends the premise and an example adventure to the provider. Each request is
  billable; an invalid or timed-out attempt may also incur cost. The current
  [model price page](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
  lists $2 per million uncached input tokens and $12 per million output tokens
  as of 28 September 2026. Check the provider's current price and your usage
  dashboard before running a batch. The 30-run qualification's nominal
  estimate was $1.350868; actual billing was not independently checked.
- The supported generated subset is 3–5 locations, 3–5 placed NPCs, 1–3
  single-opponent encounters, an initial lead, at least three obtainable
  discoveries, one social challenge with a physical route after failure, and
  two explicit endings. These are tiny single-session adventures, using the
  existing schema and rules. Save/resume, clocks, new mechanics, and remote
  publishing are outside this increment.

## Generate, validate, play, and replay

Run these PowerShell commands from the repository root after `npm.cmd ci` and
`npm.cmd run build`. Choose a fresh output name inside an existing directory;
the generator never overwrites it. Set the key in your own shell without
putting it in command history, files, or traces.

```powershell
New-Item -ItemType Directory -Force .scratch/issue-61 | Out-Null
node dist/cli.js --generate-adventure .scratch/issue-61/adventure.json --premise "A courier vanishes near a storm-damaged mill" --model gpt-5.6-terra
node dist/cli.js --validate-adventure .scratch/issue-61/adventure.json
node dist/cli.js --adventure-file .scratch/issue-61/adventure.json --seed 0 --trace .scratch/issue-61/play-trace.json
node dist/cli.js --replay .scratch/issue-61/play-trace.json
```

The play command is interactive. Type `help`, `look`, `journal`, and the offered
actions; finish with `quit` to write the trace. To prove replay is independent
of the source, move the JSON file before replay:

```powershell
Move-Item -LiteralPath .scratch/issue-61/adventure.json -Destination .scratch/issue-61/adventure-away.json
node dist/cli.js --replay .scratch/issue-61/play-trace.json
Move-Item -LiteralPath .scratch/issue-61/adventure-away.json -Destination .scratch/issue-61/adventure.json
```

A completed trace embeds the validated adventure and
exact runtime tuple. To use a live DM, add `--ai` to the play command and
retain `OPENAI_API_KEY`; this sends player turns to a provider and may incur
additional cost. Validation, command play, and replay need neither key nor
provider.

Generation accepts a printable premise of 1–500 characters. It makes at most
three complete-document attempts (the first plus two repairs), with 10,000
output tokens requested per attempt and a 16 KiB candidate limit. Each
request has a 120-second client timeout and an attempt has a five-minute
background polling limit. Validation checks schema and references, bounded
progression, both ending witnesses, a failed-social physical fallback, and
continuity on witnessed routes. Route search tries seeds 0–15 with a 32-action,
12,000-state, five-second bound. It proves selected routes, not all seeds or
all player choices. Failed attempts do not promote an output file; provider
failures and repeated content stop the run. For another attempt, use a new
output path after inspecting the reported code. Repairs cannot relax rules or
redirect the output.

The CLI prints an accepted file's ID, SHA-256 content digest, model, attempt
count, warning count, route seeds, and exploration count. Validation returns
JSON diagnostics with `severity`, stable `code`, JSON Pointer `path`, `entity`,
and `message`. An invalid document exits 2. Generation failures exit 2 and
show bounded codes and paths, or a sanitized provider error. Relevant codes
include `response-byte-limit`, `unsupported-version`, `copied-example-id`,
`incomplete-or-refused`, `repeated-response`, `provider-timeout`,
`provider-connection-error`, `provider-http-<status>`, and
`provider-request-failed`. Loader and route codes use the same diagnostic
shape; the exact code/path is the next repair clue. Do not infer that a
provider failure means no tokens were billed.

Keep generated drafts, traces, and evaluation reports in ignored `.scratch/`,
`.generation-evaluations/`, or `.dm-evaluations/`. Traces can contain hidden
facts, player text, and full adventure snapshots. The provider receives the
premise and bounded candidate context for repairs; its background mode
temporarily retains response data for polling even though the request sets
`store=false` ([OpenAI data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)).
Do not put credentials or personal information in premises or share traces
without checking their contents. The evaluation reports record hashes, codes,
usage, and route evidence rather than raw rejected provider responses.

## Reproducible seeded journeys

The reviewed files under `issue-60-samples/` are tracked, editorially
corrected derivatives of generated adventures. Each command list below starts
a **new** session at seed 0. In PowerShell, pipe a list into the CLI, for
example:

```powershell
@("move lantern-stairs", "search surveyor-ledger", "move lantern-room", "search beacon-log", "move lantern-stairs", "move storm-quay", "resolve Launch the harbor search", "quit") |
  node dist/cli.js --adventure-file docs/acceptance/issue-60-samples/investigation.json --seed 0 --trace .scratch/issue-61/investigation-search.json
node dist/cli.js --replay .scratch/issue-61/investigation-search.json
```

| Journey | File, seed | Input lines, in order | Expected result |
| --- | --- | --- | --- |
| Search ending | `investigation.json`, 0 | `move lantern-stairs`; `search surveyor-ledger`; `move lantern-room`; `search beacon-log`; `move lantern-stairs`; `move storm-quay`; `resolve Launch the harbor search`; `quit` | `launch-search`, victory |
| Chart ending, with combat | `investigation.json`, 0 | `move lantern-stairs`; `search surveyor-ledger`; `talk keeper-mara surveyor-signal persuade`; `move lantern-room`; `search beacon-log`; `move lantern-stairs`; `move storm-quay`; `move eastern-cove`; `attack cove-reef-crab`; `search tide-stake`; `move storm-quay`; `resolve Publish a reef warning chart`; `quit` | `publish-chart`, victory |
| Failed-social physical fallback | `negotiation.json`, 0 | `move reed-ferry`; `move willowbank-green`; `talk reed-elder dawn-question persuade`; `move reed-ferry`; `move old-bell-tower`; `attack tower-kite`; `search tower-nest`; `move reed-ferry`; `move brackenford-square`; `resolve Propose a shared repair`; `quit` | Social check fails; physical nest clue permits `shared-repair` victory |
| Combat defeat | `adventures/chapel-clues.json`, 74 | `move chapel path`; `move ruined chapel`; `move crypt`; `attack skeleton`; `attack skeleton`; `quit` | Defeat, with no ending |

For another premise and both of its endings, run
`node --test tests/issue-60.test.mjs` after building. It exercises six seeded
command journeys across investigation, rescue, and negotiation, exports
format-4 traces, removes each copied source, and replays every trace. Run
`node --test tests/issue-57.test.mjs tests/issue-59.test.mjs` for bounded
repair success/failure, sanitized generation-provider failure, and successful
background polling. `node --test tests/openai-dm-model.test.mjs` covers a
live-DM turn recovering after an injected adapter failure. These use injected
responses and need no key; they are deterministic failure-path checks, not
live-provider availability proof. The historical format 1–3
fixtures are replayed by `tests/trace.test.mjs` and `tests/issue-58.test.mjs`.

## Qualification and verification

Issue [#59](https://github.com/barnabyg/dungeonOne/issues/59) recorded
28/30 playable artifacts on the frozen ten-premise protocol, with batch yields
10/10, 9/10, and 9/10. First pass yielded 26/30; first repair added two;
second repair added none. One HTTP 500 and one unresolved reference accounted
for the failures. This is a provisional yield gate on repeated premises, not
reliability on unseen inputs. Its exact report hashes and token counts are in
[issue 59 evidence](issue-59.md).

Issue [#60](https://github.com/barnabyg/dungeonOne/issues/60) recorded three
reviewed sample premises, nine live-DM turns on an earlier content revision,
and limited unfamiliar-player feedback. The first three players quit; one later
negotiation player reached offered endings but did not report choosing one.
The live review used `gpt-5.6-luna` with rules
`chapel-clues-rules-v4`, engine `chapel-clues-engine-v7`, prompt
`chapel-clues-dm-v9`, and tools `chapel-clues-tools-v7`.
[Issue 60 evidence](issue-60.md) describes each result and the redacted
[live case report](issue-60-live-evidence.json). The current sample content
version 3 has not had a live-DM rerun. Fresh unfamiliar-player journeys
across premises, enjoyment and duration claims, multi-turn live continuity,
and semantic consistency of unseen generated prose remain unqualified.

### Clean-checkout verification, 28 September 2026

A local clean clone of the issue branch was made from tracked files at the
first handoff commit. Its starting `git status --short` was empty. The only
subsequent source change was this verification record; runtime, tests,
dependency files, scripts, and README stayed identical. The host used Node.js
24.13.0 (within the supported 24.x line, although below the `.nvmrc` pin)
and npm 11.6.4.

- `npm.cmd ci` installed 99 packages and reported zero vulnerabilities.
- `npm.cmd run verify` passed all seven gates with zero warnings and 420/420
  tests. Its package gate rebuilt and checked the 127-file archive, then
  validated and started an extracted package from a separate caller directory.
- `npm.cmd run build` and `@('look','quit') | npm.cmd start -- --seed 0`
  passed. Separate replays of historical command, AI, and chapel fixtures
  passed. The tracked checkout remained clean after build and startup.
- One live generation from that clone used `gpt-5.6-terra`, premise
  “A missing cartographer leaves a signal at a flooded observatory,” one
  attempt, schema 3 / `chapel-clues-rules-v4`, and produced content ID
  `flooded-star-dome`, content version `1`, digest
  `sha256:307edd5505ebc61036a073e533667632c950d54d29904cfd999bceeacb82611c`.
  `--validate-adventure` returned `ok: true` with two
  `analysis-incomplete` warnings, both covered by route witnesses. The route
  check found both endings and a physical fallback after a failed social
  check at seed 0.
- With `OPENAI_API_KEY` empty, command play reached `publish-channels` and
  `send-inland` victories at seed 0. Both exported format-4 traces. The
  generated JSON was moved away, both traces replayed successfully without
  it or a provider, and the file was restored. The retained file and traces
  are ignored local evidence, not dependencies of the handoff.

The live CLI does not expose token usage or provider billing for this single
generation, so its actual cost is unknown. This check does not qualify
generated prose for every seed or unseen premise, and it does not close the
unfamiliar-player and current-content live-DM gates described above.
