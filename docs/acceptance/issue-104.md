# Issue 104: replace the single Hollow Beacon slot

Prerequisites: Node 24.x, npm 11.6.4, `npm.cmd ci`, `npm.cmd run build`,
a desktop browser and `OPENAI_API_KEY` in the launch environment for live
gameplay. Use an unused filename in an existing directory for this test.

```powershell
npm.cmd run browser -- --seed 42 --save .\issue-104-player-save.json
```

Open the printed localhost URL and select **Start adventure**. This is
Hollow Beacon: Watch Route, content version 4. Type this message inside the
browser game, then wait for the complete reply and enabled input:

1. `Go to Watch Loft` — expect Watch Loft, saved travel and a result card.

Open **Hints** and request a stronger hint. Wait for its result. Enter an
unsent draft. Activate **New game** using Tab and Enter. The native modal
explains replacement of progress, conversation, replies, cards and both hint
levels, and displays seed 42. Initial focus is on **Cancel**. Escape or Cancel
returns focus to New game; the draft, history, current scene and open hints
remain unchanged. Tab stays within the modal while it is open.

Open it again, Tab from Cancel to **Replace and start new game**, and press
Enter. Expect a saved-new-game status, focus on Conversation, Watch Yard,
Day 0, HP 20/20, empty conversation and draft, collapsed Hints and no old
discoveries. Open Hints: opening guidance is fresh and the stronger-hint
button is available again. Reload, then stop the launcher with Ctrl+C and
rerun the exact command above: the new opening restores with empty history.
Browser mode automatically resumes the slot; it does not use `--resume`.
Changing the launch seed keeps the occupied game at its saved seed, while
the next New game confirmation displays the newly requested seed.

Keep another tab open at Watch Loft before resetting. After reset, a turn
or option submitted there must refresh Watch Yard with a stale-request notice
without adding old travel/history to the slot. A stale reset confirmation is
also rejected. Read current state in that tab, then use a fresh action normally.
An already completed supported adventure also offers New game and returns to
the same active opening after confirmation.

## Offline failure and busy-request checks

The fixture uses a deterministic local DM and needs no credentials or network:

```powershell
node tests/fixtures/issue-104-server.mjs .\issue-104-offline-save.json
```

Use an unused test filename. The seed is 42. Follow the cancel/confirm checks
above. For publication failure, stop it after a complete reply and restart:

```powershell
node tests/fixtures/issue-104-server.mjs .\issue-104-offline-save.json fail
```

Confirm New game: expect a clear replacement-failed status, focus returned to
New game and the old scene/history/hints preserved. Read current state, stop
with Ctrl+C and restart without `fail`; the verified old slot restores.

For pending stronger hints, use a separate unused test filename:

```powershell
node tests/fixtures/issue-103-server.mjs .\issue-104-pending-hint-save.json
```

Start, open Hints and request a stronger hint. It stays preparing. New game
confirmation must reject replacement and preserve the old game. In another
PowerShell terminal set `$hintControls` to the printed controls URL and run
`Invoke-RestMethod "$hintControls/release/0"`. Wait for the hint result, then
confirm New game again; it succeeds and clears the old stronger result.
During a pending turn New game is disabled in that tab; another tab's reset
is rejected until the complete turn and save finish.

To hold a turn in the offline browser, start with another unused test filename:

```powershell
node tests/fixtures/issue-104-server.mjs .\issue-104-pending-turn-save.json turn
```

Start and submit `Go to Watch Loft`. Input and New game stay disabled with a
waiting reply. Open the printed URL in another tab and confirm New game:
expect the pending-turn rejection. Stop the fixture with Ctrl+C, then restart
without `turn`; recovery reports no committed action and preserves the old
generation. The automated gated-turn test releases the response and also checks
successful replacement after the pending work completes.

Automated checks inject a publication exception and kill real local processes
immediately before/after the atomic replacement rename. Restart recovers the
whole old slot before publication or the whole new slot afterward. They also
check an old recovery journal, both pending hint levels, a pending AI turn,
completed sessions, stale tabs, delayed turn/reset responses and page focus.
Run the focused tests after building:

```powershell
node --test tests/issue-104.test.mjs
```

Real Chromium checks cover keyboard cancellation/confirmation and focus,
preserved/cleared hints and history, reload, stale tabs and rejected replacement.
Live provider wording, audible screen-reader output and hardware/power-loss
durability are outside these checks. The failure contract uses complete synced
files and same-directory atomic rename; abandoned staging files from a killed
process are never treated as save slots.
