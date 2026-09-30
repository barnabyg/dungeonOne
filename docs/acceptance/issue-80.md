# Issue #80: complete two-session qualification

## Frozen action judgments

The executable matrix is `tests/issue-80.test.mjs`. It uses the released
`bribed-crossroads`/1 and `day-raider-crossroads`/1 content. Costs are days
on these actual adventures, not the proposed zero-cost policy in issue #72.
The current schema-9 `timeCosts.attack` is 1; changing it would alter an
existing rules tuple, save history, and trace replay. Every rejected action
in this matrix preserves state and consumes no die or day.

| Attempt and category | Legal effect or refusal | Cost | Viable continuation |
| --- | --- | ---: | --- |
| Attack Lysa; combat | Starts authorized combat; no register or rescue claim | 1 | Defeat Lysa, then use her desk or leave |
| Refuse; ending | Records undelivered register and actual Neri fate | 0 | Terminal ending |
| Leave town; ending | Records departure without a report | 0 | Terminal ending |
| Burn stone hall; unsupported action | Refuses without claiming masonry burned | 0 | Go to cellar |
| Lie to Lysa; deception | Opposed check changes only her belief | 1 | Go to cellar for physical register |
| Wait three days; clock | Applies threshold effects in order | 3 | Go to cellar or long lane |
| Offer tonic to Lysa; unusual use | She refuses; player retains tonic, no healing | 1 | Return to cellar |
| Barricade short passage with cart | Blocks named connection; no roll | 0 | Cellar and later long lane |
| Distract guard with crate | One check; success opens side door temporarily, failure keeps square open | 1 | Search register |
| Offer tonic to guard; bribe | Spends tonic and makes guard trusting, no healing | 1 | Search register |
| Follow witnessed guard | Moves through an adjacent open route | 1 | Return to cellar or long lane |
| Stale barricade; stale target | Refuses repeat | 0 | Go to cellar |
| Offer to absent guard; hidden target | Refuses | 0 | Go to cellar |
| Incomplete barricade; ambiguous target | Asks for a specific target/resource | 0 | Go to cellar |
| Distract then attack; compound | Refuses the compound request | 0 | Search register |
| Talk to dead Lysa; dead actor | Refuses dialogue | 0 | Go to cellar; desk remains usable |

The focused suite passes 19 cases, including seed-0 command and scripted-AI
two-session routes. Existing
focused suites for issues #73–#79 cover offered profile selection, combat,
check failures, resource policy, absent actors, command and scripted-AI
two-process saves, and same-mode linked replay. The new route combines a
spent tonic, a failed distraction (d20 6 + 2 vs DC 12), the Day 7 short-route
closure, a late ending, and equal uninterrupted/resumed checkpoint, RNG,
transition, and linked replay. It found a missing v14 engine admission in
`src/replay.ts`; that check now includes the released offer engine version.
The canonical `npm.cmd run verify` passed all seven gates with 553 tests and
zero warnings in the implementation worktree.
A separate clean local clone of the committed branch was empty before running
`npm.cmd ci` (99 installed packages, zero vulnerabilities), build, start,
save, resume, and linked replay. The generated artifacts were the only
untracked files afterward. The late ending and `Trace verified successfully`
were observed. Historical trace fixtures remain in full verification.

## Reproduce the late command route

From a clean checkout with Node 24.x and npm 11.6.4, run `npm.cmd ci` and
`npm.cmd run build`. Command mode needs no API key. Use a private save path:

```powershell
New-Item -ItemType Directory -Force .scratch/issue-80 | Out-Null
node dist/cli.js --adventure-file .\adventures\bribed-crossroads.json --seed 0 --save .\.scratch\issue-80\save.json --trace .\.scratch\issue-80\first.json
```

Type each line at the next `>` prompt:

1. `move cellar` — the guard, register, tonic, and crate are visible; Day 1.
2. `take tonic` — the tonic enters inventory; Day 2.
3. `offer tonic to guard` — the guard accepts and becomes trusted; tonic is spent without healing; Day 3.
4. `attempt distract guard with heavy crate` — seed 0 fails the check; the square route stays open; Day 4.
5. `search route-register` — Safe route enters the journal; Day 5.

Wait for the next `>` prompt, press Ctrl+C, then restart:

```powershell
node dist/cli.js --resume .\.scratch\issue-80\save.json --trace .\.scratch\issue-80\second.json --previous-trace .\.scratch\issue-80\first.json
```

Continue with:

1. `move square` — Day 6; short Hall passage still available.
2. `wait days 1` — Day 7; raiders close that passage.
3. `move back lane` — the longer route remains available; Day 8.
4. `move hall` — the reporting desk remains usable at the clock maximum.
5. `resolve file-register` — late report; Neri alive in cellar; tonic spent.

```powershell
node dist/cli.js --replay .\.scratch\issue-80\first.json .\.scratch\issue-80\second.json
```

Expect `Trace verified successfully`. For an on-time contrast, start a fresh
save with the same adventure and seed, then type `move cellar`,
`search route-register`, `move square`, `move hall`, and
`resolve file-register`; the ending states the deadline was met. The focused
suite also scripts an on-time AI route across two processes and checks equal
uninterrupted/resumed checkpoint, transitions, and replay. Additional
scripted-AI routes live in `tests/issue-73.test.mjs` through
`tests/issue-78.test.mjs`. Scripted tool choices demonstrate orchestration;
they are not evidence that a live model understands new phrasing.

## Live and player evidence

`scripts/review-issue-80.mjs` freezes 20 previously unused phrasings: three
each for barricade, distraction, deception, offer, and follow, plus five
unsupported, ambiguous, compound, absent, and hidden requests. It records
per-case expected and selected tool, exact utterance, mutations, provider
metadata, mechanics, narration, and content/runtime hashes. It aggregates
selection and unauthorized-mutation counts with misses per category. The
`falseClaimReview` fields in the raw run require manual comparison of
narration with mechanics. Run after build
with `OPENAI_API_KEY` set: `node scripts/review-issue-80.mjs gpt-5.6-luna`.
The user explicitly approved sending the bounded adventure contexts after
automatic approval review initially rejected the run. The live review is
recorded in [`issue-80-live-review.md`](issue-80-live-review.md), with raw
per-case evidence in [`issue-80-live.json`](issue-80-live.json): 19/20
category/target selections, zero unauthorized mutations, and zero false
success or world-change claims on manual inspection. The one selection miss
was a compound request; the engine rejected it without mutation. Three
clear single-action requests selected the correct profile but were refused
by the wording guardrail, so they needed a restatement. A focused test proves
the engine's displayed retry works and play can continue from each refusal.
The model gave one example phrase that is itself rejected; the engine's
copyable `Try:` command remains valid. This sample does not
establish general live-model reliability or a complete live journey.

## Unfamiliar-player acceptance

On 30 September 2026, the project owner confirmed that the unfamiliar-player
acceptance test was completed successfully and asked that this confirmation
alone be recorded. This is an **owner-reported pass**. No player transcript,
tested commit, seed, save/resume point, ending, recovery detail, or
contradiction notes were supplied, so those facts cannot be inferred or
independently checked. The original criterion to record actual utterances
and outcomes remains unaudited. The exercise instructions remain in
`issue-80-player-sheet.md` if detailed evidence is later made available.
