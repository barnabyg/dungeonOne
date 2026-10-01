# Issue 101 recovery checks

Prerequisites: Node 24, `npm.cmd ci`, `npm.cmd run build`, and a valid
`OPENAI_API_KEY` in the launch environment. Choose a new save path with an
existing parent directory. This starts Hollow Beacon: Watch Route, version 4.

```powershell
npm.cmd run browser -- --seed 0 --save .\issue-101-player-save.json
```

Open the printed URL and click **Start adventure**. Type each message separately:

1. `Go to the Watch Loft` — expect Watch Loft, one travel card, and saved progress.
2. `Persuade Pell to tell me about his shift` — expect the social result, a Pell
   reply, and refreshed character/journal panels. The action draws seeded dice.
3. `What can I see?` — expect an AI reply from the preserved position.

Open the same URL in a second tab before sending an action in the first tab.
Send the first action, then send a message from the older second tab. Expect a
stale-request notice and refreshed history/location, with no additional action.
While a reply is pending, reload: expect a pending notice. Use **Read current
state** after the reply finishes; do not repeat the pending action.

If the provider fails before an action, expect “No action was committed”; retry
after the provider returns. If it fails after an action, expect its result card,
authored NPC reply where applicable, saved position, and “do not repeat it”.
Later ordinary-language messages still use AI. There is no browser command mode.

If the connection drops, restore it and use **Read current state**. The loaded
history identifies whether the action committed. A local save failure identifies
what position is durable and retains the result. Repair storage, then use
**Read current state** to publish that same result without another AI call. Do
not delete the `.recovery` file: it contains a synced result that has not yet been
published to the main slot. If both journal and primary writes fail, the only
copy of the new result may be in the running process; keep that launcher running
until recovery succeeds. No durable save is claimed for that position.

Stop the launcher with Ctrl+C and restart with the exact launch command above;
open its new URL. Expect verified state, RNG, result cards and history from the
saved position. Browser continuation uses the save path automatically rather
than a `--resume` flag. Use only one launcher per slot.

Automated evidence: `tests/issue-101.test.mjs` executes the real page script
against HTTP/storage for response loss and concurrent tabs, injects provider and
filesystem publication failures, and kills actual processes before commit and
after a random social commit. Verified checkpoint/state/RNG comparisons prove
recovery does not repeat an action. The save verifier replays validated engine
transitions; browser conversation remains display data. Browser mode does not
export diagnostic traces, so these checks make no new trace replay claim.
Live provider timing and native browser screen-reader behavior remain manual.
