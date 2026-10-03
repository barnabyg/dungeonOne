# Issue 95: qualify Hollow Beacon with unfamiliar players

Prepared on 3 October 2026 on `feat/issue-95-player-qualification`, in the
browser's default character mode. **Status: rounds 1–3 fixed; ready for the
next player session. Not qualified.** The external-player gates below stay open
until three unfamiliar players have played and their evidence is recorded here.

The issue names Hollow Beacon v12. #110 made new adventures start v13 (one
**Examine** action). The first player session (below) stopped early on
confusing text, and the project owner then approved a content release: new
adventures now start **v14** (`hollow-beacon` 14,
`character-adventure-rules-v2`, schema 17,
`adventures/hollow-beacon-story.json`), which is v13 with plain player-facing
text. This qualification is for v14. v12 and v13 saves continue under their
own rows. Stonebridge (levels 2–3) is out of scope.

## Gates

| Gate                                                                                         | Status                                              |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Three unfamiliar players in the browser, character mode, evidence recorded                   | **Open:** 1 session, stopped early (does not count) |
| No authoritative contradiction or unfinishable supported branch in tested play               | **Open:** scripted routes finish; needs player play |
| At least two finish without story coaching                                                   | **Open**                                            |
| Completed runs plausibly fit 2–4 hours without padded travel                                 | **Open, at risk:** see [Length](#length)            |
| At least two say they would choose another adventure                                         | **Open**                                            |
| Named automated journeys (endings, timing, check, casualty, item, avoidance, seeds, resumes) | Done: [Automated journeys](#automated-journeys)     |
| Canonical seven-gate verification, zero warnings                                             | Done; rerun after round 1 (see below)               |
| Clean checkout: install, verify, build, start, create, save, continue, finish, Review        | Done: [Clean checkout](#clean-checkout)             |
| Diagnostic CLI replay verified separately                                                    | Done, in the same handoff run                       |
| Handoff: PowerShell commands, browser steps, expected responses, prerequisites, limits       | Done: player and host sheets                        |

## Handoff documents

- [Player sheet](issue-95-player-sheet.md): the only thing players see. It
  covers prerequisites, a separate seed and library per player, character
  creation, the recommended level range, panels and both hint levels, Ctrl+C
  and rerun to continue, the ending with Review and its XP award, and starting
  over (Rest, or Abandon with confirmation, Rest, start). It contains no route,
  clue or ending advice.
- [Session host sheet](issue-95-observer-sheet.md): how to set up a clean
  checkout, what counts as an unfamiliar player, hints versus story coaching,
  what to record verbatim, and a per-session record template. Records go in
  `docs/acceptance/issue-95-sessions/`.

Per-player launch commands (one library each, concrete seeds):

```powershell
npm.cmd run browser -- --seed 0 --characters .\.scratch\increment-8-player-01\characters.json
npm.cmd run browser -- --seed 1 --characters .\.scratch\increment-8-player-02\characters.json
npm.cmd run browser -- --seed 2 --characters .\.scratch\increment-8-player-03\characters.json
```

### Browser steps and expected responses

These steps are for the session host's handoff check, not for players.

| Step                                                                      | Expected                                                                                                                                                 |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open the printed `http://127.0.0.1:<port>`                                | “Welcome to Dungeon One” with getting-started steps; no adventure yet                                                                                    |
| **Adventures**                                                            | The new-character form is already open; **Save character** stays disabled until a name is typed                                                          |
| Name, **Balanced**, **Save character**                                    | “Character saved”; the character is selected: Fighter level 1, HP 19/19, XP 0                                                                            |
| (in the same dialog)                                                      | **Start Hollow Beacon: A Fighter’s Warning with <name>**, “Recommended levels 1–2”                                                                       |
| Start                                                                     | Watch Yard, Day 0, the Day 3 deadline, “XP 0 / 1,000 for level 2”; the conversation opens with the story introduction; **Hints** ready                   |
| Wait for a complete reply and an enabled box, Ctrl+C, rerun the same line | New URL; same adventure, conversation and state; no AI request                                                                                           |
| Reach an ending                                                           | Ending card; “1000 XP credited”, **Level 1 → 2** (on a surviving ending); Review                                                                         |
| Ctrl+C and rerun after the ending                                         | Review again; message box disabled; XP unchanged                                                                                                         |
| **Adventures** → character → **Rest between adventures**                  | Start buttons return; level-2 character still inside 1–2                                                                                                 |
| During an adventure, **Abandon adventure** → Cancel, then again → OK      | Cancel changes nothing; OK keeps the journey under **Saved adventures**, requires **Rest between adventures**, then a new start opens a fresh Watch Yard |
| Defeat (0 HP)                                                             | Defeat Review, no XP; the character shows as defeated and cannot start another adventure, so create a new one                                            |

Prerequisites: Node 24.x, npm 11.6.4, `npm.cmd ci`, `npm.cmd run build`, a
desktop browser, and `OPENAI_API_KEY` with provider network access for
gameplay. Character creation, panels, hints and Review work without the
provider. There is no browser `--resume` or `--adventure` flag.

Known limits for players: one active adventure per character; the loopback
port changes on every start; a defeated character is retired; the CLI is not a
player interface.

## Automated journeys

[`tests/issue-95.test.mjs`](../../tests/issue-95.test.mjs) runs in canonical
verification without credentials. Each journey creates a level-1 Fighter
(Balanced) and clicks offered options through the shipped HTTP server and save
authority in its own process. Only the provider is scripted
([`tests/fixtures/issue-93-server.mjs`](../../tests/fixtures/issue-93-server.mjs)).

| Journey                                        | Seed              | Covers                                                                                                                                                                                                                                |
| ---------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| On time: verified safe signal                  | 0                 | **Failed check** (wisdom at the beacon lamp, no XP); both fights won; component fitted and **spent (item loss: the only lossy item mechanic is spending the component)**; Day 2, “Before Day 3” consequence; **verified safe signal** |
| Valley road: slower human warning              | 0, 1, 2, 3        | **Combat avoidance** (no combat card at all, HP 19/19); **late** consequence; **slower human warning**; seeds 0–3 (this route rolls no dice)                                                                                          |
| Casualty: urgent risky signal                  | 0                 | Sentry avoided by the drainage walk; **Vey killed (casualty)**; controls secured; component still carried; late; **urgent risky signal**                                                                                              |
| Defeat                                         | 33                | **Defeat** by the ridge raider; no XP, level 1; Review after a restart; no provider call                                                                                                                                              |
| Restarts mid-combat and at the Day 3 threshold | 0                 | Process kill **mid-combat** (sentry) and right after the **Day 3 threshold**; identical state, no call; threshold not replayed; finishes late                                                                                         |
| Ridge fight across seeds                       | 0, 1, 2, 5, 9, 33 | **Multiple seeds** on a dice route: six different fights; each run ends in a defeat (no XP) or a late verified safe signal with 1,000 XP, and both outcomes occur                                                                     |
| Every surviving journey above                  |                   | **Completion XP credited once**: one “1000 XP credited”, level 2; kill and relaunch into Review: identical view, no call, a further turn refused, XP still 1,000                                                                      |
| Player handoff                                 | 0                 | [`scripts/qualify-handoff.mjs`](../../scripts/qualify-handoff.mjs) in a real browser (below)                                                                                                                                          |

Existing tests cover the rest of the browser boundary and are unchanged:
[`tests/issue-94.test.mjs`](../../tests/issue-94.test.mjs) (the full typed
and clicked v13 journey in real Edge, provider failures before and after a
commit, a misbehaving provider), [`tests/issue-93.test.mjs`](../../tests/issue-93.test.mjs)
(launcher continuation, abandonment, stale tabs, `--legacy` v4–v11 saves) and
[`tests/issue-110.test.mjs`](../../tests/issue-110.test.mjs) (v12 saves
continue with Inspect and Search). Since round 1 they all play v14.

## Clean checkout

[`scripts/qualify-handoff.mjs`](../../scripts/qualify-handoff.mjs) follows the
handoff in headless Edge and writes a receipt. It is also a test in
canonical verification, so it can't drift from the shipped page.

1. The shipped launcher (`dist/browser-cli.js --seed 0 --characters <library>`)
   starts. The page creates Ada, checks “Recommended levels 1–2”, and starts
   Hollow Beacon.
2. Ctrl+C, then the same command: the identical adventure, with the message
   box enabled.
3. The tracked 14-turn journey is typed into the page. Gameplay needs a
   provider and the launcher accepts only a real key, so this step runs the
   shipped server in its own process with the tracked scripted provider over
   the same library. No live request is made.
4. The same launcher command opens Review: message box disabled, level 2,
   1,000 XP, every saved byte unchanged.
5. In the page: Rest, start, Abandon cancelled then confirmed, Rest, start.
   Three journeys stay listed and career XP is kept.
6. Diagnostic CLI replay of `tests/fixtures/historical-ai-victory.json`,
   separately: “Trace verified successfully”.

The launcher runs through `tests/fixtures/issue-93-launcher.mjs`, which only
stops it opening a desktop window, with a placeholder credential.

**Result (3 October 2026):** a fresh `git clone` of this branch at `e35c99a`.
After review, `1ae5fee` and `f6738cd` refactored the shared test helpers and
added the multi-seed journey; they were verified in the working checkout, not
in a second clean clone. In it,
`npm.cmd ci --cache .verify-artifacts/npm-cache` installed with 0
vulnerabilities, and `npm.cmd run verify` with `$env:CI = "true"` passed **all seven gates, 740
tests, 0 failures, zero warnings**. `npm.cmd run build` and
`node scripts/qualify-handoff.mjs` passed every check. Tracked files were
unchanged. Node 24.13.0, npm 11.6.4, headless Edge. Receipt:
[`issue-95-clean-handoff.json`](issue-95-clean-handoff.json). No live
provider request was made, and nothing was pushed.

## Length

A scripted route finishes in 14 turns, and #94's live run took 22 turns with
1.4–4.8 s per turn. A player who reads everything, explores both
investigation routes, talks to every character and fights will take longer,
but the module has 12 locations and one main decision. Reaching 2–4 hours
without padding is the gate most at risk. The sessions will measure it. If
completed runs are clearly shorter, the honest outcomes are more content (a
content ticket with its own release row) or a revised target. Padding travel
is not one of them.

## Things to watch in the sessions

The rules-text introduction and the engine wording on ending cards, noted here
before round 1, were fixed by v14. Still to watch:

- Engine-written result cards still use terms such as "Fighter attack cost:
  1 action, 0 days" and "Cost: 0 days; no dice". They come from the engine, not
  the content, and players haven't reached them yet.
- A level-up raises maximum HP (19 → 28) but leaves current HP (for example
  10/28) until Rest. That is correct, but it may read as a bug.
- Defeat retires the character for good. The player sheet says so, but it may
  still surprise players.

## Player sessions

Records go in `docs/acceptance/issue-95-sessions/`, using the template in the
host sheet.

### Round 1: player 01 (stopped early)

[Record](issue-95-sessions/player-01.md). The player got as far as the opening
scene, Captain Iona and the beacon lamp. The host then stopped the session to
pass on 14 items of feedback, so the run does not count toward any gate. Fixes,
following the project owner's decisions of 3 October 2026:

| Feedback (item)                                               | Fix                                                                                                                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “Choose character” vs “Character” (1)                         | Toolbar: **Adventures** and **Character sheet**                                                                                                          |
| “Close character library” (2); no layout (5)                  | Library dialog: title bar with **Close**; sections for characters, the selected character with its adventures, and saved adventures; empty states        |
| Expected 3d6 rolls (3)                                        | Follow-up #118; the form explains what a preset is                                                                                                       |
| Save enabled with no name (4)                                 | **Save character** is disabled until a name is typed; a first visit opens the form directly                                                              |
| “Combat on arrival…” unclear (6)                              | Character mode: “A fight starts as soon as you reach Ridge Trail, and you can't run once it starts.”                                                     |
| XP not in the header (7)                                      | “Fighter · Level 1 · XP 0 / 1,000 for level 2”                                                                                                           |
| “The beacon is dark…” means nothing (8); “Read the scene” (9) | v14's story introduction opens the conversation; the header summarises the current place under **More about this place**; a welcome before any adventure |
| Attack offered on Captain Iona (11)                           | Character mode: no Attack click on someone you are not fighting; typing still works                                                                      |
| “Ask how the watch responds” (12)                             | v14 introduces the beacon watch; topics renamed, for example **Ask what the watch is doing now**                                                         |
| “Claim the familiar signal is safe” and its text (13)         | v14's introduction explains the beacon's familiar light; the bluff was first reworded, then removed in round 2                                           |
| Wisdom and intelligence check text (14)                       | **Roll Wisdom** with a plain explanation; v14 drops the four generic assessment checks                                                                   |

The player liked the column of places to go and people to talk to (10); it is unchanged.

Rechecked: every journey in [Automated journeys](#automated-journeys) now plays
v14 and passes: all endings, on time and late, the failed check, defeat, the
casualty, restarts and multiple seeds. #93, #94 and #110 also pass on v14.
[`tests/issue-95-ui.test.mjs`](../../tests/issue-95-ui.test.mjs) checks the
page and option changes in a real browser.
[`tests/issue-95-content.test.mjs`](../../tests/issue-95-content.test.mjs)
checks that v14 changes only text and the removed checks, has no engine
jargon, and opens with the story. No live AI run was made for v14. The model
now reads the v14 descriptions and topic labels, so the next player session is
also their first live check.

### Round 2: owner playtest

[Record](issue-95-sessions/owner-01.md). The project owner played v14 after
round 1 and could finish. Their summary: the game lacked narrative, and there
was no loot. Fixes, following their decisions of 3 October 2026:

- **Story:** strengthened inside v14's existing structure. The player has a
  reason to be there. The refugees have a stake: the caravan is their way
  south, and raiders may be following them. A note on the ridge raider
  foreshadows the diversion. Vey confesses a motive (raider threats and a
  share) and what happened at the shutter. The endings and the keeper's fate
  read as a payoff.
- **People:** clicking Iona, Sera or Pell says who they are. Sera's request
  and her and Pell's guarded answers say what is being asked and what would
  change their minds.
- **Bluff:** removed from v14, together with its correction and roll.
- **Authored replies:** Hollow Beacon v14 people speak their authored replies.
  The model no longer strings approved facts together with a stock closing
  (“Please check carefully.”), so conversations need one AI call, not two.
- **Hints:** a refused action's “Try:” hint says `examine` in v13 and v14.
- **Modifiers:** the bracketed ability modifiers are explained on the form,
  the library sheet and the Character sheet.
- **Loot:** follow-up #119. 3d6 abilities remain #118.

Rechecked: the named journeys, #93, #94 and #110 all pass on the round 2 v14.
[`tests/issue-95-dialogue.test.mjs`](../../tests/issue-95-dialogue.test.mjs)
covers authored replies (v14) against composed replies (v13) and the
Examine-era hints. The content test now also requires the bluff's removal.

### Round 3: owner follow-up

The project owner called the round 2 result “all pretty good” and raised three
more points ([record](issue-95-sessions/owner-01.md#follow-up)):

- **Why modifiers:** the explanation now says why some abilities have one:
  13 or more gives a bonus, 8 or less a penalty, 9 to 12 is average. Average
  scores show no “(+0)”, and a check only mentions a bonus or penalty the
  character actually has. The round 2 text (“10 or 11 gives +0”) was also
  wrong: 9 to 12 give +0.
- **Opponent HP:** during a fight the opponent's name, HP and a red health bar
  sit in the header beside the player's own HP.
- **Fight XP:** in v14, defeating the ridge raider or the tower sentry earns
  100 XP each, through the existing `actor-defeated` reward. Like the check
  XP, it is earned once per character and credited with the completion award.
  Killing a person (Vey) earns nothing. The header shows XP earned this
  adventure. A level-1 character finishing with both fights has 1,200 XP,
  still level 2, so Stonebridge's 2–3 range is unaffected.

Rechecked: the named journeys assert the new totals (1,200 with both fights,
1,100 with the raider, 1,000 without fights) and the fight XP lines. #94's
journey and guard tests assert 1,100. A real-browser test checks the opponent
block in the header.
