# Issue 52 — Data-runtime live DM qualification

The bounded `data-chapel` campaign uses the shipped chapel data runtime. It does
not claim coverage of arbitrary external adventure definitions. The configured
default model remains `gpt-5.6-luna`; both requested and provider-reported IDs
were `gpt-5.6-luna`. The final campaign used content version `7`, rules
`chapel-clues-rules-v4`, engine `chapel-clues-engine-v7`, prompt
`chapel-clues-dm-v8`, and tools `chapel-clues-tools-v7`.

The [sanitized per-run evidence](issue-52-evaluator-evidence.json) records each
projected room, visible items and offered tools, normalized call, resulting
prose, automated check, and reviewed semantic judgment. It omits response IDs,
credentials, raw provider payloads, and raw session traces. The final live
campaign made 21 isolated runs: three each for potion collection, failed-social
fallback, post-rescue Mara, ambiguous ending intent, both explicit endings, and
Oren-dead confidential resolution. Every projected call and authoritative
outcome passed the automated checks. After inspecting the prose against the
projected requests and outcomes, all 33 required manual judgments passed.
Safety was 21/21, clear tool accuracy 18/18, clarification 3/3, no fabricated
outcomes 18/18, and ending intent 12/12. Existing thresholds were unchanged.
Other scoring dimensions had zero cases in this bounded campaign; their zero
denominators are not evidence for arbitrary definitions.

The raw CLI report remains ignored at
`.dm-evaluations/issue-52-data-final-scored.json`. The evaluator wrote it with
manual judgments marked missing, so its exit code was 1. This was the expected
pre-review state; the tracked evidence records the subsequent per-run review.
Judgments are tied to these specific runs and must not be reused blindly for a
new nondeterministic campaign.

## Two evidence-led corrections

1. The initial data campaign found that the approved Oren-refusal fact omitted
   the notice and chapel evidence even though the authored fallback offered
   them. A structured live reply could therefore withhold the useful route.
   Content version 6 added the available-evidence guidance to the approved
   fact. The next campaign's three fallback replies all included it.
2. Initial ambiguous-ending replies sometimes implied Oren was inaccessible or
   postponed choices already offered. Prompt version 8 asks the player to pick
   one of the currently offered endings. A live journey then revealed that a
   static dry-niche description still said the collected potion remained on the
   path. Content version 7 removed that stale description. A deterministic
   return-path test and the final live journey confirmed an empty room-item list
   and no remaining-bottle claim.

Round 1 revised the refusal fact. Round 2 revised the ambiguity prompt and,
after its operator journey exposed the niche claim, revised the niche content
before the final campaign. No further correction round was used.
The final campaign shows no unresolved sampled failures. The initial reports
remain under ignored `.dm-evaluations` for local audit.

## Player journey review

An operator-driven ordinary-language live journey with seed `0` collected the
potion, fought the guardian, found the ledger, spoke with and rescued Tavi,
returned to the inn, asked Mara about Tavi, requested an ambiguous outcome, and
chose confidential referral. Guidance listed current exits and both endings;
the ambiguous request asked for a choice without a mutation. Mechanics showed
rolls, HP, and status separately from narration. Mara accurately said Tavi had
returned. The return path showed no potion left in the room, and the final
ending requested restitution and repair without claiming either was completed.
The trace at `.dm-evaluations/issue-52-manual-confidential.json` replayed.

An earlier operator-driven public journey reached the other ending and replayed
from `.dm-evaluations/issue-52-manual-public.json`; it exposed the stale niche
text before the second correction. The final data campaign independently
covered public disclosure on content version 7. These operator and scripted
journeys provide guidance, mechanics, and choice review, not new timing,
enjoyment, or unfamiliar-player evidence. [Issue 37's accepted waiver](issue-37.md)
remains as recorded.

## Reproduce

Set `OPENAI_API_KEY` and run:

```powershell
npm.cmd run eval:dm -- --model gpt-5.6-luna --campaign data-chapel --output .dm-evaluations/issue-52-reproduction.json
npm.cmd run build
node --test tests/dm-data-cases.test.mjs tests/dm-evaluator.test.mjs
npm.cmd run verify
```

Review every new live report's projected requests, prose, and manual judgments.
Live calls are intentionally outside `verify`. Provider access, credentials,
and human observations remain external prerequisites; their absence cannot be
replaced by scripted assertions. The campaign does not qualify general
improvisation, arbitrary definitions, or player enjoyment.

Later player feedback about potion reuse guidance and Tavi's ledger wording is
addressed in [the follow-up record](issue-52-feedback.md). This page preserves
the original qualification snapshot and versions.
