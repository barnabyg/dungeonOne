# Issue 105: completed adventure review

Prerequisites: Node.js 24, `npm.cmd ci`, `npm.cmd run build`, and an
`OPENAI_API_KEY` set in the launch environment for normal AI play. Start the
bundled Hollow Beacon: Watch Route with seed 0 and a fresh save path:

```powershell
npm.cmd run browser -- --seed 0 --save .\issue-105-player-save.json
```

Open the printed local URL and select **Start adventure**. Send these messages
one at a time, waiting for each complete reply:

1. `Travel to Keeper Path` — location becomes Keeper Path.
2. `Search the latch` — an authoritative result records the keeper-path lead.
3. `Travel to Watch Yard` — location becomes Watch Yard.
4. `Travel to Ridge Trail` — location becomes Ridge Trail.
5. `Search the broken marker` — the journal records the ridge evidence.
6. `Travel to Beacon Tower` — location becomes Beacon Tower; **Ending choices**
   offers the available signal and refusal/departure choices with public stakes.
7. Select **Ending choices**, read the stakes, and click **Hold the beacon**.
   The authoritative ending reports the current signal consequences and that
   the keeper remains missing. No future keeper resolution is invented.

The sidebar now says **Review mode**. Message input and Send are disabled;
there are no scene action buttons. Inventory, Character, Journal, Known leads,
location, time and HP remain readable. Opening Hints explains that interaction
is closed; no stronger hint can be requested. The final conversation and ending
result card remain visible. Reload and check that the same history returns.
Stop the launcher with Ctrl+C after the reply completes, run the exact same
start command, and open its new URL: the completed save automatically restores
the same review state (browser mode has no `--resume` flag).

Use a different fresh save path for each repeat. At step 7, type
`Resolve Refuse the watch` or click **Walk away from the watch**: the result says
the signal remains unresolved or was abandoned, without claiming a rescue.
Both routes close interaction and preserve readable review information.
Typing `What are my choices?`, `Do not refuse the watch`, or `Maybe hold the
beacon` before choosing must not end the game. An old tab sending a question
after another tab completes refreshes the ending without changing the save.

For a deterministic offline browser check, the fixture prepares a signal-ready
save through actual engine actions (use a fresh path):

```powershell
node tests/fixtures/issue-105-server.mjs .\issue-105-offline-save.json
```

Open the printed URL, choose an ending and run the review/reload checks above.
For a post-commit provider failure, add `fail` to that command with another
fresh save path. The ending card and saved notice remain, and reload restores
them. The fixture uses a bounded scripted model; it does not test live provider
interpretation. Automated tests additionally drop ending responses, kill a
process after commit, complete delayed hint preparations, and submit direct
API/stale-tab requests while checking exact save bytes, transition counts,
provider counts, time and RNG preservation.
