# Issue #80 live-model review

On 30 September 2026, `node scripts/review-issue-80.mjs gpt-5.6-luna` ran
20 isolated, previously unused player utterances against the current
adventure fixtures. The complete machine-readable evidence, including each
utterance, offered call, attempted arguments, mechanics, narration, provider
metadata, and before/after state hashes, is in
[`issue-80-live.json`](issue-80-live.json). The requested and provider-reported
model was `gpt-5.6-luna` throughout. The two content/runtime identities are
stored per case in that report. The `bribed-crossroads` cases used rules v10,
engine v14, prompt v17, and tools v14; `day-raider-crossroads` follow cases
used rules v8, engine v11, prompt v14, and tools v11.

| Category | Cases | Correct category and target | Committed legal effect | Selection misses | Manual narration review |
| --- | ---: | ---: | ---: | ---: | --- |
| Barricade | 3 | 3 | 2 | 0 | Both commits describe the blocked passage; the refusal claims no blockage. |
| Distraction | 3 | 3 | 3 | 0 | Each describes the successful check, Day 2 horn, and temporary side-door opening. |
| Deception | 3 | 3 | 1 | 0 | One committed lie changes only Lysa's belief; two refusals claim no success. |
| Offer | 3 | 3 | 3 | 0 | Tonic is spent, guard trusts the player, and no healing is claimed. |
| Follow | 3 | 3 | 3 | 0 | Engine-owned response shows the move to Square and Day 3 → Day 4. |
| Burn stone hall | 1 | 1 | 0 | 0 | No tool or mutation; masonry is described as noncombustible. |
| Ambiguous barricade | 1 | 1 | 0 | 0 | Requests a passage and object, with no claimed effect. |
| Compound distract/attack | 1 | 0 | 0 | 1 | Model tries `distract`; engine rejects before mutation, then asks for one explicit action. |
| Absent guard/item | 1 | 1 | 0 | 0 | No tool or mutation; correctly names the absent guard and uncarried tonic. |
| Hidden Neri | 1 | 1 | 0 | 0 | No follow tool or mutation; correctly says no visible trail is available. |

The category/target selection score is **19/20**, above the 16/20 gate.
All 15 supported single-action cases selected the authored target/profile;
12 committed and three were rejected without time, resource, or state cost.
There were **zero unauthorized mutations** and **zero false success or world
change claims** in a manual comparison of all 20 narrations with the
authoritative mechanics and before/after state. The four supported refusals
(three clear single-action phrases and the compound request) each display
an authoritative `Try:` hint. `tests/issue-80.test.mjs` executes a precise
retry for each from the unchanged state, then continues play. The separate
seeded CLI test covers a failed check followed by a late ending.

The three single-action refusals expose wording limits: `barricade-2` asks
"Can you ...? Do it" but the engine requires a clearer affirmative form;
`deception-1` says the claim is false without using the expected lie form;
`deception-2` says Neri reached "safety" instead of the authored "safe
route." In each case the model selected the correct authored profile, the
engine rejected it safely, and the response gave a way to restate the
request. These are live usability misses for the attempted effect, even
though they are not category/target selection misses. The compound response
focuses on confirming the distraction and does not repeat the attack clause;
it neither claims that either action happened nor authorizes a combined turn.
The model's example in `deception-1` ("I tell Lysa that Neri made it to the
safe route") is itself rejected by the engine. The authoritative mechanics
also show `attempt deceive lysa about neri-safe-route`, which succeeds in the
continuation test. Players should follow that `Try:` hint; the model's
example remains a usability defect in this sampled response.

This is an isolated, bounded live-model sample. It does not establish a
complete live-model journey, general reliability across unseen content, or
an unfamiliar player's experience. The player's actual exercise remains
pending separately.
