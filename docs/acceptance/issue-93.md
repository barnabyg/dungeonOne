# Issue 93: start and continue the expanded adventure in one browser slot

Implemented on `codex/gameplay-ui`, 3 October 2026. The single-save-slot
browser launcher is `--legacy` mode. Since increment 10, the launcher without
`--legacy` opens the character library, which manages its own adventure
sessions and refuses Start and New game for a single slot. Character mode is
unchanged by this ticket. Changing the default remains a separate release decision.

## Supported-release policy

[`src/browser-releases.ts`](../../src/browser-releases.ts) is the single policy.

- **Start:** an empty slot or a confirmed **New game** starts the newest listed
  release, `BROWSER_START_VERSION` = Hollow Beacon content version **11**
  (_Final Warning_, `chapel-clues-rules-v17`, schema 16).
- **Continue:** an occupied slot continues only if its saved adventure ID,
  content version, rules version and schema match a listed release (v4–v11).
  It plays from its own saved snapshot, which the save authority verifies against
  the digest recorded in the save, with its original rules, history and endings.
  Slots are deliberately not pinned to the bundled file's digest: some release
  files received corrections shortly after their first commit, and saves made
  before a correction must stay readable. Nothing is migrated, reinterpreted or upgraded. A completed v4 watch
  ending stays a completed v4 game in Review mode. It is not treated as an
  unfinished full adventure.
- **Refuse:** anything else fails before the page is served, and the file stays
  byte-identical. This covers releases outside the list (for example CLI-only v1–v3
  or a future unlisted version), saves whose snapshot was edited without its
  recorded digest, CLI `quit`-closed slots and corrupt files. An unsupported release
  reports the supported tuples and ends with "The occupied slot was left unchanged;
  select another save path." The launcher exits with status 2 and serves nothing.
- **New releases:** a content ticket appends a row with its released file and moves
  `BROWSER_START_VERSION` deliberately; the launcher help text follows the table.
  Existing rows never change. At startup, each bundled file is checked against its
  row, in both launcher modes.

Character-library sessions (Hollow Beacon v12, Stonebridge v1) keep the
increment 10 rules.

## Player flow

Prerequisites: Node 24.x, npm 11.6.4, installed dependencies, a desktop
browser, and `OPENAI_API_KEY` set in the launch environment with network access
to the provider. The launcher refuses to start without a key. Without network
access, startup and local reads work, but AI turns report that no action was
committed. Limits: one `--save` path per launcher, an OS-assigned loopback URL
that can change on every start, and no multi-slot UI. Inventory, Character,
Journal, Known leads and Hints are local reads with no provider call.

```powershell
Set-Location C:\docs\git\dungeonOne
npm.cmd run build
npm.cmd run browser -- --legacy --seed 0 --save .\.scratch\increment-8-continuity\slot.json
```

1. Open the printed `Hollow Beacon: http://127.0.0.1:<port>` URL if it did not
   open automatically. Expect **Hollow Beacon: Final Warning**, Watch Yard, Day 0,
   Day 3 caravan deadline, full HP. **Game menu** shows seed 0.
2. Select **Start adventure**. Expect an empty conversation and the opening saved.
   Type `Travel to Watch Loft`. Expect a reply with a **Resolved action** card
   ("Travelled to Watch Loft."), the location changing to Watch Loft, Day 0
   unchanged and the **Saved** indicator. Wait until the message box is enabled again.
3. Press Ctrl+C in PowerShell. Rerun exactly:

```powershell
npm.cmd run browser -- --legacy --seed 0 --save .\.scratch\increment-8-continuity\slot.json
```

4. Open the newly printed URL. The slot continues automatically with the same
   location, day, HP, journal and exact conversation. No AI request is made to
   restore it. Rerunning with another `--seed` still continues at the saved seed;
   the new seed only labels a future **New game**.

Browser mode has no `--resume` or `--adventure` flag. Do not type `quit` to keep
an active game: it closes the session, and a closed slot will not open in the browser.

A finished game reopens in **Review mode**: conversation, cards, journal and
information stay readable, the message box and gameplay options are disabled,
hints explain that interaction is closed, and no provider call is made.

### Starting v11 without losing an older slot

An occupied slot from an older release (v4–v10) keeps that release. **New game** replaces it with
v11 after native confirmation, so do that only when you no longer need the old
game. To keep the historical game, start v11 in a new save path:

```powershell
npm.cmd run browser -- --legacy --seed 0 --save .\.scratch\increment-8-continuity\v11-slot.json
```

Rerun the original `--save` path at any time to read or continue the older game.

## New game protection

This ticket reuses the existing #104 protections. **Cancel** or Escape preserves
state, history and both hint levels. Confirmation requires the displayed seed and
current revision, and atomically replaces the whole slot with a fresh v11 opening.
Replacement is refused while a turn or hint is pending. Old tabs, old
generations and delayed replies cannot change the replacement game.

## Automated coverage

[`tests/issue-93.test.mjs`](../../tests/issue-93.test.mjs) covers:

| Check                                                                                                                                                                                                         | Boundary                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Each policy row matches its bundled file; the start release is the newest                                                                                                                                     | Policy and adventure files                |
| `--legacy --seed 0 --save <dir>/increment-8-continuity/slot.json` starts v11; stopping and rerunning the same command, or with `--seed 7`, restores the same view and bytes                                   | Shipped launcher process (opener stubbed) |
| Ridge Trail combat and clock checkpoint (Day 2, initiative, attack), restart, lost-reply retry rejected with no provider call, then continued play matches an uninterrupted seeded run                        | HTTP server, scripted provider, save      |
| Active and completed v4 slots continue under the v11 launcher; completed Review makes no provider call; unconfirmed, wrong-seed and stale resets refused; confirmed reset starts v11; old revision cannot act | HTTP server, save                         |
| v3, a future v99 fixture, a v11 save edited without its digest, a `quit`-closed slot and a corrupt file fail before serving and stay byte-identical                                                           | Startup                                   |
| Real Edge/Chromium starts v11, commits a typed action, kills and relaunches the server process, and shows exact conversation, location and save bytes                                                         | Browser, server, save                     |

Deeper fault coverage is retained in the existing tests: issue-100 (history and
crash after commit), issue-101 (lost responses, process kill, retained recovery),
issue-104 (reset during turn/hint, delayed replies, interrupted replacement),
issue-105 (completed Review), issue-106 (real-browser journeys, stale tabs,
native confirmation focus). Full-campaign combat/threshold continuation belongs
to the content tickets and #94.

## Compatibility

CLI `--adventure-file`, `--save`, `--resume`, offline command mode, default
adventure selection and trace/replay contracts are unchanged. No cross-mode
continuation (browser slot ↔ CLI `--resume`) is tested or promised here, and
there is no browser switch or export feature. No live provider calls were made.

### Test limitations

On Windows, Node's `kill("SIGINT")` force-terminates the child rather than
delivering Ctrl+C, so the launcher-process test exercises an abrupt stop,
which is a harsher case than a graceful shutdown. That test makes no provider
request: it covers start, stop and continuation through the shipped launcher
arguments. Committed-turn continuation runs against the same server in a
separately killed process with a scripted provider (the real-browser test),
and in-process with the combat checkpoint.
