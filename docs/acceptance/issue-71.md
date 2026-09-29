# Issue #71: two-session consequence adventure

`adventures/consequence-journey.json` combines the guard, witness, tonic,
raider scout, and raider-plan clock in one small schema-5 adventure. Its
content ID/version is `consequence-journey`/`1`; the validated content digest
is `sha256:0bb560a9e34656ff02c93a2711c3b49e3f7353a03e52e02abbb3d595203cef9d`.
The runtime tuple is `chapel-clues-rules-v6` /
`chapel-clues-engine-v9`; AI uses `chapel-clues-dm-v12` /
`chapel-clues-tools-v9`. Seed `0` uses `mulberry32-v1`.

## Play the late route across two sessions

Use Node 24.x and npm 11.6.4. From the repository root, run `npm.cmd ci`
once and `npm.cmd run build`. These commands use local command mode and need
no API key. Choose private paths for saves and traces:

```powershell
New-Item -ItemType Directory -Force .scratch/issue-71 | Out-Null
node dist/cli.js --adventure-file .\adventures\consequence-journey.json --seed 0 --save .\.scratch\issue-71\late-save.json --trace .\.scratch\issue-71\late-first.json
```

Type these commands inside the game, one at each `>` prompt:

1. `talk guard insult ask` — the guard says they will remember the insult; Raider plan reaches 1/6.
2. `take restorative-tonic` — the tonic enters inventory; the horn warns at 2/6.
3. `attack scout` — seed 0 defeats the Raider Scout at the cellar; the corpse remains there.
4. `talk neri rescue ask` — Neri goes to the square.
5. `search route-register` — the journal gains a sourced Safe route discovery; the raiders close the short passage at 5/6.
6. `move square` — the clock reaches 6/6, and the scene offers Cellar and Back Lane.

After the next `>` prompt, press **Ctrl+C** in PowerShell. The last accepted
action was committed before that prompt. Start a new process:

```powershell
node dist/cli.js --resume .\.scratch\issue-71\late-save.json --trace .\.scratch\issue-71\late-second.json --previous-trace .\.scratch\issue-71\late-first.json
```

Type these commands after restart:

1. `move cellar` — Neri and the tonic are absent; Raider Scout's remains are present.
2. `talk guard return ask` — the guard recalls the insult and refuses guidance.
3. `move square`, `move back-lane`, `move hall` — the closed short passage is bypassed. The hall desk is still available.
4. `talk lysa response ask` — Lysa says she has no report of Neri's fate.
5. `talk lysa report-rescue ask` — Lysa learns Neri reached the square.
6. `talk lysa response ask` — Lysa now offers help because of the report.
7. `journal` — Safe route is attributed to the cellar register; the missed deadline and rescue are listed.
8. `resolve file-register` — victory records the late delivery, Neri alive in the square, and the defeated scout.

The same commands are checked in as
[`late-first.txt`](inputs/issue-71-late-first.txt) and
[`late-second.txt`](inputs/issue-71-late-second.txt). A noninteractive run can
pipe each file to its respective startup command. The save is produced by the
first process. To verify the complete diagnostic chain, run:

```powershell
node dist/cli.js --replay .\.scratch\issue-71\late-first.json .\.scratch\issue-71\late-second.json
```

Expect `Trace verified successfully`. The trace files are evidence, not saves.
The save embeds its validated adventure, so resume and replay work if the
original adventure file moves away. Keep both trace segments in order.

## On-time contrast

Start with a **fresh** save path, or omit `--save`:

```powershell
node dist/cli.js --adventure-file .\adventures\consequence-journey.json --seed 0 --save .\.scratch\issue-71\on-time-save.json
```

Type `talk guard help ask`, `search route-register`, `move square`, `move hall`,
and `resolve file-register`. The guard thanks you, the clock ends at 4/6, and
the ending says the route arrived before the raiders closed the safe passage.
Neri remains alive in the cellar because this route did not rescue them. The
commands are in [`on-time.txt`](inputs/issue-71-on-time.txt).

## Mid-combat restart example

This separate example uses the chapel to leave an actual fight unfinished:

```powershell
node dist/cli.js --adventure-file .\adventures\chapel-clues.json --seed 0 --save .\.scratch\issue-71\combat-save.json --trace .\.scratch\issue-71\combat-first.json
```

Type `move chapel-path`, `move ruined-chapel`, and `move crypt`. The skeleton
guardian encounter starts; seed 0 gives the Fighter initiative 7 versus 3,
with the Fighter's turn next. Wait for `>`, press Ctrl+C, then run:

```powershell
node dist/cli.js --resume .\.scratch\issue-71\combat-save.json --trace .\.scratch\issue-71\combat-second.json --previous-trace .\.scratch\issue-71\combat-first.json
```

Type `attack skeleton`. The resumed scene is the Crypt in combat at 20/20 HP;
seed 0's first attack is a miss (d20 5), followed by a skeleton miss (d20 3).
The next turn remains the Fighter's. The original initiative is not rerolled.
Stop after the next `>` prompt, then verify both segments with `--replay` in
the order shown above.

## Automated and review evidence

`tests/issue-71.test.mjs` runs the late and on-time scripts through the built
CLI, asserts save and public scene/journal facts, moves a copied original
adventure file before resume, and replays the linked command segments. It
also runs a split scripted-AI guard journey and replays its tool calls. Those
scripted responses verify orchestration and state; they do not establish live
model quality.

The bounded live review on 29 September 2026 used OpenAI
`gpt-5.6-luna` with the content and prompt/tool versions above. It sent four
turns over two live processes: insult, depart, return, and ask the guard for
guidance. The correct `talk` and `move` tools committed; after restart, the
engine said the guard remembered the insult. The live narration after the
first insult was only `Cellar Guard (steady):`, and the later reply was a
generic `Please, listen.` The engine's authored response remained clear,
but those narrations did not explain the consequence well. A fifth live turn
asked about the scout, Neri, tonic, and closed route after a separate command
checkpoint. The model correctly stated that the scout was defeated, Neri was
alive in the square, the tonic was carried unused, and the raider plan at 6/6
closed the short route while the long route remained open. This small review
does not qualify a full live-DM ending or broader prose quality. The
command-to-AI save continued correctly, but its mixed-mode trace segments
currently fail replay with `Replay divergence at segment 1 mode`; use
same-mode segments for diagnostic verification.

An implementer-only continuity read of the scripted route found the causal
links visible: the guard refers to the insult, the cellar lists the scout's
remains and no tonic, the square lists Neri and the blocked passage, Lysa's
answer changes only after the rescue report, and the ending names the late
delivery. Separately, the project owner reported on 29 September 2026 that
an unfamiliar player completed the test with no feedback. The exercise is
described in [`issue-71-player-sheet.md`](issue-71-player-sheet.md). No
individual answers, session trace, duration, or tested commit were supplied,
so this is a reported pass rather than independently inspectable play data.
No enjoyment or broad usability claim is inferred from it.

Adventure validation returns `ok: true` with three `analysis-incomplete`
warnings for rescue/report milestones because the static route analyzer does
not witness those dialogue effects. The checked-in CLI journey exercises the
rescue and report directly. Canonical verification's zero-warning rule is
separate from these content-analysis warnings.

At the implementation checkout, the focused tests for issues #62–#70
passed (39/39). The canonical `npm.cmd run verify` passed all seven gates
with 462/462 automated tests and zero warnings. A fresh local clone of that
commit had no tracked or untracked changes; `npm.cmd ci` installed from the
lockfile with zero reported vulnerabilities, and its own canonical verify
passed 462/462 tests with zero warnings. From that clone, the first checked-in
script produced a new save and format-5 segment. The temporary original
adventure copy was moved away; the second process resumed to victory and
both segments replayed successfully. This clean-checkout check used only
tracked source plus the save and trace files it produced.

## Privacy and compatibility

Saves and traces stay on the local filesystem unless you choose to share
them. They contain player actions, a full adventure snapshot, and hidden
story facts; choose a private path and inspect before sharing. A save does not
store the API key or provider transcript. Live `--ai` sends the current
public/speaker-scoped game context and player input to OpenAI and needs
`OPENAI_API_KEY`; command play and replay do not.

Current saves use format 3. Format-1 and format-2 saves remain readable and
upgrade on the next committed action. Format-5 traces link each saved process;
one segment alone cannot prove a resumed journey. Historical trace formats
1–4 keep their released replay semantics and cannot be spliced into a format-5
chain. A failed save write stops play; resume the last valid save. `quit`
closes the session, so interrupt at a prompt when you want to continue later.
