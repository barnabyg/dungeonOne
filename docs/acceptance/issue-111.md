# Issue 111: AI narration cannot contradict a rejected action

Checked on 3 October 2026 on `fix/issue-111-rejected-narration`, in the
browser's default character mode (Hollow Beacon v12 and Stonebridge v1).

## Change

Character adventures now use the `character-adventure-dm-v2` prompt.

- **Rejected mutation:** when the engine or the browser refuses an attempted
  state-changing call, the reply is engine-authored: “That did not happen: the
  request was refused, so no action was committed and nothing changed. The
  Action rejected card gives the reason.” The provider is not asked to narrate,
  so it cannot claim the refused result. Implemented as the character runtime's
  `renderDmNarration`, the existing hook for engine-authored replies.
- **Read turns:** one prompt sentence limits read narration to what the read
  result states; a discovery that needs search or another action has not
  happened until that action reports it.
- **Committed turns, reads and clarifications** keep AI narration.

The release tuple (`character-adventure-rules-v1`, engine v1, tools v1) is
unchanged, so released character saves continue. Saved browser histories keep
their recorded replies. AI traces recorded under `character-adventure-dm-v1`
still replay. Legacy single-slot releases are unchanged.

## Scripted evidence

`tests/issue-111.test.mjs` drives the shipped browser server with a provider
that tries to overclaim:

| Turn                                                | Provider narration offered           | Player-visible reply             |
| --------------------------------------------------- | ------------------------------------ | -------------------------------- |
| Rejected `resolve_quest`                            | “…you are now level 5.”              | Engine-authored; never requested |
| Impossible `place_item` (component not carried)     | “…the beacon is repaired.”           | Engine-authored                  |
| Click for travel; provider calls a different ending | “You win … and gain 1000 XP.”        | Engine-authored                  |
| `get_character_status` read                         | “You are unhurt … still at level 1.” | Provider narration kept          |
| Committed `move`                                    | “You climb the worn stair…”          | Provider narration kept          |

The rendered page shows the three engine-authored replies and none of the false
claims; the sheet stays level 1 with 0 XP. A second test replays a character AI
trace under both prompt versions and rejects an unknown one.

## Live check

Budget agreed before the run: at most 20 turns. Ran 12 typed turns from a new
level-1 Fighter, seed 0, with `scripts/qualify-narration-live.mjs` (cap 40
calls; 20 used; `gpt-5.6-luna`). Full record:
[`issue-111-live.json`](issue-111-live.json).

| Player input                                       | Result          | Reply                                                          |
| -------------------------------------------------- | --------------- | -------------------------------------------------------------- |
| “Resolve the verified safe signal now…”            | No tool call    | Says the fitting is not recorded; offers the persuasion option |
| “Fit the signal component into the beacon socket.” | Inspect only    | Says no component is carried                                   |
| “Ask Vey to stand down.”                           | No tool call    | Vey is not present                                             |
| “Earlier you said I reached level 5…”              | No tool call    | Level 1, 0 XP; denies level 5                                  |
| Iona, the loft and the records room                | Three commits   | Approved facts and accurate travel narration                   |
| “Look the setting plate over carefully.”           | Inspect only    | “may have been altered … search … to compare”                  |
| “Search the setting plate.”                        | Commit          | Confirms the alteration, as the search result reports          |
| “Pocket the component.”                            | `take` rejected | Engine-authored                                                |
| “Grab the spare component off the plate.”          | Commit          | Accurate                                                       |
| “Warn them.”                                       | Look only       | Asks who to warn                                               |

No reply claimed a refused result, XP, a level, or a rescue. The final sheet
was level 1 with 0 XP and the adventure was still in play.

### Remaining overclaims

- **Plate inspect (soft inference, not a claim).** The #94 run said the plate
  “confirms” the alteration before searching. Under v2 the model hedges (“may
  have been altered”) and points to the search. It still infers from the two
  marks the inspect lists. This is now accurate to the read result, so no
  further change is proposed.
- **Text-only and read turns are not checked.** Only rejected mutations get an
  engine-authored reply. A model could still overclaim in a turn with no
  mutation attempt; the result cards, the no-commit notice and the unchanged
  sheet remain authoritative there. None did in this run.
