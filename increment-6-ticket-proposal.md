# Increment 6 ticket proposal

Source: `increment-6-implementation-plan.md` and the high-level roadmap. This is a review draft for the `to-tickets` quiz. No GitHub issues have been created.

## Publication index

| # | Title | Blocked by | Demonstrable result |
| --- | --- | --- | --- |
| 1 | Resume a saved adventure after changing locations | None | A schema-3 adventure resumes in a new process from its embedded content and recorded move. |
| 2 | Keep discoveries and items through a restart | 1 | Search, take, use, and relocation consequences remain true after leaving and resuming. |
| 3 | Resume combat and checks with the same next dice | 1 | A mid-combat or pre-check save continues exactly like an uninterrupted seeded run. |
| 4 | Resume AI play after a committed tool action | 1, 3 | AI mode resumes without repeating a committed action after narration failure. |
| 5 | Make a guard remember the player's treatment | 1, 2 | Authored relationship state changes later dialogue after departure and restart. |
| 6 | Let a rescue change another NPC's response | 5 | A rescued villager changes an ally's later legal response, while death remains truthful. |
| 7 | Advance an authored deadline and preserve its effects | 1, 5 | Time-bearing actions and wait advance a one-time clock with a playable missed-deadline route. |
| 8 | Ground the AI DM in relevant saved history | 4, 6, 7 | The DM recalls visible consequences after long context gaps without gaining hidden facts. |
| 9 | Verify a resumed journey diagnostically | 3, 4 | A split command or AI journey produces replayable, linked diagnostic evidence. |
| 10 | Qualify the complete multi-session adventure | 8, 9 | Clean-checkout, scripted, live, and player evidence supports the increment-6 exit criterion. |

## 1 — Resume a saved adventure after changing locations

### What to build

A player can start a current schema-3 adventure, move to another location, close the process without quitting the in-world session, and resume from a local save in a new process. The save includes the validated adventure snapshot so the original adventure file can be moved or removed. Introduce the versioned save envelope and a minimal append-only committed transition record through this working path. Keep saves separate from diagnostic traces.

### Acceptance criteria

- [ ] A documented CLI play/save/resume flow restarts at the correct location, status, and offered actions without replaying the introduction or reapplying the move.
- [ ] Every committed move has one ordered domain event, action identity, state digest, and RNG position; reads and rejected moves append no world event.
- [ ] Loading replays recorded transitions through the exact supported runtime tuple and compares the checkpoint state/digest before play; a moved/deleted source file does not matter.
- [ ] Save replacement is atomic; an interrupted or failed write leaves the previous valid save usable and reports the unsaved action clearly.
- [ ] Trace files cannot be resumed, saves cannot be replayed as traces, and released format-1–4 traces still verify.

### Blocked by

None (can start immediately).

## 2 — Keep discoveries and items through a restart

### What to build

The player searches for evidence, collects and uses a unique item, leaves, then resumes and returns. The item cannot be collected or used twice; discoveries, NPC location, and journal claims still agree with the committed history. Extend durable events and save validation for these existing supported mutations.

### Acceptance criteria

- [ ] A complete command journey on an existing adventure preserves discoveries, milestones, item ownership/consumption, and actor relocation across restart and revisit.
- [ ] Search, transfer/use, discovery, milestone, and relocation events are typed and ordered; a repeated one-time action does not duplicate them.
- [ ] The resumed journal, scene, inventory, and action availability agree with authoritative state, including a missing or consumed item.
- [ ] A generated schema-3 adventure resumes without being rewritten or acquiring invented relationship/clock data.
- [ ] Tampered event payloads, checkpoints, content digests, oversized files, duplicate keys, and unknown save tuples fail before the game starts.

### Blocked by

1 — Resume a saved adventure after changing locations.

## 3 — Resume combat and checks with the same next dice

### What to build

A player saves in an unfinished fight or just before a one-attempt social check, restarts, and gets the same next rolls and outcomes as an uninterrupted seeded run. Complete the RNG checkpoint/reconstruction and durable combat/check event path.

### Acceptance criteria

- [ ] Mid-combat, pre-check, and pre-healing split runs match uninterrupted runs in draw sequence, initiative, HP, item use, social result, and next legal action.
- [ ] A complete player action and automatic opponent turn are one settled persistence boundary; no save contains half an attack or effect list.
- [ ] Failed social checks remain committed attempts after reload and cannot be rerolled through another approach.
- [ ] Death and encounter completion produce durable events once; dead opponents remain dead after a location change and restart.
- [ ] Altered RNG state, draw count, rolls, or resulting checkpoint is rejected with a useful divergence location.

### Blocked by

1 — Resume a saved adventure after changing locations.

## 4 — Resume AI play after a committed tool action

### What to build

An AI-mode player saves and resumes the same adventure. If a DM provider fails after a tool action commits, the committed state is saved once and the next turn can continue without repeating the roll, item use, or attack. Local read controls still work after resume.

### Acceptance criteria

- [ ] A scripted AI journey resumes in a new process with the same scene, status, tool availability, and next dice as an uninterrupted run.
- [ ] The committed tool call is durably recorded before narration failure can trigger a retry; restart never reapplies it.
- [ ] Ambiguous, rejected, read-only, over-budget, and provider-failed-before-commit turns do not fabricate world events or time advancement.
- [ ] Local help/status/inventory/journal and post-completion reads retain their current behavior after resume.
- [ ] The save stores no credential, raw provider response, or authoritative transcript summary.

### Blocked by

1 — Resume a saved adventure after changing locations; 3 — Resume combat and checks with the same next dice.

## 5 — Make a guard remember the player's treatment

### What to build

In a small authored consequence adventure, the player can insult or help a guard, leave, resume, and return. The guard responds differently through a validated, finite relationship state. This is the first playable use of a new content/rules tuple for authored relationship predicates and effects; older documents retain their behavior.

### Acceptance criteria

- [ ] Two seeded routes show different later guard dialogue or access after insult versus help, including after process restart.
- [ ] Relationship tier and reason are engine-owned structured state with a durable change event; repeating a one-time choice does not stack the change.
- [ ] The schema/loader rejects unknown tiers, targets, invalid effects, and impossible references; existing schema-3/rules-v4 files continue to validate and play.
- [ ] Public scene and DM tool projections show only the guard's currently allowed response and knowledge; an unwitnessed private reason is withheld.
- [ ] A dead guard cannot speak or provide help regardless of prior attitude.

### Blocked by

1 — Resume a saved adventure after changing locations; 2 — Keep discoveries and items through a restart.

## 6 — Let a rescue change another NPC's response

### What to build

The player rescues a villager and later meets an ally in another scene. The ally's response changes only when the authored knowledge/reveal condition is met. Returning after a restart preserves the rescue, relationship reason, item/actor fates, and a truthful alternative if the villager dies.

### Acceptance criteria

- [ ] Rescue, no-rescue, and villager-death journeys lead to distinct, truthful later ally responses and legal actions, before and after reload.
- [ ] The ally does not cite a rescue they have no authored way to know about; private facts remain out of public and AI projections.
- [ ] NPC relocation and death remain authoritative over relationship prose; a killed actor never returns to dialogue or the original location.
- [ ] At least one completion route survives an unavailable NPC, and the authored scenario validates before play.

### Blocked by

5 — Make a guard remember the player's treatment.

## 7 — Advance an authored deadline and preserve its effects

### What to build

In the consequence adventure, the player can act before an enemy deadline or spend time and see the plan advance. An explicit bounded wait and declared time-bearing actions advance a simple authored clock. Missing the deadline changes later scenes but leaves a completable route.

### Acceptance criteria

- [ ] Met-deadline and missed-deadline routes have different visible consequences and truthful endings, including after resume across a threshold.
- [ ] Each crossed threshold emits and applies its effects once, including when one action crosses multiple thresholds.
- [ ] Look, status, journal, invalid requests, and provider retries consume no time; time-bearing actions and wait have documented deterministic costs.
- [ ] Waiting during active combat or after terminal completion is rejected without advancing time.
- [ ] Loader validation rejects invalid clock IDs/bounds/threshold order/effect references, and route tests show the missed-deadline path is still playable.

### Blocked by

1 — Resume a saved adventure after changing locations; 5 — Make a guard remember the player's treatment.

## 8 — Ground the AI DM in relevant saved history

### What to build

After a long gap and restart, the AI DM can describe why the guard, ally, item, enemy, and deadline are in their current states. It receives a bounded projection of authoritative current state and relevant domain events, not a free-form memory that can supersede canon.

### Acceptance criteria

- [ ] Scripted AI journeys reflect earlier treatment, rescue, item use, death, and missed deadline after a restart and removal of old conversational prose.
- [ ] History selection is deterministic, bounded, and scoped to the current scene, speaker, and revealed facts; a hidden theft or private clock stage is not leaked.
- [ ] Invalid AI claims cannot mutate state, create knowledge, revive an actor, return an item, or undo a threshold.
- [ ] DM prompt/tool version changes are explicit, old replay tuples remain supported, and tests assert tool/fact consistency rather than exact narration.

### Blocked by

4 — Resume AI play after a committed tool action; 6 — Let a rescue change another NPC's response; 7 — Advance an authored deadline and preserve its effects.

## 9 — Verify a resumed journey diagnostically

### What to build

A player or developer can inspect and verify a journey that crossed a save/resume boundary without misrepresenting a diagnostic trace as a save. The chosen continuation representation either links replayable segments or provides another explicit verified full-journey export. Both command and AI play are covered.

### Acceptance criteria

- [ ] The trace continuation contract is documented and yields replayable evidence for an uninterrupted and a split command journey, plus a split scripted-AI journey.
- [ ] Segment linkage or full export verifies exact content/runtime identity, action/tool sequence, draws, events, and resulting states across the boundary.
- [ ] Missing, reordered, altered, or mismatched segments fail clearly; an ordinary format-4 trace is never silently spliced into an invalid replay.
- [ ] Historical format-1–4 traces continue to replay with their released semantics.

### Blocked by

3 — Resume combat and checks with the same next dice; 4 — Resume AI play after a committed tool action.

## 10 — Qualify the complete multi-session adventure

### What to build

An unfamiliar player can complete the compact consequence adventure across two sessions and understand why the world changed. Package the manual journey, automated evidence, and honest limitations for implementation handoff.

### Acceptance criteria

- [ ] A checked-in scripted journey covers insult, departure, rescue, item, enemy, deadline, restart, return, and one ending; a contrasting route covers help and meeting the deadline.
- [ ] CLI, storage, scene/journal, scripted AI, and diagnostic replay checks pass from a clean checkout, including a save produced during the test and a moved original adventure file.
- [ ] The canonical seven-gate verification passes with zero warnings, with focused checks passing for each preceding ticket.
- [ ] A bounded live-DM review and unfamiliar-player continuity review record model/content/prompt versions, observations, and any evidence gaps; no scripted test is presented as live-provider proof.
- [ ] Player documentation gives exact save/resume commands, interruption behavior, local-file privacy, compatibility limits, and expected results for mid-combat and deadline examples.

### Blocked by

8 — Ground the AI DM in relevant saved history; 9 — Verify a resumed journey diagnostically.
