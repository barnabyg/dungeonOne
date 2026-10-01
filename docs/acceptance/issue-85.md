# Issue 85: Refugee route player checks

Hollow Beacon v5 uses schema 10 / chapel-clues-rules-v11. V4 content and
saved outcomes are preserved. New games through the browser launcher use v5;
occupied v4 slots continue automatically, including completed Review mode.
Camp and tower choices continue play. The expanded adventure finale belongs
to later tickets; no choice in this release confirms a rescue.

Prerequisites: Node 24.x, npm 11.6.4, installed dependencies, a desktop browser,
and OPENAI_API_KEY in the launcher environment with provider access. Automated
browser qualification uses Edge on Windows and Playwright Chromium elsewhere.

```powershell
Set-Location C:\docs\git\dungeonOne
npm.cmd run build
New-Item -ItemType Directory -Force .\.scratch\issue-85-player | Out-Null
npm.cmd run browser -- --seed 0 --save .\.scratch\issue-85-player\slot.json
```

Use an empty slot for a new game; open the printed URL and select Start adventure.
Wait for each complete response before the next action.

1. Travel to Refugee Camp. Sera, camp signal survey and Refugee Overlook are
   public leads. Select Sera and Ask what the keeper said. Journal shows her
   warning as testimony and her pursuer suspicion as a contested belief.
2. Select Sera and Refuse help and mistrust the claim. Revisit her warning:
   she acknowledges refusal but still points to the physical leads. Alternatively
   select Help the group make room; a return acknowledges that help without
   inventing a rescue. Leaving by any visible exit remains possible.
3. Search camp signal survey, travel to Refugee Overlook and search sighting
   frame. Journal records observations sourced to those objects. The changed
   alignment makes an unverified familiar signal dangerous, without establishing
   a culprit or keeper fate. No watch conversation is required.
4. Return via Refugee Camp and Watch Yard to Watch Loft and Signal Records Room.
   Search beacon setting plate. Compare the two physical routes in Journal and
   Known leads. Repeat on a fresh slot in the opposite order.
5. At the camp, type `Wait 3 days`. Sera leaves for Valley Road after Day 3;
   the survey and overlook remain visible. Revisit the camp description and
   Journal. Baseline Hints and Request a stronger hint use only current public
   leads, with no clock advance, provider request or conversation turn.
6. Travel to Valley Road (4 days), then Beacon Tower. Select Tower Runner and
   try each provisional instruction: hold, light, refuse and leave. Each records
   its instruction, keeps exits and input available, and claims no completed
   rescue. Continue back through Valley Road and Watch Yard to either clue route.

Typed alternatives use the same authorized actions: `Travel to Refugee Camp`,
`Search camp signal survey`, `Travel to Refugee Overlook`, `Search sighting frame`.
For a failed interaction, select Persuade: Ask for the refugee journey account
before other conversations. Seed 0 fails once; the survey remains available.

Stop the launcher with Ctrl+C after a completed response, then restart exactly:

```powershell
npm.cmd run browser -- --seed 0 --save .\.scratch\issue-85-player\slot.json
```

The printed URL may change. The occupied slot resumes automatically with the
same scene, clock, evidence and saved history. Keep a second tab to check that
old revision-bound actions are rejected and refreshed. Confirmed New game
replaces this disposable slot with v5; cancel preserves it.

For an existing completed v4 Watch Route browser save, launch using its save
path. Expect its original ending and Review mode, disabled gameplay, readable
journal and history. No v5 evidence is added to that save.

## CLI regression adapter

```powershell
npm.cmd start -- --adventure-file .\adventures\hollow-beacon-refugees.json --seed 0 --save .\.scratch\issue-85-player\cli-slot.json
```

Type these separately:

```text
move refugee-camp
talk sera account persuade
search camp-survey
move refugee-overlook
search sighting-frame
journal
```

Expect one failed social check, then independent observed alignment evidence.
At the next `>` prompt press Ctrl+C; `quit` closes the saved session. Resume with:

```powershell
npm.cmd start -- --resume .\.scratch\issue-85-player\cli-slot.json
```

Then type `move refugee-camp`, `wait days 3`, `look`. Expect Sera's departure and
continued access to the physical evidence. Optional casualty test on a separate
slot: `move refugee-camp`, `attack sera`, `attack sera`, `look`, `search camp-survey`.
Seed 0 kills Sera; the survey and overlook survive.

## Automated evidence and limits

`tests/issue-85.test.mjs` covers seeded command/scripted-AI parity, both physical
clue orders across CLI process restarts and ordered trace replay, refusal,
failed checks, casualties, attributed journal categories, real-browser typed
and clicked actions, threshold departure, hint reads, persisted continuation,
and fresh launcher processes preserving active v5 and completed v4 saves.
The seven-gate `npm.cmd run verify` is the required full verification.

No live-provider or unfamiliar-player acceptance is claimed. Final keeper and
caravan outcomes remain outside this ticket. Static progression analysis retains
the existing watch-route warnings about socially gated Pell testimony; focused
watch tests remain the evidence for that optional path.

Verification result: all seven gates passed with zero warnings; 634 tests passed,
zero audited vulnerabilities, and clean build/package validation passed.
Standards and Spec reviews have no remaining findings.
