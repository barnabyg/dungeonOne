# Issue 102: cached, optional hints

Prerequisites: Node 24.x, npm 11.6.4, `npm.cmd ci`, `npm.cmd run build`,
a desktop browser, and a valid `OPENAI_API_KEY` in the environment for AI turns.
Hints themselves use no provider. Choose an unused save path in an existing directory.
The browser selects Hollow Beacon: Watch Route, content version 4.

```powershell
npm.cmd run browser -- --seed 0 --save .\issue-102-player-save.json
```

Open the printed local URL and select **Start adventure**. Expect Watch Yard,
Day 0 and HP 20/20. Hints starts collapsed. Open **Hints**: expect the public
objective, known leads and currently legal actions. It must not claim that the
setting has been altered, identify a culprit, or establish the keeper's fate.
Close and reopen several times, including keyboard activation and Escape.
Expect identical guidance, restored button focus, unchanged conversation and
scroll position, location, clock and HP.

Type these separately, waiting for each complete reply:

1. `Go to the Watch Loft` — saved travel; hints refresh to local exits and Pell's
   available topics. Iona is no longer offered as a local conversation.
2. `Enter the Signal Records Room` — saved travel; the setting plate is a legal
   search target, with no fabricated search result.
3. `Compare the setting plate` — altered-setting evidence appears in Journal;
   hints use the changed known leads without identifying who altered it.
4. `Return to the Watch Loft` — local guidance and known evidence remain current.
5. `Wait three days` — Day 3; Pell is absent from the loft and no hint offers
   talking to him there. The journal can still mention him as a known lead.

Use contextual buttons if the provider asks for clarification. Hints never
executes its listed actions. Inventory, Character and Journal remain usable.
Reload: Hints is collapsed; reopening shows saved guidance. Stop with Ctrl+C
after a complete reply and run the exact launch command again. The browser
automatically continues that save path; no CLI `--resume` flag is needed.
Expect identical saved guidance, history, state and RNG, with Hints collapsed.

## Deterministic real-browser delay and failure journey

This fixture requires no credentials or provider access. It has a separate
loopback control service used only for testing; neither service uses fixed ports.

```powershell
node tests/fixtures/issue-102-server.mjs .\issue-102-fixture-save.json
```

Use an unused save filename. Copy `url` and `controls` from its printed JSON.
Open `url` in a real browser and set `$hintControls` to the printed controls URL
in a second PowerShell terminal. **Start adventure**, leaving Hints closed.
`Invoke-RestMethod "$hintControls/snapshot"` reports one queued preparation,
zero provider calls, sequence 0, RNG position 0, and only public candidate strings.
Release that job with `Invoke-RestMethod "$hintControls/release/0"`.
After preparation, opening/reopening Hints must be immediate, show the same
strings and preserve checkpoint, provider count and job count.

Click **Watch Loft (0 days)** with Hints closed. Snapshot reports job 1, two DM
calls, sequence 1 and RNG 0. Release job 1, then open Hints: Pell is available;
Iona is not. Reload and expect the panel closed. For restart, use
`Invoke-RestMethod "$hintControls/restart"`, navigate to its new `url`, and
expect the same cached guidance and unchanged counts. For a complete process
restart, stop the fixture with Ctrl+C and rerun the exact fixture command;
its counters reset, with zero jobs/calls until new gameplay.

Close Hints, travel to Watch Yard (job 2), then Watch Loft (job 3), keeping
both preparations pending. Release job 3 first, then job 2. Open Hints: only
Watch Loft guidance appears. Snapshot must retain the latest hint revision,
sequence 3, six DM calls and RNG 0. The late Yard result cannot overwrite it.

Travel to Watch Yard (job 4) with Hints closed. Save a snapshot, then run
`Invoke-RestMethod "$hintControls/fail/4"`. Hints stays hidden. Open it: expect
**Hints unavailable for this position** with saved-progress guidance. Journal
and Character still work; the conversation still reports Action saved.
Compare snapshots: checkpoint (including state, time and RNG), transitions and
provider-call count are identical. Only the derived hints cache changes.
Reload/restart and expect the same unavailable cache, without a new job.

Executed on 2026-10-01 using Codex's real Chromium in-app browser: hidden
preparation, repeated viewing, reload/server restart, out-of-order results and
failure all passed. API/storage tests additionally check discovery, return visits,
the deadline, invalid cache rejection and compatibility with saves lacking hints.
Live AI wording and live-provider outages are not exercised by this fixture.
