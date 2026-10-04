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

**Character level**:
The stage of a character's advancement that determines its supported class capabilities.
_Avoid_: Content version, Story milestone, Hint level

**Experience points**:
Earned character progress awarded for authored accomplishments and used to determine advancement.
_Avoid_: Story milestones, Player score

**Treasure**:
Silver and items a character finds by examining something, or is given by a named person, during an adventure. The engine decides what is there; it is kept only on surviving completion and earned once per character. It is never simply awarded. Silver is the pre-5e currency; the 5e currency is not decided yet.
_Avoid_: Reward XP, Drop

**Adventure module**:
A playable scenario defining its setting, encounters, challenges, rewards, and intended characters.
_Avoid_: Character sheet, Adventure session

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

**Difficulty**:
An adventure module's declared challenge for its recommended level range: Easy, Medium or Hard. The balance gate checks that the module is neither more lethal nor easier than it declares. Not to be confused with the Difficulty Class (DC) of a single check.
_Avoid_: Challenge rating (a monster's, not a module's), DC

**Format version**:
The single version number carried by a character library, adventure save, trace or adventure module file. Changing a format bumps it; until the owner declares a stable release, a loader refuses an older version with a message naming the file, and never migrates it.
_Avoid_: Rules version, Content version, Schema version
