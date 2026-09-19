# Issue 34 acceptance evidence

## Deterministic terminal pass

On 19 September 2026, the complete chapel flow was inspected in the terminal
with seed `7`. The pass deliberately failed Oren's intimidation check, followed
the visible chapel evidence instead, collected the potion, cleared the guardian,
recorded the ledger and Tavi's testimony, rescued Tavi, chose public disclosure,
and inspected `status`, `journal`, `inventory`, and `help` after victory.

Observed results:

- Startup and every accepted gameplay mutation printed one compact authoritative
  state line. HP, potion state, combat turn, and quest progress matched the
  detailed mechanics and final journal.
- The failed social check showed its roll and a public alternative. No retry or
  hidden fact was needed to finish the investigation.
- Speaker-prefixed dialogue, combat/social mechanics, journal updates, scene
  narration, and final-state reads were visually distinguishable.
- Contextual `Try:` and help examples were copyable and did not advertise the
  ledger, rescue, or resolutions before those targets became public.
- Public disclosure froze subsequent movement while final-state reads and quit
  remained available.

A focused seed-`7` potion pass observed the opening critical hit reduce the
fighter to `9/20`, `use potion` roll `2, 2 + 2`, restore 6 HP, consume the item,
allow the guardian's normal missed response, and leave the fighter at `15/20`
with the correct active turn.

A seed-`0` casualty pass killed Oren through the normal combat rules, recovered
the ledger independently, rescued Tavi, and chose confidential referral. The
ending named the trustee restitution/repair request but made no promise from
dead Oren. A post-ending attack was rejected while status and journal remained
readable.

## Provider-failure recovery

The checked-in scripted provider-failure inputs commit the missing-person-notice
search and then exhaust the provider response stream. Exact `journal`, `status`,
`inventory`, `help`, and `quit` all completed locally afterward. The exported
trace replayed without a model; changing the recorded `local-status` input to
`status please` was rejected as an invalid local-read record.

Run the copyable command block in the README, or the focused automated check:

```powershell
npm.cmd run build
node --test --test-name-pattern "provider failure leaves every exact local control" tests/issue-34.test.mjs
```

## Remaining live and human evaluation

The deterministic and scripted passes demonstrate orchestration, authority,
recovery, and readability; they do not establish live-model interpretation
quality or human enjoyment. A live/human session should record any command the
model maps to the wrong public tool, any point where the next public command is
unclear, any speaker whose voice is hard to distinguish, and whether the choice
between disclosure and confidential referral feels informed rather than merely
mechanical. Those observations should include the exact player wording, visible
scene, model ID, and trace reference so they are actionable.
