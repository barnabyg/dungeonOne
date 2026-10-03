# Issue 95: qualify Hollow Beacon with unfamiliar players

Prepared on 3 October 2026 on `feat/issue-95-player-qualification`, in the
browser's default character mode. **Status: ready for player sessions. Not
qualified.** The external-player gates below are open until three unfamiliar
players have played and their evidence is recorded here.

The issue names Hollow Beacon v12. Since #110, new character adventures start
**v13** (`hollow-beacon` 13, `character-adventure-rules-v2`, schema 17, prompt
`character-adventure-dm-v3`, tools `character-adventure-tools-v3`), which is
v12 with one **Examine** action. Players get v13, so this qualification is for
v13. No release row, tuple, save format or module offered for new play was
changed. Stonebridge (levels 2–3) is out of scope.

## Gates

| Gate                                                                                         | Status                                              |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Three unfamiliar players in the browser, character mode, evidence recorded                   | **Open:** sessions not yet run                      |
| No authoritative contradiction or unfinishable supported branch in tested play               | **Open:** scripted routes finish; needs player play |
| At least two finish without story coaching                                                   | **Open**                                            |
| Completed runs plausibly fit 2–4 hours without padded travel                                 | **Open, at risk:** see [Length](#length)            |
| At least two say they would choose another adventure                                         | **Open**                                            |
| Named automated journeys (endings, timing, check, casualty, item, avoidance, seeds, resumes) | Done: [Automated journeys](#automated-journeys)     |
| Canonical seven-gate verification, zero warnings                                             | Done: 740 tests, clean checkout                     |
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
| Open the printed `http://127.0.0.1:<port>`                                | The page offers **Choose character**; no adventure yet                                                                                                   |
| **Choose character** → **Create character**, name, **Balanced**, **Save** | “Character saved”; Fighter level 1, HP 19/19, XP 0                                                                                                       |
| Select the character                                                      | **Start Hollow Beacon: A Fighter’s Warning with <name>**, “Recommended levels 1–2”                                                                       |
| Start                                                                     | Watch Yard, Day 0, the Day 3 caravan deadline; **Hints** ready; empty conversation                                                                       |
| Wait for a complete reply and an enabled box, Ctrl+C, rerun the same line | New URL; same adventure, conversation and state; no AI request                                                                                           |
| Reach an ending                                                           | Ending card; “1000 XP credited”, **Level 1 → 2** (on a surviving ending); Review                                                                         |
| Ctrl+C and rerun after the ending                                         | Review again; message box disabled; XP unchanged                                                                                                         |
| **Choose character** → character → **Rest between adventures**            | Start buttons return; level-2 character still inside 1–2                                                                                                 |
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

| Journey                                        | Seed              | Covers                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| On time: verified safe signal                  | 0                 | **Failed check** (wisdom at the beacon lamp, no XP); both fights won; component fitted and **spent (item loss: v13's only lossy item mechanic is spending the component)**; Day 2, “Before Day 3” consequence; **verified safe signal** |
| Valley road: slower human warning              | 0, 1, 2, 3        | **Combat avoidance** (no combat card at all, HP 19/19); **late** consequence; **slower human warning**; seeds 0–3 (this route rolls no dice)                                                                                            |
| Casualty: urgent risky signal                  | 0                 | Sentry avoided by the drainage walk; **Vey killed (casualty)**; controls secured; component still carried; late; **urgent risky signal**                                                                                                |
| Defeat                                         | 33                | **Defeat** by the ridge raider; no XP, level 1; Review after a restart; no provider call                                                                                                                                                |
| Restarts mid-combat and at the Day 3 threshold | 0                 | Process kill **mid-combat** (sentry) and right after the **Day 3 threshold**; identical state, no call; threshold not replayed; finishes late                                                                                           |
| Ridge fight across seeds                       | 0, 1, 2, 5, 9, 33 | **Multiple seeds** on a dice route: six different fights; each run ends in a defeat (no XP) or a late verified safe signal with 1,000 XP, and both outcomes occur                                                                       |
| Every surviving journey above                  |                   | **Completion XP credited once**: one “1000 XP credited”, level 2; kill and relaunch into Review: identical view, no call, a further turn refused, XP still 1,000                                                                        |
| Player handoff                                 | 0                 | [`scripts/qualify-handoff.mjs`](../../scripts/qualify-handoff.mjs) in a real browser (below)                                                                                                                                            |

Existing tests cover the rest of the browser boundary and are unchanged:
[`tests/issue-94.test.mjs`](../../tests/issue-94.test.mjs) (the full typed
and clicked v13 journey in real Edge, provider failures before and after a
commit, a misbehaving provider), [`tests/issue-93.test.mjs`](../../tests/issue-93.test.mjs)
(launcher continuation, abandonment, stale tabs, `--legacy` v4–v11 saves) and
[`tests/issue-110.test.mjs`](../../tests/issue-110.test.mjs) (v12 saves
continue with Inspect and Search).

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

Seen while building the journeys. This is known negative evidence. It isn't
fixed yet because the first sessions should show how much each item matters;
each item becomes a fix or a ticket after those sessions:

- The introduction is about 2,400 characters of rules ("0 days and no dice",
  "min(8, missing HP)", "no retreat or surrender") rather than a story hook.
  Several location descriptions repeat it.
- Ending cards repeat engine wording ("Commit a verified signal … for 0 days
  and no dice") before the story outcome.
- A level-up raises maximum HP (19 → 28) but leaves current HP (for example
  10/28) until Rest. That is correct, but it may read as a bug.
- Defeat retires the character for good. The player sheet says so, but it may
  still surprise players.

## Player sessions

_None yet._ Records go in `docs/acceptance/issue-95-sessions/`, using the
template in the host sheet, and are summarised here with the fixes they
produce and the rechecked routes.
