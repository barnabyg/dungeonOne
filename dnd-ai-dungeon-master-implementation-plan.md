# D&D AI Dungeon Master — High-Level Implementation Plan

## 1. Goal

Build a playable Dungeons & Dragons-style game with a local desktop browser interface centred on text conversation, staying close to the tabletop model:

- a deterministic rules system decides what happens;
- a player owns independently saved characters and chooses which character to bring to an adventure;
- an adventure defines what is true;
- an AI Dungeon Master interprets player intent, presents the world, roleplays NPCs, and narrates outcomes.

Browser gameplay requires the AI service. Command mode remains available for automated testing and compatibility with existing adventures and saved data. The browser experience begins with Hollow Beacon; earlier adventures do not require browser support.

Scope update, 2 October 2026: [increment 10](increment-10-implementation-plan.md) is implemented locally on `codex/gameplay-ui`: independently saved character sheets, creation/selection, Fighter levels 1–3, and two adventures with recommended level ranges. Separately versioned character-enabled play preserves existing adventure/save/trace behavior. Live-provider and unfamiliar-player qualification remain pending. [ADR 0003](docs/adr/0003-save-characters-independently-of-adventure-sessions.md) records the ownership decision; the [player handoff](docs/acceptance/increment-10-characters.md) records concrete testing steps.

Direction update, 3 October 2026: the character library is the default and primary browser mode. Players bring a saved character to an adventure module within its recommended level range. The remaining increment 8 tickets (#93–#95) were revised to qualify the full adventure in that mode, with Hollow Beacon v12 played by a new level-1 character. The browser's `--legacy` mode keeps the increment 9 single save slot only so released Hollow Beacon v4–v11 saves remain playable. The command-line app is a testing and regression adapter. [`src/browser-releases.ts`](src/browser-releases.ts) lists which releases start new play and which only continue; the [#93 handoff](docs/acceptance/issue-93.md) records the start/continue flow.

The delivery strategy is based on **small playable vertical slices**. Each increment should be something a person can actually play, even if the content is tiny and the experience is rough. Every increment should also retire a meaningful technical or design risk.

The project should optimise for:

1. **Playable features**
2. **Enjoyable user experience**
3. **Small increments**
4. **Testability**

It should deliberately _not_ optimise early for:

- performance;
- production-grade non-functional requirements;
- breadth of content;
- large numbers of classes, spells, monsters, locations, or adventures.

Three good monsters are more useful than thirty partially implemented monsters.

---

## 2. Core Architecture

Keep the major responsibilities separate from the beginning.

### Rules Engine

Deterministic software responsible for:

- character statistics;
- ability modifiers, character levels, and earned experience points;
- dice;
- checks and saving throws;
- attacks and damage;
- hit points;
- conditions;
- initiative;
- movement/range where needed;
- inventory;
- spell/resource use;
- rests;
- death and recovery.

The AI should not decide rule outcomes.

### Character Model

A character is the persistent adventurer controlled by a player. Its character sheet is saved independently in a character library before an adventure is selected. It contains identity, class, the six ability scores, earned experience, level-derived capabilities, and permanent equipment. Multiple saved characters are supported; closing the interface or canceling adventure selection preserves a newly saved sheet.

The first character-enabled release supports Fighters at levels 1–3. Strength, Dexterity, Constitution, Intelligence, Wisdom, and Charisma affect supported combat or authored checks through explicit, versioned rules. The engine derives bonuses from the sheet; new adventures define difficulty and circumstances rather than a fixed player combat profile. [Fighter rules v1](docs/character-rules.md) defines the presets, modifiers, HP/attack progression, equipment and XP thresholds as explicit old-school-inspired house rules.

An adventure session references the selected character and records its initial sheet snapshot for deterministic save/resume and replay. The character library owns identity and career progress; the session owns evolving adventure state and provides verified results to the character record. One active adventure per character prevents two games from independently advancing the same sheet. Reopening a historical game cannot roll back current career progress or create another selectable character.

Use new versioned content, rules, saves, and traces for character-enabled play. Preserve historical formats and runtime tuples with their original results; do not invent ability scores or a level for a character in an old save. Character/adventure writes must recover safely after interruption and accept earned rewards exactly once.

### Adventure Model

Structured data describing:

- supported character rules/classes, intended character count, and a recommended inclusive level range;
- stable reward identities and authored XP awards;
- locations;
- NPCs;
- monsters;
- encounters;
- clues;
- secrets;
- factions;
- treasures;
- quest states;
- important world facts;
- event clocks or timelines.

The adventure establishes canon.

An adventure module and a saved character sheet are separate resources. The player selects both to start an adventure session. New modules declare a recommendation such as levels 1–3 for one Fighter. Validate ranges and supported capabilities; show a warning for a supported character outside the recommendation and reject an unsupported rules version, class, or level. Initial enemies and difficulties remain authored rather than automatically scaling with level.

### World State

Persistent current reality within an adventure session, linked to its selected character and initial character snapshot:

- where everyone is;
- who is alive;
- current HP/resources;
- doors opened or locked;
- clues discovered;
- NPC attitudes;
- quest states;
- elapsed time;
- important historical events.

The world-state store is authoritative. The LLM's context is not.

Conversation history is persisted for the player to revisit, including their messages, AI replies, and authoritative result cards. Restoring that history must not reexecute actions or turn narration into game facts. The journal and current world state establish what the player has learned; the AI receives bounded context derived from that state.

### AI Dungeon Master

Responsible for:

- interpreting free-text player intent;
- choosing valid game-engine actions;
- describing scenes;
- narrating rule outcomes;
- roleplaying NPCs;
- selecting currently offered checks for eligible authored approaches;
- improvising non-canonical detail;
- managing pacing within explicit constraints.

The AI should operate through a defined set of tools rather than directly rewriting game state.

### UI

The player completes the supported adventure in a local desktop browser. Use a restrained reading interface with a central conversation and surrounding information components.

Current location, exits, time/deadline, and HP are always visible. Character-enabled play also shows the selected name, class, and level. Inventory, the full character sheet, journal, and leads are one click away. The sheet shows six scores/modifiers, current and maximum HP, actual equipment, attack/damage, initiative, conditions, and XP progress. These information views read current authoritative state without making another AI request or taking a gameplay action.

The character-enabled opening offers **Continue adventure**, **Choose character**, and **Create character**. The library lists saved names, classes, levels, and availability. Create character lets the player review and save a named level-1 Fighter without starting a game. Choosing an available character leads to adventure selection with recommended levels and compatibility/difficulty warnings; a character already adventuring offers continuation of that game. Creating or choosing a sheet is local and does not require an AI response.

Players type ordinary-language actions and questions or click contextual actions such as an exit or conversation topic. A click submits the intent immediately. The AI presents the response, and the engine validates and resolves the action. Questions and clarification do not advance time or consume a gameplay action.

Consequential changes appear as concise result cards in the conversation, while surrounding components display current values. Attribute NPC dialogue to its speaker and distinguish authoritative results from AI narration. Show a waiting indicator followed by a complete response.

Prepare hints as the scene changes, using information the player currently knows and actions the engine permits. AI may phrase that guidance. Keep the hints component hidden until requested, cache its content for immediate viewing, and require an explicit request for a stronger nudge. Hints must not expose undiscovered facts or fabricate outcomes.

Increment 9's initial browser release saved automatically to one local slot, including exact conversation history. Resume restores both progress and history. Its New game confirmation explains replacement of that slot's progress and conversation. After an ending, history and final information remain readable; gameplay input and further AI questions are closed. Since increment 10 that single slot is the `--legacy` compatibility mode for released Hollow Beacon v4–v11 saves; new play uses the character library.

Increment 10 separates saved characters from adventure session records. **New adventure** and **Create character** are distinct actions: starting or restarting an adventure never deletes a saved character or resets earned career progress. Active-session replacement or abandonment requires explicit confirmation and recoverable persistence. Completed adventure records retain their historical sheets and conversation. This introduces the managed records required for character continuation, not a general named-slot manager.

The player configures the API key before launching a local command that starts the server and opens the browser. Keyboard operation, readable labels, visible focus, and useful waiting/error feedback are part of the initial UI. Maps, multiple slots, a hosted site, phone-specific design, an installer, browser key configuration, and streamed replies are deferred.

See [the increment 9 plan](increment-9-implementation-plan.md) for the initial UI, persistence, and failure contracts, [the increment 10 plan](increment-10-implementation-plan.md) for independent characters and progression, and [the glossary](CONTEXT.md) for character, adventure session, conversation history, journal, hint, and save slot terminology.

---

# 3. Delivery Principles

## 3.1 Every Increment Must Be Playable

An increment is not:

> "Implement inventory system."

A playable increment is:

> "The player can find a healing potion in a room, add it to inventory, use it during a fight, and see HP restored."

Features should normally enter the project as part of an end-to-end gameplay loop.

## 3.2 Introduce Risk Before Breadth

Prioritise uncertain things before repetitive things.

High-risk examples:

- can an LLM reliably translate free text into safe game actions?
- can canon remain consistent?
- can NPC conversations respect hidden knowledge?
- can the AI avoid inventing rule outcomes?
- can a generated adventure actually be completed?
- can a multi-hour session remain coherent?

Low-risk examples:

- adding the tenth monster;
- adding another sword;
- adding another room type.

## 3.3 Determinism Is a Testing Feature

Where practical:

- seed dice rolls;
- make rules functions pure;
- record game events;
- allow replay;
- capture AI tool calls;
- support mocked AI responses.

A failed game should be reproducible.

## 3.4 AI Output Is Untrusted Input

Treat the Dungeon Master as an intelligent but fallible client of the engine.

The AI may request:

`attack(target="goblin_1", weapon="longsword")`

The engine decides whether that request is legal and resolves it.

The AI should never be able to say:

`goblin_1.hp = 0`

## 3.5 Prefer Narrow Excellence Over Broad Mediocrity

Early versions should support very small subsets of D&D. The original proof slices can use one fixed character profile; the character-enabled increment expands deliberately to one class and levels 1–3.

For example:

- one level;
- one or two classes;
- three monsters;
- four spells;
- one small adventure.

If those elements interact convincingly, expansion becomes much safer. The examples above describe early proof slices, not a permanent restriction against character advancement.

---

# 4. Increment Roadmap

Increment numbering records the planned work, rather than its execution order. Following completion of issue #84, pause the remaining increment 8 tickets, complete increment 9, rewrite the remaining increment 8 tickets around the delivered browser UI, and then finish increment 8. This sequence is recorded in [ADR 0001](docs/adr/0001-build-local-ai-browser-play-before-finishing-increment-8.md).

Increment 10 was implemented after increment 9 and before the remaining increment 8 tickets, without a GitHub ticket. Its character library became the default browser mode. On 3 October 2026 the remaining increment 8 tickets (#93–#95) were revised to qualify the full adventure in that mode; the single save slot remains only as `--legacy` compatibility for released saves.

## Increment 1 — The Smallest Playable Dungeon

### Player Experience

The player can launch the game and complete a tiny dungeon consisting of approximately three rooms.

Example:

1. enter dungeon;
2. inspect a room;
3. open a door;
4. encounter a goblin;
5. fight it;
6. find an object;
7. reach the exit.

Narration can initially be templated rather than AI-generated.

### Scope

Implement only enough rules for:

- one prebuilt Fighter;
- movement between named locations;
- one weapon;
- one monster type;
- initiative;
- attack rolls;
- AC;
- damage;
- HP;
- death;
- simple inventory;
- deterministic dice seeding.

### What This Proves

- the fundamental game loop works;
- rules and state are separate from presentation;
- the event model is viable;
- the game can be replayed and tested.

### Test Focus

Automated tests should cover:

- attack resolution;
- damage;
- death;
- illegal actions;
- room transitions;
- inventory pickup;
- win/lose state.

Add a complete scripted playthrough test.

### Exit Criterion

A tester can play the dungeon from start to finish without developer intervention.

---

## Increment 2 — AI Narrator and Free-Text Player Input

### Player Experience

The same tiny dungeon now accepts natural-language commands.

Examples:

- "I cautiously open the door."
- "I hit the goblin with my sword."
- "Search the corpse."
- "Go back to the entrance."

The AI interprets the request, invokes engine actions, then narrates the result.

### Scope

Introduce a very small DM tool surface:

- `look`
- `move`
- `inspect`
- `take`
- `attack`
- `get_character_status`

The AI receives only relevant scene/state information.

### Important Constraint

Do **not** expand the adventure yet.

The deliberately tiny world makes failures easy to recognise.

### What This Proves

This is the first major project risk:

> Can the AI behave as an interface to a deterministic game instead of becoming the game itself?

### Test Focus

Create a library of natural-language action cases:

- clear requests;
- ambiguous requests;
- impossible requests;
- synonyms;
- compound requests;
- attempts to manipulate the DM.

Record AI tool calls so that failures can be inspected.

Use mocked model responses for deterministic integration tests.

### Exit Criterion

A player can finish Increment 1 entirely through natural-language interaction and the AI cannot bypass the rules engine.

---

## Increment 3 — A Small but Enjoyable Adventure

### Player Experience

Replace the mechanical dungeon with the first experience that should begin to feel like D&D.

Example structure:

- a village inn;
- two or three NPCs;
- a missing person;
- a short investigation;
- a small dungeon;
- one combat encounter;
- one meaningful decision;
- two possible endings.

Target play time: roughly **30–60 minutes**.

### New Capabilities

Add:

- NPC dialogue;
- persuasion/deception/intimidation checks;
- NPC knowledge boundaries;
- secrets and clues;
- basic quests;
- simple branching;
- one additional monster type;
- one consumable item;
- character status UI;
- visible dice/check feedback.

### Important Design Feature

NPC data should explicitly distinguish:

- what the NPC knows;
- what the NPC believes;
- what the NPC wants;
- what the NPC will reveal and under what circumstances.

### What This Proves

- AI roleplay can coexist with structured canon;
- investigation works;
- non-combat play works;
- hidden information stays hidden;
- the system can produce an enjoyable short session.

### Test Focus

Add scenario-level tests such as:

- NPC must not reveal clue before condition X;
- successful persuasion exposes clue;
- failed persuasion does not;
- killing an NPC changes quest state;
- player can still complete the adventure through an alternate route.

### Exit Criterion

Someone unfamiliar with the implementation can play the adventure for 30–60 minutes and describe it as a game rather than a technology demo.

---

## Increment 4 — Separate the Adventure From the Engine

### Player Experience

Ideally almost unchanged.

That is intentional.

### Technical Goal

Move all adventure-specific information out of application code and into a structured adventure format.

The same engine should load the existing adventure from data.

Potential structure:

```text
Adventure
├── metadata
├── starting_state
├── locations
├── NPCs
├── encounters
├── secrets
├── clues
├── quests
├── clocks
└── endings
```

### Add Adventure Validation

The loader should detect problems such as:

- references to missing locations;
- NPCs placed nowhere;
- impossible quest dependencies;
- duplicate IDs;
- invalid monster references;
- missing starting state.

### What This Proves

The game engine and adventure are genuinely independent.

This is the prerequisite for both authored adventures and AI-generated adventures.

### Test Focus

- schema validation;
- reference integrity;
- load/save round trips;
- full existing adventure playthrough from external data.

### Exit Criterion

The original playable adventure requires no adventure-specific logic in the core game engine.

---

## Increment 5 — Generate Tiny Adventures

### Player Experience

The player can request something like:

> "Generate a short adventure involving smugglers and an abandoned temple."

The system generates a small playable adventure.

Keep the generated format deliberately constrained:

- 3–5 locations;
- 3–5 NPCs;
- 1–3 combat encounters;
- one central problem;
- a few clues;
- at least two possible resolutions.

### Architecture

Generation should be a separate pipeline:

1. generate structured adventure;
2. validate schema;
3. validate references;
4. perform logical checks;
5. optionally ask an AI critic to inspect it;
6. repair invalid output;
7. only then make it playable.

Do not let the live DM invent the underlying adventure while the player is playing it.

### What This Proves

This retires the second major project risk:

> Can AI-generated structured content reliably produce a solvable and interesting game?

### Test Focus

Build automated adventure quality checks.

Examples:

- adventure has a reachable ending;
- required clues are obtainable;
- every referenced entity exists;
- no required NPC begins dead;
- every encounter uses supported rules;
- no impossible circular dependency exists.

Generate many tiny adventures automatically and validate them.

### Exit Criterion

A meaningful percentage of generated adventures can be played start-to-finish without manual repair.

Do not optimise generation variety until reliability is acceptable.

---

## Increment 6 — Persistent Causality and Consequences

### Player Experience

Adventures now feel less like isolated scenes.

NPCs remember important actions. Earlier choices affect later scenes.

Examples:

- insulted guard is less helpful later;
- rescued villager changes another NPC's attitude;
- a killed enemy remains dead;
- stolen item remains missing;
- delayed action allows an enemy plan to advance.

### Add

- append-only event history;
- canonical world-state changes;
- relationship state;
- simple world clocks;
- save/load;
- session resume;
- memory summaries for the AI DM.

### Critical Principle

Historical narrative summaries are not authoritative.

Structured current state plus important recorded events remain authoritative.

### What This Proves

This attacks the largest long-session risk:

> Can the game preserve causality without relying on the LLM remembering everything?

### Test Focus

Create multi-scene regression scenarios.

Example:

1. insult NPC;
2. leave location;
3. complete combat;
4. return much later;
5. verify relationship remains changed.

Test save/reload in the middle of these sequences.

### Exit Criterion

A multi-session adventure can resume without obvious continuity failures.

---

## Increment 7 — DM Judgement and Adventure Dynamics

### Player Experience

The world becomes more responsive to unexpected behaviour.

Examples:

- player barricades a door;
- creates an improvised distraction;
- bribes someone;
- follows an NPC instead of taking the expected quest;
- waits several days before acting.

### Add

A controlled DM judgement mechanism for situations that cannot sensibly be fully encoded.

Possible categories:

- trivial success;
- impossible;
- requires ability check;
- opposed check;
- reasonable improvisation;
- action changes world state.

Add simple adventure clocks:

```text
Day 1: cult obtains relic
Day 3: villager disappears
Day 5: ritual begins
Day 7: ritual completes
```

### Guardrail

The AI may interpret situations but must still express durable consequences as structured state changes.

### What This Proves

The game can support genuinely unexpected tabletop-style player behaviour rather than merely accepting differently worded menu choices.

### Test Focus

Maintain a growing "weird player behaviour" suite.

Examples:

- burn the quest location;
- attack the quest giver;
- refuse the quest;
- leave town;
- attempt to deceive an ally;
- wait instead of acting;
- use an item in an unintended but plausible way.

### Exit Criterion

Unexpected player behaviour usually produces a coherent consequence rather than an error, refusal, or collapse of the adventure.

---

## Increment 8 — First Proper Game

Delivery sequence: originally paused after issue #84 for increment 9 and the agreed ticket rewrite. GitHub issues and current acceptance records establish implementation status. Independent character selection and progression were delivered by increment 10; the remaining increment 8 tickets play the full adventure with a saved character in that mode.

### Player Experience

Now build the first version intended to be played because it is enjoyable, not primarily because it proves architecture.

Target:

- 2–4 hour adventure;
- meaningful exploration;
- investigation;
- multiple NPCs;
- several combats;
- alternative paths;
- consequences;
- satisfying ending;
- save/resume.

### Carefully Expand Rules

Only add rules needed by this adventure.

Possibly:

- Fighter;
- Rogue;
- Cleric;
- Wizard;
- several skills;
- a small spell set;
- 5–8 monsters;
- conditions;
- short and long rests;
- basic equipment choices.

### UX Work

Use the browser experience delivered by increment 9 and extend it only as the full adventure's mechanics require. New routes, trust changes, combat, recovery, items, and endings must update the conversation, panels, contextual actions, hints, and saved history truthfully.

The remaining start/continue, live-AI and unfamiliar-player tickets (#93–#95) target the increment 10 character library, the default browser mode: Hollow Beacon v12 is the full adventure for a new level-1 character, continuation reruns the same launcher command, and replacing an active adventure is an explicit abandon, rest and new start that keeps the old journey for review. Keep the `--legacy` single slot only for released saves. A general named-slot manager stays out of scope. Completed issue history is preserved.

Retry is allowed for an uncommitted interface or provider failure. If narration fails after a committed action, display and save the authoritative result; a retry cannot reverse the consequence, reroll, or repeat the action. Further gameplay waits for AI availability. Completed games offer history review without further AI questions.

### What This Proves

The architecture can support an experience that people voluntarily want to continue playing.

### Exit Criterion

External playtesters finish the adventure and ask to play another one.

That is a much stronger success signal than feature completeness.

Unfamiliar-player testing uses the completed adventure through the browser, each player creating a new level-1 character in their own character library. It returns during increment 8 after increment 9 has delivered the interface.

---

## Increment 9 — Local Browser Play

### Player Experience

Play the available Hollow Beacon content entirely in a local desktop browser, with central AI conversation, persistent location/exits/time/HP, one-click information panels, optional hints, contextual actions, and automatic saving. Closing the browser or stopping the local process preserves the single slot and its conversation for continuation.

### Scope

Support Hollow Beacon as it exists through issue #84. Give later gameplay actions and results a consistent place in the UI; design the details of future combat, quest items, and the full finale when their increment 8 tickets resume.

Deliver:

- a local launch command, server, and desktop browser shell;
- player-safe structured projections, keeping hidden adventure and save data on the server;
- typed AI turns, contextual click intents, and concise result cards;
- one-click inventory, character, journal, and leads;
- one automatic save slot and restored conversation history;
- generated, cached hints that remain hidden until requested;
- safe recovery from failures before and after an action commit;
- protection against duplicate or stale submissions, including reload and multiple tabs;
- confirmed new-game replacement and completed-game review;
- browser workflow checks and clean-checkout handoff evidence.

The engine continues to own rules, canon, time, RNG, and persistence authority. Reuse its established action/save paths and preserve old save, trace, and adventure interpretation. AI-only browser gameplay does not remove command-based testing or released compatibility workflows.

### What This Proves

The browser can keep current information accessible during play, restore the reading experience after restart, and safely present AI-mediated actions through the existing deterministic engine. Increment 9 establishes the interface for the remainder of the full adventure.

### Test Focus

Test complete browser → local API → engine → storage workflows, including conversations, investigation, travel, current signal decisions, refusal/departure, hints, questions, reload, server restart, reset, and failures on either side of a commit. Use scripted AI for repeatable browser checks and separately record bounded live-AI evidence.

### Exit Criterion

The supported Hollow Beacon content is playable and resumable through the browser; automated checks and a direct desktop walkthrough demonstrate correct state, history, and failure recovery; and installation/start/continue/reset work from a clean checkout. Canonical verification passes all required gates with zero warnings.

Unfamiliar-player testing is not an increment 9 gate. It returns for the full-game qualification in increment 8. After increment 9 completes, rewrite the remaining increment 8 tickets against the delivered UI and resume the adventure work.

See [the increment 9 implementation plan](increment-9-implementation-plan.md) for delivery slices and concrete verification criteria.

---

## Increment 10 — Independent Characters and Leveled Adventures

### Player Experience

Create and save a named Fighter independently of a game, or choose an existing character from the library. Inspect its full sheet, choose an adventure recommended for a stated level range, and play using character-derived combat and check values. Resume with exact character and adventure state. Complete the adventure, see earned progress and level changes, then take the same character into a second module.

### Scope

- independently saved character records with creation/selection before adventure startup;
- six ability scores and engine-derived modifiers, an actual loadout, and a readable character sheet;
- meaningful Fighter levels 1–3, stable authored XP rewards, and a documented advancement table;
- versioned adventure metadata for character rules/classes, one-character play, and recommended levels;
- a registry and selector for two qualified authored adventures with different recommendations;
- linked adventure sessions with frozen starting sheets, one active session per character, and retained completed records;
- recoverable start/result handoff, once-only rewards, and explicit New adventure/abandonment flows;
- unchanged interpretation of historical content, saves, traces, and completed Review mode.

The implemented advancement policy credits pending adventure XP when a surviving character completes the adventure, preserving remaining HP. Explicit rest restores health before another start; defeated characters are unavailable. Abandonment discards pending XP while retaining the character and historical journey. These rules do not introduce healing or advancement into old saves. New classes, spells, parties, automatic encounter scaling, resurrection, and arbitrary generated-adventure browser support remain later work.

### Test Focus

Prove standalone character creation and persistence before starting a game; selected-sheet effects on combat and authored checks; threshold advancement without duplicate XP; a two-adventure journey with preserved career progress; and restart, interrupted writes, stale tabs, active-character conflicts, and historical-save compatibility through browser/API/storage workflows. Qualify difficulty across the declared levels, score profiles, routes, and seeds.

### Exit Criterion

A player can save a character, close/reopen the interface, select it, finish one adventure, and start a second with the same identity, scores, equipment policy, and earned level. The sheet, rewards, range warnings, and saved history remain truthful. Focused and canonical verification, a clean-checkout handoff, bounded live-AI checks, and unfamiliar-player evidence qualify the new journey. The live-AI and unfamiliar-player evidence is gathered with the full adventure through #94 and #95.

See [the increment 10 implementation plan](increment-10-implementation-plan.md) for the delivery slices, remaining rules decisions, and concrete acceptance scenarios.

---

# 5. What to Delay

Do not add these merely because D&D has them.

Delay until gameplay requires them:

- dozens of classes and subclasses;
- complete spell lists;
- hundreds of monsters;
- tactical grid combat;
- multiplayer;
- voice;
- 3D environments;
- animated characters;
- procedural world maps;
- sophisticated economies;
- large campaign settings;
- modding;
- optimisation for huge numbers of concurrent users.

For the initial browser release, also defer maps, multiple save slots, hosted deployment, phone-specific design, an installer, browser API-key setup, and streaming. UI support for earlier adventures can follow later demand.

Independent character sheets and the qualified character/adventure selector are now explicit increment 10 scope. The records needed to retain character journeys do not bring a general slot manager, cloud character sharing, or broad legacy/generated-adventure UI support into that increment.

Every one of these can consume substantial effort without answering the project's key question:

> Is AI-mediated tabletop-style roleplaying actually fun?

---

# 6. Testing Strategy

Testability should be designed into the architecture rather than added later.

## Rules Tests

Rules should be ordinary deterministic unit tests.

Examples:

- attack modifiers;
- ability score/modifier tables, Fighter level progression, XP thresholds, and level caps;
- AC resolution;
- advantage/disadvantage;
- damage;
- saving throws;
- conditions;
- resource consumption.

## Scenario Tests

Test complete gameplay situations.

Example:

```text
Given:
  player is in crypt
  goblin has 4 HP

When:
  player attacks
  seeded roll = 18
  damage = 5

Then:
  goblin dies
  combat ends
  corpse exists in crypt
  player remains in crypt
```

## AI Contract Tests

Test whether the AI selects valid tools and arguments.

Avoid asserting exact prose.

Good assertion:

> DM called `persuasion_check` against `mara`.

Bad assertion:

> DM said exactly "Mara looks uncertain..."

## Browser Workflow Tests

Test critical play and persistence workflows through the browser, local API, and storage boundary. Cover automatic save and exact history restoration, state panels, hints, duplicate/stale input, reset, and AI failure before and after a commit. Verify questions and information views preserve time and RNG, and completed games make no further AI calls.

Character-enabled workflows additionally cover saving a sheet before a game exists, selecting among multiple saved characters, canceling adventure selection, one active game per character, preserving characters during New adventure, once-only result handoff, and carrying earned progress into a second module. Old game review must not roll back a current sheet; interrupted character/adventure writes must recover a consistent result.

Scripted AI keeps automated browser tests deterministic; separately record live-AI checks and a direct desktop walkthrough. Increment 9 does not require unfamiliar-player testing. The full-game qualification in increment 8 does.

Tests may assert exact restoration of previously displayed conversation without asserting that a live model will generate the same prose again.

## Adventure Validation Tests

Generated and authored adventures should pass structural checks before play.

New character-enabled modules validate supported rules/classes and inclusive level ranges, stable reward identities, and explicit ability-based challenges. Qualify the claimed range with actual character profiles; metadata alone does not establish balance. The existing schema-3 generator keeps its old mode until a separately verified upgrade supports the new mechanics and updates its continuity/readiness/route checks.

## Replay Tests

Record:

- player input;
- AI tool calls;
- engine events;
- random seed;
- the selected character identity, frozen starting sheet, and character rules version for character-enabled sessions;
- state transitions.

This makes difficult AI-driven failures inspectable.

## Regression Adventures

Keep a handful of tiny adventures specifically for automated testing.

Do not rely solely on the current showcase adventure.

---

# 7. Recommended Development Rhythm

Treat each increment as a short loop:

1. define one player-visible capability;
2. create the smallest adventure situation requiring it;
3. implement the underlying capability;
4. add automated tests;
5. play it manually;
6. fix obvious UX problems;
7. lock it in with regression tests;
8. move on.

Avoid building large infrastructure in anticipation of hypothetical future needs.

The preferred question is:

> "What is the smallest playable situation that forces us to solve this problem properly?"

That naturally produces useful vertical slices.

---

# 8. Suggested Milestone Sequence

| Increment         | Playable Result                                                                       | Main Risk Retired                                                     |
| ----------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1                 | Three-room deterministic dungeon                                                      | Core rules/state architecture                                         |
| 2                 | Same dungeon through natural language                                                 | LLM-to-engine interaction                                             |
| 3                 | 30–60 minute authored adventure                                                       | Dialogue, secrets, non-combat play                                    |
| 4                 | Adventure loaded entirely from data                                                   | Engine/adventure separation                                           |
| 5                 | AI-generated tiny adventure                                                           | Generated-content reliability                                         |
| 6                 | Persistent consequences and save/resume                                               | Long-term coherence                                                   |
| 7                 | Unexpected actions and world clocks                                                   | DM judgement and player freedom                                       |
| 8, through #84    | Hollow Beacon opening and watch route                                                 | Opening investigation and persistent consequences                     |
| 9                 | Local AI browser play with persistent information and restored history                | UI usability, browser persistence, and safe AI failure recovery       |
| 10                | Independently saved Fighter sheets, levels 1–3, and a two-adventure journey           | Character ownership, progression, balance, and safe career continuity |
| 8, remaining work | First 2–4 hour adventure played with a saved character, qualified through the browser | Actual sustained fun                                                  |

---

# 9. Overall Strategy

The project should resist two temptations.

The first is **building the whole D&D ruleset before there is a good game**.

The second is **giving the LLM too much authority because it makes early prototypes easier**.

Both make the first demo faster and the eventual game harder.

Instead:

- build deterministic mechanics only as they become playable;
- expose them through explicit DM tools;
- keep canon in structured adventure data;
- keep reality in structured world state;
- let the AI specialise in language, interpretation, roleplay and judgement;
- repeatedly prove the architecture through very small complete adventures.

The key progression is therefore not:

> more rules → more monsters → more spells → bigger game

It is:

> **mechanical game → natural-language game → enjoyable authored adventure → data-driven adventure → generated adventure → persistent reactive world → genuinely flexible AI Dungeon Master**

That sequence attacks the uncertain parts of the idea early while ensuring that almost every stage leaves behind something playable.
