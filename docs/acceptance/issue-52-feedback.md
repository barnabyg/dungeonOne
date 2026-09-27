# Issue 52 follow-up — Potion and Tavi guidance

Player feedback after the initial qualification found two problems in the live
chapel experience: after use in combat the DM offered the consumed potion again,
and Tavi's claim to have “followed the ledger into the crypt” sounded as though
the ledger moved there ahead of Tavi.

The potion was already marked `consumed` in authoritative state, absent from
inventory, absent from projected suggestions, and absent from the next tool
schema. The data runtime had no authored narration for `use_item`, so a model
continuation could still offer it. The runtime now narrates a successful use
from the committed state and counterattack result, without a second model
response. The prompt also distinguishes visible room exits from currently
available movement during combat. Tavi's data-runtime testimony, approved
fact, journal summary, and [canon](../chapel-canon.md) now say Tavi entered the
crypt **to find** the chapel repair ledger. Tavi's spoken fact uses first person.
Historical format 1–3 content and
readers remain unchanged.

The current build uses content version `8`, rules `chapel-clues-rules-v4`, engine
`chapel-clues-engine-v7`, prompt `chapel-clues-dm-v9`, and tools
`chapel-clues-tools-v7`. The configured `gpt-5.6-luna` was both the requested and
provider-reported model. The bounded campaign now includes explicit potion use
and Tavi's account. It made 27 isolated live runs: safety 27/27, clear tool
accuracy 24/24, clarification 3/3, no fabricated outcomes 24/24, and ending
intent 12/12 after manual review. All 39 per-run semantic judgments passed.
Other dimensions had zero cases in this bounded campaign and were not sampled.

The [sanitized evidence](issue-52-feedback-evidence.json) records the actual
projected rooms, tools, calls, prose, checks, and judgments. The raw report
remains ignored at `.dm-evaluations/issue-52-feedback-final.json`; its exit
code was `1` because the judgments were recorded after the calls. The tracked
evidence records the subsequent review for those exact runs. No new human
timing or enjoyment evidence was collected, and [issue 37's waiver](issue-37.md)
remains in force.

## Reproduction and manual checks

With `OPENAI_API_KEY` set, run `npm.cmd run build`, then:

```powershell
@('I go up the chapel path.', 'I take the healing potion.', 'I go to the ruined chapel.', 'I enter the crypt.', 'I drink the healing potion.', 'What can I do now?', 'quit') |
  node dist/cli.js --adventure chapel --seed 7 --ai --trace .dm-evaluations/potion-feedback-repro.json
node dist/cli.js --replay .dm-evaluations/potion-feedback-repro.json
```

Expect the potion to be consumed, the guardian counterattack and final HP to
agree with mechanics, and the next action list to contain the attack without
the potion or a combat retreat. For Tavi, use seed `0`, reach and defeat the
guardian with three attacks, search the ledger, and ask Tavi why they entered
the crypt. Expect both the reply and journal to say Tavi went there to find the
ledger. The live traces for both routes replayed successfully.

Focused regression tests assert the potion's consumed state, projected tool
and suggestion lists, and narration that rejects a scripted stale offer. They
also check Tavi's projected testimony. The canonical verification command is
`npm.cmd run verify`; live calls remain outside it.
