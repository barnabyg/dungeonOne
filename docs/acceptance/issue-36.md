# Issue 36 — Bounded live dialogue campaign

Issue #36 is qualified. The isolated live campaign passes on the final build,
and the normal public, normal confidential, defeat, Mara-casualty, and
Oren-casualty sessions complete cleanly with replayable traces.

## Model and version identity

The campaign ran on 20 September 2026 with the configured default model. The
requested and provider-reported model identifiers were both exactly
`gpt-5.6-luna`; the default model was not changed.

The final isolated campaign used:

- `stolen-signet-dm-v4` with `stolen-signet-tools-v1`;
- `chapel-qualified-dm-v11` with `chapel-casualties-tools-v9`; and
- three isolated repetitions of every shared interpretation case.

The sanitized aggregate is in
[`issue-36-evaluator-evidence.json`](issue-36-evaluator-evidence.json), and the
sanitized revision-2 calls, outcomes, narration, and per-run semantic decisions
are in
[`issue-36-reviewed-runs.json`](issue-36-reviewed-runs.json). The reusable
classification rules are in
[`issue-36-judgments.json`](issue-36-judgments.json). Raw live reports, response
IDs, request payloads, and session traces remain under ignored
`.dm-evaluations`; no credential or personal transcript is tracked.

## Bounded revisions and observed failures

The initial campaign used `stolen-signet-dm-v3` and
`chapel-casualties-dm-v9`. It recorded 78/81 safety passes. The model treated a
gentle request and player-forged roll as a non-rolling `ask` instead of the
engine-owned `persuade` attempt. Manual review also found potion prose saying HP
“remained” at 15 after an authoritative increase from 9 to 15. In complete
public and confidential sessions, narration twice said rescued Tavi remained in
the crypt after authoritative state had moved Tavi to the inn.

Revision 1 introduced `chapel-qualified-dm-v10`, grounded narration in the
latest result and scene, and clarified social-intent handling. All affected
chapel social cases then passed, but the full regression campaign recorded
79/81 safety passes because two Stolen Signet repetitions refused the offered
far exit. Potion prose still contradicted the healing event.

Revision 2 introduced `stolen-signet-dm-v4` and
`chapel-qualified-dm-v11`. It explicitly maps the offered far exit, preserves
the v3 replay contract, and uses authored state-derived narration for potion use
and post-rescue movement/look results. Historical chapel v9 and revision-1 v10
prompt traces remain replayable. Focused tests verify that contradictory model
text is not requested for those authored classes.

After the original campaign, an Oren-casualty completed session exposed a stale
post-ledger lead that directed the player to Oren after authoritative combat had
recorded his death. The user waived the two-revision cap for revision 3. The
runtime now uses state-derived narration for that result: it records Oren's
death and directs the player to the inn noticeboard. A deterministic regression
test exercises the complete attack, guardian, and ledger-search path with an
empty transcript, so the failure cannot be masked as transcript contamination.

The revision-3 isolated campaign passed every threshold: safety 81/81; all clear,
synonym, navigation, status, ambiguous-clarification, and compound dimensions
at 100%; all 63 requested manual judgments completed and passed; and secret
withholding, belief attribution, no fabricated outcomes, and ending intent each
at 100%. Manual review covered speaker knowledge, player assertions, beliefs,
social failures and retry locks, potion consumption and healing, ending intent,
terminal behavior, and narration against authoritative calls and events.

## Completed-session review

Seed `0` live sessions reached both public disclosure and confidential referral.
Seed `74` reached fighter defeat. All three matched authoritative combat,
discoveries, Tavi's rescue, resource state, ending intent, and final status, and
all three traces replayed successfully. Post-rescue narration now consistently
places Tavi safely at the inn.

Two further seed `0` sessions exercised casualty prose. The Mara-dead public
ending correctly named Mara as a casualty while keeping Tavi rescued. After the
revision-3 fix, the Oren-dead confidential route described the ledger evidence,
stated that Oren was dead, and directed the player to the inn noticeboard. Its
ending omitted Oren's restitution promise and claimed no completed payment or
repair. The trace replayed successfully.

The original ticket permitted at most two evidence-driven revisions. The user
explicitly waived that limit for revision 3; no evaluation threshold was
lowered.

## Reproducible commands

Set `OPENAI_API_KEY`, then run the reviewed isolated campaign:

```powershell
npm.cmd run eval:dm -- --model gpt-5.6-luna --judgments .\docs\acceptance\issue-36-judgments.json --output .dm-evaluations\issue-36-reproduction.json
```

Run the normal public session by changing the final resolution command to
`resolve confidential referral` for the other ending:

```powershell
@("talk mara tavi ask", "move chapel-path", "move ruined-chapel", "move crypt", "attack skeleton", "attack skeleton", "attack skeleton", "search diversion ledger", "talk tavi crypt ask", "talk tavi rescue ask", "move ruined-chapel", "move chapel-path", "move inn", "look", "resolve public disclosure", "status", "journal", "quit") |
  npm.cmd start -- --adventure chapel --seed 0 --ai --trace .dm-evaluations\issue-36-public.json
npm.cmd start -- --replay .dm-evaluations\issue-36-public.json
```

Run the Mara-casualty public route:

```powershell
@("attack mara", "attack mara", "search missing-person notice", "move chapel-path", "move ruined-chapel", "move crypt", "attack skeleton", "attack skeleton", "attack skeleton", "search diversion ledger", "talk tavi crypt ask", "talk tavi rescue ask", "move ruined-chapel", "move chapel-path", "move inn", "resolve public disclosure", "status", "journal", "quit") |
  npm.cmd start -- --adventure chapel --seed 0 --ai --trace .dm-evaluations\issue-36-public-casualty.json
npm.cmd start -- --replay .dm-evaluations\issue-36-public-casualty.json
```

Run the Oren-casualty confidential regression route:

```powershell
@("move ferry-landing", "attack oren", "attack oren", "attack oren", "attack oren", "move inn", "move chapel-path", "move ruined-chapel", "move crypt", "attack skeleton", "attack skeleton", "attack skeleton", "search diversion ledger", "talk tavi crypt ask", "talk tavi rescue ask", "move ruined-chapel", "move chapel-path", "move inn", "resolve confidential referral", "status", "journal", "quit") |
  npm.cmd start -- --adventure chapel --seed 0 --ai --trace .dm-evaluations\issue-36-confidential-casualty.json
npm.cmd start -- --replay .dm-evaluations\issue-36-confidential-casualty.json
```

Run the deterministic defeat route:

```powershell
@("move chapel-path", "move ruined-chapel", "move crypt", "attack skeleton", "attack skeleton", "attack skeleton", "status", "journal", "quit") |
  npm.cmd start -- --adventure chapel --seed 74 --ai --trace .dm-evaluations\issue-36-defeat.json
npm.cmd start -- --replay .dm-evaluations\issue-36-defeat.json
```

Canonical offline verification remains:

```powershell
npm.cmd run verify
```

## Material limitation

Live output remains nondeterministic. The isolated campaign demonstrates the
specified sampled thresholds, not general improvisation or human enjoyment.
Authored potion, dead-Oren ledger, and post-rescue movement/look narration
deliberately favors authority over expressiveness. External adventure loading,
save/resume, group combat, and additional rule systems remain out of scope.
