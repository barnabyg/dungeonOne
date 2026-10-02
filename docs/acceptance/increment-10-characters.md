# Independent characters: player testing and qualification

Implemented locally on `codex/gameplay-ui`, 2 October 2026. The first version
supports one Fighter per adventure at levels 1–3. It uses explicit
[house rules](../character-rules.md), rather than claiming an exact D&D edition.

## Start and restart

Prerequisites: Node.js 24.x, npm 11.6.4, installed dependencies, a desktop browser,
and `OPENAI_API_KEY` configured in the launch environment for AI gameplay.
Creating characters, browsing sheets, and reviewing completed adventures work
without the provider. Automated browser checks use Microsoft Edge with a
scripted model; live wording can vary, while result cards remain authoritative.

From the project directory:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run browser -- --seed 42 --characters .\.scratch\character-player\characters.json --save .\.scratch\character-player\legacy.json
```

The launcher prints a local URL and opens the browser. Choose **Your characters**,
**Create character**, name **Ada**, preset **Balanced**, then **Save character**.
Expect a level-1 Fighter, Strength 14, Dexterity 12, Constitution 13,
Intelligence 10, Wisdom 11, Charisma 9; HP 19/19, AC 16, attack +3, damage
1d8+1, and 0 XP. Close the library before choosing an adventure and restart:
the saved sheet must still exist. Save a second Fighter and expect both sheets.

Choose Ada and **Start Hollow Beacon**. Expect the levels 1–2 recommendation
and the same saved sheet. **Character** opens scores, modifiers, gear and XP;
opening it never consumes an action, advances time or calls AI.

To test continuation, wait until the reply is complete and input is enabled,
then press Ctrl+C in PowerShell. Restart with the exact same command:

```powershell
npm.cmd run browser -- --seed 42 --characters .\.scratch\character-player\characters.json --save .\.scratch\character-player\legacy.json
```

Expect exact HP, location, remembered rolls, cards and conversation. Do not type
`quit` to test a resumable active journey. Keep `characters.json` and its adjacent
`character-adventures` directory together when copying or backing up progress.
An embedded session without its original current library remains readable in
historical review; restore the original records to continue that identity.

## Hollow Beacon: peaceful completion

Use the offered contextual actions or type these requests one at a time, waiting
for a complete response after each:

```text
Travel to Watch Loft
Travel to Signal Records Room
Search setting plate
Travel to Watch Loft
Travel to Watch Yard
Travel to Valley Road
Search wagon ruts
Travel to Ridge Shelter
Travel to Drainage Walk
Travel to Beacon Tower
Search tower work order
Ask Vey about "Present the work order and setting plate".
Search final warning board
```

Names and the public topic wording should be taken from the current UI. The
checked-in canonical route is in `tests/fixtures/character-journeys.mjs`.
Searching the plate records physical evidence. The valley avoids combat and
crosses the caravan deadline; a final choice records its authored consequences
without inventing a rescue. Report the plate proof through Vey's offered topic
to secure control. Choose the offered **Slower human warning** ending. Expect a terminal
completion card with 1,000 XP credited once, level 1 → 2, maximum HP 19 → 28,
attack +3 → +4, and remaining HP preserved. Opening Review and restarting must
not grant XP again.

In **Your characters**, choose Ada, then **Rest between adventures**. Expect HP
28/28 and available adventure buttons. Choose **Start Stonebridge** (levels 2–3).
Expect Ada's identity, scores, gear, level and XP, with fresh adventure-local
clues, items and clock. Reviewing Hollow Beacon later must not roll back Ada.

## Stonebridge: a second module

Use these offered actions, waiting after each:

```text
Travel to Bridge Archives
Search unlocked archive chest
Take bridge seal
Travel to Toll Yard
Travel to Stonebridge Span
Fit bridge seal in bridge seal socket
```

Choose the offered **Open the crossing** final decision. Expect 1,500 completion
XP, career XP 2,500, level 2 → 3, maximum HP 28 → 37, attack +4 → +5, and a
visible level-3 cap. Rest explicitly before another start. Repeating a module
cannot grant its same stable completion reward again; additional eligible XP
above the cap remains recorded.

## Checks, risk, and cancellation

- From the Hollow Beacon opening, inspect the dark beacon's optional Wisdom
  check. Expect its score modifier, DC 12, zero time cost, one attempt, and 20
  pending XP on success. Failure leaves routine investigation and the complete
  peaceful route available. Reload preserves the result and never rerolls it.
  Other authored checks exercise Strength, Dexterity, Constitution and Intelligence;
  the existing credibility check uses Charisma. AI prose cannot award XP or alter
  scores. Optional rewards can move the final career total above 2,500.
- With a new level-1 character, select Stonebridge and expect an out-of-range
  warning. Deliberately starting is permitted; enemies retain fixed difficulty.
  Unsupported classes, levels and rule versions are rejected by the engine.
- Hollow Beacon's Ridge Trail starts combat immediately. Attack, carried healing
  and cover have their existing explicit costs. At 0 HP the character becomes
  unavailable and pending XP is discarded. The valley remains the combat-free
  alternative. Test restart after a complete combat reply and expect exact HP
  and dice results.
- An active character offers Continue and explicit **Abandon** confirmation.
  Cancel keeps it active. Confirm retains the historical journey, discards pending
  XP and requires rest before a new start. A second saved character may have its
  own active journey. A second tab with a stale request receives a refresh error
  and cannot start a competing adventure or duplicate a reward.

## Legacy compatibility

Use an isolated legacy slot:

```powershell
npm.cmd run browser -- --legacy --seed 42 --save .\.scratch\character-player\legacy-v11.json
```

Expect the original v11 fixed Fighter with 20 HP and original action rules.
The historical sheet explains that scores and level were not recorded. Existing
save formats 1–3 and trace formats retain their original outcomes; no migration
is needed. The generator still produces its previously supported schema.

## Evidence and limits

Focused tests cover rules, standalone creation/cancellation/restart, frozen-sheet
save4/trace6 replay, one-time advancement, interrupted starts and completion
publication, lock recovery, competing turns, stale save copies, pending-XP
abandonment, missing-library review, and two complete journeys through the real
browser, API and files. Package validation initializes a character adventure
from an extracted package in a caller directory containing spaces.

Balance samples use seeds 0–63, all three presets and both inclusive recommended
bounds. For an attack-only basic encounter without cover or healing, surviving
counts are:

| Module / level    | Balanced | Stout | Scout |
| ----------------- | -------: | ----: | ----: |
| Hollow Beacon / 1 |    56/64 | 56/64 | 55/64 |
| Hollow Beacon / 2 |    62/64 | 64/64 | 62/64 |
| Stonebridge / 2   |    62/64 | 64/64 | 62/64 |
| Stonebridge / 3   |    64/64 | 64/64 | 63/64 |

The corresponding peaceful routes complete for every sampled sheet and seed;
failed optional checks do not obstruct them. These are gross balance checks, not
evidence that every risky sequence survives. Hollow Beacon's chained fights and
deadline decisions remain deliberate risks. The legacy progression analyzer's
incomplete-analysis diagnostics for item/combat effects do not prove those
routes; executable journey tests supply the evidence.

Live AI and unfamiliar-player qualification remain pending: no paid provider
budget or external testers have been supplied. Proposed bounded live handoff:
one two-module journey, one failed-check continuation, one combat/restart, one
stale retry, and one attempt to request invented XP, with an agreed spending or
turn cap. Record provider/model, token cost, authoritative outcomes and any
misleading narration. Ask an unfamiliar player to create a sheet, understand the
range warning and advancement card, resume, and choose a second module; record
observations separately from scripted/implementer evidence.
