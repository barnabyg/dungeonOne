# Issue 103: explicit stronger hints

Prerequisites: Node 24.x, npm 11.6.4, `npm.cmd ci`, `npm.cmd run build`,
a desktop browser, and `OPENAI_API_KEY` in the launch environment for live
gameplay. Both hint levels themselves use no provider. Choose an unused save
filename in an existing directory. The browser selects Hollow Beacon: Watch
Route, content version 4, seed 0.

```powershell
npm.cmd run browser -- --seed 0 --save .\issue-103-player-save.json
```

Open the printed URL, **Start adventure**, then open **Hints**. Expect the
baseline objective, leads and legal options; no stronger nudge appears until
you select **Request a stronger hint**. Use Tab to reach the button and
Enter/Space to activate it. Its result is a polite, atomic live status.
The opening nudge points toward Watch Loft and asks what information is missing.
It does not name a travel command or prescribe an exact next action.
It cannot identify an undiscovered culprit, claim the setting has been altered,
or establish the missing keeper's fate. The guidance is a suggestion, not a
guaranteed result. Location, Day 0, HP 20/20, inventory and conversation remain
unchanged. Close/reopen Hints: the same stronger guidance is immediate and the
button is disabled because this position already has a result.

Type these separately, waiting for each complete reply:

1. `Go to Watch Loft` — saved travel. The old stronger guidance disappears;
   request a new nudge highlighting Pell alongside the Signal Records Room,
   asking how those sources might fit together. It does not select a topic.
2. `Enter the Signal Records Room` — saved travel. Request a stronger hint;
   it points out subjects in a current lead without instructing you to search
   the setting plate or supplying its result.
3. `Compare the setting plate` — the journal records discovered evidence.
   Guidance may refer to current public leads, without inventing a culprit.
4. `Return to Watch Loft` — guidance uses this position's current facts.
5. `Wait three days` — Pell leaves the loft. A new nudge must not offer a
   conversation with him there, even though he remains a known journal lead.

Reload: Hints starts collapsed; reopen it to see the cached stronger result.
After a complete reply, stop the launcher with Ctrl+C and rerun the exact
launch command above. It automatically resumes that save path; no CLI
`--resume` flag is needed. Expect identical gameplay, conversation and guidance.
When the adventure has ended or no information-gathering action is available,
requesting a stronger hint explains that current knowledge cannot justify a
next step, without revealing a solution.

## Offline browser delay, failure and stale-result checks

No credentials or provider access are needed for this fixture. Its controllable
preparer receives only approved public candidate strings and no game tools.

```powershell
node tests/fixtures/issue-103-server.mjs .\issue-103-fixture-save.json
```

Use an unused filename. Open the printed `url`, and in a second PowerShell
terminal set `$hintControls` to the printed `controls` URL.

1. **Start adventure**, open/reopen **Hints**. Run
   `Invoke-RestMethod "$hintControls/snapshot"`: expect zero jobs, zero DM calls,
   sequence 0, RNG 0. Baseline viewing never escalates.
2. Request a stronger hint with Enter/Space. Expect **Preparing a stronger
   hint…** and a disabled request button; gameplay and other panels still work.
   Snapshot now has one public candidate job. Run
   `Invoke-RestMethod "$hintControls/release/0"`. The result appears in Hints
   automatically; checkpoint, transitions and provider-call count stay unchanged.
3. Close/reopen, reload, and reopen Hints. Expect the same cached result and
   unchanged counters. Run `Invoke-RestMethod "$hintControls/restart"`, navigate
   to its new `url`, and reopen Hints. The result restores without another job.
4. Click **Watch Loft (0 days)**, request its stronger hint (job 1), then travel
   back using **Watch Yard (0 days)** while preparation is pending. Request the
   Yard hint (job 2). Release job 1:
   `Invoke-RestMethod "$hintControls/release/1"`. It cannot show Pell's guidance
   in the Yard; the current request continues waiting. Snapshot has sequence 2,
   four DM calls, three hint jobs, RNG 0.
5. Record the snapshot, then run
   `Invoke-RestMethod "$hintControls/fail/2"`. Expect **Stronger hint unavailable
   for this position** in Hints. No provider exception details appear. Checkpoint,
   inventory, time, RNG and conversation are unchanged; only the derived cache
   updates. Restart/reload restores this unavailable result without regeneration.

For a full process restart stop the fixture with Ctrl+C and rerun its command;
fixture counters reset, while the saved result restores without a new request.

Executed on 2026-10-01 in real Chromium: keyboard activation, explicit
escalation, automatic waiting/result display, public grounding, repeated viewing,
reload, server restart, out-of-order preparation and failure all passed.
HTTP/page-script/storage tests additionally check duplicate/stale requests,
exact preservation of the save outside the optional hint cache, invalid content
rejection, and the no-justified-action explanation. Live AI wording and audible
screen-reader output were not tested; the native button and live-region semantics
were checked in the browser. Guidance follows public lead names heuristically;
it does not solve or rank hidden adventure outcomes, select a dialogue topic,
or prescribe a sequence of actions. Older optional stronger-hint wording is
discarded without changing or rejecting the saved adventure; request the softer
nudge explicitly after updating.
