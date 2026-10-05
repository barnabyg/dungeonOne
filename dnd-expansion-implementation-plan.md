# D&D 5e Expansion — Implementation Plan (Increments 11–18)

Status, 4 October 2026: increment 11 is published as GitHub issues #125–#140 (see the [increment 11 ticket proposal](increment-11-ticket-proposal.md)); increments 12–18 are not yet ticketed. It turns the project owner's prioritised D&D feature list into eight increments of ticket-sized slices. Each slice below has a title, what to build, acceptance criteria and blockers, in the shape used by the [increment 9 ticket proposal](increment-9-ticket-proposal.md). Section 10 records the owner's decisions and the ones still open.

Baseline: `main` at `f68d221`.

## 1. Direction

The owner decided on 4 October 2026:

- **5th edition, 2024 rules.** The game moves to the 2024 rules as published in SRD 5.2 (CC-BY-4.0) instead of extending the B/X-flavoured house rules.
- **A fresh start.** The game is in early development, so everything before 5e is removed and no longer supported in any form:
  - Hollow Beacon (every version, including the `--legacy` single slot) and Stonebridge;
  - every existing character, character library, save and trace;
  - the CLI command-mode adventures (Chapel, Signet, crossroads and other fixtures);
  - the adventure generator in its current schema;
  - every runtime that only served them.

  No migration is offered. A new 5e adventure is written for the new engine.

- **No compatibility until stable.** While 5e is in development, saves, characters and adventure files are throwaway. Each file type carries one format version. When a format changes, older files are refused with a clear message; they are never deleted or reinterpreted. Compatibility contracts resume at a release the owner declares stable.
- **Character generation should involve luck and force hard choices.** 4d6-drop-lowest, no generic presets.
- **Each module declares a difficulty.** Easy, Medium or Hard. It is checked both for lethality and for being too easy.

Shared infrastructure is kept and adapted: the browser server and page, the AI DM turn loop and OpenAI model adapter, the save authority and file locking, the character library and career handoff concepts, seeded randomness, trace/replay mechanics, scripted-DM testing, the verification pipeline, and the artwork pack.

## 2. The owner's list and recommended order

Owner's priority order:

1. Multi-opponent combat
2. Weapon and armour choice (limited set to start)
3. Treasure variety, balanced by level
4. Game balance check before releasing an adventure
5. Economy, with time in adventures to buy and sell
6. Monster variety (about 10 classic monsters)
7. Checks, with adventures that handle different outcomes
8. Levels beyond 3; new characters always start at level 1
9. Non-magical classes (thief/rogue)
10. Reaction rolls
11. Magical classes and a magic system
12. Stealth and surprise
13. Companions
14. Shared campaign world

The order is kept except where a dependency forces a change:

| Change                                                                                                     | Why                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A 5e foundation increment comes first, and includes multi-opponent combat (1) and the balance gate (4)** | The new engine is built from scratch, so combat is designed as sides against sides with individual initiative from day one rather than added later. The gate must exist before the first adventure is released.                                                                                                          |
| **Build first, then cut over, then delete**                                                                | `save.ts`, `replay.ts`, `dm-turn.ts`, `game-tools.ts` and `runtime-contract.ts` import the old runtimes directly. Deleting first leaves nothing playable and breaks the shared infrastructure. Instead: decouple, build the 5e runtime beside the old one, switch the browser, rebuild the CLI test routes, then delete. |
| **Economy (5) before treasure variety (3)**                                                                | Coin has no use today. More treasure only matters once it can be spent or sold.                                                                                                                                                                                                                                          |
| **Conditions before monster variety (6)**                                                                  | Classic monsters need them (poisoned, paralysed, frightened, prone). Saving throws arrive with the 5e foundation.                                                                                                                                                                                                        |
| **Morale with monster variety; reaction rolls (10) with stealth and surprise (12)**                        | Morale is a monster trait in group fights. Reaction rolls and surprise both run when an encounter opens. Neither is core 5e; both are kept as house rules on top because the owner listed them.                                                                                                                          |
| **Checks (7) and stealth (12) before the rogue (9)**                                                       | Rogue features (Expertise, Sneak Attack, Cunning Action) need skills, hidden states and surprise.                                                                                                                                                                                                                        |
| **Class data before the rogue**                                                                            | A second class needs the Fighter's numbers as data.                                                                                                                                                                                                                                                                      |
| **In-adventure rest before magic**                                                                         | Spell slots, hit dice and Fighter features recover on short and long rests.                                                                                                                                                                                                                                              |
| **Content in every increment**                                                                             | Each increment ends with a qualified adventure release that uses its features. Levels beyond 3 cannot be reached without level 3–5 adventures.                                                                                                                                                                           |

### Resulting increments

| Increment | Theme                                                   | Owner items      |
| --------- | ------------------------------------------------------- | ---------------- |
| 11        | 5e foundation, first adventure, removal of the old game | 1, 4 (+ 5e move) |
| 12        | Equipment and economy                                   | 2, 5             |
| 13        | Conditions, monsters and treasure                       | 6, 3 (+ morale)  |
| 14        | Flexible checks and higher levels                       | 7, 8             |
| 15        | Encounter openings and the rogue                        | 12, 10, 9        |
| 16        | Magic                                                   | 11               |
| 17        | Companions                                              | 13               |
| 18        | Shared campaign world                                   | 14               |

## 3. Shared contracts

These apply to every ticket. Repeat them in each ticket's "Shared implementation contract" section rather than restating them in every acceptance list.

- **Throwaway formats.** Character library, save, trace and adventure files each carry one format version. A ticket that changes a format bumps it, and the loader refuses older files with a message naming the file and telling the player to move it aside. No compatibility shims, no migration, no per-increment rules versions. This applies until the owner declares a stable release.
- **Engine authority.** The AI DM chooses only offered actions through bounded tools. Dice, targets, HP, saves, prices, spell slots and outcomes are engine-owned. Each new mechanic adds a tool or tool parameter and a rejection path the AI cannot narrate around.
- **Found or given.** Treasure, gear and coin come from examining something (a feature, or a defeated enemy's body once its fight is won), from a named giver, or from a transaction. They are never simply awarded.
- **Adventure rollback.** Everything that changes during an adventure (hit points, items and coin found, coin spent, gear bought, swapped or dropped, XP) lives only in the adventure session. What the character finds is usable at once in that adventure: coin looted from a goblin can buy a sword from a merchant further in. The character library changes only when the adventure ends, in one write:
  - On surviving completion (a victory or an escape), the character keeps exactly what it holds at the end and is credited the XP it earned. Coin spent is gone, gear bought is kept, and this includes coin and gear the character brought into the adventure.
  - On defeat or abandonment, the character is exactly as it was when the adventure started.
  - "Earned once per character" applies to finding things and to XP awards (each find and each award happens once), never to holding them. Spending found coin does not make it findable again.
- **Balance gate.** An adventure is offered in the browser only if it passes qualification at its declared difficulty in `npm.cmd run verify`.
- **No positions.** The game has no grid or map. 5e rules that need distance (opportunity attacks, reach, areas, movement speed, and weapon masteries such as Push) are left out or abstracted, and each omission is listed in the rules document. Ranged weapons are deferred to a later version.
- **Temporary `--5e` flag.** Until the cutover in 11.10, new 5e behaviour is reached by launching the browser with a temporary `--5e` flag, using its own library path. The default browser keeps the old game working until then, so `main` stays playable throughout the series.
- **Testing.** Each ticket has focused tests and its own commit. Critical journeys run browser → API → storage. Every increment's release ticket includes a player handoff in `docs/acceptance/`.
- **Licensing.** Use only SRD 5.2 rules, monsters, spells and items (CC-BY-4.0, attribution in the rules document and README). Confirm each name is in SRD 5.2 when ticketing.

## 4. Increment 11 — 5e foundation and first adventure

Published as #125–#140, reworked into sixteen vertical slices before publication. The issues are the source of truth for scope and acceptance criteria; the slices below are the planning record. The proposal's index maps each issue to these slices, and later increments' "Blocked by" references to 11.x slices mean the matching issues.

**Playable result:** a player rolls a 5e Fighter with 4d6-drop-lowest, makes real trade-offs, and plays a new level 1–2 adventure with group fights against a live AI DM. The adventure shows its difficulty and has passed the balance gate. Hollow Beacon, Stonebridge, `--legacy`, old characters and the old runtimes are gone.

### 11.1 Record the fresh 5e start and update the documentation

**What to build.** ADR 0005: adopt SRD 5.2 for all characters and adventures, remove pre-5e gameplay, and suspend compatibility contracts until a declared stable release. It records:

- what is in for now: ability modifiers, proficiency bonus, saving throws, skills, advantage/disadvantage, action/bonus action/reaction, short and long rests, 5e XP table and stat blocks;
- what is out and why: positioning, opportunity attacks, ranged combat, feats beyond those decided in 11.3, multiclassing and species traits;
- house rules kept on top of 5e: morale and reaction rolls;
- the removal scope from section 1.

Update the documentation to match:

- `README.md`: rewrite for the new game; remove Hollow Beacon, Stonebridge, `--legacy`, release-history and compatibility sections.
- `AGENTS.md`: drop the `--legacy` and released-save guidance. State the throwaway-format policy so agents don't add compatibility shims.
- `CONTEXT.md`: remove terms only the old game used; add proficiency, saving throw, skill, difficulty and format version.
- `docs/character-rules.md`: replace with a 5e rules document (filled in by 11.3 and 11.4).
- `docs/migration-contract.md` and earlier ADRs: mark as superseded by ADR 0005.

Historical plans and acceptance documents are deleted in 11.12, not edited.

**Acceptance criteria**

- [ ] The owner reviews the ADR and the updated documents before 11.3 starts.
- [ ] No document describes a supported feature that 11.12 removes. Mark it "removal pending 11.12" until then.

**Blocked by:** none.

### 11.2 Decouple shared infrastructure from the old runtimes

**What to build.** A prefactor. `runtime-contract.ts`, `game-tools.ts`, `dm-turn.ts`, `save.ts`, `trace.ts`, `replay.ts` and `browser-server.ts` currently import types and functions from `chapel*`, `signet-runtime`, `exploration-runtime` and `chapel-clues-runtime`. Make them depend only on a generic runtime interface (state, legal actions, tool definitions, resolve, project, serialise), so a new runtime plugs in and the old ones can later be deleted without touching infrastructure.

**Acceptance criteria**

- [ ] No infrastructure module imports an old runtime module; a lint rule or test enforces it.
- [ ] The existing suite still passes. This is the last ticket that has to keep old behaviour working.

**Blocked by:** none (can run in parallel with 11.1).

### 11.3 Roll a 5e Fighter with 4d6-drop-lowest

**What to build.** A new character rules module and library format.

Ability generation:

- Roll six scores with 4d6-drop-lowest from the seeded stream; the player sees every die.
- The rolled set is **durable**: it's saved as a pending creation before it's shown. Reloading, restarting or abandoning creation shows the same set and never a new one.
- **Roll once, place freely, no rerolls** (owner decision). The player assigns the six results to the six abilities. A low roll has to go somewhere, which forces the trade-off ("amazing Strength, but Charisma 7"). There is no safety net for weak sets.
- The aim is friction, not prevention. A determined player can still delete a character and roll another; that's accepted. What must not exist is a cheap reroll: reloading the page, restarting the server or backing out of creation.

Then:

- 5e modifiers ((score − 10) / 2, rounded down);
- the 2024 background ability increase (+2/+1 or +1/+1/+1) applied after placement, without backgrounds' other features (owner decision);
- proficiency bonus +2;
- Fighter HP: 10 + Con at level 1, then 6 + Con per level;
- saving throw proficiency in Strength and Constitution;
- two skill proficiencies;
- Fighting Style (a short list without ranged options);
- Weapon Mastery for the masteries that work without positions (e.g. Graze, Sap, Vex, Nick, Topple);
- Second Wind, Action Surge and Tactical Mind at level 2, and the Champion subclass at level 3;
- XP thresholds 300 and 900.

The kit is fixed for now and uses only common-tier gear (12.1), because early levels are meant to be the most dangerous (owner principle): chain shirt, shield and mace (AC 15 + Dex up to 2 = 15–17, 1d6 + Str, Sap mastery). This deliberately departs from the 2024 Fighter's starting equipment (chain mail and greatsword). Kit choice comes in increment 12.

The library uses a new format version. An old library file is refused with a clear message and left untouched. The browser gains the 5e creation screen and sheet under the temporary `--5e` flag.

**Acceptance criteria**

- [ ] Table tests per level for HP, proficiency, saves, attack and features.
- [ ] Browser → API → storage: rolling, then reloading or restarting the server, shows the identical set. No browser or API path produces a different set for a pending creation.
- [ ] Placement and the background increase can be changed freely until the character is saved; the dice cannot.
- [ ] Creation shows modifiers, proficiencies and derived numbers before saving. Validation rejects malformed or out-of-rules sheets.
- [ ] New characters are always level 1 with 0 XP. The library API rejects anything else. No separate ticket is needed for this.

**Blocked by:** 11.1, 11.2.

### 11.4 Resolve 5e combat between sides

**What to build.** A new encounter engine.

- Encounter state holds `sides` (party, opponents). Each side has combatants with HP, AC, attacks, resources and conditions.
- **Each combatant rolls its own initiative**, with ties broken by Dexterity and then a seeded roll.
- Each turn has an action, a bonus action and a reaction.
- Attacks, critical hits, advantage/disadvantage and saving throws work as in 5e. Fighter features use their 2024 rules (Second Wind, Action Surge, Weapon Mastery).
- The player chooses targets. Opponents choose targets by a deterministic, seeded rule.
- An encounter ends when one side is defeated or has fled.
- **0 HP is instant defeat** for the player character (owner decision): no death saving throws. As today, the adventure ends and a defeated character can't start another. Monsters at 0 HP are defeated as in 5e.

The data model allows more than one party combatant (unused until increment 17).

**Acceptance criteria**

- [ ] 1v3: turn order, targeting, individual defeat and encounter end are correct.
- [ ] Attacking a defeated or absent target is rejected with a reason.
- [ ] Every roll is recorded. Save and replay of a mid-fight state are exact.
- [ ] Tests cover each Fighter feature and each included mastery.

**Blocked by:** 11.3.

### 11.5 Run 5e adventures from a new adventure format

**What to build.** A new, minimal adventure schema and runtime. It covers only what the first adventure needs:

- rooms and passages, including doors that can be locked or stuck;
- features to examine, with discoveries;
- items to take and use (healing potion);
- a talkable creature with talk topics (e.g. a captive or a cowardly kobold);
- skill checks with success and failure outcomes;
- simple traps: a saving throw against damage;
- encounters that start the 11.4 engine;
- treasure found by examining, XP rewards and endings (escape with loot, escape without it, defeat);
- the declared recommended levels and difficulty.

Mechanics from the old schema (deadline clocks, offers, deception, barricades, confrontations, named givers and so on) come back only when an adventure needs them.

**Acceptance criteria**

- [ ] The validator rejects unreachable endings, checks that guard the only essential path, and unknown references.
- [ ] A fixture adventure plays end to end through the runtime with exact save and replay.

**Blocked by:** 11.4.

### 11.6 Let the AI DM run 5e adventures

**What to build.** A fresh tool set and system prompt for the new runtime: move, examine, take, use, talk, check (by skill), attack (with target), Second Wind, Action Surge and the final choice. Rebuild scripted-DM interpretation cases for the new tools.

**Acceptance criteria**

- [ ] Scripted cases cover each tool, ambiguous targets ("attack the goblin" when there are two), and rejected actions.
- [ ] The DM can't invent rolls, targets, advantage or outcomes. Rejected actions produce engine-authored replies, as today.

**Blocked by:** 11.5.

### 11.7 Qualify any adventure from its own data

**What to build.** A new balance harness (e.g. `src/balance/`). It reads an adventure's encounters, checks, healing, treasure and recommended levels and plays them with deterministic policies (_direct_, _cautious_, _avoid-optional_) across seeds.

Characters are sampled from the real 4d6-drop-lowest distribution, placed sensibly for the class with the background increase applied. With no rerolls or safety net, the absolute extremes (six 3s or six 18s) are practically impossible, so "weakest" and "strongest" mean percentiles of that distribution (proposed: 5th and 95th by total modifier). The percentiles are a parameter settled with the thresholds in 11.8.

**Acceptance criteria**

- [ ] Metrics per (adventure, level, character, policy): survival rate, HP lost per encounter, rounds per fight, healing used, XP earned, and the chance of killing each enemy with one hit.
- [ ] Policies and seed count are parameters. The default run fits inside `verify` (record the time budget).
- [ ] An encounter the harness can't simulate fails with a named reason.

**Blocked by:** 11.5.

### 11.8 Gate adventures on their declared difficulty

**What to build.** Each adventure declares `difficulty: "easy" | "medium" | "hard"`. The thresholds are a parameter table.

**Too deadly.** The weakest sampled character (11.7 percentile) at the minimum recommended level, playing the cautious policy, must survive the required path:

| Difficulty | Required-path survival |
| ---------- | ---------------------- |
| Easy       | ≥ 95%                  |
| Medium     | ≥ 85%                  |
| Hard       | ≥ 75%                  |

Owner principle: early levels are when a character is most vulnerable, and the game must not make them easy. A level-1 Fighter has no access to heavy weapons such as a greatsword (starting gear is common tier only; see 11.3 and 12.2).

**Too easy.** The owner's definition: the strongest character can kill an average enemy in one hit. Proposed measure, to be settled in this ticket (open decision 1):

- Take the strongest sampled character (11.7 percentile) at the maximum recommended level and the adventure's ordinary enemies (not bosses).
- For each, compute the chance that a single attack reduces the enemy from full HP to 0, counting hit chance, crits, Fighting Style and masteries.
- Fail if that chance exceeds a per-difficulty cap for most ordinary enemies.

Completing the adventure must also not award more XP than takes a character past the maximum recommended level + 1.

The browser's adventure picker shows the difficulty.

**Acceptance criteria**

- [ ] The gate fails a fixture adventure that is too lethal for its declared difficulty and passes it declared one step harder.
- [ ] The gate fails a fixture whose ordinary enemies a strong level-1 Fighter usually one-shots, with a readable report naming the enemies.
- [ ] `npm.cmd run verify` fails if any shipped adventure doesn't qualify.

**Blocked by:** 11.7.

### 11.9 Write the first 5e adventure

**What to build.** A stock D&D dungeon crawl (owner's premise) for one Fighter at levels 1–2. The character enters an old abandoned dungeon, explores it, finds some loot and tries to get out alive. About 8–12 rooms, using everything in 11.5. It contains:

- at least one group fight;
- one fight that can be avoided;
- at least one trap and one locked or stuck door;
- skill checks, with a non-check route for everything essential;
- treasure found by examining, with more of it behind the riskier rooms;
- a choice near the end: push deeper for more loot, or leave with what you have.

Ordinary enemies follow the early-levels-are-dangerous principle and must pass 11.8's too-easy measure. The ticket includes a short premise and room map for the owner's review before writing. Optional location artwork through the existing artwork pack.

**Acceptance criteria**

- [ ] Passes the gate at its declared difficulty.
- [ ] A complete scripted-DM journey reaches each ending.

**Blocked by:** 11.6, 11.8.

### 11.10 Play the new adventure in the browser

**What to build.** The browser creates, selects and plays only 5e characters and adventures:

- the 5e flow becomes the default and the `--5e` flag is removed;
- an encounter panel listing every combatant in initiative order with HP and turn, with per-target attack controls and Second Wind/Action Surge;
- difficulty in the adventure picker.

Remove `--legacy` and the single save slot. Starting with an old library, save or adventure file shows the refusal message.

**Acceptance criteria**

- [ ] Browser → API → storage: create a character, start the adventure, fight a group, reload mid-fight, finish, and level up.
- [ ] Typed "attack the archer" resolves to that target. An ambiguous target produces a clarification.
- [ ] Phone-width layout keeps every combatant readable.

**Blocked by:** 11.9.

### 11.11 Rebuild the CLI test routes on the new adventure

**What to build.** The CLI remains a testing adapter for the 5e runtime: offline command mode, scripted-DM and live AI regression routes, and trace replay. `scripts/eval-dm.mjs` and the `qualify-*-live.mjs` scripts get new cases for the new adventure.

**Acceptance criteria**

- [ ] Each route runs on the new adventure, and trace replay reproduces a recorded run exactly.
- [ ] DM evaluation coverage is equivalent in kind to the old suite: interpretation, refusal and narration-fidelity cases.

**Blocked by:** 11.10.

### 11.12 Remove the pre-5e game

**What to build.** Delete every source module, test, fixture, adventure, schema, script and document that only served the old game:

- old runtimes and the adventure schemas behind them (`chapel*`, `signet*`, `exploration-runtime`, `historical-runtime`, the old `adventure-loader` paths, `character-runtime` and so on);
- the generator (`generation*`, `progression-analysis`);
- `adventures/*.json` except the new adventure;
- `tests/issue-*.test.mjs`, other tests and fixtures for removed behaviour;
- `docs/acceptance/` records for removed features, the increment 1–10 plans and ticket proposals in the repository root, `docs/chapel-canon.md`, `docs/browser-history.md` and `docs/migration-contract.md`.

Git history keeps everything.

**Acceptance criteria**

- [ ] `npm.cmd run verify` passes with zero warnings. Coverage of kept infrastructure doesn't drop.
- [ ] A text search finds no references to Hollow Beacon, Stonebridge, `--legacy`, the chapel or the signet outside git history and this plan's history section.
- [ ] The README describes only the 5e game.

**Blocked by:** 11.11.

### 11.13 Qualify the release and write the handoff

**Acceptance criteria**

- [ ] Clean-checkout install, build, verify and launch work.
- [ ] One bounded live-AI run of the full adventure is recorded.
- [ ] A player handoff in `docs/acceptance/` covers creation choices, a group fight, restart mid-fight, completion and level-up.

**Blocked by:** 11.12.

## 5. Increment 12 — Equipment and economy

**Playable result:** a new character picks a starting kit, finds or buys better gear, and sells what they don't need. Better gear costs more and is rarer.

### 12.1 Price weapons and armour by cost and rarity

**What to build.** Rules data plus a section in the rules document. **Cost and rarity follow effectiveness** (owner decision): cheap items are weak, and strong items are expensive and harder to find. Each item has a price and an availability tier (_common_, _uncommon_, _rare_). Tiers limit which markets and treasure can contain them, and at which levels. Proposed limited set, using SRD 5.2 values:

| Weapon         | Price | Damage          | Properties        | Mastery           | Tier     |
| -------------- | ----- | --------------- | ----------------- | ----------------- | -------- |
| Club           | 1 sp  | 1d4 bludgeoning | light             | Slow (abstracted) | common   |
| Dagger (knife) | 2 gp  | 1d4 piercing    | finesse, light    | Nick              | common   |
| Mace           | 5 gp  | 1d6 bludgeoning | —                 | Sap               | common   |
| Shortsword     | 10 gp | 1d6 piercing    | finesse, light    | Vex               | common   |
| Longsword      | 15 gp | 1d8 slashing    | versatile (1d10)  | Sap               | uncommon |
| Greatsword     | 50 gp | 2d6 slashing    | heavy, two-handed | Graze             | uncommon |

| Armour      | Price    | AC               | Notes                               | Tier     |
| ----------- | -------- | ---------------- | ----------------------------------- | -------- |
| Leather     | 10 gp    | 11 + Dex         | light                               | common   |
| Chain shirt | 50 gp    | 13 + Dex (max 2) | medium                              | common   |
| Chain mail  | 75 gp    | 16               | heavy, Str 13, stealth disadvantage | uncommon |
| Plate       | 1,500 gp | 18               | heavy, Str 15, stealth disadvantage | rare     |
| Shield      | 10 gp    | +2               | one hand                            | common   |

**Acceptance criteria**

- [ ] One rules module derives AC, attack and damage from equipped items. Table-driven tests cover every item, versatile use, two-handed/shield exclusion, Dex caps and Strength requirements.
- [ ] Damage type is recorded (used by monster resistances in 13.2).
- [ ] A test asserts that within each table, no item is both cheaper and strictly better than another.

**Blocked by:** 11.13.

### 12.2 Choose a starting kit when creating a character

**What to build.** Creation offers 3–4 named kits of **common-tier items only**, with equal value (e.g. _shortsword and shield_, _mace and shield_, _two light weapons and leather_), or starting coin to buy from the common tier (open decision 3). Longswords, greatswords and heavier armour come later, found, bought or earned. Kit choice is another trade-off alongside the rolled scores.

**Acceptance criteria**

- [ ] Creation shows derived AC, attack and damage for each kit before saving.
- [ ] The gate qualifies every kit at each recommended level.

**Blocked by:** 12.1.

### 12.3 Equip, swap and drop gear during an adventure

**What to build.** Equip and unequip outside combat. Donning armour takes authored time. Drawing or swapping a weapon in combat uses the 5e object interaction. Found gear is an ordinary placed item, kept only on surviving completion. The gear and coin the character owns come with it into the adventure, and follow the adventure rollback contract (section 3).

This changes how an adventure is settled. Since #133, settling _adds_ the treasure carried out to the sheet. Once gear can be dropped, swapped or sold mid-adventure, settling must instead _replace_ the character's possessions with what it holds at the end. Keep the per-character ledger of finds and XP awards separate from what the character holds.

**Acceptance criteria**

- [ ] Swapping updates derived numbers immediately and on the sheet.
- [ ] Abandonment or defeat restores the starting gear.
- [ ] Gear dropped or left behind during a surviving adventure is gone afterwards; gear found and carried out is kept.
- [ ] An interruption between the session and library writes never duplicates or loses gear.
- [ ] The AI can't equip what isn't carried.

**Blocked by:** 12.2.

### 12.4 Buy and sell between adventures

**What to build.** A market in the character library for a resting character not in an adventure. It stocks the common tier, plus uncommon items from level 3 (open decision 3). Prices follow 12.1, and selling returns half price. Purchases are durable library transactions. The coin and gear a character owns go with it into its next adventure, where they can be spent or lost (section 3, adventure rollback).

**Acceptance criteria**

- [ ] Buying with too little coin is rejected. Selling equipped gear needs confirmation.
- [ ] An interrupted transaction never duplicates or loses coin or items.
- [ ] No AI call is needed.

**Blocked by:** 12.2.

### 12.5 Trade with merchants inside adventures

**What to build.** Authored merchant NPCs have stock, prices and a time cost, through a `trade` tool. Purchases spend carried coin (found in this adventure or brought into it), and become permanent only on surviving completion, as the adventure rollback contract (section 3) describes.

**Acceptance criteria**

- [ ] A merchant offers only authored stock. Stock and prices are engine-owned.
- [ ] Trading costs authored time, so it interacts with deadline clocks.
- [ ] Coin found earlier in the same adventure can be spent there: for example, 10 gp looted from a goblin's body buys a shortsword.
- [ ] Browser → API → storage: buy with found coin, then escape, and the sheet shows the item bought and the change left; buy, then die or abandon, and the sheet shows the coin and gear the character started with.
- [ ] Spending found coin never makes it findable again on a later visit.

**Blocked by:** 12.3, 12.4.

### 12.6 Release an adventure with a market town and found gear

**Acceptance criteria**

- [ ] At least one adventure has a merchant and one piece of found gear. It qualifies. Handoff written.

**Blocked by:** 12.5.

## 6. Increment 13 — Conditions, monsters and treasure

**Playable result:** encounters use varied classic monsters with real differences (poison, undead, fleeing goblins). Treasure scales with level and includes gems, potions and gear.

### 13.1 Add 5e conditions

**What to build.** The SRD conditions needed by the first monsters: poisoned, paralysed, frightened, prone, restrained, unconscious. Each has a duration, its source, and the save that ends it. Their effects on attacks, saves and actions are engine-enforced. Conditions show in the panel and on the sheet.

**Acceptance criteria**

- [ ] Each condition has an engine test of its effects.
- [ ] Repeat saves at the end of a turn are recorded and replay exactly.

**Blocked by:** 11.13.

### 13.2 Add a shared bestiary of ten classic monsters

**What to build.** A bestiary file that adventures reference by ID (adventures can still author one-off monsters). The candidate list is below. Confirm each against SRD 5.2 when ticketing: the 2024 rules renamed several (e.g. goblin warrior, hobgoblin warrior) and may lack others, such as the orc.

| Band | Candidates                        | Feature exercised                                           |
| ---- | --------------------------------- | ----------------------------------------------------------- |
| 1    | kobold, giant rat, goblin         | groups, Pack Tactics, Nimble Escape, morale                 |
| 1–2  | skeleton, zombie                  | undead, damage vulnerability and immunity, Undead Fortitude |
| 2–3  | wolf, hobgoblin, bugbear (or orc) | knock prone, group tactics                                  |
| 3–4  | giant spider, gnoll               | poison save, Rampage                                        |
| 4–5  | ogre (optional 11th)              | big damage                                                  |

**Acceptance criteria**

- [ ] Each monster has its SRD stat block, XP value, a morale score (house rule) and a treasure type (13.4). Each special trait has a focused test.
- [ ] The opponent AI uses traits deterministically from seeded dice.
- [ ] The harness can build ad-hoc encounters from bestiary IDs to estimate difficulty and one-hit-kill rates per level.

**Blocked by:** 13.1.

### 13.3 Make monsters check morale and flee or surrender

**What to build.** House rule: a Wisdom save against a morale DC when the first ally falls and at half strength. A fleeing opponent leaves the encounter; a surrendering one becomes a talkable NPC if the adventure authors it.

**Acceptance criteria**

- [ ] Undead and mindless monsters never check morale.
- [ ] A fled opponent's XP and loot follow an authored policy (open decision 4).
- [ ] The harness accounts for fleeing.

**Blocked by:** 13.2.

### 13.4 Define treasure types and per-level budgets

**What to build.** A treasure catalogue:

- 5e coins (open decision 2);
- gems and art objects (sell-only value);
- potions (healing, greater healing);
- gear from 12.1, limited by tier and level.

Each level band has a treasure value budget per adventure. Decide whether +1 weapons and armour come here or with magic (open decision 5).

**Acceptance criteria**

- [ ] The validator rejects treasure above the budget, or above the tier allowed, for the adventure's maximum recommended level.
- [ ] Treasure keeps the found-or-given rule and the once-per-character ledger of finds (section 3: the ledger records what was found, not what is still held).
- [ ] Gems sell at the market (12.4) and in adventures (12.5).

**Blocked by:** 12.4.

### 13.5 Leave monster loot to be found on remains

**What to build.** A defeated monster's treasure type produces a loot list, authored or rolled at authoring time, that lies among its remains and is found with Examine. Rolling happens at authoring time, so the gate sees the exact value. #133 already lets an opponent carry authored items that are found by searching its body once its fight is won; this ticket generates those items from treasure types.

**Acceptance criteria**

- [ ] Loot appears only after defeat and only through Examine.
- [ ] The value counts toward 13.4's budget.

**Blocked by:** 13.2, 13.4.

### 13.6 Release adventures with bestiary encounters and level-scaled treasure

**Acceptance criteria**

- [ ] Shipped adventures use at least four bestiary monsters, including an undead and a poison user. They qualify. Handoff written.

**Blocked by:** 13.3, 13.5, 12.6.

## 7. Increment 14 — Flexible checks and higher levels

**Playable result:** checks have consequences beyond flavour text, and characters advance past level 3 into new adventures.

### 14.1 Give checks graded outcomes with consequences

**What to build.** The check model gains:

- outcome bands: e.g. failure, success, and optionally failure by 5+ or success by 5+;
- typed effects per band: discovery, route opened or closed, clock advance, damage, condition, NPC attitude change, item;
- an authored retry policy: never, after a cost, or after a changed circumstance;
- alternative approaches using different skills against the same obstacle;
- authored advantage or disadvantage from circumstances.

**Acceptance criteria**

- [ ] The validator proves each essential path has a non-check route or a fail-forward outcome.
- [ ] Every effect type has an engine test, plus a browser card showing band and consequence.
- [ ] Remembered outcomes still stop rerolls by repeated typing.

**Blocked by:** 13.1.

### 14.2 Let the AI DM run checks with branching outcomes

**What to build.** The check tool gains the chosen approach. The prompt states that the DM narrates only the engine's band and effects. Interpretation cases cover approach selection ("I climb the wall" → Athletics or Acrobatics, as offered).

**Acceptance criteria**

- [ ] Scripted-DM regression cases for each band.
- [ ] The DM can't trigger an effect that isn't in the result.

**Blocked by:** 14.1.

### 14.3 Qualify adventures across check outcomes

**What to build.** Harness policies always-fail and always-succeed for checks. The adventure must stay completable and within its difficulty threshold on the always-fail branch.

**Acceptance criteria**

- [ ] A fixture adventure with a fail-into-dead-end check is rejected.

**Blocked by:** 14.1, 11.8.

### 14.4 Extend the Fighter to level 5

**What to build.** 2024 Fighter levels 4 and 5. Level 4 brings an Ability Score Improvement (other feats out of scope). Level 5 brings Extra Attack, Tactical Shift if it works without positions, and proficiency +3. XP thresholds 2,700 and 6,500.

**Acceptance criteria**

- [ ] Table tests per level. The level-up card explains every change, including the ASI choice.
- [ ] Extra Attack can split between targets.

**Blocked by:** 11.13.

### 14.5 Write adventures for levels 3–5

**What to build.** One or two adventures recommended for levels 3–4 and 4–5, using bestiary monsters, graded checks, merchants and level-budget treasure. Alternatively, build a 5e adventure generator (open decision 6), which is a much larger ticket.

**Acceptance criteria**

- [ ] A level-1 character can reach level 5 by playing the shipped adventures in sequence. The harness simulates this career path.
- [ ] Each adventure qualifies at its declared difficulty. Handoff written.

**Blocked by:** 14.3, 14.4, 13.6.

## 8. Increment 15 — Encounter openings and the rogue

**Playable result:** encounters begin with surprise and reactions. Not every monster attacks, and a sneaky character can avoid fights or strike first. A Rogue joins the Fighter.

### 15.1 Roll surprise and allow sneaking past or ambushing

**What to build.** An encounter-opening procedure using 2024 rules: a Stealth check against passive Perception, and a surprised creature has disadvantage on initiative. Sneaking lets the character avoid, ambush or approach an encounter. Stealth disadvantage comes from armour data (12.1).

**Acceptance criteria**

- [ ] Engine and browser show who was surprised and why.
- [ ] A successful sneak past leaves the encounter unresolved but bypassed, with an authored XP policy.
- [ ] The harness runs a stealth-first policy.

**Blocked by:** 14.1.

### 15.2 Roll monster reactions at encounter start

**What to build.** House rule: a 2d6 reaction roll plus the character's Charisma modifier gives hostile, unfriendly, uncertain, indifferent or friendly. It applies to monsters and NPCs the adventure marks as reaction-eligible. Each band maps to authored options (attack, parley, demand toll, let pass, trade). Parley uses Persuasion, Deception or Intimidation checks. This is where a low-Charisma roll at creation starts to bite.

**Acceptance criteria**

- [ ] Mindless monsters skip reactions.
- [ ] Each band gives authored options only; the DM narrates the result and can't change the band.
- [ ] Peaceful outcomes award the authored XP.

**Blocked by:** 15.1, 13.3.

### 15.3 Define classes as data

**What to build.** A prefactor. Class definitions as data:

- hit die and HP per level;
- saving throw and skill proficiencies;
- armour and weapon proficiencies;
- weapon masteries;
- features by level, with their uses and recovery;
- subclass options;
- primary ability.

The Fighter is re-expressed as data.

**Acceptance criteria**

- [ ] Golden tests: the Fighter derives identical numbers through the new path at every level.

**Blocked by:** 14.4.

### 15.4 Add the Rogue class

**What to build.** SRD 5.2 Rogue at levels 1–5:

- light armour, the class's weapons from the limited set;
- Expertise;
- Sneak Attack with a finesse weapon when the character has advantage or an ally is engaged with the target;
- Weapon Mastery;
- thieves' tools for locks and traps;
- Cunning Action;
- Steady Aim;
- the Thief subclass at level 3;
- Cunning Strike and Uncanny Dodge at level 5.

**Acceptance criteria**

- [ ] Creation offers Fighter or Rogue. Kits are class-appropriate.
- [ ] Engine tests for Sneak Attack (only once per turn, only from qualifying states), Cunning Action, Cunning Strike and Expertise.
- [ ] The DM prompt describes class-specific offered actions.

**Blocked by:** 15.3, 15.1.

### 15.5 Add locks and traps to adventures and release

**What to build.** Adventure content:

- locks opened with thieves' tools;
- traps found with Perception or Investigation, disarmed with thieves' tools, with a Dexterity save if triggered;
- alternative routes for non-rogues: force the lock with Athletics, take the damage, or find a key.

**Acceptance criteria**

- [ ] Both classes can complete every shipped adventure.
- [ ] Rogue survival meets the declared difficulty at the minimum recommended level.
- [ ] Handoff written.

**Blocked by:** 15.2, 15.4, 14.5.

## 9. Increments 16–18

These are planned at slice level. Refine them into full tickets once increment 14 lands.

### Increment 16 — Magic

| Slice | Title                                             | Notes                                                                                                                                                                                            | Blocked by |
| ----- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 16.1  | Rest during an adventure                          | Short rest (spend hit dice) and long rest, with time cost, interruption risk and clock interaction. Fighter and Rogue features start recovering inside adventures.                               | 13.1       |
| 16.2  | Cast spells from slots                            | Spell slots per class level, prepared spells, cantrips, a casting action, single targets (areas abstracted or deferred), saves, concentration, durations, a `cast` tool. A spell-list data file. | 15.3, 16.1 |
| 16.3  | Add the Cleric class                              | Cure Wounds, Bless, Guiding Bolt, Shield of Faith, Sacred Flame; Turn Undead against bestiary undead.                                                                                            | 16.2, 13.2 |
| 16.4  | Add the Wizard class                              | Spellbook, Arcane Recovery. Fire Bolt, Magic Missile, Shield, Sleep, Burning Hands. **Sleep can end fights outright; the gate must catch it.**                                                   | 16.2       |
| 16.5  | Find scrolls, wands and magic items               | SRD magic items under the 13.4 budget and rarity tiers.                                                                                                                                          | 16.3, 16.4 |
| 16.6  | Release adventures qualified for all four classes | Harness policies for casters (spend slots early or conserve).                                                                                                                                    | 16.5       |

### Increment 17 — Companions

Settle open decision 7 first. Recommended first step: **engine-controlled hirelings**.

| Slice | Title                                        | Notes                                                                                                          | Blocked by |
| ----- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------- |
| 17.1  | Define hirelings and their records           | Hireling sheets (class data from 15.3), wage, loyalty/morale, stored in the library and linked to an employer. | 15.3       |
| 17.2  | Fight alongside companions                   | Uses 11.4's party side. Deterministic companion tactics, plus simple player orders.                            | 17.1       |
| 17.3  | Hire companions and share rewards            | Hiring at the market or from authored NPCs. XP and treasure shares, death and dismissal.                       | 17.2, 12.4 |
| 17.4  | Balance adventures for companions            | Recommended level ranges per party size. The gate qualifies 1 and 2 party members at the declared difficulty.  | 17.3       |
| 17.5  | Release with companion content and a handoff |                                                                                                                | 17.4       |

### Increment 18 — Shared campaign world

Needs an ADR: a fourth record, the **campaign**, separate from character, adventure and session, with its own revision and receipts. Each session freezes a starting campaign snapshot just as it freezes the starting sheet.

| Slice | Title                                      | Notes                                                                                                            | Blocked by |
| ----- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| 18.1  | Record the campaign model in an ADR        | The fourth record and what carries across adventures (NPC fates, faction standing, cleared locations, calendar). | none       |
| 18.2  | Keep world state in a campaign record      | Create a campaign, attach characters, durable world-state updates on completion.                                 | 18.1       |
| 18.3  | Let adventures read and change world state | Adventures declare world-state prerequisites and effects; the validator and gate check them.                     | 18.2       |
| 18.4  | Open adventures from the campaign map      | Browser flow: map or list of available adventures given world state.                                             | 18.3       |
| 18.5  | Release a linked adventure chain           | Two or three linked adventures.                                                                                  | 18.4       |

## 10. Decisions

### Settled by the owner, 4 October 2026

| Decision                  | Outcome                                                                                                                                                          | Where it applies        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Rules                     | 5e, 2024 version (SRD 5.2)                                                                                                                                       | Section 1, increment 11 |
| Old game                  | Remove all pre-5e gameplay, content, characters, saves and traces; no migration                                                                                  | 11.1, 11.10, 11.12      |
| Compatibility             | Throwaway formats until a declared stable release                                                                                                                | Section 3               |
| Ability generation        | 4d6-drop-lowest; roll once, place freely, no rerolls and no safety net. The goal is friction against gaming creation, not prevention; revisit if it doesn't work | 11.3                    |
| Background increase       | 2024 +2/+1 (or +1/+1/+1) ability increase only; no other background features                                                                                     | 11.3                    |
| Balance thresholds        | Declared difficulty per adventure: Easy ≥ 95%, Medium ≥ 85%, Hard ≥ 75% survival, held as a parameter                                                            | 11.8                    |
| Too easy                  | One-hit kills (or a high chance of them) of average enemies; exact measure settled in 11.8                                                                       | 11.8                    |
| Early levels              | The most dangerous stage of a character, never easy. No heavy weapons such as a greatsword at level 1; starting gear is common tier only                         | 11.3, 11.8, 12.2        |
| 0 HP                      | Instant defeat for the player character; no death saving throws                                                                                                  | 11.4                    |
| First adventure           | Stock D&D dungeon crawl: enter an abandoned dungeon, explore, find loot, get out alive                                                                           | 11.9                    |
| Initiative                | Each combatant rolls                                                                                                                                             | 11.4                    |
| Weapon and armour numbers | Cost and rarity follow effectiveness                                                                                                                             | 12.1                    |
| Ranged weapons            | Deferred to a later version                                                                                                                                      | Section 3               |
| Saves, rogue              | 5e six-ability saves; the 2024 Rogue with the Thief subclass                                                                                                     | 11.4, 15.4              |

### Settled by the owner, 5 October 2026

| Decision           | Outcome                                                                                                                                                                               | Where it applies      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Enemy treasure     | Searching the body is the only way to get what a defeated enemy carried; defeating it gives nothing by itself                                                                         | #133, 13.5            |
| Victory and escape | Both are surviving completion, so both keep the treasure carried                                                                                                                      | #133                  |
| Adventure rollback | What is found is usable at once in the same adventure; on surviving completion the character keeps what it holds at the end, and on defeat or abandonment it is exactly as it started | Section 3, 12.3, 12.5 |
| Level-up           | Credited automatically when the adventure is settled; the ending's level-up card and its one step back to the sheet are its confirmation                                              | #133                  |

### Open

Number 1 is settled while working ticket 11.8; the rest can wait until their increment.

1. **"Too easy" measure details:**
   - what counts as an ordinary enemy;
   - the per-difficulty one-hit-kill cap;
   - whether to measure per attack or per turn (Action Surge now, Extra Attack later);
   - the character percentiles used as "weakest" and "strongest" (11.7).
2. **Currency:** 5e copper/silver/gold, stored as copper internally and shown in mixed denominations (recommended).
3. **Starting equipment:** common-tier kits only, or starting coin to buy from the common tier. Also, when uncommon and rare items appear in markets.
4. **XP and loot for fled or surrendered monsters.**
5. **+1 gear:** treasure in increment 13, or wait for magic in 16.
6. **Content strategy:** hand-author every adventure, or build a 5e generator before 14.5.
7. **Companions:** engine-controlled hirelings or a player-controlled party of library characters.
8. **Market location:** the plan does both (12.4 library market, 12.5 in-adventure merchants). Confirm, or drop one.
9. **Long-term level cap** after 5.

## 11. Out of scope

Multiclassing, feats (except the level-4 ASI), species, backgrounds' non-ability features, ranged combat and positioning, domains and strongholds, crafting, multiplayer, and a dungeon-mapping UI. Each can be its own plan later.
