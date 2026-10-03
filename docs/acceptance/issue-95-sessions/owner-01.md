# Owner playtest 1 (v14 after round 1)

- Date / commit: 3 October 2026 / `feat/issue-95-player-qualification` at
  `7026d05`
- Player: the project owner. This is owner feedback, not one of the three
  unfamiliar players.
- Content: hollow-beacon v14 (round 1 text)
- Result: played through and worked out what was needed

## Feedback

| #   | Feedback                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Why do ability scores have numbers in brackets, like “Strength 14 (+1)”?                                                                                                      |
| 2   | Why is there an option to bluff Iona? There's no reason to want to.                                                                                                           |
| 3   | “Captain Iona (urgent): Please, listen. The valley beacon is dark at dusk. … Please check carefully.” “Please check carefully” makes no sense here.                           |
| 4   | Iona's “I won't light a beacon I can't trust.” makes no sense.                                                                                                                |
| 5   | An action read “Search the camp signal survey” while the button says “Examine”. Seen in the centre panel without clicking anything.                                           |
| 6   | Sera's “Help the group make room” has no context.                                                                                                                             |
| 7   | Asking about the refugee journey: “Give me a reason to tell you, or look at the survey and sighting frame yourself.” A reason to tell you what? Why care about their journey? |
| 8   | Meeting Pell in the Watch Loft without knowing who they are.                                                                                                                  |
| 9   | Pell's answer is confusing.                                                                                                                                                   |
| 10  | Overall: the game lacked narrative, and there was no loot.                                                                                                                    |

## Diagnosis and fixes

| #   | Cause                                                                                                                                     | Fix                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Modifiers were shown unexplained                                                                                                          | One line under the scores in the library and on the Character sheet: the modifier is added to a d20 roll with that ability                                                                                                 |
| 2   | Left over from an earlier deception mechanic                                                                                              | Removed from v14 with its correction topic and roll (owner decision)                                                                                                                                                       |
| 3   | The reply was the model's arrangement of short “approved fact” sentences with a stock opening and closing, not the authored line          | Hollow Beacon v14 people speak their authored replies as written; no second AI call. v13 and earlier unchanged                                                                                                             |
| 4   | Round 1 v14 wording                                                                                                                       | Iona now says lighting it unchecked could send the caravan the wrong way                                                                                                                                                   |
| 5   | Probably the engine card on a refused action: its “Try:” hint said `search camp-survey` (pre-Examine wording), and the model also read it | In rules v2 (v13, v14) the hints say `examine`                                                                                                                                                                             |
| 6   | The request was never set up                                                                                                              | The camp has two storm-torn shelters; the topic is **Help the refugees raise their torn shelters**                                                                                                                         |
| 7   | Guarded answer without a stake                                                                                                            | The introduction gives the refugees a stake (the caravan is their way south; raiders may be following); the topic is **Ask Sera why the refugees fear the beacon**, and the guarded answer says what would change her mind |
| 8   | Introductions were missing                                                                                                                | Clicking Iona, Sera or Pell says who they are; the loft names Pell as the signaller who set the aim                                                                                                                        |
| 9   | Guarded answer without a way forward                                                                                                      | Pell says they answer to the captain and that convincing them, or the setting plate, are the ways forward                                                                                                                  |
| 10  | Thin story; no rewards except XP                                                                                                          | Story strengthened within v14's structure: a reason to be there, the refugees' stake, the raider's note, Vey's motive and confession, and endings with a payoff. Loot is follow-up #119 (owner decision)                   |

## Follow-up

After round 2 the owner found it “all pretty good”, with three points: the
modifier explanation didn't say why some abilities have one, and “(+0)” is
pointless; the opponent's HP was hard to find during fights; and winning
fights should give XP. All three are fixed in round 3 (see the issue 95
record).
