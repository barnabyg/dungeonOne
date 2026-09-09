# D&D AI Dungeon Master — High-Level Implementation Plan

## 1. Goal

Build a playable, text-first Dungeons & Dragons-style game that stays close to the tabletop model:

- a deterministic rules system decides what happens;
- an adventure defines what is true;
- an AI Dungeon Master interprets player intent, presents the world, roleplays NPCs, and narrates outcomes.

The delivery strategy is based on **small playable vertical slices**. Each increment should be something a person can actually play, even if the content is tiny and the experience is rough. Every increment should also retire a meaningful technical or design risk.

The project should optimise for:

1. **Playable features**
2. **Enjoyable user experience**
3. **Small increments**
4. **Testability**

It should deliberately *not* optimise early for:

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

### Adventure Model

Structured data describing:

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

### World State

Persistent current reality:

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

### AI Dungeon Master

Responsible for:

- interpreting free-text player intent;
- choosing valid game-engine actions;
- describing scenes;
- narrating rule outcomes;
- roleplaying NPCs;
- deciding when checks are appropriate;
- improvising non-canonical detail;
- managing pacing within explicit constraints.

The AI should operate through a defined set of tools rather than directly rewriting game state.

### UI

Initially text-first.

The UI should make it easy to see:

- current scene;
- narration;
- player choices/actions;
- dice results when useful;
- character status;
- combat state;
- inventory;
- quest notes;
- important recent events.

A polished text interface is preferable to an ambitious graphical interface early on.

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

Early versions should support very small subsets of D&D.

For example:

- one level;
- one or two classes;
- three monsters;
- four spells;
- one small adventure.

If those elements interact convincingly, expansion becomes much safer.

---

# 4. Increment Roadmap

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

At this stage, spend meaningful effort on:

- readable conversation layout;
- clear distinction between narration and mechanics;
- character sheet;
- inventory;
- quest journal;
- combat status;
- quick action affordances;
- undo/retry for genuine interface failures;
- useful save slots;
- clean adventure start flow.

### What This Proves

The architecture can support an experience that people voluntarily want to continue playing.

### Exit Criterion

External playtesters finish the adventure and ask to play another one.

That is a much stronger success signal than feature completeness.

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

Every one of these can consume substantial effort without answering the project's key question:

> Is AI-mediated tabletop-style roleplaying actually fun?

---

# 6. Testing Strategy

Testability should be designed into the architecture rather than added later.

## Rules Tests

Rules should be ordinary deterministic unit tests.

Examples:

- attack modifiers;
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

## Adventure Validation Tests

Generated and authored adventures should pass structural checks before play.

## Replay Tests

Record:

- player input;
- AI tool calls;
- engine events;
- random seed;
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

| Increment | Playable Result | Main Risk Retired |
|---|---|---|
| 1 | Three-room deterministic dungeon | Core rules/state architecture |
| 2 | Same dungeon through natural language | LLM-to-engine interaction |
| 3 | 30–60 minute authored adventure | Dialogue, secrets, non-combat play |
| 4 | Adventure loaded entirely from data | Engine/adventure separation |
| 5 | AI-generated tiny adventure | Generated-content reliability |
| 6 | Persistent consequences and save/resume | Long-term coherence |
| 7 | Unexpected actions and world clocks | DM judgement and player freedom |
| 8 | First 2–4 hour polished adventure | Actual sustained fun |

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
