# Increment 10 — Independent Characters and Leveled Adventures

Status, 2 October 2026: implementation of all six slices is present on the local `codex/gameplay-ui` branch. Numeric rules are defined in [Fighter rules v1](docs/character-rules.md). Automated qualification and the [player handoff](docs/acceptance/increment-10-characters.md) cover standalone characters, two complete browser journeys, replay, recovery and balance. Bounded live-provider and unfamiliar-player evidence remain pending and are gathered with the full adventure through #94 and #95. On 3 October 2026 the character library was confirmed as the primary browser mode, and the remaining increment 8 tickets (#93–#95) were revised to target it; the single save slot remains only as `--legacy` compatibility for released saves. #93 qualifies startup and continuation in this mode ([handoff](docs/acceptance/issue-93.md)).

See the [project spec](dnd-ai-dungeon-master-implementation-plan.md), [glossary](CONTEXT.md), and [ADR 0003](docs/adr/0003-save-characters-independently-of-adventure-sessions.md). The earlier [review and proposal](https://chatgpt.com/space/page_e2d647b31e50819192704cecd28c6068) provides the source review and additional rationale. Repository documents define the implementation scope; the Page is supplementary context.

## 1. Intended playable result

A player saves a named level-1 Fighter without starting a game. Later they select that character from their library, inspect its sheet, choose an adventure recommended for a stated character level range, and play with character-derived combat and check values. They finish the adventure, see earned progress and any level increase, and bring the same character into a second module. Closing and restarting restores the exact sheet, adventure state, and Conversation history.

The first release supports one player controlling one Fighter at levels 1–3. It includes multiple independently saved characters, one active adventure per character, and two qualified authored modules with different level recommendations. Broad class, party, spell, campaign, or generated-adventure expansion is outside this increment.

## 2. Baseline and risk

The source review used branch `codex/gameplay-ui`, commit `cdf2a2f8d1fcc13191a8f4c4d59f65249f979454`, on 2 October 2026. The browser already has a Character panel, authoritative result cards, local information reads, saved history, and verified save/recovery flows. Hollow Beacon v11 uses a fixed 20-HP Fighter with AC 16, attack +5, initiative +1, and damage 1d8+3. Player combat numbers and social-check modifiers belong to adventure content; no six-score character, character level, XP system, or independent character library exists.

The browser accepts specific Hollow Beacon v4–v11 tuples rather than arbitrary adventure files. Save loading reconstructs initial state from content and replays transitions. The schema-3 generator also rejects unsupported progression claims. Character creation, initialization, versioning, selection, and balancing therefore need engine and persistence work as well as a new sheet layout.

The highest risk is starting replay from a character that has advanced since the game began. Keep each session's initial sheet immutable and record its character rules version. A second risk is losing or duplicating career progress when a completed session and character record are written separately. Both need qualification through browser, API, and storage.

## 3. Independent characters and adventure records

Keep three records distinct:

1. **Character record:** an independently saved sheet with identity, name, class, six ability scores, character rules version, career XP, permanent equipment, stable earned reward identities, availability/defeat status, active-session association, accepted result receipts, and revision.
2. **Adventure module:** setting, start location, challenges, monsters, rewards, supported character rules/classes, intended character count, and recommended inclusive level range.
3. **Adventure session:** selected character identity and frozen starting sheet, evolving health/resources and world state, earned adventure rewards, events, dice records, Conversation history, and completed outcome.

Create and persist the character before selecting an adventure. Canceling selection, closing the interface, starting a different game, or reviewing a completed game preserves the character record. New adventure and Create character are separate actions. Starting a new adventure never resets earned career XP or deletes another character.

The active session is authoritative for evolving state during its journey. The library associates the character with that game and accepts verified career results. A character already adventuring offers Continue this adventure; it cannot start a second competing game. Different saved characters may have different game records. Keep the records needed for these journeys without building a general named-slot management interface.

A historical game's sheet describes that game at its recorded position. Reviewing or replaying it cannot roll back the current character or grant rewards again. Missing library data must not make an otherwise valid embedded session unreadable; continuation/result publication requires a safe recovery policy before a new game can advance that identity.

## 4. Character and adventure selection

The opening offers Continue adventure, Choose character, and Create character. The character library lists name, class, level, a brief ability summary, and availability. A player can open a saved sheet without starting a game or calling AI.

Create character asks for a name and supported class, initially Fighter. Recommend balanced ability presets for the first release. The player reviews all six scores and derived capabilities, then selects Save character. The sheet is saved immediately and survives cancellation of adventure selection. Optional rolled creation is later work; if introduced, use recorded creation results and a separate seed so refresh or startup cannot reroll the sheet or consume gameplay dice.

After character selection, show qualified adventures and their recommended levels, supported class/rules, and any loadout restriction. Confirm the selected pair before starting. A supported character outside the recommendation receives a clear warning and may proceed deliberately; unsupported character rules, classes, or levels are rejected.

During play, show name, class, level, and HP compactly. Expand the existing Character panel into the full sheet: scores/modifiers, current/maximum HP, actual armor/weapon, attack and damage, initiative, conditions, XP, and progress to the next level. Sheet reads remain local, preserve focus/history position, and consume no AI call, time, action, or RNG.

## 5. Rules and advancement

Support Strength, Dexterity, Constitution, Intelligence, Wisdom, and Charisma with an explicit modifier table. The working direction is an old-school-inspired rules subset that retains the existing ascending AC and d20 resolution. Before coding, choose the exact rules/edition intent, score presets, modifier table, HP and attack progression, equipment/Dexterity rules, minimum damage, XP thresholds, and cap behavior together.

Strength affects Fighter melee attacks/damage and authored physical checks. Dexterity affects initiative, armor-dependent defense, and agility checks. Constitution affects maximum HP and eligible endurance checks. Intelligence, Wisdom, and Charisma affect authored reasoning, perception/insight, and social checks respectively.

New challenges name their relevant ability, difficulty, permitted approach, circumstances, costs, and consequences. The engine supplies character bonuses; the AI only selects currently offered actions. Replace fixed player bonuses in new content and avoid adding Strength twice to weapon damage. Never infer carried equipment from a combat profile or Fighter label.

Keep routine observation/conversation and essential evidence available under authored rules. Use checks when uncertainty has an interesting consequence. Failure of an optional Intelligence, Wisdom, or social check must not conceal the only route to an essential clue. Preserve remembered checks and evidence-based alternatives.

Use stable authored XP rewards for objectives and encounter resolutions, including peaceful resolutions where appropriate. Proposed policy: each reward is earned once per character, even across repeated adventure starts or revisions of the same reward. Version changes must preserve its identity. Repeated clicks, narration, retries, reloads, and historical review grant no extra XP.

Proposed first-release policy: show adventure XP as pending and credit it when a surviving character completes the adventure; apply advancement in the same durable completion result. Levels 2 and 3 must have explained mechanical effects, initially maximum HP and class attack progression. Scores remain stable. Record XP above the supported cap and show that level 3 is the maximum supported level.

The exact advancement timing, injury handling, defeated-character availability, and between-adventure rest/equipment policy remain choices to settle before implementation. Recommended defaults are completion-only advancement, an explicit rest before the next module, unavailable defeated characters, carried permanent equipment, and adventure-local clues/quest items/relationships/clocks. No rule proposal changes a released save.

## 6. Versioning and safe continuity

Introduce character-enabled schemas and rules/engine versions, a separately versioned character record, and a new session save/trace format containing the frozen starting sheet. Derive combat/check values through one character rules module behind the existing runtime interface and player-safe projections.

Retain save formats 1–3, released traces, old adventure schemas, content digests, and runtime tuples with their original semantics. Old sheets can explain that ability scores and level were not recorded; do not fabricate values inside historical canonical state. Resume always uses recorded initial character data rather than the current library sheet.

Define recoverable character/session start and completion handoff. A durable completion receipt records the verified result before its once-only application to the character record. Revision checks, active-session association, and accepted receipts prevent duplicate rewards and conflicting advancement. Recovery must handle interruption between writes, lost responses, stale tabs, old save copies, and simultaneous starts. Choose storage mechanics during implementation rather than assuming two ordinary file writes are atomic.

Explicit abandonment releases the active character safely, preserves the prior game's record, and follows the agreed pending-XP policy. Busy reset/selection and stale generations remain rejected. Review mode stays readable and makes no gameplay or provider calls; career synchronization is persistence work, not a second AI action.

## 7. Delivery slices

These are proposed slices, not published GitHub issues. Each implementation slice requires focused verification and its own selective commit. Integrate and run canonical verification before pushing the complete series.

| Slice | Player-visible result                              | Dependencies and acceptance                                                                                                                                                                                                                                                                     |
| ----- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Understand a defined Fighter sheet and advancement | Settle rules tables, creation presets, loadout, rewards, progression/rest/defeat policy, and record invariants. Derive and validate through one rules module; cover negative modifiers, thresholds, caps, and malformed records.                                                                |
| 2     | Save and select a character before playing         | Add the independent library, Choose character/Create character, standalone sheet, and a new character-enabled runtime/save initialization. Cancel/restart preserves sheets; the selected character plays and resumes with identical values. Historical sessions remain unchanged. Depends on 1. |
| 3     | See ability scores affect actions                  | Integrate combat and physical/mental/social authored checks with visible bonus breakdowns, correct equipment, and truthful offered actions. Failed optional checks preserve an onward investigation. Depends on 2.                                                                              |
| 4     | Earn progress and advance to levels 2 and 3        | Implement agreed reward/timing policy, pending XP if selected, thresholds/cap, durable level-change cards, and once-only rewards. Final Review stays read-only. Depends on 3.                                                                                                                   |
| 5     | Bring the saved character to another module        | Add verified career-result handoff, recovery, explicit abandonment/rest, and a registry/selector for two versioned authored adventures with different level recommendations. Preserve the earlier game and earned character progress. Depends on 4.                                             |
| 6     | Complete a qualified two-adventure journey         | Balance declared ranges across score profiles/routes/seeds; qualify full browser/API/storage continuity, crashes and legacy compatibility; prepare clean-checkout, bounded live-AI, and unfamiliar-player evidence. Depends on 5.                                                               |

Independent creation/selection belongs in slice 2, not an optional extension after progression. The complete release includes all six slices. Create a new character-enabled Hollow Beacon edition rather than rewriting v11, then a short second module that proves continuation. Determine the recommendations from balance evidence.

Keep the existing generator in its old supported mode. A later generation slice requests a level range, emits the new schema, validates rewards and supported checks, updates unsupported-mechanic continuity checks, and qualifies readiness/routes for actual character profiles. Do not advertise generated leveled modules before that work passes.

## 8. Verification and player handoff

Run `npm.cmd run verify` with zero warnings for the integrated implementation. Focused tests exercise rules and real runtime actions; critical journeys cross the real browser, API, and storage. Include:

- standalone character saving, multiple sheets, creation/selection cancellation, and local sheet reads;
- score/modifier and class-level calculations, armor caps, damage bounds, HP/XP thresholds, malformed records, and unsupported rules/classes/levels;
- supported out-of-range warnings, valid inclusive recommendations, and fixed authored difficulty;
- exact resume/replay from a frozen sheet with identical state, RNG, cards, and history;
- reward duplication attempts across retries, completed reloads, repeat adventure starts, and content updates;
- interrupted start/result handoff, active-character conflicts, stale tabs/generations, lost responses, missing library recovery, and historical review without rollback;
- AI attempts to invent scores, XP, levels, or rerolls causing no unauthorized mutation;
- unchanged historical adventure/save/trace outcomes.

The implementation handoff must give copyable PowerShell launch/restart commands with an actual supported character, adventure, seed, and isolated save path. Include Node.js 24.x/npm 11.6.4, installed dependencies, the build, desktop browser, and configured provider/network prerequisites. Document only implemented flags; this plan creates none. Stop after a complete reply with enabled input, use Ctrl+C, and rerun the launcher to continue rather than closing an active game with quit.

Manual player scenarios:

1. Create and save a named Fighter before choosing an adventure; inspect the sheet, cancel selection, close/reopen, and choose the same sheet. Create a second character and verify both remain saved.
2. Choose an adventure and inspect the selected name/level and recommendation. Try a supported character outside its range and observe the warning; an unsupported class/rules/level fails clearly.
3. Resolve physical and social checks, read their character bonuses, fail an optional check, and still reach essential evidence.
4. Take damage and restart after the next stable reply. Expect exact HP, scores, RNG-derived results, and Conversation history.
5. Complete at an advancement threshold; expect one explained award/level change. Reopen Review and expect no extra reward or AI call.
6. Select the same character for the second module; apply the agreed rest/equipment policy and expect preserved identity, scores, earned level, and a fresh adventure world.
7. Cancel or confirm New adventure/abandonment; verify character records and earned career progress are preserved according to the agreed policy. Review the first game without altering the current sheet.
8. Resume a historical Hollow Beacon slot and expect its original HP, check rules, ending, and Review behavior.

Balance qualification covers both range bounds, weaker/stronger presets, multiple seeds, combat avoidance, failed checks, healing, and deadlines. Seeded sampling can reveal gross problems; unfamiliar-player evidence must establish whether the sheet, advancement, and next-adventure choice are understandable. Agree a bounded live-run budget before using the provider and distinguish automated, implementer, and external-player evidence.

Implementation evidence and concrete manual testing steps are recorded in the player handoff. The design requirements above are retained as the acceptance contract; the working proposals in section 5 are resolved by Fighter rules v1. No paid provider run or external-player observation is implied by automated qualification.
