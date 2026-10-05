# Adventure Play

This context covers the characters a player brings to adventures and what the player can learn and revisit during each journey. The game is moving to the 2024 5e rules in SRD 5.2 ([ADR 0005](docs/adr/0005-start-afresh-on-5e-and-suspend-compatibility.md)). Terms marked _Pre-5e only_ belong to the old game, which is removal pending (#139); don't use them for 5e work.

## Language

**Player**:
The human who chooses a character and controls its actions during an adventure.
_Avoid_: Character, Fighter

**Character**:
A persistent adventurer with an identity, class, ability scores, equipment, carried treasure, and earned career progress that can be brought to different adventures.
_Avoid_: Player, Adventure save

**Character sheet**:
The record of a character's identity, abilities, capabilities, health, equipment, and advancement.
_Avoid_: Player sheet, Combat profile

**Character library**:
The player's collection of independently saved characters, including characters not currently taking part in an adventure.
_Avoid_: Save slots, Party

**Pending creation**:
The six 4d6-drop-lowest ability rolls of a character being created, saved in the character library before the player sees them. They stay the same until a character is saved from them; there are no rerolls.
_Avoid_: Roll (when the saved set is meant), Draft character

**Character level**:
The stage of a character's advancement that determines its supported class capabilities.
_Avoid_: Content version, Story milestone, Hint level

**Experience points**:
Earned character progress awarded for authored accomplishments and used to determine advancement.
_Avoid_: Story milestones, Player score

**Treasure**:
Silver and items a character finds by examining something (such as a chest, or a defeated enemy's body), or is given by a named person, during an adventure. The engine decides what is there; it is kept only on surviving completion and earned once per character. It is never simply awarded. Silver is the pre-5e currency; the 5e currency is not decided yet, so 5e treasure is named items with no value.
_Avoid_: Reward XP, Drop

**Pending treasure**:
Treasure the character carries during an adventure but has not kept yet. It can be used in that adventure at once (and, once coin and merchants exist, spent there). A victory or an escape keeps what the character holds at the end; a defeat or abandonment rolls the character back to how it started, as if the adventure never happened.
_Avoid_: Loot (when kept treasure is meant), Inventory

**XP award**:
One source of experience points a character can earn once: winning an encounter (its opponents' stat-block XP) or reaching an ending that awards XP. Awards are credited only on surviving completion.
_Avoid_: Milestone, Score

**Exit room**:
A room the character can leave the adventure from. Leaving is the player's final choice, never the AI DM's. Not to be confused with a room's exits, the passages out of it.
_Avoid_: Exit (alone, which means a passage out of a room), Retreat

**Escape**:
An ending the player chooses by leaving from an exit room: with loot when the character carries treasure, without it otherwise. Like a victory, it is surviving completion.
_Avoid_: Retreat, Flee (which a fled monster does), Quit

**Abandonment**:
Giving up an adventure in progress from the character sheet. The character keeps its treasure and XP as they were when the adventure started, and can start another.
_Avoid_: Escape, Quit

**Adventure module**:
A playable scenario defining its setting, encounters, challenges, rewards, and intended characters.
_Avoid_: Character sheet, Adventure session

**Room**:
A place in an adventure module, joined to others by two-way passages. There is no map: a character is in one room at a time, and entering a room whose fight has not been won begins it.
_Avoid_: Location (pre-5e), Square, Tile

**Feature**:
Something fixed in a room that the character can examine, such as a chest or a ledger. Examining it may make its discovery. Not to be confused with a class feature, such as Second Wind, which the code calls a feature in combat contexts.
_Avoid_: Object (too broad), Item (an item can be taken)

**Discovery**:
The authored fact a character learns by first examining a feature, which may reveal an item hidden in it. The engine decides it; the AI DM cannot invent one.
_Avoid_: Clue (pre-5e), Journal entry

**Door**:
A barrier in a passage between two rooms, stuck or locked. A stuck door is forced open with a check; a locked one opens with its key, or is picked or broken open with a check. Once open it stays open.
_Avoid_: Gate, Exit (the way itself)

**Trap**:
A hidden danger in a passage. Searching a room may find it, and a found trap may be disarmed; going through an armed trap springs it once, with a saving throw against its damage.
_Avoid_: Hazard

**Ability check**:
A d20 roll plus one ability's modifier, and the proficiency bonus when the check uses a skill the character is proficient in, against an authored DC. Each check is rolled once and its outcome remembered, so asking again never rerolls it.
_Avoid_: Skill roll, Test

**Topic**:
Something a creature can be asked about, with its authored answer. Some need a check, with an answer for success and one for failure. The AI DM offers only these topics.
_Avoid_: Subject (pre-5e), Question

**Adventure session**:
One character's particular playthrough of an adventure module, with its own events, world state, and conversation history.
_Avoid_: Character, Adventure module

**Recommended level range**:
The inclusive span of character levels an adventure module is intended to suit for its stated character count and supported classes.
_Avoid_: Character level, Automatic difficulty scaling

**Conversation history**:
The player's messages, AI replies, and authoritative result cards as they appeared during a saved play session. It can be revisited after resuming or completing the adventure, but it does not establish game facts.
_Avoid_: Journal, game state

**Journal**:
_Pre-5e only._ The authoritative record of facts, testimony, beliefs, and leads that the player has discovered in the adventure.
_Avoid_: Conversation history, chat log

**Hint**:
_Pre-5e only._ Optional guidance based on what the player currently knows. Hints are prepared as the scene changes, stay hidden until requested, and can provide a stronger nudge when explicitly requested.
_Avoid_: Undiscovered clue, solution reveal

**Save slot**:
A single local record of an adventure session, including its authoritative game state and conversation history. It is saved automatically as play progresses. Each adventure session has its own save beside the character library, and the library remembers which one to continue. (Pre-5e only: the `--legacy` browser mode holds one session in a single `--save` file.)
_Avoid_: Manual save point

**Proficiency bonus**:
The bonus, set by character level, that a character adds to attacks, saving throws and skill checks it is proficient in.
_Avoid_: Level bonus, Attack bonus

**Saving throw**:
A d20 roll plus one ability's modifier, and the proficiency bonus if proficient, made to resist a trap, spell or other effect. 5e has one for each of the six abilities.
_Avoid_: Save (which means a saved file), Resistance roll

**Skill**:
A named use of an ability, such as Athletics (Strength) or Perception (Wisdom). A skill check adds that ability's modifier, and the proficiency bonus if the character is proficient in the skill.
_Avoid_: Ability check (when a skill is meant), Talent

**Encounter**:
A fight between two sides, the party and its opponents, each holding one or more combatants. It ends when one side is entirely defeated.
_Avoid_: Battle, Combat (when one fight is meant)

**Combatant**:
One creature in an encounter, with its own hit points, armour class, attack and initiative roll. The player character is one; each opponent is another.
_Avoid_: Monster (for the player character), Unit

**Initiative**:
The d20 + initiative bonus each combatant rolls when an encounter begins; higher totals act first, ties going to the higher Dexterity and then a seeded roll-off.
_Avoid_: Turn order (the result, not the roll)

**Defeated character**:
A character whose adventure session ended at 0 HP. It stays in the library but cannot start another adventure; there are no death saving throws.
_Avoid_: Dead character, Unconscious

**Difficulty**:
An adventure module's declared challenge for its recommended level range: Easy, Medium or Hard. The balance gate checks that the module is neither more lethal nor easier than it declares. Not to be confused with the Difficulty Class (DC) of a single check.
_Avoid_: Challenge rating (a monster's, not a module's), DC

**Ordinary enemy**:
An opponent a module doesn't mark as a boss. The balance gate's one-hit-kill cap applies only to ordinary enemies; a boss is exempt.
_Avoid_: Average enemy, Minion (a stat block's name)

**Format version**:
The single version number carried by a character library, adventure save, trace or adventure module file. Changing a format bumps it; until the owner declares a stable release, a loader refuses an older version with a message naming the file, and never migrates it.
_Avoid_: Rules version, Content version, Schema version
