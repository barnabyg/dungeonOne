# Issue 96: local Hollow Beacon browser launch

## Player checks

Prerequisites: Node.js 24.x, npm 11.6.4, a desktop browser, `npm.cmd ci`,
`npm.cmd run build`, and `OPENAI_API_KEY` supplied in the launch environment.
Use a new filename for a fresh slot; the parent directory must exist.

```powershell
npm.cmd run browser -- --seed 0 --save .\issue-96-player-save.json
```

Expect a loopback URL with an available port and an attempted browser open.
If no window opens, paste that URL into your browser. The empty slot offers
**Start adventure**. Use Tab to reach that button, confirm visible focus, and
press Enter. Expect Watch Yard, seed 0, HP 20/20, Caravan Deadline Day 0, a
Day 3 deadline, and five visible exits (Refugee Camp, Keeper's Path, Ridge
Trail, Valley Road, Watch Loft). Iona and the watch notice are in view.
The scene occupies the main column; location, HP, time, and exits stay
visible in the sticky status column while reading a long scene.

Select **Read current state** or reload: expect the same opening, with no
Start button or replacement. Stop the launcher with Ctrl+C and rerun the
same command: expect the same occupied slot and seed. A new ephemeral URL
is printed after each restart; open that URL.

There are no in-game text commands in this browser slice. To check CLI
interoperability and changed-state reading, stop the browser launcher and run:

```powershell
npm.cmd start -- --resume .\issue-96-player-save.json
```

Type these commands inside the CLI:

- `wait days 3`: expect Day 0 → Day 3, the caravan deadline event, and Pell's
  departure from the watch loft. Wait for the next `>` prompt, then press
  Ctrl+C to preserve a resumable session.

Restart the browser with the first command. Expect Day 3 and no Ridge Trail
in visible exits. The scene describes the missed turn; no rescue is claimed.
To resume that same save in the CLI again:

```powershell
npm.cmd start -- --resume .\issue-96-player-save.json
```

Do not use `quit` for this restart check: it closes the saved session.

Run without `OPENAI_API_KEY`: expect a setup error, no listening URL, and no
new save. An invalid occupied file must produce an error while preserving
its exact bytes. Earlier Hollow Beacon content and other adventures remain
available in the CLI; the browser opening supports Watch Route version 4.

## Implementation and verification

The browser service binds only to 127.0.0.1 at an OS-selected free port.
Mutation requests require the exact origin and host. No arbitrary file
paths, credentials, adventure snapshots, hidden thresholds, or engine state
are served. Scene and character data use existing public projections; a
separate public clock projection avoids changing historical AI trace output.
Initial saves publish a synced complete file atomically with exclusive
creation; ordinary save updates retain their existing behavior and format.

Focused automated HTTP/storage tests cover start/read/restart, preserved
occupied seed, concurrent starts, corrupt and incompatible slots, authoritative
time and exits after CLI progress, origin/host rejection, absent configuration,
safe asset routing, and browser-open failure fallback.

Verification on 1 October 2026:

- `npm.cmd run typecheck`: passed.
- `node --test tests/issue-96.test.mjs`: 10 passed, including shutdown with a
  speculative browser connection.
- `npm.cmd run verify`: all seven gates passed with zero warnings; 582 tests
  passed, zero failures, zero skips, and zero dependency vulnerabilities.
- Real headless desktop Chrome at 1440 × 1000: browser → loopback service →
  verified save start/read passed. Tab/Enter started the slot with visible
  focus, the scene and five exits matched authoritative state, reload preserved
  the file, Day 3 progress changed time and removed the ridge exit, and a
  restarted service preserved seed 0 despite requesting seed 999. Sticky
  status remained visible while scrolling; the 720px layout had no horizontal
  overflow. No page script errors occurred. The check also exposed and
  verified the fix for shutdown hanging on Chrome's speculative connection.
- Code review: Standards and Spec axes found no actionable code findings.

AI authentication validity and live model behavior are outside this slice;
start/read does not make a provider request. Conversation restoration and
gameplay input remain for later tickets.
