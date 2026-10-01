# Issue 97: browser AI conversation

Prerequisites: Node.js 24.x, npm 11.6.4, `npm.cmd ci`, `npm.cmd run build`,
a desktop browser, network access, and a valid `OPENAI_API_KEY` in the launch
environment. Choose a new save filename whose parent directory exists.

```powershell
npm.cmd run browser -- --seed 0 --save .\issue-97-player-save.json
```

Open the printed loopback URL and select **Start adventure**. Expect Hollow
Beacon: Watch Route, Watch Yard, seed 0, HP 20/20, Caravan Deadline Day 0,
and five visible exits. Type these messages in **What do you do or ask?**,
selecting **Send message** and waiting for each complete reply:

- `What can I see?`: expect a description of the visible yard. No action is
  committed, and HP, time, and exits remain unchanged.
- `Ask Iona about the beacon`: expect an attributed Iona reply about the dark
  beacon, approaching caravan, and missing keeper. The result card records
  the conversation; Day 0 and HP 20/20 remain unchanged.
- `Go to the Watch Loft`: expect saved travel, Watch Loft in the location
  field, Pell in view, and the Signal Records Room among the visible exits.
- `Persuade Pell to tell me about his shift`: at seed 0 expect refusal from
  the failed check, attributed to Pell. The failed check is saved, and another
  paraphrase must not reroll it.
- `Enter the Signal Records Room`: expect saved travel and the setting plate
  in view.
- `Compare the setting plate`: expect the authoritative observation that
  the fresh east-cut score differs from the approved fork score. Its author
  and purpose remain unknown. The result card and saved state agree.

Every message appears immediately with **Waiting for a complete reply…**;
the editor, Send, and Read current state controls are disabled while pending.
On completion, the full reply and concise authoritative cards appear, input
becomes usable, and persistent fields refresh. No unsolicited full character
sheet is appended. Tab through the editor and Send to check keyboard access.

Try `Search the secret setting` or `Go to somewhere imaginary`: expect a
rejection or clarification, with no saved action, time advance, or dice draw.
Try `Go to the loft and search the plate`: expect clarification, rejection,
or at most one resolved action; the result cards identify what actually happened.
Live wording and interpretation may vary, but the engine's authority does not.

With an invalid provider key, the initial request reports **AI service failed.
No action was committed.** If the provider fails after an accepted action,
the page reports that the action was saved and must not be repeated, displays
the authoritative result or authored NPC reply, and updates persistent fields.

Stop the launcher with Ctrl+C after the reply completes, then rerun the same
browser command and open its new URL. Expect the saved location and seed;
conversation restoration is a later ticket. To inspect the same slot in the
CLI, stop the browser service and use:

```powershell
npm.cmd start -- --resume .\issue-97-player-save.json
```

Type `journal` and expect the altered-setting observation. Wait for the next
`>` prompt and press Ctrl+C. Do not type `quit`; it closes the saved session.

## Verification

Focused HTTP/storage tests compare each accepted and rejected scripted AI
turn with its corresponding engine route, including complete checkpoint state,
RNG state/position, attributed replies, authoritative result cards, and public
field refresh. Fault checks cover provider failure before/after saving,
multiple tool calls, a second mutation attempt, concurrent turns/starts,
invalid/oversized input, and unrelated origins. Existing issue 96 browser
startup and compatibility checks remain included.

Conversation persistence, response-loss recovery, stale-tab revisions, reset,
and completion review are later tickets. Live provider behavior is not part
of deterministic automated verification.

Verified on 1 October 2026:

- Focused issue 97 checks: 8 passed. The unchanged browser script runs in a
  minimal DOM harness through the real API and storage; the harness asserts
  pending controls, blocked duplicate submission, complete replies, literal
  text rendering, result cards, location/HP refresh, and a single saved action.
- `npm.cmd run verify`: all seven gates passed with zero warnings; 590 tests
  passed with no failures or skips, zero dependency vulnerabilities, and a
  passing clean build/package check.
- Real in-app desktop browser: start, Iona conversation, watch-loft travel,
  Pell's seeded failure, records-room travel, evidence search, public field
  refresh, and provider-failure notice passed. Pending controls and complete
  replies were verified through the accessibility tree. A later browser run
  confirmed concise travel cards and the complete authored Pell refusal after
  correcting a zero-fact AI reply. The sticky status panel remained readable
  alongside the conversation, and focus returned to the editor.
- Standards review: no actionable findings. Spec review: the travel-card
  finding was fixed and re-reviewed; no actionable findings remain.

Live AI wording/authentication was not tested with a paid provider call;
the browser journey used the deterministic server-side model seam.
