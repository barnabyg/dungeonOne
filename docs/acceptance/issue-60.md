# Issue 60: player experience qualification

## Sample and method

This is a **bounded sample**, not a general enjoyment or duration claim. Three premises from the frozen issue 59 set were regenerated independently with `gpt-5.6-terra` on 28 September 2026: investigation at a storm-damaged lighthouse, rescue at an abandoned watermill, and negotiation over a stolen bell. Each initial response passed the generator's structural, route, continuity, and source-free replay gates without repair. The source documents remain in ignored `.generation-evaluations/issue-60-*.json` for local audit. The committed [samples](issue-60-samples) are player handoff artifacts. All three received evidence-led content corrections described below; they are **reviewed derivatives**, not unchanged generator successes.

The original generation contract is schema 3, `chapel-clues-rules-v4`, prompt and request code in `src/generation.ts`, strict response shape in `src/generation-schema.ts`, and the structural example in `adventures/generation-example.json`. The issue 59 protocol 8 report records its model, limits, file and prompt hashes, and 28/30 generation yield. That batch deleted its accepted files, so these are new samples and cannot be counted as its human or live-DM evidence.

| Sample | Content ID / version | Original attempts | Editorial status |
| --- | --- | ---: | --- |
| [Investigation](issue-60-samples/investigation.json) | `reefward-lighthouse` / 2 | 1 | Added evidence conditions to harbor decisions. |
| [Rescue](issue-60-samples/rescue.json) | `floodwheel-rescue` / 2 | 1 | Added post-rescue room, hatch, and lead text. |
| [Negotiation](issue-60-samples/negotiation.json) | `marsh-bell-dispute` / 2 | 1 | Required bell recovery before settlement. |

The negotiation document originally allowed either ending after a ferry clue, including narration that returned a bell the player had not recovered. The lighthouse document allowed publication of a safe chart without the tide measurement and let the general ending state rely on the route ledger without the beacon log. The reviewed files require the relevant discoveries. The first live rescue review found that, after the hatch search recorded `courier-freed`, the DM still said Tovin was trapped: the room and hatch descriptions retained their pre-rescue text. The reviewed rescue file projects the opened hatch, Tovin's free state, and a new actionable lead after that milestone. A repeated live turn described him as alive and free in the mill loft. `tests/issue-60.test.mjs` proves the premature choices are rejected, the post-rescue projection is current, both endings remain reachable, the social failure route remains, and six command journeys export traces that replay without the source file. The current generator is **not proven to prevent analogous semantic errors in new output**; these content-specific corrections should not be treated as a generic generator fix.

| Reviewed sample | Document digest | File SHA-256 | Ending routes (seed 0) | Failed-social fallback |
| --- | --- | --- | --- | --- |
| Investigation | `sha256:0b4da400dd49d3dec62a5212125400e6a2c4539d179c24861522fd4e5ed55786` | `a7118bd7e67ad0c80042438c8b381c2992dedcde2974cab882d9647cc8e64988` | 7 / 12 actions | 8 actions |
| Rescue | `sha256:699f7e539023aa0c0f432d4b3f42b3bcfeac49c2dcb6da6226df61cddde233d4` | `ed2c1882a2e02211172578950ee4a965320656e84a393d81af04ef25cb56a4b3` | 11 / 11 actions | 11 actions |
| Negotiation | `sha256:66a10a0173009b6d5f9ac85ce674ced6d1d256eb5762571aa99cd612a49103ab` | `16cf99edf90507ae93833fdda6d425d7d608c78878b143534024ec641e50f43b` | 8 / 8 actions | 10 actions |

## Unfamiliar-player sessions

The user arranged three unfamiliar players. **All three quit before completion** because they could not work out what to do. All struggled to talk to anyone and found the precise command format annoying. One reported that no take or collect command was available. These are the only reported observations: premise assignment, exact inputs, goal and clue understanding, choice recognition, elapsed time, and transcripts were not captured. Do not infer those missing details or treat a route witness as a player completion. The player-experience gate failed at 0/3 completions. A second unfamiliar-player round after the command changes is outstanding.

Give each future player the [player sheet](issue-60-player-sheet.md) and one assigned file. Do not expose the JSON or route tests before play. Assign at least one player to each premise, vary the order for players who try more than one, and record the sheet's goal clarity, clue discovery, completion, choice recognition, contradictions or dead ends, and desire to finish. Avoid coaching beyond terminal operation. If a player stops, record that outcome. Add the anonymized observations, actual durations, sample sizes, corrections, reruns, and unresolved findings here before claiming player qualification.

### Player setup

From a normal clone with Node 24 and npm 11.6.4:

```powershell
npm.cmd ci
npm.cmd run build
node dist/cli.js --adventure-file docs/acceptance/issue-60-samples/investigation.json --seed 0
node dist/cli.js --adventure-file docs/acceptance/issue-60-samples/rescue.json --seed 0
node dist/cli.js --adventure-file docs/acceptance/issue-60-samples/negotiation.json --seed 0
```

Run one of the three `node` commands per assigned session. The player may type `help`, `look`, `journal`, and `status`. A live AI session adds `--ai` and requires `OPENAI_API_KEY`. The seed is for reproducibility, not a route hint. Keep each session's trace in an ignored location if needed for diagnosis.

For the next round, create an ignored trace directory and append a unique `--trace` path to each player's command (for example, `--trace .scratch/issue-60/player-1.json`). The game writes the trace when the session ends, including if the player quits. Ask before sharing a trace if a player entered personal information.

```powershell
New-Item -ItemType Directory -Force .scratch/issue-60 | Out-Null
```

### Command-friction regression

`node --test tests/issue-60-feedback.test.mjs` models likely examples of the reported CLI blockers; the players' exact inputs were not captured. Before the change, a first `look` offered no copyable actions; `talk to Mira about the missing courier` returned `invisible-target`; and `collect the ferry mud` returned `unknown-command`. The data runtime now lists current, copyable commands after `look`, `help`, and rejected actions. It explains that evidence goes in the journal and that these samples have no portable inventory items. A test checks that the suggested conversation and evidence commands work. Natural talk phrasing and `collect` still reject; the player must use the displayed commands. A parser change would alter the meaning of existing v7 traces, so this compatibility-sensitive part of the feedback remains unresolved. The regression suite replays a trace produced by the released parser to guard its existing meaning. These automated checks do **not** show that unfamiliar players can now understand or enjoy the game.

The user later clarified that players tried short inputs such as `talk Orin` and received `invisible-target`; their main difficulty was discovering the required person, topic, and approach fields. A short talk attempt now identifies the named visible person and lists that person's available, copyable topic commands. If the person has no available topics, it says so explicitly. In the negotiation sample, Orin Coil has no authored topics, so a conversation with him remains unavailable even with full syntax. This is a content limitation to consider before another player round, and no player transcript establishes which adventure or Orin they meant.

## Editorial review

The endings have distinct immediate stakes in the reviewed text: search for the missing surveyor versus warning crews about the reef; public closure of a hazardous ford versus a quiet dispatch to the district; shared repair cost versus returning the bell and clearing an accusation. The stakes are modest and all outcomes end positively. The quiet dispatch text says delivery has already occurred, which may feel abrupt; this remains an editorial concern for player review. The three files also share a conspicuous structure: a starting lead, a small connected map, searchable evidence, a social challenge with physical fallback, a single opponent, a return to the start, and two resolutions. Repeated names and similar evidence flow may make the premises feel interchangeable. Human responses to this question are outstanding.

The route witnesses and command completion prove mechanical reachability for selected seeds. They do not measure comprehension, natural choices, elapsed play time, or enjoyment. The bounded live-DM review below is separate from the chapel-only campaign in issue 52 and from canonical verification.

## Live DM review

`node scripts/eval-generated-dm.mjs` ran nine isolated live turns on the final reviewed files. It used route witnesses only to set up the later states, then sent ordinary-language player requests to the live model. The [redacted per-case evidence](issue-60-live-evidence.json) records public projected scenes and tools, normalized calls, narration, authoritative before/after state, content digest, file hash, and model/prompt/tool/rules/engine versions. It omits credentials, provider response IDs, and private SDK payloads. The full report remains ignored at `.dm-evaluations/issue-60-generated.json`. A previous full report and a one-case post-correction rerun were inspected locally; the final report replaces the previous file. This script is outside `npm.cmd run verify`; it needs provider credentials and network access. It is an operator-selected bounded sample, not an unfamiliar-player journey or a general live-DM pass rate.

The requested and provider-reported model was `gpt-5.6-luna`; all responses reported `completed`. The sampled files used rules `chapel-clues-rules-v4`, engine `chapel-clues-engine-v7`, prompt `chapel-clues-dm-v9`, and tools `chapel-clues-tools-v7`. In the final nine turns, the start scenes exposed their current leads and visible tools without private facts. The question about Mira's guarded dawn observation produced a `talk` call but did not reveal her guarded fact. The rescued courier was correctly described in the loft after the correction. A premature bell-return request made no tool call or state change; an ambiguous settlement request asked which of the two choices the player meant. The three explicit ending requests each made one accepted `resolve_quest` call and reached the requested ending. No sampled turn emitted a diagnostic. I inspected every projected request, call, and narration against its authoritative before/after state.

The samples contain no item entities, so item pickup or consumption continuity was **not exercised**. The nine isolated turns do not prove multi-turn conversational continuity, all secrets, combat narration, or human understanding. The initial rescue false-trapped statement is an evidence-led failure, not part of the final passing sample.

## Verification and remaining qualification

For the original reviewed sample, `npm.cmd run build` and `node --test tests/issue-60.test.mjs` passed five tests, including six command/replay journeys. Its canonical `npm.cmd run verify` passed all seven gates with zero warnings and 411 automated tests. Verification of the subsequent command-hint changes is recorded with the implementation handoff. Another unfamiliar-player round, any corrections it identifies, broad story enjoyment, and reliability on unseen premises remain outstanding. Generated content can still contain semantic inconsistencies that schema and route checks do not detect.
