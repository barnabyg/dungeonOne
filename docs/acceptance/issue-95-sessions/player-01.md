# Player 01 (first session, stopped early)

- Date / commit: 3 October 2026 / `feat/issue-95-player-qualification` at
  `c4eb984`
- Played: stopped by the host before the end, because the player was too
  confused to make progress. Duration not recorded.
- Content / model / seed: hollow-beacon v13 / gpt-5.6-luna / not recorded
- Character: a new level-1 Fighter; preset not recorded; no XP earned
- Save and continue: not exercised
- Hints / story coaching / technical help: not recorded
- Path: the character library, the opening at Watch Yard, the Captain Iona
  and beacon lamp options
- Ending: none (stopped by the host)
- Would choose another adventure like this: not asked

The host passed on the feedback below, lightly edited. The run doesn't count
toward any player gate.

## Feedback

| #   | Where              | Feedback                                                                                                                                       |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Top bar            | Having both “Choose character” and “Character” is confusing.                                                                                   |
| 2   | Character library  | Didn't understand “Close character library”.                                                                                                   |
| 3   | Character creation | Expected to roll three d6 for each ability.                                                                                                    |
| 4   | Character creation | “Save character” is enabled before a name has been entered.                                                                                    |
| 5   | Character library  | After creating a character the dialog has no obvious layout: buttons and text mixed, “Saved adventures” over a lone “Close character library”. |
| 6   | Explore column     | “Combat on arrival. No retreat or surrender once fighting.” — not obvious what it refers to.                                                   |
| 7   | Header             | Wanted XP shown with the character details.                                                                                                    |
| 8   | Scene              | “The beacon is dark; the caravan reaches the fork on Day 3” — no idea what that is about.                                                      |
| 9   | Scene              | “Read the scene” adds to the confusion.                                                                                                        |
| 10  | Explore column     | **Liked** the options showing where you can go and who you can talk to.                                                                        |
| 11  | Captain Iona       | Clicking her offered Attack. Should I be attacking her?                                                                                        |
| 12  | Captain Iona       | “Ask how the watch responds” — what is the watch?                                                                                              |
| 13  | Captain Iona       | The text above “Persuade: Claim the familiar signal is safe” is very confusing. What signal?                                                   |
| 14  | Beacon lamp        | All the “wisdom check” and “intelligence check” text is confusing.                                                                             |

## Diagnosis

The page opens with an empty conversation. The only story the player sees is
the first sentence of an introduction written as rules
(`adventures/hollow-beacon-examine.json`), and its rest hides under “Read the
scene”. So the beacon, the caravan, the watch and the “familiar signal” are
never introduced (items 8, 9, 12 and 13). Option text exposes engine wording
(“one d20 + 0 against DC 12, remembered without rerolls”, “once per adventure,
no time cost”; items 6, 13 and 14). The library dialog is an unstructured run
of buttons (items 1, 2, 4 and 5).

## Decisions (project owner, 3 October 2026)

- The content fixes ship as Hollow Beacon **v14**, which new adventures start.
  v13 saves keep continuing.
- Click options offer Attack only against people who are hostile. Typing an
  attack still works.
- Rolled 3d6 abilities go to follow-up #118. For now the form explains the
  presets.
- The top-bar buttons become **Adventures** and **Character sheet**.
