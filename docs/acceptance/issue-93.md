# Issue 93: start and continue the expanded adventure with a saved character

Implemented on `codex/gameplay-ui`, 3 October 2026. Issue #93 was first written
before increment 10 made the character library the default browser mode, so it
described a single save slot with **Start adventure** and **New game**. On
3 October 2026 the project owner confirmed that character mode is the intended
player experience: persistent characters gain experience and levels, and
adventure modules target level ranges. The issue was revised the same day, and
this handoff qualifies it in character mode. The table below maps the original
single-slot wording.
The `--legacy` single slot remains a compatibility path for older saves.

The command-line app is a testing and regression adapter only; it is not part
of this handoff.

| Issue wording                     | Character mode                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Single save slot                  | The character library (`--characters` file) plus one save per adventure in the adjacent `character-adventures` folder |
| Fresh startup                     | Create or choose a character, then start an adventure offered for new play                                            |
| Automatic continuation            | Rerun the same command; the library's selected adventure opens                                                        |
| New game (replace an active game) | **Abandon adventure** (native confirmation), **Rest between adventures**, then start again                            |
| Completed Review                  | Unchanged; earned XP is credited once                                                                                 |

Abandoning does not delete anything. The abandoned journey stays listed under
**Saved adventures** for review, and the character keeps its earned career
progress; only pending XP from the abandoned adventure is discarded.

## Supported-release policy

[`src/browser-releases.ts`](../../src/browser-releases.ts) lists every bundled
release with its exact tuple (adventure ID, content version, rules version,
schema), the browser mode that plays it, and whether it is offered for new play.

| Mode                   | Offered for new play                                        | Continued only       |
| ---------------------- | ----------------------------------------------------------- | -------------------- |
| Character (default)    | Hollow Beacon v12 (levels 1–2), Stonebridge v1 (levels 2–3) | —                    |
| `--legacy` single slot | Hollow Beacon v11                                           | Hollow Beacon v4–v10 |

- **Continue:** a save continues only if its saved tuple matches a listed row of
  its mode. It plays from its own saved snapshot, which the save authority checks
  against the digest recorded in the save, with its original rules, starting
  character sheet, history and endings. Nothing is migrated or reinterpreted;
  for example, a completed v4 watch ending stays a completed v4 game in Review.
  Saves are deliberately not pinned to the bundled file's digest: some release
  files received corrections shortly after their first commit, and saves made
  before a correction must stay readable.
- **Refuse:** anything else fails clearly and stays byte-identical: releases
  outside the list (for example CLI-only v1–v3 or a future unlisted version),
  saves edited without their recorded digest, CLI `quit`-closed single-slot
  saves and corrupt files. An unsupported release reports the listed tuples and
  ends with "The occupied slot was left unchanged; select another save path."
- **New releases:** a content ticket appends a row with `starts` and removes
  `starts` from the release it supersedes, so existing sessions keep continuing
  while new play gets the new release. Existing tuples never change. At startup
  each bundled file is checked against its row; the launcher help text and the
  character library's adventure list follow the table.

## Player flow

Prerequisites: Node 24.x, npm 11.6.4, installed dependencies, a desktop browser,
and `OPENAI_API_KEY` in the launch environment with network access to the
provider. Character creation, sheets, the information panels and Review work
without a provider call. Without provider access, an AI turn reports that no
action was committed. Limits: one character library per launcher, an
OS-assigned loopback URL that can change on every start, and one active
adventure per character.

```powershell
Set-Location C:\docs\git\dungeonOne
npm.cmd run build
npm.cmd run browser -- --seed 0 --characters .\.scratch\increment-8-continuity\characters.json
```

Pass `--characters` explicitly. Without it the library is `characters.json` in
the current directory. `--save` is not needed in character mode: it names a
single-slot save that is shown only while no character adventure is selected.
Its default is `hollow-beacon-browser-save.json` in the current directory, so a
leftover `--legacy` save there appears until you start or continue a character
adventure.

1. Open the printed `Hollow Beacon: http://127.0.0.1:<port>` URL if it did not
   open automatically. Select **Choose character**, **Create character**, enter
   `Ada`, keep **Balanced**, and select **Save character**. Expect a level-1
   Fighter with HP 19/19, AC 16 and 0 XP.
2. Select Ada. Expect the levels 1–2 recommendation beside **Start Hollow
   Beacon: A Fighter’s Warning with Ada**. Select it. Expect that title, Watch Yard, Day 0, the Day 3
   caravan deadline, Ada's name above HP, and an empty conversation. **Hints**
   is ready immediately.
3. Type `Travel to Watch Loft`. Expect a **Resolved action** card ("Travelled to
   Watch Loft."), the location changing to Watch Loft, Day 0 unchanged and the
   **Saved** indicator. Wait until the message box is enabled again.
4. Press Ctrl+C in PowerShell. Rerun exactly:

```powershell
npm.cmd run browser -- --seed 0 --characters .\.scratch\increment-8-continuity\characters.json
```

5. Open the newly printed URL. The same adventure continues automatically with
   the same location, day, HP, journal and exact conversation, without an AI
   request. Rerunning with another `--seed` still continues at the saved seed;
   the new seed only applies to the next adventure you start.

Do not type `quit` to pause. Browser play has no `--resume` or `--adventure`
flag.

**Completion:** a finished adventure reopens in **Review mode** after a restart:
conversation, cards, journal and character stay readable; the message box and
gameplay options are disabled; hints explain that interaction is closed; no
provider call is made; and its XP and level change are not credited again.

**Starting over:** open **Choose character**, select Ada, choose **Abandon
adventure** and confirm. Cancel leaves everything unchanged, and abandonment is
refused while a reply is pending. Then choose **Rest between adventures** and the
Hollow Beacon start button again: a fresh opening at Watch Yard with the launcher's seed
and an empty conversation. The abandoned journey stays under **Saved
adventures**. Old tabs from the abandoned journey cannot act.

### Older single-slot saves

Released Hollow Beacon v4–v11 saves continue with their original content in
`--legacy` mode:

```powershell
npm.cmd run browser -- --legacy --seed 0 --save .\path\to\old-slot.json
```

**New game** there replaces the slot with v11 after native confirmation (see
[issue 104](issue-104.md)). To keep the old game, use a new `--save` path or
play character mode instead.

## Fix found during qualification

Starting a character adventure left **Hints** showing "preparing" until the
first turn or a restart, because only the single-slot start saved the opening's
baseline hints. The character start now does the same. The launcher test
asserts ready hints immediately after start.

## Automated coverage

[`tests/issue-93.test.mjs`](../../tests/issue-93.test.mjs). Unless noted, servers
run in a separate process that the test kills and relaunches; the provider is
scripted and counted.

| Check                                                                                                                                                                                                                     | Boundary                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Each policy row matches its bundled file and mode; exactly v12, Stonebridge v1 (character) and v11 (`--legacy`) start new play                                                                                            | Policy and adventure files                |
| `--seed 0 --characters <dir>/increment-8-continuity/characters.json`: create Ada, start v12 with ready hints, stop, rerun the same command (and with `--seed 7`): same view and bytes                                     | Shipped launcher process (opener stubbed) |
| Ridge Trail combat and clock checkpoint (Day 2, initiative, attack), process kill, lost-reply retry rejected without a provider call, continued play matches an uninterrupted seeded run                                  | HTTP, storage                             |
| Complete Hollow Beacon (level 1 → 2), process kill: Review, no provider call, XP stays 1,000, library and save bytes unchanged                                                                                            | HTTP, storage                             |
| Pending turn blocks abandonment; kill mid-turn recovers "No action was committed"; unconfirmed/stale abandonment and `/api/new-game` refused; confirmed abandon, rest and restart; old tab rejected; old journey retained | HTTP, storage                             |
| Real Edge/Chromium creates Ada, starts Hollow Beacon, types a turn, process kill and relaunch: exact conversation, location and character name                                                                            | Browser, server, storage                  |
| `--legacy`: v4 active and completed slots continue; Review makes no provider call; unconfirmed, wrong-seed and stale resets refused; confirmed reset starts v11                                                           | In-process server, storage                |
| `--legacy`: v3, a future v99 fixture, a save edited without its digest, a `quit`-closed slot and a corrupt file fail before serving and stay byte-identical                                                               | Startup                                   |

Existing tests keep deeper coverage: the increment 10 character tests (two-module
career, interrupted starts, lock crashes, missing library, abandonment XP) and
issues 100–106 (history, lost responses, hints, reset, Review, real-browser
single-slot journeys). Full-campaign live-AI continuation belongs to #94.

### Test limitations

On Windows, Node's `kill()` force-terminates the child rather than delivering
Ctrl+C, so the restart tests exercise an abrupt stop, which is harsher than a
graceful shutdown. The launcher-process test makes no provider request because
the shipped launcher only accepts a real OpenAI key; committed-turn continuation
is covered through the same server in killed processes with a scripted
provider. No live provider calls were made.

## Compatibility

CLI `--adventure-file`, `--save`, `--resume`, offline command mode, default
adventure selection and trace/replay contracts are unchanged. No cross-mode
continuation (browser ↔ CLI `--resume`) is tested or promised, and there is no
browser switch or export feature.
