# Increment 9 ticket proposal

Scope clarification, 2 October 2026: independently saved character sheets, character creation/selection, levels, and recommended adventure levels belong to [increment 10](increment-10-implementation-plan.md). The single-slot and fixed-profile requirements here remain the historical browser baseline. This is a publication record, not a current issue-status report; existing GitHub tickets are not expanded by this documentation update.

Direction update, 3 October 2026: the project owner confirmed that the character library is the primary browser mode ([ADR 0004](docs/adr/0004-qualify-the-full-adventure-in-character-mode.md)). The remaining increment 8 tickets #93–#95 were revised to target it explicitly: Hollow Beacon v12 played by a saved character, continuation by rerunning the same launcher command, and abandon/rest/start in place of single-slot New game. The single save slot described here remains only as `--legacy` compatibility for released Hollow Beacon v4–v11 saves. The rest of this document is the historical record.

Status: approved by the project owner and published as GitHub issues #96–#106 on 1 October 2026. Source: the confirmed increment 9 implementation plan, updated project spec, glossary, and ADRs. Increment 8 pauses after resolved issue #84. These tickets cover the current Hollow Beacon browser experience; the remaining increment 8 ticket rewrite follows completion of increment 9.

## Numbering and publication

Published tickets #96–#106 continue directly after increment 8's last issue, #95. All eleven issues are open with the ready-for-agent label and 15 native blocking links. Published titles, bodies, labels, and all blocking edges were checked against the approved breakdown. The remaining increment 8 issues were not modified. Issue #96 is the initial unblocked ticket.

## Shared implementation contract

All gameplay takes place in the local desktop browser through AI. The engine remains authoritative; command mode and released saves/traces remain compatible. Support Hollow Beacon through #84 without new adventure rules, older-adventure browser work, maps, multiple slots, hosting, phone-specific design, an installer, key-entry UI, or streaming. Each ticket needs a focused player-boundary check and its own implementation commit; critical workflows cross browser, API, and storage. Full verification is the integration/pre-push gate. Concurrent writers require separate branch-backed worktrees and isolated ports, save directories, and test artifacts.

Required adapter prefactoring belongs in the earliest demonstrable slice. The current runtime already has structured projections and verified save/action authority, so a separate broad refactor ticket is not justified by current evidence.

## Publication index

| Ticket                                                    | Title                                                                  | Blocked by      | What it delivers                                                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [#96](https://github.com/barnabyg/dungeonOne/issues/96)   | Launch Hollow Beacon in a local desktop browser                        | None            | Start the current adventure locally and read its scene with location, exits, time, and HP always visible.                      |
| [#97](https://github.com/barnabyg/dungeonOne/issues/97)   | Play an AI turn through browser conversation                           | #96             | Type actions and questions, receive complete AI replies and result cards, and see authoritative information update.            |
| [#98](https://github.com/barnabyg/dungeonOne/issues/98)   | Read inventory, character details, and journal beside the conversation | #97             | Open current information with one click and preserve the conversation position without an AI call or gameplay action.          |
| [#99](https://github.com/barnabyg/dungeonOne/issues/99)   | Follow exits and conversation topics with one click                    | #97             | Select a visible exit, person, or current topic and submit its intent directly to the AI turn flow.                            |
| [#100](https://github.com/barnabyg/dungeonOne/issues/100) | Continue the single save slot with exact conversation history          | #97             | Reload or restart the local process and recover both verified progress and the displayed conversation.                         |
| [#101](https://github.com/barnabyg/dungeonOne/issues/101) | Recover interrupted browser turns without repeating actions            | #100            | Survive AI errors, lost responses, stale tabs, and save failures while keeping each committed action intact.                   |
| [#102](https://github.com/barnabyg/dungeonOne/issues/102) | Reveal cached hints only when the player asks                          | #98, #100       | Prepare guidance from known facts as scenes change, save it, and display it immediately in a hidden-by-default component.      |
| [#103](https://github.com/barnabyg/dungeonOne/issues/103) | Request a stronger hint without changing the adventure                 | #102            | Explicitly ask for a stronger nudge in the hints component while preserving gameplay progress.                                 |
| [#104](https://github.com/barnabyg/dungeonOne/issues/104) | Start a fresh game safely in the single save slot                      | #101, #103      | Confirm New game and replace progress, conversation, and hints together without an old turn contaminating the new game.        |
| [#105](https://github.com/barnabyg/dungeonOne/issues/105) | Review a completed adventure without further AI interaction            | #99, #101, #103 | Commit current Hollow Beacon endings and retain readable final information and history with gameplay and AI questions closed.  |
| [#106](https://github.com/barnabyg/dungeonOne/issues/106) | Qualify local browser play and prepare the increment 8 handoff         | #104, #105      | Demonstrate the supported desktop journey, live AI, clean installation, and safe continuation before returning to increment 8. |

The six planning slices are split into eleven tickets to keep exact history, interruption recovery, baseline hints, stronger nudges, reset, and ending review separately demonstrable. Dependencies represent required capabilities rather than a blanket sequence: information views, click intents, and history can follow the typed-turn ticket independently; reset and ending review can follow their shared prerequisites independently. Branch-backed worktrees are required for concurrent writing.

## 96 — Launch Hollow Beacon in a local desktop browser

### What to build

Launch Hollow Beacon as delivered through issue #84 with a copyable local command. The command opens a restrained desktop browser interface, with a central scene/conversation area and persistent location, exits, time/deadline, and HP. Start an empty single save slot safely and read its current state; full conversation restoration is a later ticket.

### Acceptance criteria

- [ ] A configured launch prints a loopback URL, selects an available port, and attempts to open the browser. Browser-launch failure leaves a usable URL. Missing AI configuration produces a clear setup error; credentials are supplied before launch.
- [ ] The initial scene and persistent fields match authoritative Hollow Beacon state at a displayed seed. An occupied slot is read without silent replacement; initial state is saved through the existing verified authority.
- [ ] Browser data is a structured player-safe view, including time and visible exits. It is not parsed from terminal prose, and credentials, hidden facts, raw save snapshots, and internal content are not exposed to the page. Local mutation requests reject unrelated origins.
- [ ] The desktop layout uses readable labels, keyboard-accessible controls, visible focus, and restrained styling. The current scene remains readable while persistent fields stay visible.
- [ ] A real browser-to-local-service-to-storage start/read check passes. Existing CLI startup, adventures, saved formats, and replay retain their behaviour; any required adapter prefactoring lands with this slice.

### Blocked by

None (can start immediately; use the completed #84 baseline).

## 97 — Play an AI turn through browser conversation

### What to build

Play the current Hollow Beacon opening by typing ordinary-language requests in the browser. AI interprets intent through the existing bounded tools, the engine resolves accepted actions, and the page presents complete replies with attributed NPC dialogue and concise authoritative result cards.

### Acceptance criteria

- [ ] A seeded browser journey conducts one conversation, searches for evidence, and travels using the configured AI orchestration. Scripted AI makes automated checks deterministic; there is no player-facing command-only mode.
- [ ] Questions and clarification preserve game state, time, and RNG. Invalid, ambiguous, hidden-target, and compound requests preserve the established authority contract, including at most one gameplay mutation per attempt.
- [ ] Consequential results are saved before being represented as committed. Result cards explain what changed and persistent fields refresh from authoritative state without dumping the full character sheet after each turn.
- [ ] A request appears in the conversation with a waiting indicator, followed by a complete reply. Pending input cannot submit another turn; server-side turn handling also prevents concurrent commits. An initial provider failure reports whether an action was committed without repeating it.
- [ ] Browser/API/storage checks verify accepted and rejected turns and compare state and RNG with the corresponding engine route. Current CLI and compatibility checks remain green.

### Blocked by

- #96 — Launch Hollow Beacon in a local desktop browser

## 98 — Read inventory, character details, and journal beside the conversation

### What to build

Let the player open inventory, character details, journal, and known leads beside the central conversation. These components read the current authoritative position, making it unnecessary to type information commands or scroll through old replies to recover current facts.

### Acceptance criteria

- [ ] Each information component is one click or keyboard activation away. Opening, closing, and switching components does not add chat messages, call AI, advance time, or draw RNG.
- [ ] The journal distinguishes observed evidence, testimony, beliefs, and current leads using existing classifications. Character and inventory views show supported current values and truthfully display empty inventory without inventing items or mechanics.
- [ ] After a conversation, discovery, travel threshold, or return visit, displayed information matches current state and excludes stale leads, absent speakers, and hidden knowledge.
- [ ] Panel navigation restores useful focus and preserves the player's conversation scroll position. Location, exits, time, and HP remain visible while secondary information is open.
- [ ] A browser journey checks information before and after a discovery and return visit, and verifies that repeated panel reads preserve state, RNG, and provider-call count.

### Blocked by

- #97 — Play an AI turn through browser conversation

## 99 — Follow exits and conversation topics with one click

### What to build

Offer contextual interaction for current visible exits, people, objects, and ending choices in Hollow Beacon. Clicking an offered action submits one explicit intent immediately through the same AI-mediated turn used by typed requests. Keep choices local to the selected context rather than displaying an exhaustive command checklist.

### Acceptance criteria

- [ ] Clicking an exit or offered conversation topic submits a clear player intent and yields the same canonical action/result as its typed equivalent. NPC dialogue retains its speaker and subject.
- [ ] Contextual options come from current visible targets and engine-permitted actions. Current ending choices show their public stakes and require an explicit selected choice; the AI cannot choose an ending on the player's behalf.
- [ ] An option from an old scene or unavailable topic is rejected and current information is refreshed without mutation, time cost, or RNG draw. Browser-supplied target/action data is validated on the server.
- [ ] Waiting, result cards, saved commits, and persistent field updates use the shared turn flow; clicking does not create a separate rules path. Controls are keyboard accessible.
- [ ] Real browser checks cover travel, dialogue, inspection, and stale intent, comparing clicked and typed routes for canonical state and RNG equality.

### Blocked by

- #97 — Play an AI turn through browser conversation

## 100 — Continue the single save slot with exact conversation history

### What to build

Automatically retain the player's exact messages, AI replies, and authoritative result cards with the single local Hollow Beacon slot. Continue after closing the page or restarting the process with the same progress and readable conversation history.

### Acceptance criteria

- [ ] After a completed turn, browser reload and a two-process restart restore identical game state/RNG and the exact displayed messages, replies, speaker labels, and result cards. Continue reports the adventure, seed, and active/completed state.
- [ ] History has a versioned persistence contract linked to verified progress. Completed responses are persisted before final display; an interruption after a game commit but before narration/history completion recovers a truthful result without executing the action again.
- [ ] Closing the browser or stopping the local server does not issue the game quit action. Restoring history never replays its messages or tool calls.
- [ ] Long visible history is independent of bounded, speaker-scoped model context. Current state and the journal remain authoritative, and private provider payloads, credentials, or hidden save content are not copied into browser history.
- [ ] A browser/API/storage restart and interruption check passes. Existing engine save/trace formats remain readable; invalid or inconsistent browser records fail clearly without replacing a valid slot.

### Blocked by

- #97 — Play an AI turn through browser conversation

## 101 — Recover interrupted browser turns without repeating actions

### What to build

Give the player a truthful recovery path when AI, the connection, or persistence fails. Preserve the one committed result across reload and retry, prevent duplicate or stale attempts from changing the slot, and let later gameplay continue when AI is available again.

### Acceptance criteria

- [ ] A provider failure before commit preserves state/time/RNG and permits retry. A failure after commit displays and saves the authoritative result or authored reply, refreshes panels, and identifies the committed position; retry cannot reroll or repeat it.
- [ ] A lost HTTP response, browser reload during a turn, repeated request, or second tab produces at most one commit. Requests are tied to the current session generation/revision, and stale requests return current visible state without mutation.
- [ ] An interrupted local process recovers a verified progress/history position. Injected save failure reports what is durable, retains a recoverable result, and never silently rerolls or claims a successful durable save that did not occur.
- [ ] Browser waiting, failure, and saved states are clear and keyboard readable. Provider restoration allows a new AI-mediated turn from the preserved position; no command-only gameplay fallback is introduced.
- [ ] Browser/API/storage fault checks cover both sides of commit, response loss, restart, duplicate input, stale intent, and concurrent tabs, proving commit count and RNG equality. Replay evidence follows the established supported contract.

### Blocked by

- #100 — Continue the single save slot with exact conversation history

## 102 — Reveal cached hints only when the player asks

### What to build

Prepare baseline hints for the current Hollow Beacon scene using public facts, known leads, visible targets, and legal actions; AI may phrase the game-grounded guidance. Keep the hints component hidden until the player opens it, and cache its content with the saved position.

### Acceptance criteria

- [ ] Hints are prepared when relevant scene/state changes occur even while the component is hidden. Opening and reopening displays cached guidance without another provider call, gameplay action, time cost, or RNG draw.
- [ ] The game constrains allowed hint content to current player knowledge and legal targets/actions. Hints introduce no undiscovered facts, fabricated results, or false legal options and do not appear unsolicited elsewhere in the UI.
- [ ] Cached hints are linked to their originating state revision and are restored with the slot. A delayed result from an old scene cannot replace current guidance; opening the page starts with the component hidden.
- [ ] Hint generation failure preserves committed progress and clearly indicates unavailability inside the hints component. It does not block viewing current information or cause an action retry.
- [ ] A real browser journey checks generation while hidden, immediate repeated viewing, save/restart, stale generation, and failure, with state/RNG/provider-call assertions and hidden-information checks.

### Blocked by

- #98 — Read inventory, character details, and journal beside the conversation
- #100 — Continue the single save slot with exact conversation history

## 103 — Request a stronger hint without changing the adventure

### What to build

Let the player request stronger guidance after reading the baseline hint. The additional nudge is explicit, remains within what the player currently knows, and is stored with the corresponding scene rather than becoming a gameplay action.

### Acceptance criteria

- [ ] A labelled control in the hints component explicitly requests a stronger nudge; baseline hints do not automatically escalate. Show waiting and success/unavailable states there.
- [ ] The request uses current public facts and permitted actions, has no gameplay mutation capability, and preserves world state, time, RNG, item ownership, and the main conversation.
- [ ] A stronger nudge gives more concrete guidance when supported by player knowledge; when none is justified, it explains that limitation without exposing an undiscovered solution.
- [ ] Cache and restore the resulting guidance for the matching revision. Repeated viewing does not regenerate it, and stale, duplicate, or failed requests do not attach old guidance to the current scene.
- [ ] Browser checks verify explicit escalation, grounding, repeated viewing, restart, and stale/failing requests. The control is keyboard accessible and its result is announced appropriately.

### Blocked by

- #102 — Reveal cached hints only when the player asks

## 104 — Start a fresh game safely in the single save slot

### What to build

Offer New game for the single Hollow Beacon slot. Explain that existing progress and conversation history will be replaced, require confirmation, and produce a clean session while protecting both the current slot and the new game from interrupted writes and old in-flight responses.

### Acceptance criteria

- [ ] An occupied active or completed slot offers an explicit New game confirmation describing replacement. Cancel preserves all state/history/hints; confirm starts Hollow Beacon cleanly with the displayed seed.
- [ ] Replacement clears prior progress, messages, replies, result cards, and both hint levels as one consistent operation. A failed replacement retains or recovers the old verified slot and reports failure clearly.
- [ ] If an AI turn or hint request is in flight, reset waits until safe or is clearly rejected. An old tab or delayed response cannot commit to, display in, or populate hints for the new session.
- [ ] A subsequent reload and process restart recover the new slot without old discoveries or history. No multiple-slot selector, save naming flow, or earlier-adventure browser support is added.
- [ ] Real browser/API/storage tests cover cancel, confirm, write interruption, reset during a turn/hint request, and an old tab after reset. Confirmation and focus recovery work by keyboard.

### Blocked by

- #101 — Recover interrupted browser turns without repeating actions
- #103 — Request a stronger hint without changing the adventure

## 105 — Review a completed adventure without further AI interaction

### What to build

Complete the current Hollow Beacon signal decisions and refusal/departure outcomes through the browser, then enter review mode. Let the player read the final conversation and current information while closing gameplay input, further AI questions, and hint generation.

### Acceptance criteria

- [ ] At least one current signal decision and a refusal/departure route produce truthful engine-owned endings through explicit typed or clicked intent. Ending eligibility and public stakes follow current content; no future increment 8 finale is authored here.
- [ ] After completion, conversation submission, gameplay controls, and stronger-hint requests are closed. Additional requests, including direct API attempts and old tabs, cause no provider call, mutation, time change, or RNG draw.
- [ ] History, ending result cards, journal, inventory, character detail, location, time, and HP remain readable. An outstanding hint result cannot introduce a new message or guidance after completion.
- [ ] Reload and server restart restore the completed review state and exact history. A lost ending response or post-commit AI error recovers the same single ending rather than repeating it.
- [ ] Browser/API/storage tests cover signal and refusal/departure completion, reflection attempts, reload/restart, stale requests, and lost-response recovery while confirming provider-call and commit counts.

### Blocked by

- #99 — Follow exits and conversation topics with one click
- #101 — Recover interrupted browser turns without repeating actions
- #103 — Request a stronger hint without changing the adventure

## 106 — Qualify local browser play and prepare the increment 8 handoff

### What to build

Qualify the completed increment 9 browser experience against Hollow Beacon through issue #84. Exercise a representative saved desktop journey, conduct bounded live-AI checks, prove clean-checkout delivery, and document the delivered contracts needed for the later increment 8 ticket rewrite.

### Acceptance criteria

- [ ] Deterministic browser/API/storage journeys cover typed and clicked play, information views, both hint levels, questions/clarification, signal and refusal/departure endings, exact history restoration, reset, duplicates/stale tabs, and pre/post-commit failure. Browser checks participate in canonical full verification.
- [ ] A direct desktop walkthrough records readability of central conversation and persistent fields, panel and confirmation focus, keyboard operation, history scrolling/new-reply behaviour, waiting/error feedback, and fixes to concrete issues found.
- [ ] Bounded live-AI evidence covers current investigation, dialogue, travel, a selected ending, hints, and saved continuation. Record exact provider/model/content/prompt/tool/rules identities, authoritative outcomes, latency/cost, corrections, and limitations; scripted checks are reported separately.
- [ ] A clean checkout installs, fully verifies with all seven gates and zero warnings, builds, launches, plays, automatically saves, restarts, reviews, and resets using tracked inputs and locally produced artifacts. Preserve verification dashboard and CI behaviour and isolate ports, slots, and test artifacts.
- [ ] The handoff supplies exact PowerShell launch/relaunch commands, concrete content/seed/local save directory, printed-URL expectations, AI prerequisites, browser actions and expected results, and known limits. Unfamiliar-player testing stays in increment 8. Document delivered interfaces for the subsequent rewrite without editing or closing the remaining increment 8 issues in this ticket.

### Blocked by

- #104 — Start a fresh game safely in the single save slot
- #105 — Review a completed adventure without further AI interaction
