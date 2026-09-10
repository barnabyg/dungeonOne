# Increment 1 — The Smallest Playable Dungeon

Status: proposed implementation plan, ready for review and subsequent conversion into issues. No implementation issues are created by this document.

Source: [high-level implementation plan](dnd-ai-dungeon-master-implementation-plan.md), especially increment 1, delivery principles, and testing strategy.

## 1. Review and recommendation

The roadmap's first increment is appropriately small: prove that a person can finish a dungeon whose outcomes come from deterministic rules rather than narration. Retain that scope. The main gaps to resolve before implementation are the player interface, exact supported rules, combat timing, adventure completion conditions, and what replay promises.

Use a local terminal application with explicit commands and templated narration. This is the smallest interface that exercises real input, rules, state, and presentation together. Free-text interpretation remains increment 2. A browser interface would be a deliberate change to this proposal, with additional interaction and distribution work.

Two apparent overlaps in the roadmap should be interpreted narrowly:

- Increment 1 separates an immutable, built-in adventure definition from mutable session state. Increment 4 introduces an external adventure format, loader, and comprehensive validation.
- Increment 1 records a session trace and supports deterministic replay for debugging. Increment 6 introduces durable world history, save/load, and session resume. An in-memory authoritative state is sufficient here.

The example includes opening a door, although increment 2's illustrative tool list omits `open`. Include an explicit `open` action now and retain that capability when designing increment 2's tools.

## 2. Intended player experience

A tester installs the documented prerequisites, launches one command, reads the objective, explores three rooms, opens a door, defeats a goblin, retrieves a stolen signet, and leaves through the far exit. A complete run should take about 5–10 minutes, including learning the controls.

The game shows the current room, visible objects and exits, fighter HP, objective, and relevant commands. Combat output shows initiative, whose turn it is, attack rolls, modifiers, AC, damage, and remaining HP. Death and victory produce explicit endings and instructions for starting another run.

The player needs neither an AI account nor credentials nor a network connection during play. Dependency installation and security checks may need network access.

## 3. Proposed technical decisions

These are defaults for ticket generation, not claims about an existing implementation. The repository currently contains planning and agent documentation, with no application stack to preserve.

| Area | Proposed choice | Reason |
|---|---|---|
| Runtime | TypeScript on a supported Node.js LTS release | One language for the engine, command adapter, and verification support |
| Interface | Line-oriented terminal commands using standard input/output | Small, scriptable, and easy to exercise end to end |
| Dependencies | Minimal runtime dependencies; lock dependencies and pin tools | Avoid framework work before gameplay |
| State | One in-memory session owned by an application service | No database or save migration work in this increment |
| Content | One built-in typed adventure definition | Separate facts from current state without an external content platform |
| Randomness | Explicit, versioned seeded generator with documented algorithm | Stable results across processes and deterministic regression tests |
| Testing | Unit and scenario tests plus spawned-process CLI tests | Prove both mechanics and the user-facing boundary |
| Distribution | Clone, install, build, run locally | No hosting, installer, or package-registry release |

Select and verify maintained tool versions during the initial implementation slice. The command names below are proposed contracts to implement; they do not exist yet.

## 4. Concrete adventure

Working title: **The Stolen Signet**.

| Location | Initial facts | Available progression |
|---|---|---|
| Entrance | Fighter starts here; objective is displayed; wooden door is closed but unlocked | Inspect or open the door; move to guardroom once open |
| Guardroom | One living goblin; passage to reliquary; entrance door connects back | Entering starts combat immediately; passage becomes usable when combat ends |
| Reliquary | One stolen signet on a pedestal; far exit | Take signet, then use `leave` to win |

The signet is a simple object with no hidden check or puzzle. There is no treasure elsewhere. The door is a single shared entity, so opening it from either side affects both sides. It stays open. No close, lock, break, or pick-lock actions are needed.

After combat, revisiting the guardroom shows the dead goblin and never starts a second encounter. All three rooms remain traversable within the dungeon. There is no retreat from active combat and no exit through the entrance in this slice; the introduction and help must make those limitations clear.

Victory requires a living fighter at the reliquary, possession of the signet, and an explicit `leave` action. Attempting to leave without it explains the missing objective and leaves the game playable. Taking the signet alone does not win.

## 5. Explicit rules subset

This is a deliberately simplified D&D-style ruleset, not a claim of complete edition compatibility. Keep these values in definitions, not scattered through combat code.

| Statistic | Prebuilt fighter | Goblin |
|---|---|---|
| Maximum and starting HP | 20 | 7 |
| AC | 16 | 13 |
| Initiative modifier | +1 | +2 |
| Attack modifier | +5 | +4 |
| Weapon | Longsword | Scimitar |
| Damage on ordinary hit | 1d8 + 3 | 1d6 + 2 |

These are proposed encounter-tuning values. Confirm through seeded runs and a manual playtest that the introductory fight is approachable. Preserve meaningful loss coverage even if values are adjusted before release; do not add hidden mercy rolls or reroll outcomes.

Combat semantics:

1. Entering the guardroom with a living goblin rolls initiative once: fighter first, then goblin. Higher total acts first; ties favour the fighter. Order remains fixed throughout the fight.
2. If the goblin wins initiative, resolve its first turn before prompting the player. Thereafter each participant gets one attack per turn. A round consists of both participants' turns unless someone dies first.
3. An attack rolls 1d20. Natural 1 always misses; natural 20 always hits and rolls twice the weapon's damage dice, adding the modifier once. Otherwise a total equal to or above AC hits.
4. Roll damage only on a hit. Clamp HP at zero. Zero HP means immediate death; omit death saves, unconsciousness, and recovery.
5. A dead combatant never acts. Killing the goblin ends combat immediately, without a retaliation. Fighter death ends the session in defeat immediately.
6. The goblin attacks the fighter with its one weapon whenever it has a turn. No tactical AI, target selection, movement, or special abilities.
7. During the fighter's turn, only a valid attack advances combat. Read-only commands and rejected commands do not spend a turn or trigger a goblin attack.

No ability checks, saving throws, advantage/disadvantage, opportunity attacks, range, bonus actions, resting, healing, levelling, equipment switching, or encumbrance. The fighter's weapon is fixed equipment; the collectible inventory contains the signet only.

## 6. Player commands and action contract

Use documented canonical names and case-insensitive matching. Avoid fuzzy matching and compound-command interpretation. Internally use stable entity IDs rather than display strings.

| Command | Behaviour |
|---|---|
| `help` | List commands with examples and current combat restrictions |
| `look` | Describe current room, visible entities, and exits |
| `inspect <target>` | Describe a visible room feature, door, creature, exit, or carried item |
| `open <door>` | Open an accessible door outside combat; already-open is an informative no-op |
| `move <location>` | Move through an adjacent, open connection outside combat |
| `attack <target>` | Attack the living goblin during the fighter's combat turn |
| `take <item>` | Transfer the visible signet into inventory outside combat |
| `inventory` | Show collectible inventory and fixed weapon separately |
| `status` | Show fighter HP, session outcome, and combat turn when applicable |
| `leave` | Attempt the objective-gated exit from the reliquary |
| `quit` | End the process cleanly without declaring victory or defeat |

Empty input, unknown verbs, missing arguments, invisible targets, and unsupported commands produce actionable feedback rather than exceptions. Reject moving through a closed door, moving to a nonadjacent location, taking the same object twice, and attacking an absent or dead target. Repeated read commands must not alter future dice results.

After victory or defeat, permit help, read-only inspection of the final visible state, and quit; reject further gameplay mutations. End-of-input should exit cleanly from interactive and piped sessions.

The engine receives structured actions, validates them independently of the CLI, and returns either a successful result or a typed rejection. Failed actions leave gameplay state and RNG position unchanged. This makes the action boundary usable by increment 2 without trusting its future AI caller.

## 7. Implementation boundaries and state ownership

Keep these as small modules in one application, not separate services:

- **Adventure definition:** stable IDs, room descriptions, connections, initial door state, entity placement, combatant definitions, and objective facts. No session mutation.
- **Rules:** initiative, attack, damage, and death calculations using explicit dice input. No terminal output or adventure-specific room names.
- **Session engine:** authoritative current location, HP, door state, item ownership, encounter state, turn order, outcome, and RNG state. Validates actions and coordinates rule resolution.
- **Session trace and replay:** records structured inputs, outcomes, events, and randomness for reproduction. Does not become an alternative state authority.
- **CLI and presenter:** parses commands, dispatches actions, renders results and a player-visible state projection. It cannot directly modify HP, placement, inventory, or outcome.

A successful action returns the updated state and ordered structured events. An ordinary attack action may include the player's attack, the automatic goblin response, and the next player turn. Stop immediately if either attack creates a terminal condition.

Useful events include room entered, door opened, combat started, initiative rolled, turn started, attack resolved, damage applied, combatant died, combat ended, item taken, and adventure won/lost. Define only events required by this slice. Events carry IDs and mechanical facts; narration is derived from them. Read-only responses and rejected requests are trace entries, not fictional world changes.

Invariants to enforce through the action boundary:

- HP is always between zero and maximum HP.
- An item has exactly one owner/location; pickup cannot duplicate it.
- Dead creatures cannot act, and completed encounters cannot restart.
- Active combat has a legal next actor; a terminal session has no pending automatic turn.
- Only legal adjacent movement changes location.
- A rejected action cannot partially apply damage, movement, inventory changes, or random draws.
- Narration reports the engine's result and never resolves a rule itself.

## 8. Deterministic randomness and replay

Support an explicit unsigned 32-bit integer seed at startup. Reject invalid seeds with a clear usage error. When no seed is supplied, choose one once and print it. All gameplay randomness must use the session generator; IDs, wall-clock timestamps, and presentation must not consume its draws.

Document draw ordering: fighter initiative, goblin initiative, then each attack's d20 followed by damage dice only on hits. Critical hits consume two damage dice. Test the generator against fixed known vectors. Boundary rules tests can inject an explicit dice sequence without exposing a cheat command in the player interface.

Provide optional trace export and a headless replay command. A trace contains format version, rules/adventure version, initial seed, ordered submitted actions, rejections, roll records, structured events, and deterministic state comparisons after each action. Keep raw CLI input for diagnosis, but replay through the structured action boundary. Exclude timestamps and prose from equality checks.

Replay starts from the initial state, re-executes actions with the recorded seed, and checks every recorded result and final state. Report the first mismatch and exit nonzero. Reject malformed traces and unsupported versions clearly. Validate trace data as input; it cannot set arbitrary session state.

This is reproduction from the beginning, not mid-session resume. No event-sourcing framework, database, snapshot migration system, or public adventure loader is required. Once a trace format is released, it is an export compatibility contract: keep old supported traces readable; obtain approval before removing support. Version mismatch errors must be explicit rather than silently producing another outcome.

## 9. Delivery sequence for subsequent ticketing

Each slice owns its implementation, focused tests, and documentation updates. These are capability boundaries for the to-tickets step, not a request to create separate infrastructure, engine, and UI tickets for every layer.

### Slice A — Launch, look around, and walk through the dungeon

Deliver the runnable TypeScript project, built-in three-room definition, authoritative session boundary, and terminal loop. Implement help, look, inspect, status, inventory, move, quit, and basic input rejection. At this intermediate point, rooms are connected by open passages and the encounter is not active.

Acceptance:

- A tester can launch, visit all three locations, inspect visible features, and quit without editing code.
- Nonadjacent movement and unknown commands explain the problem and preserve location.
- Spawned-process tests cover startup, traversal, invalid input, and clean EOF.
- Establish the canonical verification command, CI, and required live dashboard as part of this first executable slice.

Dependencies: none. This is a walking skeleton, not increment completion.

### Slice B — Open the door, retrieve the signet, and escape

Add the closed shared entrance door, open action, signet ownership, take action, leave action, and victory state. The goblin encounter is still inactive in this intermediate slice.

Acceptance:

- Closed-door movement fails; opening it allows traversal, including returning through the same door.
- The player can reach the reliquary, take the signet, and leave to win.
- Leaving without the signet, taking it remotely, and duplicate pickup cannot complete or corrupt the game.
- After victory, gameplay mutations fail and final status remains readable.
- A complete CLI playthrough verifies the objective and victory through the actual interface.

Dependency: A.

### Slice C — Survive the goblin encounter

Activate the guardroom encounter. Add seeded dice, fighter and goblin statistics, initiative, automatic enemy turns, attacks, damage, death, and defeat. Integrate mechanical feedback into the terminal presentation. This turns the existing escape route into the target increment 1 adventure.

Acceptance:

- Both initiative orders work, including an enemy opening turn and ties favouring the fighter.
- Ordinary hits, AC equality, misses, natural 1, critical hits, and lethal damage follow the documented rules.
- A lethal player attack prevents retaliation; a lethal goblin attack prevents further player actions.
- Combat blocks movement, opening, taking, and leaving; look/status/help and rejected input spend no turn or randomness.
- Fixed seeds produce repeatable victory and defeat in CLI tests. Discover and record those seeds after implementing the generator; do not guess them in tickets.
- The dead goblin remains dead on a return visit; the signet-and-exit victory path remains intact.

Dependency: B. Seeded randomness lands with combat, rather than as unused early infrastructure.

### Slice D — Reproduce complete sessions

Add versioned trace export and replay, building on structured events already returned by the engine. Capture successful actions, invalid attempts, and automatic enemy actions without creating a second implementation of combat.

Acceptance:

- Export and replay both a winning run and a losing run from the CLI.
- Replayed events, rolls, per-action state, and final state match the original.
- Inserted read-only or invalid commands do not change later combat outcomes.
- Altered expected results produce a useful first-mismatch report and nonzero exit.
- Malformed files, unsupported versions, and unwritable export paths produce clear errors. An export failure must not report a successful export or change the gameplay outcome.

Dependency: C.

### Slice E — Verify the tester handoff

Finish onboarding and playtest the complete adventure. Consolidate executable scripted playthroughs and manual instructions. Adjust confusing feedback or encounter tuning where observed, preserving regression coverage.

Acceptance:

- A clean checkout can install, verify, build, and start using only documented commands and tracked files.
- An unfamiliar tester completes a winning run without developer intervention and can understand a losing run.
- Instructions include normal play, seed selection, replay export, replay execution, supported commands, and the simplified rules.
- Full verification passes with no unresolved diagnostics or undocumented suppressions.

Dependency: D. Tests are added throughout A–D; this slice is the integrated acceptance check.

## 10. Verification requirements

Follow the supplied global verification and dashboard guidance during implementation. Proposed commands:

```powershell
npm.cmd ci
npm.cmd run verify
npm.cmd run build
npm.cmd start -- --seed <recorded-winning-seed>
npm.cmd start -- --seed <recorded-winning-seed> --trace ./run.json
npm.cmd run replay -- ./run.json
```

Document the exact supported runtime version and commands when implemented. The canonical `verify` command must not rewrite source files. Its gates run in this order: formatting; lint/style; compiler/type checks; static bug analysis; automated tests; dependency/vulnerability/secret/package checks; build/packaging validation. Reuse tools across gates where appropriate and document inapplicable checks rather than adding redundant analyzers. CI runs the same gates headlessly.

Interactive full verification automatically starts a localhost-only observational dashboard and prints `TEST_DASHBOARD_URL`. Show active stage, test progress where available, elapsed time, recent output, failures, and final result. Document default/free-port behaviour and opt-out. Dashboard/reporting failures fall back to terminal output without changing gate order or exit status. Cover dashboard state, endpoints, ordering, degradation, and concurrent-run isolation with focused tests. Keep focused gameplay tests lightweight, with no dashboard startup.

Required test layers:

| Layer | Evidence |
|---|---|
| Rules unit tests | Initiative ties; AC boundary; natural 1/20; critical modifier applied once; damage bounds; HP clamp; generator vectors |
| Engine scenarios | Door traversal; inaccessible targets; item ownership; both turn orders; immediate death handling; no combat restart; terminal action rejection |
| Determinism/replay | Same seed/actions produce same events and state; reads/rejections preserve RNG; replay mismatch and format errors |
| CLI end to end | Launch to victory; launch to defeat; invalid input recovery; EOF; trace export and replay through built entry points |
| Clean-checkout validation | Install, canonical verification, build, launch, and one complete scripted game with no ignored local dependencies |

Do not rely on exact narration snapshots for correctness. Assert mechanical facts, prompt availability, exit behaviour, and player-visible outcome. Test pure rule boundaries using explicit rolls and full gameplay with real seeds.

## 11. Manual acceptance script

Prerequisites: clean installation, built application, and recorded winning/losing seeds provided by slice C.

1. Launch with the winning seed. Expect the objective, starting HP, entrance description, seed, and help hint.
2. Try moving to the guardroom before opening the door. Expect an explanation and unchanged location.
3. Inspect and open the door, then move to the guardroom. Expect exactly one initiative sequence and a clear player prompt after any enemy opening turn.
4. During combat, use status/help and try an illegal movement. Expect no extra enemy attacks or HP changes.
5. Attack until the goblin dies. Expect visible attack/damage arithmetic, zero goblin HP, combat ended, and no retaliation after the killing blow.
6. Walk back to the entrance and return. Expect the open door and dead goblin to remain unchanged.
7. Move to the reliquary and try leaving without the signet. Expect the objective reminder. Take it, check inventory, attempt duplicate pickup, then leave. Expect exactly one signet and explicit victory.
8. Try another attack after victory. Expect rejection and unchanged final state; quit cleanly.
9. Repeat with the losing seed. Expect defeat at zero fighter HP and no subsequent combat turn.
10. Export a run and replay it using the documented command. Expect a matching final outcome and successful comparison.

Also conduct one unseeded usability run. Record confusion, unclear prompts, and tuning observations; an automated victory is not evidence that the interface is understandable.

## 12. Increment exit gate and exclusions

Increment 1 is complete when the full three-room adventure is playable through the documented interface, both endings are verified, state and presentation are separated, session reproduction works, full verification passes, and an unfamiliar tester finishes without developer intervention.

Out of scope: LLM integration, natural-language parsing, NPC dialogue, character creation, multiple weapons or monsters, spells, consumables, tactical combat, external adventure files, save/resume, multiplayer, deployment, and production scaling. The live verification dashboard is development tooling, not a browser game interface.

Before ticket creation, the substantive product choice to review is the proposed terminal-first interface. The remaining defaults above make increment 1 implementable without repeatedly rediscovering combat, victory, or replay semantics. If a browser experience is preferred, revise the interface and end-to-end testing sections before generating issues.
