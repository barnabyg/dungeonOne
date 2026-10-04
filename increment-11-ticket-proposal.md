# Increment 11 ticket proposal

Status, 4 October 2026: proposal for the project owner's review. Not yet published. Source: [D&D 5e expansion plan](dnd-expansion-implementation-plan.md), section 4, with the owner decisions recorded in its section 10.

## Numbering and publication

GitHub numbers issues and pull requests in one sequence, so issue numbers are assigned at publication. Until then, tickets are identified by their plan IDs (11.1–11.13), and blocking links use those IDs. On publication:

- replace each plan ID with its issue number in titles' cross-references and "Blocked by" sections;
- create native blocking links;
- label every issue `ready-for-agent`;
- record the numbers in the publication index below.

## Shared implementation contract

Include this section in every published ticket.

- **Fresh 5e start.** The game moves to the 2024 5e rules in SRD 5.2 (CC-BY-4.0). All pre-5e gameplay is removed by the end of this increment. That covers Hollow Beacon, Stonebridge, `--legacy`, the CLI command-mode adventures, the generator, old characters, saves and traces. See ADR 0005 (ticket 11.1).
- **Throwaway formats.** Character library, save, trace and adventure files each carry one format version. A change bumps it, and the loader refuses older files with a message naming the file and telling the player to move it aside. No compatibility shims, no migration and no rules-version matrix, until the owner declares a stable release.
- **Transition flag.** Until 11.10, new 5e behaviour is reached by launching the browser with a temporary `--5e` flag and its own library path. The default browser keeps the old game working, so `main` stays playable at every commit. 11.10 removes the flag.
- **Engine authority.** The AI DM selects only offered actions through bounded tools. Dice, targets, HP, saves, outcomes, treasure and XP are engine-owned. Rejected actions get engine-authored replies.
- **No positions.** There is no grid or map. 5e rules that need distance are left out or abstracted, and the rules document lists each one. This covers opportunity attacks, reach, areas, movement speed and masteries such as Push. Ranged weapons are deferred.
- **Early levels are dangerous.** Starting gear is common tier only, and ordinary enemies must not be one-hit kills for a strong level-1 character (11.8).
- **Licensing.** Use only SRD 5.2 names, rules and stat blocks. Attribute it in the rules document and README.
- **Testing and commits.** One commit per ticket (more if the ticket has separable steps), each passing its focused tests. Critical journeys cross browser → API → storage. Run `npm.cmd run verify` with zero warnings before pushing a series. Concurrent writers use separate branch-backed worktrees with isolated ports, library paths and test artefacts.

## Publication index

| Ticket | Title                                                  | Blocked by | What it delivers                                                                                                                    |
| ------ | ------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 11.1   | Record the fresh 5e start and update the documentation | None       | ADR 0005 and documentation that describe the 5e direction, removal scope and throwaway-format policy.                               |
| 11.2   | Decouple shared infrastructure from the old runtimes   | None       | Saves, traces, the DM turn loop, tools and the browser server depend on a generic runtime interface, not on old runtimes.           |
| 11.3   | Roll a 5e Fighter with 4d6-drop-lowest                 | 11.1, 11.2 | Under `--5e`, create a level-1 Fighter from one durable roll placed by the player, and read its 5e sheet.                           |
| 11.4   | Resolve 5e combat between sides                        | 11.3       | An engine for fights between sides with individual initiative, 5e attacks, saves, advantage and Fighter features.                   |
| 11.5   | Run 5e adventures from a new adventure format          | 11.4       | A minimal validated adventure format and runtime: rooms, doors, examine, items, talk, checks, traps, encounters, treasure, endings. |
| 11.6   | Let the AI DM run 5e adventures                        | 11.5       | A fresh tool set and prompt so the AI DM plays the new runtime without inventing outcomes.                                          |
| 11.7   | Qualify any adventure from its own data                | 11.5       | A balance harness that plays an adventure across seeds, policies and sampled characters and reports metrics.                        |
| 11.8   | Gate adventures on their declared difficulty           | 11.7       | Easy/Medium/Hard survival thresholds and a one-hit-kill "too easy" check, enforced in `verify`.                                     |
| 11.9   | Write the first 5e adventure                           | 11.6, 11.8 | A qualified abandoned-dungeon crawl for a level 1–2 Fighter.                                                                        |
| 11.10  | Play the new adventure in the browser                  | 11.9       | The 5e game becomes the browser's only mode, with a group-fight encounter panel. `--legacy` and `--5e` are gone.                    |
| 11.11  | Rebuild the CLI test routes on the new adventure       | 11.10      | Offline command mode, scripted and live DM regression routes and trace replay run on the new adventure.                             |
| 11.12  | Remove the pre-5e game                                 | 11.11      | Old runtimes, schemas, adventures, generator, tests, fixtures, scripts and documents deleted.                                       |
| 11.13  | Qualify the release and write the handoff              | 11.12      | Clean-checkout qualification, a bounded live-AI run and a player handoff.                                                           |

11.1 and 11.2 can run in parallel. After 11.5, 11.6 and 11.7 can run in parallel.

## 11.1 — Record the fresh 5e start and update the documentation

### What to build

Write ADR 0005 in `docs/adr/` and bring the standing documentation in line with it. Nothing is deleted in this ticket; documents only describe the new direction.

The ADR records:

- adoption of SRD 5.2 for all characters and adventures;
- the removal scope listed in the shared contract;
- the throwaway-format policy and how to declare a stable release;
- what 5e content is in now: ability modifiers, proficiency, saving throws, skills, advantage/disadvantage, action/bonus action/reaction, the 5e XP table and stat blocks;
- what is out, and why: positioning, opportunity attacks, ranged combat, feats beyond the level-4 ASI, multiclassing, species and backgrounds' non-ability features;
- house rules: instant defeat at 0 HP, roll-once ability generation, common-tier starting gear, and (later) morale and reaction rolls.

Documentation:

- `README.md`: describe the 5e direction. Mark Hollow Beacon, Stonebridge, `--legacy` and the CLI adventures as "removal pending" rather than supported. 11.12 rewrites the README fully.
- `AGENTS.md`: replace `--legacy` and released-save guidance with the throwaway-format policy and the `--5e` transition flag. Agents must not add compatibility shims.
- `CONTEXT.md`: add proficiency, saving throw, skill, difficulty and format version; mark terms that only the old game uses.
- `docs/character-rules.md`: start a 5e rules section with attribution. 11.3 and 11.4 fill in its numbers.
- `docs/migration-contract.md` and ADRs 0001–0004: add a "superseded by ADR 0005" note.

### Acceptance criteria

- [ ] The owner has reviewed the ADR and the changed documents before 11.3 is merged.
- [ ] No standing document presents a feature as supported that 11.12 will remove, without saying so.
- [ ] Formatting check passes for every changed document.

### Blocked by

None (can start immediately).

## 11.2 — Decouple shared infrastructure from the old runtimes

### What to build

A prefactor so a new runtime can be added beside the old ones and the old ones deleted later without touching shared code. Today these import types or functions from `chapel*.ts`, `signet-runtime.ts`, `exploration-runtime.ts`, `chapel-clues-runtime.ts`, `character-runtime.ts` or `historical-runtime.ts`:

- `runtime-contract.ts`
- `game-tools.ts`
- `dm-turn.ts`
- `dm-history.ts`
- `save.ts`
- `trace.ts`
- `replay.ts`
- `browser-server.ts`
- `character-career.ts`

Introduce a generic runtime interface covering: create session, state projection, legal actions and tool definitions, resolve action, serialise and restore. Infrastructure depends only on it. Each old runtime implements it through an adapter, and runtime selection happens in one registry.

### Acceptance criteria

- [ ] No infrastructure module imports an old runtime module. An ESLint rule (`no-restricted-imports` or equivalent) enforces the boundary.
- [ ] The full existing suite passes unchanged: every released save, trace and browser journey behaves as before.
- [ ] The interface has focused tests using a minimal fake runtime, independent of any old runtime.

### Blocked by

None (can start immediately, in parallel with 11.1).

## 11.3 — Roll a 5e Fighter with 4d6-drop-lowest

### What to build

A new character rules module, a new character library format, and the browser creation flow under `--5e`.

Ability generation is designed to add friction against gaming creation, not to prevent it. Requirements:

- Roll six scores with 4d6-drop-lowest from the seeded stream and show every die.
- The rolled set is durable. It is saved as a pending creation **before** it is shown, so reloading the page, restarting the server or backing out of creation shows the same dice.
- **No rerolls and no safety net.** The player places the six results on the six abilities freely. Deleting a character and starting again is allowed.
- Apply the 2024 background ability increase after placement: +2/+1 to two abilities or +1/+1/+1 to three, with no other background features. Placement and the increase can change freely until the character is saved; the dice cannot.

The level-1 Fighter (SRD 5.2):

- 5e modifiers ((score − 10) / 2, rounded down) and proficiency bonus +2;
- HP 10 + Con modifier;
- Strength and Constitution save proficiency;
- two skill proficiencies from the Fighter list;
- a Fighting Style from a short list without ranged options (e.g. Defense, Dueling);
- Weapon Mastery limited to masteries that work without positions;
- Second Wind.

The rules module also defines levels 2–3 so advancement works: 300 and 900 XP; 6 + Con HP per level; Action Surge and Tactical Mind at level 2; Champion (Improved Critical, Remarkable Athlete) at level 3.

The fixed starting kit is common tier, deliberately weaker than the 2024 standard: chain shirt, shield and mace. That gives AC 13 + Dex (max 2) + 2 = 15–17, and 1d6 + Str bludgeoning with Sap.

Characters are always created at level 1 with 0 XP. The library API rejects anything else.

The library file gets a new format version. A pre-5e library is refused with a clear message and left untouched. The browser under `--5e` gets the creation screen and a 5e character sheet. The default browser is unchanged.

### Acceptance criteria

- [ ] Rules table tests for levels 1–3: modifiers, HP, proficiency, saves, attack and damage, AC, features, and XP thresholds.
- [ ] Browser → API → storage: start creation, note the dice, reload the page, restart the server and abandon creation. Each time the identical dice return. No API request yields a different set for a pending creation.
- [ ] The creation screen shows every die, the dropped die, the placement controls, the background increase, and derived numbers before saving. It is keyboard accessible and usable at phone width.
- [ ] Validation rejects malformed sheets, sheets whose scores don't match their dice, illegal placement or increases, and level ≠ 1 or XP ≠ 0 at creation.
- [ ] Opening a pre-5e library under `--5e` shows the refusal message and does not modify the file.
- [ ] `docs/character-rules.md` documents the numbers above.

### Blocked by

- 11.1 — Record the fresh 5e start and update the documentation
- 11.2 — Decouple shared infrastructure from the old runtimes

## 11.4 — Resolve 5e combat between sides

### What to build

A new encounter engine, independent of the old runtimes, behind 11.2's interface.

- Encounter state holds sides (party and opponents) with any number of combatants on each. Each combatant has HP, AC, attacks, resources and conditions. The party side has one member for now; the model must allow more for later companions.
- **Each combatant rolls its own initiative** (d20 + Dex modifier). Ties are broken by Dexterity score, then a seeded roll.
- Turn economy: action, bonus action and reaction. Fighter features follow 2024 rules: Second Wind (bonus action, 1d10 + level, two uses per long rest at level 1), Action Surge, Weapon Mastery (included masteries only) and Improved Critical.
- Attack rolls, critical hits (double dice), advantage/disadvantage and saving throws follow 5e. All dice are recorded.
- The player chooses targets. Opponents choose targets by a deterministic seeded rule documented in the rules document.
- The encounter ends when one side is defeated or has fled.
- **0 HP is instant defeat for the player character.** No death saving throws. The adventure ends in defeat, and a defeated character can't start another adventure. Opponents at 0 HP are defeated.
- Uses that recover on a short or long rest reset only at the between-adventure rest until in-adventure rests exist (increment 16).

### Acceptance criteria

- [ ] Engine tests for a 1v3 fight: initiative order including ties, targeting, individual defeat, a fight continuing after one enemy falls, and encounter end.
- [ ] Attacking a defeated or absent target, acting out of turn, or using a spent feature is rejected with a reason and no RNG draw.
- [ ] Each included mastery, Second Wind, Action Surge and Improved Critical has a focused test.
- [ ] A mid-fight state saves and restores exactly: state, RNG position and recorded dice.
- [ ] The rules document lists the deterministic opponent targeting rule and the omitted positional rules.

### Blocked by

- 11.3 — Roll a 5e Fighter with 4d6-drop-lowest

## 11.5 — Run 5e adventures from a new adventure format

### What to build

A new JSON adventure format (with its own schema file under `schema/`), a validator and a runtime. It covers only what the first adventure needs:

- rooms and passages; doors that can be locked or stuck, opened by a check, a key or force;
- features to examine, with discoveries;
- items to take and use (healing potion: 2d4 + 2);
- one or more talkable creatures with authored topics (e.g. a captive or a cowardly kobold);
- skill checks with success and failure outcomes;
- traps: a found/disarm check, and a saving throw against damage if triggered;
- encounters that start 11.4's engine, with one or more opponents;
- treasure found by examining, kept only on surviving completion and earned once per character;
- XP rewards;
- endings: escape with loot, escape without it, and defeat;
- the declared recommended levels and `difficulty` (`easy`, `medium` or `hard`).

Monsters are inline SRD 5.2 stat blocks for now; a shared bestiary comes in increment 13. Old-schema mechanics (clocks, offers, deception, barricades, confrontations, named givers) are not carried over.

### Acceptance criteria

- [ ] The validator rejects unknown references, unreachable endings, a check or trap that guards the only route to an essential room, and treasure without a found-by source.
- [ ] A small fixture adventure plays end to end through the runtime via direct engine calls, with exact save/replay.
- [ ] Every action that is rejected gives a reason and changes neither state nor RNG.

### Blocked by

- 11.4 — Resolve 5e combat between sides

## 11.6 — Let the AI DM run 5e adventures

### What to build

A fresh tool set and system prompt for the 5e runtime. The tools are: move, examine, take, use, talk, check (by skill), attack (with target), Second Wind, Action Surge, open or force a door, disarm a trap, and the final choice. Each tool offers only currently legal targets. The prompt states the authority rules: describe only results, ask when ambiguous, and allow one mutation per turn.

Rebuild scripted-DM interpretation cases for the new tools. Old cases stay with the old runtime until 11.12.

### Acceptance criteria

- [ ] Scripted cases cover every tool, typed synonyms ("search the chest" → examine), ambiguous targets ("attack the goblin" with two goblins → clarification), and rejected actions.
- [ ] The DM cannot invent rolls, targets, advantage, discoveries or treasure. Each attempt has a case showing no state change.
- [ ] Prompt and tool definitions have a single version identifier recorded in saves and traces.

### Blocked by

- 11.5 — Run 5e adventures from a new adventure format

## 11.7 — Qualify any adventure from its own data

### What to build

A balance harness (e.g. `src/balance/`) that reads an adventure in the 11.5 format and plays it through the runtime with deterministic policies:

- _direct_: fight everything on the required path;
- _cautious_: use Second Wind and potions early, avoid optional fights;
- _avoid-optional_: skip every optional room.

It plays across a configurable number of seeds.

Characters are sampled from the real 4d6-drop-lowest distribution, placed sensibly for the Fighter (highest in Strength, then Constitution) with the background increase applied. Because there's no safety net, "weakest" and "strongest" are percentiles of total modifier, not the impossible extremes. Proposed: 5th and 95th, held as parameters. Each character is played at every recommended level.

### Acceptance criteria

- [ ] Metrics per adventure, level, character percentile and policy: survival rate, HP lost per encounter, rounds per fight, healing used, XP earned, treasure value, and the chance of killing each ordinary enemy with one attack.
- [ ] Seeds, percentiles and policies are parameters. The default run fits inside `verify`; the ticket records the time budget.
- [ ] An encounter or mechanic the harness can't simulate fails with a named reason rather than passing.
- [ ] Harness results are deterministic for a fixed seed set.

### Blocked by

- 11.5 — Run 5e adventures from a new adventure format

## 11.8 — Gate adventures on their declared difficulty

### What to build

A qualification gate using 11.7's metrics. Thresholds live in one parameter table, documented in the rules document.

**Too deadly.** The weakest sampled character at the minimum recommended level, playing _cautious_, must survive the required path at least:

| Difficulty | Required-path survival |
| ---------- | ---------------------- |
| Easy       | 95%                    |
| Medium     | 85%                    |
| Hard       | 75%                    |

**Too easy.** The owner's definition is that the strongest character can one-hit-kill average enemies, or very likely can. The owner's principle is that early levels are a character's most vulnerable stage and must never be easy. Settle these details with the owner at the start of this ticket:

- what counts as an ordinary enemy (e.g. every non-boss opponent, or the median by HP);
- the one-hit-kill cap per difficulty, and whether it applies to every ordinary enemy or most;
- per attack or per turn (Action Surge now, Extra Attack later);
- the percentiles that define weakest and strongest.

Proposed starting point: for the strongest sampled character at the maximum recommended level, the chance of killing an ordinary enemy from full HP with one attack (counting hit chance, crits, Fighting Style and masteries) must not exceed the cap for any ordinary enemy.

**XP.** Completing the adventure must not award more XP than takes a character past the maximum recommended level + 1.

### Acceptance criteria

- [ ] The settled details are recorded in the rules document and the plan.
- [ ] Fixture adventures are rejected with a readable report when they are too lethal for their declared difficulty, or when a strong level-1 Fighter usually one-shots the ordinary enemies. The report names the enemies.
- [ ] The too-lethal fixture passes when declared one step harder.
- [ ] `npm.cmd run verify` fails if any shipped 5e adventure doesn't qualify.

### Blocked by

- 11.7 — Qualify any adventure from its own data

## 11.9 — Write the first 5e adventure

### What to build

The owner's premise: a stock D&D dungeon crawl. The character enters an old abandoned dungeon, explores it, finds some loot and tries to get out alive. For one Fighter at levels 1–2, in the 11.5 format, with about 8–12 rooms.

**Step 1: owner review.** Write a one-page premise, a room map (room list with connections) and an encounter list. Get the owner's approval before writing content.

**Step 2: write and qualify.** The adventure contains:

- at least one group fight;
- one fight that can be avoided;
- at least one trap and one locked or stuck door;
- skill checks, with a non-check route for everything essential;
- one talkable creature;
- treasure found by examining, with more of it behind riskier rooms;
- a late choice: push deeper for more loot, or leave with what you have.

Ordinary enemies use SRD 5.2 stat blocks chosen to pass 11.8's too-easy check. Location artwork through the existing artwork pack is optional.

### Acceptance criteria

- [ ] The owner approved the premise, map and encounter list.
- [ ] The adventure passes the gate at its declared difficulty.
- [ ] Scripted-DM journeys reach every ending: escape with loot, escape without it, and defeat.

### Blocked by

- 11.6 — Let the AI DM run 5e adventures
- 11.8 — Gate adventures on their declared difficulty

## 11.10 — Play the new adventure in the browser

### What to build

Make the 5e game the browser's only mode:

- The 5e flow becomes the default: library, creation, sheet, adventure selection with difficulty, and play.
- The encounter panel lists every combatant in initiative order with its roll, HP, defeated state and the current turn. Attack controls are per target, plus Second Wind and Action Surge when legal.
- Remove `--legacy`, the single save slot and the `--5e` flag. Starting with an old library, save or adventure file shows the refusal message and leaves the file untouched.

The old runtimes may still exist in the source tree until 11.12, but the browser no longer reaches them.

### Acceptance criteria

- [ ] Browser → API → storage journey: create a character, start the adventure, fight a group, reload mid-fight, finish, and see the level-up card.
- [ ] Typed "attack the second goblin" resolves to that target. An ambiguous target produces a clarification.
- [ ] At phone width every combatant and the turn order stay readable, and the composer stays reachable.
- [ ] Launching with an old library path or `--legacy` gives a clear message and exits without modifying anything.

### Blocked by

- 11.9 — Write the first 5e adventure

## 11.11 — Rebuild the CLI test routes on the new adventure

### What to build

The CLI stays a testing adapter, now for the 5e runtime only:

- offline command mode;
- scripted-DM and live-AI regression routes;
- trace recording and replay.

Rebuild `scripts/eval-dm.mjs` and the relevant `scripts/qualify-*-live.mjs` with cases for the new adventure: interpretation, refusal and narration fidelity. Old CLI routes stay until 11.12.

### Acceptance criteria

- [ ] Each route runs on the new adventure. Replaying a recorded trace reproduces state, RNG and cards exactly.
- [ ] DM evaluation covers the same kinds of case as the old suite, listed in the ticket's PR.
- [ ] Live routes run only with an explicit flag and `OPENAI_API_KEY`, and have a bounded call budget.

### Blocked by

- 11.10 — Play the new adventure in the browser

## 11.12 — Remove the pre-5e game

### What to build

Delete everything that only served the old game. Git history keeps it.

- **Source:** `chapel.ts`, `chapel-tools.ts`, `chapel-clues-*`, `signet-*`, `exploration-runtime.ts`, `historical-runtime.ts`, `character-runtime.ts`, and `session.ts`, `parser.ts`, `presenter.ts` and `combat.ts` if nothing kept uses them after 11.2, the old schema modules (`*-schema.ts` for the old format), the old `adventure-loader.ts` paths, `generation*.ts`, `progression-analysis.ts`, `data-dm-cases.ts`, `dm-interpretation-cases.ts`, `dm-evaluator.ts` (if superseded by 11.11), and old adapters in the runtime registry.
- **Content and schemas:** every `adventures/*.json` except the new adventure, and old `schema/` files.
- **Tests and scripts:** `tests/issue-*.test.mjs` and other tests and fixtures for removed behaviour; `scripts/eval-generation.mjs`, `scripts/eval-generated-dm.mjs`, `scripts/generation-premises.json`, `scripts/review-issue-*.mjs` and the old qualification scripts.
- **Documents:**
  - `docs/acceptance/` records for removed features;
  - the increment 1–10 plans and ticket proposals and `dnd-ai-dungeon-master-implementation-plan.md` in the repository root;
  - `docs/chapel-canon.md`, `docs/browser-history.md` and `docs/migration-contract.md`;
  - the B/X sections of `docs/character-rules.md`.

  Keep ADRs, marked superseded where applicable. Keep this proposal and the expansion plan.

- **README.md:** rewrite to describe only the 5e game, with launch commands, requirements, the rules document link and SRD attribution.

### Acceptance criteria

- [ ] `npm.cmd run verify` passes with zero warnings.
- [ ] Every module kept from 11.2's infrastructure list still has its tests.
- [ ] A text search finds no references to Hollow Beacon, Stonebridge, `--legacy`, the chapel or the signet outside git history, superseded ADRs and the expansion plan's history.
- [ ] `package.json` scripts reference no deleted files.

### Blocked by

- 11.11 — Rebuild the CLI test routes on the new adventure

## 11.13 — Qualify the release and write the handoff

### What to build

Qualify the increment from a clean checkout and write the player handoff in `docs/acceptance/increment-11.md`.

### Acceptance criteria

- [ ] From a clean clone: `npm.cmd ci`, build, `npm.cmd run verify` and the documented browser launch all work.
- [ ] One bounded live-AI run of the full adventure is recorded, with its call budget stated beforehand and the evidence file committed.
- [ ] The handoff gives copyable PowerShell launch and restart commands with a concrete seed and library path. It describes manual scenarios with expected results:
  - rolling and placing scores, including reload during creation;
  - a group fight;
  - restart mid-fight;
  - each ending;
  - level-up;
  - an old library path being refused.
- [ ] It separates automated, implementer and owner evidence.

### Blocked by

- 11.12 — Remove the pre-5e game
