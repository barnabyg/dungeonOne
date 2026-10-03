# Issue 94: the full browser adventure with a live AI Dungeon Master

Qualified on 3 October 2026 on `feat/issue-94-live-full-journey`, in the
browser's default character mode. A new level-1 Fighter from the character
library plays Hollow Beacon v12 from Watch Yard to a completed ending, its
one-time XP award and level change, and Review after a restart. No engine,
content, prompt or tool change was made: the release tuple, saves and earlier
adventures are unchanged. The command-line app was not used.

## The journey

Seed 0, one character, 22 committed turns. The same route (shared in
[`tests/fixtures/issue-94-journey.mjs`](../../tests/fixtures/issue-94-journey.mjs))
drives both the scripted test and the live run.

| Beat                  | Player input                                                                        | Engine result (seed 0)                                             |
| --------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Dialogue              | “Captain, what's wrong with the beacon, and where should I start looking?”          | Iona's approved facts                                              |
| Character-sheet check | Click beacon lamp → **Try the wisdom check**                                        | Wisdom 11: d20 6 +0 = 6 vs DC 12, failure; no XP                   |
| Investigation         | “Head up to the watch loft.”, “Go through to the signal records room next door.”    | Travel, Day 0                                                      |
| Evidence and item     | “Look the setting plate over carefully.”, “Grab the spare component off the plate.” | Altered setting discovered; component carried                      |
| Consequence and fight | “Take the ridge trail toward the tower.”, then four attack phrasings                | Day 0 → 2; raider defeated in four rounds; 10/19 HP                |
| Recovery              | Click camp dressing station → **Recover**                                           | +8 HP, 18/19                                                       |
| Avoidance             | “Avoid the sentry: slip around by the drainage walk instead.”                       | Sentry bypassed; Day 3, caravan turn missed                        |
| Proof                 | “Read through the tower work order.”, click Vey → **Present the work order…**       | Vey stands aside without a fight                                   |
| Item use              | “Fit the spare component into the beacon socket.”                                   | Component spent, 0 days                                            |
| Ambiguous ending      | “Warn them.”                                                                        | Clarification only; nothing committed                              |
| Ending                | Click **Ending choices** → **Verified safe signal**                                 | Victory, late record, no rescue claimed; **Level 1 → 2**, 1,000 XP |

## Player handoff

Prerequisites: Node 24.x, `npm.cmd ci`, a desktop browser and `OPENAI_API_KEY`
in the launch environment with provider network access. Use a new library
path for a fresh character.

```powershell
npm.cmd run build
npm.cmd run browser -- --seed 0 --characters .\.scratch\issue-94-player\characters.json
```

1. Open the printed `http://127.0.0.1:<port>` URL. **Choose character** →
   **Create character**, name `Ada`, keep **Balanced**, **Save character**:
   level 1 Fighter, 19 HP, 0 XP. Select **Start Hollow Beacon: A Fighter’s
   Warning with Ada**.
2. Open **Character** (wisdom 11 (+0)) and **Hints**. Neither changes the
   game or calls the AI.
3. Play the journey above, waiting for each complete reply and an enabled
   message box. Type the messages; click the subject and then the option for
   the click rows. The plate, work order and warning board must each end in a
   **Resolved action** search card: Vey's proof option needs both the plate
   and work-order discoveries, and the Ridge Trail closes on Day 3, so a missed
   plate search costs a long detour. If the Dungeon Master only describes something (for
   example after “Look … over carefully”), it has inspected without
   searching; type the offered option text such as `Search beacon setting plate`.
   `take` needs your own words to say take, grab, collect or pick up; a check
   needs the option text (`Try the wisdom check at beacon lamp`) or a click.
4. Continuation: after the watch-yard return, wait for the reply, press Ctrl+C
   and rerun the exact command. The new URL reopens the same adventure, exact
   conversation and state, without an AI request.
5. After **Verified safe signal**, expect the level-up card, 1,000 XP and
   Review. Ctrl+C and rerun: Review returns, the message box is disabled, no
   AI request is made, and XP stays 1,000.

Recovery: if the AI fails before your action, the notice says no action was
committed; send the message again. If it fails after, the notice says your
action was saved and must not be repeated; reload to see the saved result card.
To start over: **Choose character** → Ada → **Abandon adventure** (confirm) →
**Rest between adventures** → start again. The abandoned journey stays under
**Saved adventures**.

## Scripted coverage

[`tests/issue-94.test.mjs`](../../tests/issue-94.test.mjs) runs in canonical
verification without credentials.

| Test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Boundary                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Real Edge/Chromium creates Ada and plays the whole journey, typed and clicked. Panels and hints make no call. Provider failure before the loft move (nothing committed, retried) and after the take (saved, reload shows the card). Duplicate submission of the lost turn is 409 without a call. Process kill and relaunch: exact conversation, state and save bytes, zero calls. Every turn advances the position by at most one. Level 1 → 2, 1,000 XP. Kill and relaunch into Review: no call, no second award, library and save bytes unchanged | Browser, HTTP server in its own process, storage |
| Every provider request in that journey: transcript ≤ 8 entries and ≤ 4,000 characters, verified history ≤ 12 facts, NPC reply history scoped to the speaking NPC                                                                                                                                                                                                                                                                                                                                                                                    | Provider boundary                                |
| A deliberately misbehaving provider over HTTP: a false claim of earlier canon followed by a success narration, a claim contradicting the current scene after more than 12 turns of history, a hidden actor (Vey from Watch Yard), an item not carried, two calls in one response, a second mutation in one turn, an ambiguous ending, a clicked ending whose call names a different ending, and a request after completion. None changes position, location, clocks, journal, sheet, XP or level beyond the one permitted move                      | HTTP, storage, career library                    |
| A scripted-AI character trace (format 6) of the journey's first nine turns replays; a tampered state is rejected                                                                                                                                                                                                                                                                                                                                                                                                                                    | Trace replay                                     |

The scripted provider maps this journey's phrasing to calls. It qualifies
orchestration, guards and recovery, not language understanding.

## Live review

**Budget**, agreed with the project owner before execution: at most 80 provider
calls, configured `OPENAI_API_KEY`. Used: **54 calls, 193,256 input and 4,058
output tokens**. Billed cost is **unknown**: Responses reports tokens, not
dollars, and no verified price was available for this model.

| Identity             | Value                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Provider and model   | OpenAI Responses; requested and reported `gpt-5.6-luna` on every call                                                                |
| Content              | `hollow-beacon` v12, `sha256:8fe41c606f6f0e47d41f114a7106d88effaee007e4bd990edd2017554d6a126e`                                       |
| Rules / engine       | `character-adventure-rules-v1` / `character-adventure-engine-v1`                                                                     |
| Prompt / tools       | `character-adventure-dm-v1` / `character-adventure-tools-v1`                                                                         |
| System prompt digest | `95c21c2773ccd855e5b5936b48e0b0fe334d2f7df462a8f14c86e3c1a7ce4d30`                                                                   |
| Starting sheet       | Ada, Fighter, `fighter-rules-v1`, level 1, 0 XP, 19 HP; Str 14, Dex 12, Con 13, Int 10, Wis 11, Cha 9; chain mail, shield, longsword |

Both reports are retained: the [main run](issue-94-live.json) and its
[continuation](issue-94-live-resume.json). They record per-call phase, input,
offered tools, prompt and tool-schema digests, provider response IDs and
token usage, latency and selected calls, and per-turn cards, replies, notices
and positions. Credentials and full prompts are not recorded; player inputs
are the fixed public route text. The tool-schema digest is per call, because
it covers the tools offered at that position, so it changes as the scene does.

**Main run** (43 calls, 139,642 / 3,165 tokens, 80 s): real headless Edge
through the shipped page, in-process server and save authority. Opening probes,
then the journey to Vey. Three opening probes committed nothing and changed
no sheet, XP or outcome. The model refuted the false claim (“The current
record does not show you as level 5…”), said Vey was not present, and said
no component was carried. Injected failures made no provider request: before
the loft move (“No action was committed”, retried) and after the take (saved;
the duplicate was refused with 409). A server restart after the watch-yard
return restored the exact conversation, state and save bytes with no call.
The sheet check, fight, recovery, avoidance and tower arrival all committed as
expected. The run stopped when the Vey click returned a clarification.

**Continuation** (11 calls, 53,614 / 893 tokens, 24 s): a second runner
process started a new server over the same library. This is the same server
path the launcher uses on a rerun, but `npm.cmd run browser` itself was not
rerun live (the launcher only accepts a real key and the scripted test covers
its process kill and relaunch). The saved adventure
continued at position 18 with no call. The same Vey click committed at once;
fit, board, the ambiguous “Warn them.” (a clarification listing the three
endings), and the clicked **Verified safe signal** followed. Final: victory,
Day 3, 18/19 HP, level 2, 1,000 XP, `hollow-beacon-completion` earned once.
Restarting opened Review with no call and unchanged library and save bytes.

Per-turn latency was 1.4–4.8 s, excluding the injected failure turn (134 ms,
no provider request); per call it was 0.8–4.1 s. The largest live
transcript was 8 entries and 2,108 characters; the largest history was 8 facts.

### Corrections and clarification loops

The reports count every uncommitted turn as a clarification: 7 in the main
run (the three opening probes, the injected loft failure, and the plate,
work-order and Vey turns below) and 2 in the continuation (the board turn and
“Warn them.”).

| Turn                                     | What happened                                                                                                      | Correction                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| “Look the setting plate over carefully.” | Read-only `inspect`; nothing committed                                                                             | Typed `Search beacon setting plate` |
| “Read through the tower work order.”     | Read-only `inspect`                                                                                                | Typed `Search tower work order`     |
| “Study the final warning board.”         | Read-only `inspect`                                                                                                | Typed `Search final warning board`  |
| Click Vey → **Present the work order…**  | Clarification asking Ask, Persuade, Deceive or Intimidate; Deceive and Intimidate were not offered (main run only) | Same click on continuation          |
| “Warn them.”                             | Clarification, as intended                                                                                         | —                                   |

All other typed phrasings, including four different attack phrasings and the
avoidance request, committed the intended call first time. No turn committed
an unexpected or second mutation, and no reply claimed XP, a level or a rescue.

### Findings

1. **Contextual talk clicks can stall (open defect).** The `talk` tool lists
   topic IDs (`plate-proof`) without their labels and a generic approach enum,
   so the model asked for an approach the click had already chosen, and
   offered unavailable ones. The rerun committed, so this is intermittent.
   Fixing it changes the tool schema shared with released saves and needs a
   new tool version; it is left to follow-up issue #109.
2. **“Look over”, “read through” and “study” mean inspect.** The model's
   choice is defensible but costs the player a turn. Narration after the
   plate inspect said the setting “was altered” before the search granted
   that discovery; the journal stayed authoritative.
3. **Narration is not checked against results.** The engine and the result
   cards refuse unauthorized changes, but free narration is displayed as
   written. In the scripted guard test a provider's “you are now level 5”
   appears beside an **Action rejected** card and a no-commit notice. No live
   reply claimed XP, a level or a rescue, but finding 2's “was altered” is a
   small live overclaim. The criterion against false success claims is
   therefore met by the engine, result cards and notices, **not by narration
   itself**. Follow-up: #111.
4. **The post-commit failure text says “shown in Mechanics”.** The browser
   labels that card **Resolved action**. Follow-up: #112.
5. **Deliberately narrow phrasing.** `take` requires take, grab, collect or
   pick up in the player's own words (“Pocket the component” is refused with
   an honest rejection), and optional checks require the offered wording.
6. **Inspect and Search read as the same thing (owner playtest).** The project
   owner played the journey in the browser on 3 October 2026. They inspected
   the setting plate without searching it, so Vey's proof option never
   appeared, and they restarted rather than take the long detour back after
   the Ridge Trail closed. They then completed the journey. Their feedback: the
   two options "always feel like the same thing" and the two-step process is
   easy to miss. Agreed direction: one **Examine** action that performs an
   available search, in a new versioned release (#110).

## Traces and compatibility

Character adventures are browser-only; the CLI does not play them and the
browser has no trace export. A character-mode AI trace (format 6) recorded from
the journey's scripted turns through the sheet check, item take and ridge
arrival replays as a single file, and an altered recorded state is rejected
(`tests/issue-94.test.mjs`; command traces are covered by
`tests/character-save.test.mjs`). Linked resumed
segments exist only for format 5, so a resumed browser character journey has
**no linked trace replay**. This ticket does not resolve that mixed-mode
limitation; browser continuation is instead verified through the save
authority's checkpoint and transition replay. CLI fallback, scripted AI and
linked-trace replay for earlier adventures are unchanged and stay covered by
their tests (for example `tests/issue-91.test.mjs`).

## Limits of this evidence

- One journey route plus a scripted guard route; one live journey on one
  seed. The trace test replays the first nine turns, not the whole journey.
  Stale-tab and generation rejection are not re-tested here; #93's tests
  cover them in character mode. It does not establish provider
  reliability, coverage of all phrasings, or player enjoyment; #106's watch
  checks remain baseline evidence only.
- The live run restarted the server in-process and used headless Edge;
  abrupt process kills are covered by the scripted test. The live journey
  spans two runner invocations over the same saved adventure.
- Live provider failures were injected by the runner without making a
  request; no real provider outage occurred.
- The scripted results above and the live play are separate evidence. No
  isolated live model turns were run outside this journey.

## Reproduce

```powershell
npm.cmd run build
node .\scripts\qualify-character-live.mjs .\.verify-artifacts\issue-94-dry-run.json 80 --dry-run
node .\scripts\qualify-character-live.mjs .\.verify-artifacts\issue-94-live.json 80
```

The dry run uses the scripted interpreter: no credentials or provider calls.
The live run creates a unique library under `.verify-artifacts` and stops at
the call cap. To continue a stopped run from a step, pass the remaining budget
and the run directory printed in its report:

```powershell
node .\scripts\qualify-character-live.mjs .\.verify-artifacts\issue-94-live-resume.json 37 --resume .\.verify-artifacts\issue-94-live-<id> --from vey
```
