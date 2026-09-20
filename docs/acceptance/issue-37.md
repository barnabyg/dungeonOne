# Issue 37 — Unfamiliar-player acceptance

Two unfamiliar players completed live, ordinary-language sessions on 20
September 2026 after two evidence-led correction rounds. One chose public
disclosure and the other chose confidential referral. The operator accepted
both final runs and authorized closure of issue 37.

## Playtest protocol

The operator sets `OPENAI_API_KEY`, builds the project, and starts one unseeded
live session per participant:

```powershell
npm.cmd run build
npm.cmd start -- --adventure chapel --ai --trace .dm-evaluations\issue-37-player-1.json
```

Participants use ordinary language and may consult `help` or the README, but
receive no developer coaching. Timing starts when the opening scene appears and
ends at victory, abandonment, or defeat. Raw traces remain in the ignored
`.dm-evaluations` directory. The durable record uses anonymous participant
labels and sanitized observations only.

For each session, record duration, completion, confusing narration, hint needs,
perceived agency, the chosen resolution and why, the player's explanation of
its consequences, their understanding of a failed-check alternative, whether
mechanics and narration were distinguishable, and whether they would willingly
continue. Record any operator intervention. If both natural choices coincide,
use a directed follow-up to cover the other resolution.

## Initial human evidence

### Player 1

Trace: `.dm-evaluations/issue-37-player-1.json`

- Outcome: incomplete after 40 turns; the player quit with the quest active.
- The player cleared the guardian, recovered the ledger, and confronted Oren.
  Oren admitted diverting the repair money, but the player could not identify a
  remaining action and reported having nowhere else to go.
- The trace shows that Tavi was alive and visible in the crypt. The player left
  without speaking to or rescuing Tavi. Post-ledger guidance instead told the
  player to return to Oren, creating a misleading loop.

### Player 2

Trace: `.dm-evaluations/issue-37-player-2.json`

- Outcome: incomplete after 25 turns; the player quit with the quest active.
- The player found it difficult to remember adjacent destinations and sometimes
  scrolled back to recover the movement options.
- The unambiguous input `take the potion` was incorrectly mapped to a read-only
  `look` call. The response stated that the potion had not been collected, but
  the player overlooked that correction and entered combat without it.
- The player survived the guardian at 6/20 HP, later collected and used the
  potion, recovered the ledger, and confronted Oren. As in Player 1's run, the
  player left Tavi in the crypt and quit without reaching a resolution.

Neither initial session supplies qualifying duration, ending-choice,
consequence-understanding, failed-check, agency, mechanics-versus-narration, or
willingness-to-continue evidence. Those fields remain unreported rather than
inferred.

## First follow-up evidence

### Player 1

Trace: `.dm-evaluations/issue-37-player-1-followup.json`

- Outcome: defeat after 13 turns. The player reported that play was otherwise
  fine, but the skeleton killed the Fighter.
- The player carried the healing potion into combat and reached 9/20 HP with
  `use potion` still offered, but attacked again; the guardian's critical
  counterattack caused defeat before the potion was used.
- This is useful combat evidence but does not satisfy the requirement to
  complete the adventure.

### Player 2

Trace: `.dm-evaluations/issue-37-player-2-followup.json`

- Outcome: incomplete after 29 turns. The player recovered the ledger, spoke to
  Tavi, rescued Tavi to the inn, and returned there successfully.
- Talking to Mara after the rescue produced the stale claim that Tavi was still
  missing and another request to find them.
- Both noticeboard endings were authoritatively available, but compact guidance
  listed searches and conversations first and truncated the second resolution.
  The player could not identify the final objective, visited Oren, and quit.

The follow-up confirms that the first correction made the crypt route usable,
but neither player supplied a qualifying completed session.

## Evidence-backed fixes

- Ledger recovery now identifies establishing Tavi's fate in the crypt as the
  next objective. Authoritative live narration explicitly points to living Tavi
  or, on a casualty route, to the remains search. It no longer sends the player
  to Oren before Tavi's fate is established.
- Compact state feedback now repeats adjacent exits and up to four currently
  valid actions after gameplay mutations. Completed searches are removed from
  suggestions, so the crypt guidance prioritizes speaking with or rescuing
  Tavi.
- Explicit requests to take, pick up, grab, or collect the visible potion can no
  longer be satisfied by a read tool. The prompt contract is versioned as
  `chapel-human-dm-v12`, while v11 traces remain replayable.
- The interpretation campaign now includes the exact clear input `Take the
potion.` and checks that the potion reaches authoritative inventory state.
- Once the endings become available, compact guidance now lists public
  disclosure and confidential referral before optional searches or
  conversations, keeping both choices visible.
- In live AI play, talking to Mara after Tavi's rescue now uses authoritative
  state-derived narration: Mara acknowledges Tavi's safe return and points to
  the noticeboard choices. The persisted v9 conversation event remains
  unchanged so released traces keep replaying exactly.

The focused live-model check ran the new potion case three times with the
configured default `gpt-5.6-luna`. All three runs selected and validated `take`
under `chapel-human-dm-v12`.

## Final follow-up evidence

### Player 1

Trace: `.dm-evaluations/issue-37-player-1-final.json`

- Outcome: victory after 18 turns with seed `1811749666`.
- The player collected the potion, defeated the guardian, recovered the ledger,
  spoke with Tavi, rescued Tavi to the inn, and chose public disclosure.
- Tavi survived, and the ending recorded no casualties.
- The player did not use `help`. The trace replays successfully without a model.

### Player 2

Trace: `.dm-evaluations/issue-37-player-2-final.json`

- Outcome: victory after 25 turns with seed `3352299688`.
- The player collected and used the potion, defeated the guardian, recovered
  the ledger, rescued Tavi, questioned Oren, and chose confidential referral.
- Tavi survived, and the ending recorded no casualties.
- The player did not use `help`. The trace replays successfully without a model.

Both sessions used `gpt-5.6-luna` under `chapel-human-dm-v12`, covered the two
available resolutions, and were reported by the operator as successful.

## Automated verification

`npm.cmd run verify` passed all seven canonical gates with zero warnings on 20
September 2026. The automated suite reported 277 passing tests, zero failures,
and zero skipped tests. Both final human traces also replayed successfully with
the built CLI.

## Acceptance limitations

- Wall-clock duration was not recorded.
- The final players did not supply separate questionnaire answers for perceived
  agency, consequence understanding, failed-check understanding,
  mechanics-versus-narration clarity, or willingness to continue. These fields
  remain unreported rather than inferred from the traces.
- The operator explicitly accepted both successful final runs and authorized
  issue closure despite those unreported subjective fields.

The raw traces remain ignored local evaluation artifacts and are not committed.
