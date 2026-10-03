# Increment 9 — Local Browser Play

Scope clarification, 2 October 2026: the single-slot flow and current character panel below describe the initial browser release. [Increment 10](increment-10-implementation-plan.md) adds characters saved independently of games, a character library with Choose character/Create character, full ability sheets, Fighter levels 1–3, and qualified adventure selection with recommended levels. Preserve this increment's historical acceptance contracts; the later character/session records do not retroactively change existing saves or New game behavior.

Direction update, 3 October 2026: the project owner confirmed that the character library is the primary browser mode ([ADR 0004](docs/adr/0004-qualify-the-full-adventure-in-character-mode.md)). The remaining increment 8 tickets #93–#95 were revised to target it explicitly: Hollow Beacon v12 played by a saved character, continuation by rerunning the same launcher command, and abandon/rest/start in place of single-slot New game. The single save slot described here remains only as `--legacy` compatibility for released Hollow Beacon v4–v11 saves. The rest of this document is the historical record.

Status: shared understanding confirmed by the project owner, 1 October 2026. This document consolidates the decisions from the grill-with-docs interview. The approved breakdown is published as GitHub issues #96–#106 with 15 native blocking links; see [the ticket publication index](increment-9-ticket-proposal.md). Implementation has not started in this planning session.

## 1. Intended result and delivery order

A player plays the available Hollow Beacon adventure entirely in a local desktop browser. A central conversation carries their messages, AI narration, NPC dialogue, and concise authoritative result cards. Persistent information and one-click panels make it possible to understand the current situation without repeatedly scrolling through the conversation or entering information commands.

The project owner confirmed that issue #84 is resolved. Pause the remaining increment 8 work at that boundary. Complete all increment 9 tickets, then rewrite the remaining increment 8 tickets against the delivered browser experience, and finally resume increment 8. The ticket rewrite happens after increment 9 so it can use the actual delivered interfaces and capabilities.

Increment 9 covers Hollow Beacon as it exists through #84. It delivers no new adventure branches or rules. Later increment 8 mechanics should fit a consistent action/result presentation, with their detailed UI designed alongside their gameplay. Earlier adventures remain available through their existing interfaces; browser support for them is outside this increment.

See [ADR 0001](docs/adr/0001-build-local-ai-browser-play-before-finishing-increment-8.md) for the sequencing decision and [CONTEXT.md](CONTEXT.md) for the glossary.

## 2. Settled product decisions

| Area                   | Decision                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Play surface           | All player interaction takes place in the browser. Command mode remains useful for testing and compatibility.                                                                    |
| AI                     | Gameplay requires the existing AI service. Players may type ordinary-language actions or questions and use contextual click actions. There is no browser command-only play mode. |
| Deployment             | Local process and browser first. The player configures the API key before launching.                                                                                             |
| Layout                 | Desktop monitor layout with restrained styling and a central conversation.                                                                                                       |
| Persistent information | Current location, exits, time/deadline, and HP are always visible.                                                                                                               |
| Secondary information  | Inventory, character detail, journal, and leads are one click away. Visible people and objects support contextual interaction.                                                   |
| Hints                  | Hints are prepared as the scene changes, grounded in current player knowledge, and hidden until the player opens the component. A stronger nudge requires an explicit request.   |
| Click actions          | Clicking an exit or conversation topic submits an explicit intent immediately. AI presents the response and the engine validates the resulting action.                           |
| Conversation           | Player messages, AI replies, and result cards are persisted and restored after resume.                                                                                           |
| Results                | Consequential changes appear as compact result cards in the conversation; surrounding panels show the current values.                                                            |
| Saving                 | One local save slot, saved automatically as play progresses.                                                                                                                     |
| Restart                | Starting a new game replaces the slot only after explicit confirmation explaining that progress and conversation history will be replaced.                                       |
| During play            | Questions about visible surroundings or known facts are allowed without advancing time or taking a gameplay action.                                                              |
| Completion             | The conversation history and final information remain readable. Further AI questions and gameplay actions are closed.                                                            |
| Response delivery      | A waiting indicator followed by a complete response is sufficient.                                                                                                               |
| Launch                 | A copyable local command starts the process and opens the browser; a printed URL supports manual opening.                                                                        |
| Qualification          | Automated browser checks, a direct browser walkthrough, and bounded live-AI checks qualify increment 9. Unfamiliar-player testing returns during increment 8.                    |

Maps, multiple save slots, a hosted site, phone-specific design, an installer, browser API-key configuration, streamed replies, and support for older adventures in the browser are outside the agreed scope.

## 3. Browser experience

### Start and continue

On launch, an empty slot offers Start Hollow Beacon. An active slot offers Continue and an explicit New game action. A completed slot offers Review and New game. The page identifies the adventure, seed, and session state without exposing internal runtime identifiers.

The launch command checks that the local AI configuration is available and gives a clear setup error when it is missing. The API key stays in the local server process. There is no API-key entry form in the browser.

The local server binds to the loopback interface, selects an available port, prints its URL, and attempts to open the browser. Failure to open a browser leaves the URL usable. Reloading or closing the page does not end the adventure or discard saved progress. Stopping the server and running the launch command again restores the same slot.

Starting over requires confirmation for both active and completed slots. The replacement covers game state, conversation history, and cached hints so the new game cannot inherit information from the old one. The replacement must be atomic and recoverable if writing fails.

### Main layout

The central conversation is the largest reading area. Location, exits, time/deadline, and HP remain visible while the conversation scrolls. Surrounding information must come from current authoritative projections, rather than the latest AI wording.

Inventory, character details, the journal, and leads open through clearly labelled controls. Reading these panels is a local read: it does not require another AI response, advance time, draw a die, or enter another message in the conversation.

Visible people and objects may expose contextual details and legal interaction choices when selected. Show current exits and available topics without displaying an exhaustive command checklist. Invalid or stale choices receive a precise response, refresh current information, and leave the game unchanged.

Use readable typography, clear labels, and modest adventure styling. Buttons, panels, confirmation, and chat input must be usable by keyboard, with visible focus and understandable status announcements. Scroll behaviour should let a player revisit earlier messages without being repeatedly pulled to the bottom; make new replies discoverable while they are reading history.

### A player turn

The player types one ordinary-language request or clicks one offered intent. Their request appears in the conversation. Show a waiting state and prevent duplicate submission while that turn is in progress.

The existing AI orchestration interprets the request using current visible context and legal tools. The engine owns facts, rules, time, RNG, item ownership, and the result of an accepted action. Retain the established limit of one gameplay mutation per attempt. Clarifications and questions leave state, time, and RNG unchanged.

Show the complete AI reply and any consequential result cards. Attribute NPC dialogue to the speaker. Cards explain changes such as elapsed time, a discovery, damage, or an item transfer without repeating the entire character sheet. Refresh all panels from the resulting state.

Persist the displayed conversation as well as committed game progress. The input becomes available when the turn has reached a stable result. The browser should expose a saved, waiting, or failed state when useful to the player, without presenting internal trace machinery as gameplay.

### Hints

Hints use current public facts, known leads, visible targets, and legal actions. The game determines the allowed information; AI may phrase the guidance. Hints must not introduce an undiscovered fact, invent a legal action, or claim a result that has not happened.

Prepare and cache hints as relevant scene/state changes occur. Opening or reopening the component displays the cached guidance immediately, without another gameplay action or reroll. The component starts hidden; it must not expose its text in another visible panel or automatically open during play.

A stronger nudge is an explicit request, remains grounded in player knowledge, and cannot mutate gameplay. Bind generated guidance to its originating state revision so delayed hints cannot replace the current scene's hints. Hint generation failure must leave committed progress intact and give a clear unavailable state in the hints component.

### Completion

An ending saves the final state and conversation. The browser changes to review mode, closes chat submission and gameplay controls, and makes the final result, history, journal, inventory, and character details readable. It makes no further AI calls for questions or hints after completion. New game remains available through the confirmed replacement flow.

## 4. State, history, and failure contracts

The current runtime exposes structured scene and character projections through `AdventureRuntime`, while `playGame` binds orchestration to terminal input and text output. Build a browser adapter around the existing runtime, AI orchestration, and save authority. Do not use terminal text scraping as the browser data contract.

Add a deliberate player-safe projection for persistent fields, including structured time/deadline, visible exits, legal contextual actions, ending choices, journal classifications, and result cards. Existing scene descriptions contain some clock and ending information as prose; the UI should not extract these values by parsing descriptions. Raw canonical state and embedded adventure/save snapshots contain hidden information and must stay on the server.

Current saves preserve authoritative state and verified transitions, but AI turns do not retain exact player utterances or rendered AI replies. Command turns retain their raw command input. Browser history therefore needs a versioned persistence contract linked to the corresponding game progress. [ADR 0002](docs/adr/0002-restore-conversation-without-making-narration-authoritative.md) records the distinction. The implementation must define and test how game commits, history writes, and recovery remain consistent when interrupted between steps.

Restoring history must not reexecute its messages, tools, or result cards. Persisted conversation is for player review; current canonical facts and bounded, speaker-scoped AI context remain the source of truth for subsequent turns. Keep the model context bounded even when the visible history is long.

Use the existing verified save/action path for mutation, including RNG and replay authority. Preserve old save and trace interpretation, historical adventure identities, and CLI behaviour. A browser record can extend presentation persistence without making released engine saves unreadable. The initial browser slot starts Hollow Beacon; import and export UI for older saves is not required.

Serialize writes to the single slot and attach requests to a session generation/state revision. Duplicate requests, browser reloads, stale clicks, and multiple tabs must not produce duplicate turns or apply an old request to a newly reset game. The implementation should reject stale intent and return current player-visible state.

| Failure boundary                      | Required result                                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI fails before a commit              | Report failure; leave gameplay state/time/RNG unchanged; allow retry when the service returns.                                                                  |
| AI narration fails after a commit     | Display the verified action result or authored reply, save it, refresh panels, and make the committed status clear. A narration retry cannot repeat the action. |
| Browser disconnects during a turn     | The server completes or recovers the turn safely. Reload returns current state/history and never resubmits the action automatically.                            |
| Save write fails                      | Report the failure and retain a recoverable, verified position. Do not report a durable save that did not succeed or silently reroll on retry.                  |
| Hint generation fails or returns late | Preserve game progress; keep current cached hints or report unavailability; reject guidance for a stale revision.                                               |
| Reset overlaps an old turn            | Resolve the old turn before replacement or reject replacement until safe; never transfer old results into the new game.                                         |
| Completed game receives input         | Return the final read-only view without an AI call, mutation, or draw.                                                                                          |

## 5. Delivery slices for a ticket breakdown

These six planning boundaries are expanded into eleven published implementation tickets, #96–#106, in [the ticket publication index](increment-9-ticket-proposal.md). Each ticket demonstrates a player-visible result and receives its own focused tests and commit.

1. **Launch and read Hollow Beacon in the browser.** Add the local launch command, loopback server, desktop shell, player-safe structured projections, and central scene presentation. Demonstrate an empty slot/start and persistent location, exits, time, and HP. Surface missing AI configuration clearly.
2. **Play one AI turn and inspect current information.** Connect typed requests and contextual click intents to existing AI/engine authority. Show complete replies, attributed dialogue, result cards, and one-click inventory/character/journal/leads. Demonstrate a conversation, an investigation, travel, and a question that costs no time.
3. **Continue the single slot with exact conversation history.** Persist and restore messages, replies, and cards alongside verified game progress. Demonstrate browser reload, server restart, automatic saving, and confirmed new-game replacement. Include interruptions between engine commit and narration/history persistence.
4. **Ask for optional hints.** Generate state-grounded, cached guidance, hidden by default, with an explicit stronger-nudge request. Demonstrate that viewing hints costs no gameplay action and that stale or failed generation cannot corrupt progress or expose unearned facts.
5. **Recover safely and review an ending.** Complete the pre/post-commit failure flows, stale and duplicate input handling, reset races, and completed-session review. Demonstrate one committed result after a lost response and no AI questions after ending. Exercise the currently available Hollow Beacon signal decisions and refusal/departure outcomes; the later full-adventure finale remains increment 8 work.
6. **Qualify local browser delivery and hand off.** Run representative automated browser journeys, a direct desktop walkthrough, bounded live-AI checks, and clean-checkout install/start/continue/reset evidence. Record commands, current supported content, exact tested provider/model/prompt/tool versions, and known limitations. Finish all increment 9 tickets before the increment 8 rewrite.

Use the published tickets' explicit blocking edges to select work; the six slices above describe the delivery progression. Concurrent write-capable work needs branch-backed worktrees from explicit refs and isolated server ports, slot directories, temporary paths, and browser-test output. Integrate and fully verify in one designated checkout.

## 6. Verification and exit criteria

Critical workflows must be tested through the actual browser, local API, and persisted storage. Scripted AI responses can make automated checks deterministic, but the player product still requires live AI. Unit or API tests alone are insufficient evidence for browser start/play/continue/reset.

Required representative checks include:

- A seed-0 opening/watch journey through ordinary input and click actions, checking player-visible facts, panels, and result cards against engine state.
- A question and panel reads that preserve time and RNG; a rejected or ambiguous request that does the same.
- Hints hidden by default, immediately viewable after generation, state-grounded, and unchanged by repeated opening.
- Browser reload and two-process restart restoring identical gameplay state and exact displayed history without executing old messages.
- Duplicate submission, a stale exit/topic, and a second browser tab producing no duplicate commit.
- Provider failure before a commit and after a commit, including reload/retry after a lost response.
- Confirmed reset creating a clean slot with no previous history or hints, including protection against a turn still in flight.
- A supported signal decision and a refusal/departure ending closing gameplay and AI questions while preserving final history and information.
- Desktop layout, keyboard operation, panel focus, history scrolling, waiting/error states, and secret-safe response rendering.
- Existing compatibility suites for saves, traces, adventures, and CLI behaviour, plus replay evidence for browser commits where applicable.

Extend `npm.cmd run verify` to include the necessary browser checks while preserving its seven required gates, order, and zero-warning standard. Focused tests remain lightweight. Preserve the observational verification dashboard, its loopback/allocated-port behaviour, CI opt-out, and failure isolation. Provider calls requiring credentials remain separately identified from deterministic verification.

Before handoff, verify installation, build, startup, play, automatic save, restart, and reset from a clean checkout using tracked files. Use the supported Node/npm versions and record actual commands, seed, local slot directory, printed URL, AI prerequisites, and results. A proposed launch contract for ticket design is `npm.cmd run web -- --seed 0 --save-dir .scratch/increment-9-demo`; this command does not exist yet. The final handoff must use the implemented command.

Unfamiliar-player testing is deliberately deferred to increment 8. Increment 9 evidence establishes browser correctness and delivery, rather than enjoyment or whether the eventual full adventure is understandable. Do not expand the live-AI sample into a full adventure qualification while the later adventure content is unfinished.

## 7. Return to increment 8

After increment 9 completes, inspect the delivered contracts and rewrite the remaining increment 8 tickets before resuming implementation:

| Remaining work                                                               | Rewrite direction                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #85–#91: routes, trust, combat, recovery, quest item, confrontation, endings | Keep their intended gameplay results and add focused browser/API/storage journeys, truthful panel updates, contextual actions, and saved-history expectations.                                     |
| #92: scene, journal, character presentation                                  | Reconcile the UI already delivered in increment 9 with the needs of a longer adventure and new mechanics. Scope only remaining work.                                                               |
| #93: local slots/start/continue                                              | Reconcile with the delivered single-slot flow. Multiple slots require a later explicit scope decision.                                                                                             |
| #94: full live-AI journey                                                    | Qualify a full browser journey, long-session context, hints, save continuation, and safe service failure. Browser gameplay continues to require AI.                                                |
| #95: external qualification                                                  | Restore unfamiliar-player testing for the completed game through its intended browser experience, including comprehension, meaningful choices, continuation, and desire to play another adventure. |

Preserve completed issue history and separate implementation commits. Change remaining issue scope only in the agreed post-increment-9 rewrite. Until that step, this document and ADR 0001 explain why the previous increment 8 terminal/UI boundary is being revisited.
