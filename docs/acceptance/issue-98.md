# Issue 98: player information beside the conversation

Prerequisites: Node.js 24.x, npm 11.6.4, `npm.cmd ci`, `npm.cmd run build`,
a desktop browser, network access, and a valid `OPENAI_API_KEY` in the launch
environment. Choose a new save filename whose parent directory exists.
The browser selects Hollow Beacon: Watch Route (content version 4).

```powershell
npm.cmd run browser -- --seed 0 --save .\issue-98-player-save.json
```

Open the printed loopback URL and select **Start adventure**. Expect Watch
Yard, Day 0, HP 20/20, and visible exits. Select each information button:

- **Inventory**: no equipment and no carried items. No invented items.
- **Character**: HP 20/20 and session playing; only supported current values.
- **Journal**: Dark beacon under Observed evidence; Testimony and Beliefs
  explicitly empty. Current leads mention Pell and the setting plate.
- **Known leads**: the same current leads without the rest of the journal.

Opening or switching focuses the panel heading. Close information or Escape
returns focus to the button for that panel. Tab to the buttons and use Enter
or Space to activate them. No navigation adds conversation entries. Scroll
the conversation to an older reply, open/switch/close panels, and expect that
position to remain. Location, exits, time and HP remain alongside the panels.

Type these messages separately in **What do you do or ask?**, waiting for
each complete reply. Keep Journal open to check automatic refresh:

- `Ask Iona about the beacon`: expect attributed dialogue about the dark
  beacon and approaching caravan; Day 0 and HP 20/20 remain unchanged.
- `Go to the Watch Loft`: expect saved travel and Pell in view.
- `Enter the Signal Records Room`: expect the setting plate in view.
- `Compare the setting plate`: expect Altered beacon setting under Observed
  evidence, attributed to the beacon setting plate. Its author and purpose
  remain unknown. Current leads replace the original visit-and-compare lead
  with reporting the alteration to Iona and deciding at the tower.
- `Return to the Watch Loft`: expect the changed return description and
  retained evidence. Reading panels must not duplicate discoveries.
- `Wait three days`: expect Day 3, the missed caravan turn, Pell absent
  from the loft, and the altered-setting lead describing late rescue through
  the valley. No rescue or keeper safety is claimed.
- `Go to the Watch Yard`: expect Pell at Iona's post, current exits and
  Day 3. Journal evidence remains attributed to its original source.

Repeat all panel reads before discovery and after the return visit. Expect
unchanged HP/time/location, conversation entries, and saved progress. A
completed turn follows new replies when reading the bottom of the log;
reading older replies during a pending response does not force scrolling.

Stop the launcher with Ctrl+C after a complete reply. Rerun the same browser
command and open its new URL: panels reflect saved progress; conversation
restoration remains a later ticket. For CLI inspection, stop the browser:

```powershell
npm.cmd start -- --resume .\issue-98-player-save.json
```

Type `journal`, `inventory`, and `status` separately; expect the same facts,
empty inventory, and HP. Wait for the next `>` prompt, then press Ctrl+C.
Do not type `quit`; it closes the saved session.

## Verification

Automated checks exercise the actual API and verified save with scripted AI
through conversation, discovery, a return visit, and the Day 3 relocation.
Repeated reads preserve the entire save byte-for-byte, including RNG state
and position, and provider-call count. The shipped browser script also runs
in a DOM harness checking classifications, empty/populated inventory, lead
refresh, local navigation without requests, focus, and preserved scroll.

Real in-app desktop browser journey on 1 October 2026: initial inventory and
journal, Iona dialogue, loft/records travel, discovery with journal open,
return visit, and Day 3 relocation passed. After the return visit, repeated
panel reads kept the save SHA-256 identical and provider calls at 10. Keyboard
Space opened Inventory; Escape restored its button focus. A scrolled
conversation remained at 653.33 pixels with 24 entries across open/close.
Deadline refresh removed Pell from the loft and updated the late-rescue lead.
Restarting the service with the same slot retained the evidence and Day 3
position. The status remained visible with Journal open at desktop and
narrow desktop widths.

`npm.cmd run verify` passed all seven gates with zero warnings: 592 tests
passed, none failed or skipped, dependency/security checks passed, and clean
build/package validation passed. Standards and Spec reviews had no remaining
actionable findings.

Live paid-provider wording and authentication were not tested; the real
browser journey used the deterministic server-side model seam. Existing save
formats, CLI and game mechanics are unchanged. Cross-tab synchronization,
conversation restoration, and broader character mechanics are out of scope.
