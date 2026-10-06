# Start afresh on 5e and suspend compatibility until a stable release

> **Status:** accepted. #137 made 5e the browser's only mode, and #139 removed the pre-5e game on 6 October 2026; git history keeps it.

On 4 October 2026 the project owner decided to move Dungeon One to the 2024 fifth-edition rules published in the System Reference Document 5.2 (SRD 5.2, CC-BY-4.0), instead of extending the house rules in [`docs/character-rules.md`](../character-rules.md). The game is in early development, and building every feature twice (once in the house rules, once in 5e) costs more than starting again. The plan is the [D&D 5e expansion plan](../../dnd-expansion-implementation-plan.md); increment 11 is issues #125–#140.

## Decision

**SRD 5.2 for everything.** Every character and every adventure module uses SRD 5.2 rules, names and stat blocks. Content outside SRD 5.2 is not used. The rules document carries the SRD 5.2 attribution.

**Remove the pre-5e game.** By the end of increment 11 (#139) the following are removed and no longer supported in any form:

- Hollow Beacon (every version, including the `--legacy` single save slot) and Stonebridge;
- the CLI command-mode adventures (Chapel, Signet, crossroads and other fixtures);
- the adventure generator in its current schema;
- every existing character, character library, save and trace;
- every runtime that only served them.

No migration is offered. A new 5e adventure module replaces them. Shared infrastructure is kept and adapted: the browser server and page, the AI DM turn loop and model adapter, save authority and file locking, the character library and career handoff, seeded randomness, trace and replay, scripted-DM testing, the verification pipeline and the artwork pack.

**Transition flag.** Until 5e becomes the browser's only mode (#137), 5e behaviour is reached by launching the browser with a temporary `--5e` flag and its own library path. The default browser keeps the old game working, so `main` stays playable at every commit. Until #139 merges, documents describing the old game mark it "removal pending".

**Throwaway formats.** While 5e is in development, the character library, adventure save, trace and adventure module files each carry one format version. A change to a format bumps its version. A loader that meets an older version refuses the file with a message that names it and tells the player to move it aside. Files are never deleted, migrated or reinterpreted, and there are no compatibility shims or per-increment rules versions.

**Declaring a stable release.** Compatibility contracts resume only when the owner declares a release stable, in writing, in a new ADR. That ADR names the release and the format versions it freezes. From then on, those formats are compatibility contracts: later builds keep reading them or offer an approved migration. No release is stable until that ADR exists, whatever its version number or tag.

## 5e in scope now

- Ability scores and modifiers ((score − 10) / 2, rounded down).
- Proficiency bonus.
- Saving throws for all six abilities.
- Skills and skill proficiencies.
- Advantage and disadvantage.
- Action, bonus action and reaction on each turn.
- The 5e XP table.
- SRD 5.2 stat blocks for monsters.

Other 5e rules arrive in later increments as the expansion plan schedules them (for example short and long rests, conditions and spellcasting).

## 5e left out, and why

| Left out                                                   | Why                                                                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Positioning (grid, distance, movement speed, reach, areas) | The game has no map. Rules that need distance are omitted or abstracted, and the rules document lists each one, including weapon masteries such as Push.                              |
| Opportunity attacks                                        | They depend on leaving reach, which needs positions.                                                                                                                                  |
| Ranged combat                                              | Range bands and cover need positions. Deferred to a later version.                                                                                                                    |
| Feats, except the level-4 Ability Score Improvement        | Not among the owner's priorities. The ASI is kept because planned levels reach 4.                                                                                                     |
| Multiclassing                                              | Not among the owner's priorities, and one class per character keeps balance qualification tractable. It can be its own plan later.                                                    |
| Species                                                    | Not among the owner's priorities. It can be its own plan later.                                                                                                                       |
| Background features other than the ability increase        | The 2024 +2/+1 (or +1/+1/+1) ability increase is kept for build choice; origin feats, tool proficiencies and starting equipment are not, to keep creation small and gear common tier. |

## House rules on top of 5e

- **Instant defeat at 0 HP.** A player character reduced to 0 HP is defeated at once: no death saving throws. The adventure ends, and a defeated character cannot start another. Monsters at 0 HP are defeated as in 5e.
- **Roll once.** Ability scores are rolled once with 4d6-drop-lowest from the seeded stream and placed freely. The rolled set is saved before it is shown, so reloading, restarting or abandoning creation shows the same set. There are no rerolls and no safety net for weak sets.
- **Common-tier starting gear.** Early levels are the most dangerous stage of a character. Starting gear is common tier only, deliberately departing from the 2024 Fighter's starting equipment.
- **Later: morale and reaction rolls.** Neither is core 5e; both are kept because the owner listed them, and arrive with monster variety and encounter openings.

## Supersedes

This ADR supersedes ADRs 0001–0004 and the increment 4 migration contract (deleted in #139) wherever they conflict. In particular:

- [ADR 0003](0003-save-characters-independently-of-adventure-sessions.md) and [ADR 0004](0004-qualify-the-full-adventure-in-character-mode.md) assume released saves stay playable and that `--legacy` stays supported. Neither holds any more: released Hollow Beacon saves, existing characters and `--legacy` are removed without migration. ADR 0003's independent character library and once-only career handoff are kept for 5e characters.
- [ADR 0001](0001-build-local-ai-browser-play-before-finishing-increment-8.md) and [ADR 0002](0002-restore-conversation-without-making-narration-authoritative.md) describe Hollow Beacon work. The browser-first direction and non-authoritative conversation history carry over to 5e; their Hollow Beacon specifics do not.
- The migration contract's compatibility inventory and replay guarantees no longer bind any build.

## Consequences

Every existing player file stops working when the old game is removed, and players are told to move old files aside rather than having them converted. In exchange, increments 11–18 build one rules engine instead of two, and agents must not add compatibility shims, migrations or rules-version branches until the stable-release ADR exists.
