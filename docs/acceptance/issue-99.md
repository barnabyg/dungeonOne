# Issue 99: contextual browser actions

Requires Node 24, installed dependencies (`npm.cmd ci`), a build
(`npm.cmd run build`), network access, and `OPENAI_API_KEY` in the launch
environment. Choose an unused save filename for a fresh run.

```powershell
npm.cmd run browser -- --seed 0 --save .\issue-99-player-save.json
```

The launcher opens Hollow Beacon: Watch Route at its printed local URL.
Click **Start adventure**. The opening shows Watch Yard, Day 0, and 20/20 HP.

## Browser journey

1. Click **Captain Iona**. Only her current topics appear beside the scene.
   Click **Ask about the beacon and watch leads**. One explicit request appears with a
   waiting indicator, followed by Captain Iona's attributed dialogue and
   authoritative result cards. The requested subject stays with that speaker.
2. Open the same printed URL in a second tab and leave its current scene there.
3. In the first tab, click the **Watch Loft** exit. Travel submits immediately;
   location and current people refresh after the saved result. Day remains 0.
4. In the second tab, click its old **Watch Loft** exit. Expect a rejection
   stating the option is no longer available and refreshed Watch Loft context.
   No AI call, time cost, save change, or dice draw occurs.
5. In the first tab, select **Pell** and **Persuade: Ask about the last signal shift**.
   Seed 0 fails this check, keeping his account undisclosed.
   The NPC reply retains Pell's attribution. This consumes one engine-owned
   dice draw; the same typed request produces the same result.
6. Click **Signal Records Room**, select **beacon setting plate**, then
   **Inspect**. Expect the visible plate's description without advancing time.
   Select the plate again, then **Search**. The altered setting is recorded
   as observed evidence; the journal refreshes without asserting a culprit.
7. Use Tab and Enter or Space to select a target and activate an offered action.
   While waiting, other turn controls are disabled. Close options or Escape
   returns focus to the scene.
   A draft in the message composer survives a contextual action or stale rejection.

On desktop windows wider than 1050 pixels, the composer stays within the
viewport even after a long conversation or when options are open. Location,
scene description, status, and exits occupy the left column. Visible targets,
contextual options, and player information occupy the right column. The
centre holds only conversation and the composer. Side columns flow naturally
with the page; only conversation history has an internal scroll area. Option
buttons have visible gaps; the underlined **Close options** control sits in
the panel heading. Open the journal and scroll the page to check that the
central composer remains accessible while reading a longer side column.
Check at 1280×720, 1920×1080 (including a scaled 4K desktop), and 3840×2160.
Smaller windows retain the vertically scrolling responsive layout.

Button text uses the current public target and subject names; exit labels may
also include their travel cost. Typed equivalents can be copied from each
clicked request in the conversation.

## Ending branch

In a fresh run, type these messages separately, waiting for each reply:

```text
Travel to Keeper's Path
Search the damaged shutter latch
Travel to Watch Yard
Travel to Ridge Trail
Search the broken marker post
Travel to Beacon Tower
```

The ridge journey advances to Day 2. Select **Ending choices** at the tower.
Read the public stakes for each currently offered choice. Opening these
options does not choose an ending. **Hold the beacon** explicitly requests
that choice, saving the watch's safe-stop resolution. Asking what the choices
are cannot authorize the AI to resolve one.

For a restart, wait for the completed reply, press Ctrl+C in the launcher,
and rerun the exact start command above. The browser reads the occupied slot
and restores canonical progress. Conversation restoration remains outside
this ticket. Do not issue `quit` when preserving a resumable session.

## Verification

`tests/issue-99.test.mjs` compares API clicks with typed turns, saved canonical
checkpoints, RNG, cards, and dialogue; rejects old and forged offers without
calling AI; and verifies ending stakes, explicit consent, and prevention of
AI substitution. Existing browser, CLI, replay, and format checks remain gates.

The checked-in real-browser journey runs the shipped page in Edge with
scripted AI through the real HTTP server and save storage. It covers native
keyboard travel, dialogue with a real dice draw, inspection, search, and
rejection of a second tab's stale intent. It compares clicked and typed
checkpoints and result cards after every turn. Supply an installed Playwright
entry point (the Codex bundled runtime can provide one):

```powershell
node .\docs\acceptance\issue-99-browser.mjs 'C:\Users\bob\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs'
```

Scripted-AI browser checks do not qualify live-provider interpretation or
network reliability; the manual journey above covers the configured provider.
