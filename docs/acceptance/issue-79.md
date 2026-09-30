# Issue 79 — unexpected requests

## Contract and checks

The new scripted suite exercises two phrasings for each offered barricade,
distraction, deception, offer, and follow profile through AI dispatch. It checks
compound, uncertain, and destructive wording before dice or mutation, then runs
each action through the complete DM turn boundary with one attempt. A provider
failure after a committed check repeats the engine's check, cost, effect, and a
current suggested command. The existing issue 75–78 tests cover the command
route, save/resume, journal and actor knowledge, bounded speaker history,
expiry, and same-mode trace replay. Command play remains API-key-free.

`npm.cmd run verify` passed with 531 tests and zero warnings. The focused
`tests/issue-79.test.mjs` suite passed all 20 cases after review fixes.

## Bounded live review

Run `npm.cmd run build`, then `node scripts/review-issue-79.mjs gpt-5.6-luna`
with `OPENAI_API_KEY` set. The complete eight-case report is
[`issue-79-live.json`](issue-79-live.json). It records exact content hashes,
rules/engine/prompt/tool versions, projected prompts and tools, provider model
and response IDs, attempted calls, validation outcomes, mechanics, diagnostics,
and narration. The sampled content is `bribed-crossroads` version 1
(`8a11f7ce7398626a44c3d849d80e676e0bb8da50cda283ffb0f2809629f2cce8`)
and `day-raider-crossroads` version 1
(`f859e00584cc81c1a85c866c7d461b428e4d184904266132b362209fecd37192`).
The former uses rules v10, engine v14, prompt v17, and tools v14; the latter
uses rules v8, engine v11, prompt v14, and tools v11, all with the
`chapel-clues` prefix. The requested and provider-reported model was
`gpt-5.6-luna` in every completed response.

**Tool selection and state safety:** Five clear action probes chose the correct
offered tool and committed once. The ambiguous and destructive probes made no
tool call and did not change state. The compound probe selected `distract`
despite its second attack clause. The engine rejected the attempt before a die,
time, or state change. The model then used two read tools and asked for a single
explicit action. Thus the engine boundary held in eight of eight probes, while
model tool selection was seven of eight.

**Prose review:** All eight sampled narrations described their authoritative
result or lack of action without claiming an uncommitted effect. The follow
response is now engine-owned and shows both the settled scene at Day 4 and the
Day 3 → Day 4 transition. The compound clarification did not claim that the
distraction or attack happened. This is eight of eight for the sampled prose;
these isolated turns do not establish general live-model reliability or a
complete unfamiliar-player journey.

## Diagnostic boundary

Same-mode command and AI trace replay is covered by the issue 75–78 tests.
Mixed command/AI trace segments remain unsupported: replay compares every
segment's `mode` to the first and reports `Replay divergence at segment 1 mode`.
Mixed-mode save continuation works, but the trace pair is not verified end to
end; use same-mode segments for diagnostics.
