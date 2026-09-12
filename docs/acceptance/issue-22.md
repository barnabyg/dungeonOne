# Issue 22 — Default DM model evaluation evidence

Run date: 12 September 2026

Reviewer: Codex implementation agent

Latest prompt/tool versions evaluated: `stolen-signet-dm-v3` / `stolen-signet-tools-v1`

Detailed JSON reports and live-play traces remain local under the ignored
`.dm-evaluations/` directory. No report, trace, credential, request header, or
provider payload is committed.

## Bounded evaluation campaign

Every candidate/revision ran all 16 shipped cases three times (48 runs). The
required thresholds were 100% safety, at least 90% for each clear, synonym,
navigation, status, and ambiguous-clarification dimension, 100% compound
mutation-budget compliance, and complete passing manual review.

| Attempt | Exact model | Prompt | Result |
| --- | --- | --- | --- |
| Initial | `gpt-5.4-mini-2026-03-17` | `stolen-signet-dm-v2` | Did not qualify: safety 28/48; clear 10/12; synonym 2/6; navigation 7/9; status 3/6; ambiguous 0/3 unreviewed; compound 3/3. Failures exposed contradictory impossible/terminal case contracts, three corpse-search misses, one ambiguous read, and four malformed provider responses. |
| Revision 1 | `gpt-5.4-mini-2026-03-17` | `stolen-signet-dm-v3` | Did not qualify: safety 43/48; clear 9/12; synonym 6/6; navigation 7/9; status 6/6; ambiguous 2/3; compound 3/3. Post-run review rejected the one ambiguous narration that opened the door; four other failures were malformed provider responses. |
| Revision 2 | `gpt-5.5-2026-04-23` | `stolen-signet-dm-v3` | Passed the case evaluator: safety 48/48; clear 12/12; synonym 6/6; navigation 9/9; status 6/6; ambiguous 3/3; compound 3/3; manual case review 15/15; zero provider failures. It did not qualify overall because the required completed-playthrough narration review failed. |

Revision 1 changed only the versioned prompt and three bounded case contracts.
The prompt now separates function calls from prose, maps the observed corpse and
status language, prevents read-tool guesses for ambiguity, handles the first
valid mutation in a compound request, and refuses unavailable or terminal
actions without a tool. The remote-item, direct-HP, and post-defeat movement
cases now accept the safer no-action behavior required by the offered-tool
contract. Revision 2 changed only the evaluated candidate. No engine, dispatcher,
or orchestration guardrail was weakened.

## Live completed-playthrough blocker

The strongest snapshot completed two real Responses API sessions with no
diagnostics. Seed 0 ended in victory and recorded these
meaningful calls: `open`, `move`, two `attack` calls, defeated-opponent
`inspect` for “Search the corpse”, `move`, `take`, `get_character_status`, and
`leave`. Seed 207 ended in defeat and recorded `open`, `move`, three `attack` calls, and
`get_character_status` after defeat. Both format-2 traces replayed successfully
without an API key.

Manual comparison found correct final victory and defeat narration, but both
sessions contradicted a completed mechanical action: immediately after the
engine emitted `door-opened`, the narration claimed the door was “already open”.
A bounded rerun reproduced the contradiction and also described the first move
into the reliquary as a return. These runs therefore do not satisfy the required
zero-contradiction review.

The initial candidate plus two evidence-driven revisions exhaust the ticket's
tuning bound, so no default is pinned and `--ai` still requires `--model`.
The concrete next experiment is a `stolen-signet-dm-v4` prompt that explicitly
defines each structured tool-result event as newly completed and requires
narration to describe that event before consulting the resulting scene. It must
rerun the full evaluator and both seeded live playthroughs as a separately
authorized campaign before default selection can resume.
