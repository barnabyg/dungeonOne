# Issue 86: Iona's trust and the safe-signal claim

Hollow Beacon content v6 (`adventures/hollow-beacon-trust.json`) uses schema 11,
rules `chapel-clues-rules-v12`, engine v16, prompt v19 and tools v16.
The browser launcher starts this release for empty slots and confirmed New game.
Released v4 and v5 slots retain their content, rules, history and RNG; the old
assets are unchanged. Earlier CLI adventures remain supported.

## Browser player check

Prerequisites: Node 24.x, npm 11.6.4, installed dependencies, a desktop browser,
and `OPENAI_API_KEY` in the launcher environment with provider network access.
Use a fresh slot directory. From PowerShell:

```powershell
Set-Location C:\docs\git\dungeonOne
npm.cmd run build
New-Item -ItemType Directory -Force .\.scratch\issue-86-player | Out-Null
npm.cmd run browser -- --seed 1 --save .\.scratch\issue-86-player\slot.json
```

Open the printed URL and select **Start adventure**. Expect Watch Yard, Day 0
and full HP. Select **Captain Iona**: her current neutral relationship is shown.
**Persuade: Claim the familiar signal is safe** shows one d20 + 0, DC 12,
no rerolls, 0 days and the relationship consequences before selection.
Choose it or type this single message:

```text
Tell Captain Iona the familiar signal is safe.
```

Seed 1 rolls 13 and succeeds. Expect Iona's attributed acceptance, a result card
showing d20 13 / DC 12 / success, trusted relationship, and a **Beliefs** journal
entry named **Iona accepted the safe-signal claim**. It records her private
belief then, not an observed safe signal or rescue. The claim option disappears;
a repeat cannot roll again. To inspect her changed response, type:

```text
Ask Captain Iona about how the watch responds.
```

Expect provisional trust in your assurance and a lead to the plate. After the
complete reply and enabled composer, press Ctrl+C in the launcher. Restart:

```powershell
npm.cmd run browser -- --seed 1 --save .\.scratch\issue-86-player\slot.json
```

The slot continues automatically at the newly printed URL with the same belief,
relationship, history and dice. Browser mode has no `--resume` flag.
Type these separately, waiting for each complete reply:

```text
Travel to Watch Loft
Travel to Signal Records Room
Search beacon setting plate
Travel to Watch Loft
Travel to Watch Yard
```

Expect **Observed evidence** for the altered setting, attributed to the plate.
Day remains 0; no culprit or keeper/caravan fate is established. Select Iona,
read the no-dice/0-day stakes of **Correct the safe-signal claim with the setting
plate**, then choose it. The typed equivalent is:

```text
Show Captain Iona the setting plate correction.
```

Expect Iona to withdraw any acceptance of the claim and trust the honest
correction. No new die appears. **Testimony** records **Iona corrected the
safe-signal belief**. The earlier **Beliefs** entry remains as a historical
record, with a current lead recognizing the correction. Ask how the watch
responds again: she no longer believes the familiar signal is safe.

For refusal use another fresh slot, seed 0:

```powershell
npm.cmd run browser -- --seed 0 --save .\.scratch\issue-86-refusal\slot.json
```

The same claim rolls 6 and fails, making Iona hostile. Her reply gives explicit
plate and camp survey/frame leads. Repeat the plate journey and correction:
trust recovers without another check. Sera and Pell do not acquire this private
claim or correction. Their investigation routes, the beacon, keeper and caravan
remain independent; no finale is added.

Keep an old tab open before a claim or New game: old options are rejected with
refreshed state. If narration fails after the claim, the check/result are saved;
read current state and continue without repeating it. Pending turns prevent
New game replacement. Confirmed replacement clears history and changes generation.

## Regression adapters and automated evidence

`tests/issue-86.test.mjs` covers acceptance/refusal at the runtime boundary,
exactly one draw, independent world/NPC state, physical recovery, journal
classes, and ambiguous, compound, hidden, dead, stale and wrong-approach AI
rejection without mutation or RNG. CLI seeds 0 and 1 compare split-session
state/RNG with uninterrupted routes and verify linked traces after restart.

The real Edge/Chromium test drives the shipped page, HTTP API and save authority.
Typed/clicked claim and correction routes have identical checkpoints. It injects
narration failure after the saved check, tries stale clicks/current-revision
retries, restarts before correction without provider calls, checks attribution
and Journal, holds a correction reply while reset is rejected, and rejects an
old-generation claim after New game. Local hints and current leads exclude stale
claim offers and recognize the correction. Tests own temporary slots, dynamic
ports and browser instances. The suite is offline.

For the CLI adapter, use a separate slot:

```powershell
node .\dist\cli.js --adventure-file .\adventures\hollow-beacon-trust.json --seed 1 --save .\.scratch\issue-86-cli\slot.json
```

Enter `talk iona safe-signal persuade`; wait for `>`, then Ctrl+C. Resume:

```powershell
node .\dist\cli.js --resume .\.scratch\issue-86-cli\slot.json
```

Enter `move watch-loft`, `move signal-records`, `search setting-plate`,
`move watch-loft`, `move watch-yard`, `talk iona correct-signal ask`, then
`journal`, separately. Expect the same claim, plate observation and correction.
`quit` closes the session; Ctrl+C preserves it. CLI and trace replay are regression
adapters, not the primary player handoff or a browser replay feature.

Live-provider paraphrase quality and unfamiliar-player acceptance remain
unverified; deterministic fixtures verify orchestration and recovery.
