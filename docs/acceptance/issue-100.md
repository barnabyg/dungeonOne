# Issue 100 player checks

Prerequisites: Node 24, `npm.cmd ci`, `npm.cmd run build`, and a valid
`OPENAI_API_KEY` supplied in the launch environment. Choose an unused save path
with an existing parent directory. The supported adventure is Hollow Beacon:
Watch Route, content version 4. AI interpretation can vary; use contextual buttons
if a typed request produces clarification.

```powershell
npm.cmd run browser -- --seed 0 --save .\issue-100-player-save.json
```

Open the printed local URL and click **Start adventure**. Expect Watch Yard,
20/20 HP, Day 0, and the saved adventure title and seed. Type separately:

1. `Ask Iona about the beacon` — expect a reply attributed to Iona and a result card.
2. `Go to the Watch Loft` — expect Watch Loft and a travel result card.
3. `Persuade Pell to tell me about his shift` — expect a social result, attributed
   Pell reply, and saved progress; the seeded roll may succeed or fail.
4. `What can I see?` — expect a reply without advancing time or drawing dice.

After a complete reply, reload the page. Expect exactly the same message wording,
NPC labels, replies, ordered cards, and notices. Close the page, stop the launcher
with Ctrl+C, then run the exact command above again and open its new URL. Expect
the same history, location, HP, clock, and saved seed. This browser launcher
automatically continues its slot; it does not use the CLI's `--resume` flag.

Continue with `Go to the Signal Records Room`, then `Search the setting plate`.
Expect new turns appended to the restored history and evidence in **Journal**.
Inspecting history must not change state or repeat social rolls/travel.

For the completed branch, return to Watch Yard, travel via Ridge Trail, search the
broken marker, then travel to Beacon Tower and select **Hold the beacon** from
the ending choices. Expect the ending outcome to be displayed. Reload and restart
again: the ending and conversation remain readable.

For interruption recovery, send an action and stop the process while waiting
for narration after the action has saved. Restart with the same command. If an
action committed, expect its truthful result card and an interruption notice
that says not to repeat it; otherwise expect "No action was committed."
Exact timing is checked deterministically by the automated killed-process test.
Live-provider timing and response wording are not automated.
