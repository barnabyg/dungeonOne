# Adventure Play

This context covers the characters a player brings to adventures and what the player can learn and revisit during each journey. The game uses the 2024 5e rules in SRD 5.2 ([ADR 0005](docs/adr/0005-start-afresh-on-5e-and-suspend-compatibility.md)).

## Language

**Player**:
The human who chooses a character and controls its actions during an adventure.
_Avoid_: Character, Fighter

**Character**:
A persistent adventurer with an identity, class, ability scores, equipment, carried treasure, a purse of coin, and earned career progress that can be brought to different adventures.
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

**Level choice**:
The Ability Score Improvement (+2 to one ability or +1 to two, none above 20) and fourth weapon mastery a Fighter chooses on its sheet after settling at level 4. Until it is made the character owes it, saved in the character library, and cannot start another adventure.
_Avoid_: Level-up (the card that shows a new level), Feat

**Experience points**:
Earned character progress awarded for authored accomplishments and used to determine advancement.
_Avoid_: Story milestones, Player score

**Treasure**:
Items a character finds by examining something (such as a chest, or a defeated enemy's body), or is given by a named person, during an adventure. The engine decides what is there; it is kept only on surviving completion. It is never simply awarded. Each treasure is found once per character: the character's ledger records it as a find, and it is never there to find again, even after the character no longer holds it. Treasure the character holds is one of its possessions. Each treasure is a gem or art object with a value from the treasure catalogue, which a merchant pays in full; coin found the same way is not treasure but goes into the purse.
_Avoid_: Reward XP, Drop

**Coin**:
SRD 5.2 copper, silver and gold pieces (1 gp = 10 sp = 100 cp). A module hides coin, like treasure, in a feature or on an opponent's body, and the engine decides how much; taking it empties it into the purse at once. It is found once per character, recorded in the ledger like a treasure. It is spent with merchants.
_Avoid_: Gold (for coin in general), Money

**Purse**:
The coin a character holds, one of its possessions, kept as a number of copper pieces and always shown in mixed denominations, largest first ("3 gp 4 sp"). A new character's purse is empty: there is no starting coin.
_Avoid_: Wallet, Gold, Balance

**Treasure budget**:
The most an adventure module's findable treasure (coin, gems, art objects, potions and gear) may be worth, set by its maximum recommended level. Each item must also have a tier allowed at that level.
_Avoid_: Loot table, Hoard

**Treasure type**:
What a bestiary monster carries, as dice for one kind of coin and optionally one trinket (a gem or art object): none for undead and beasts, a few coppers for a goblin. An authoring-time roll turns it into the items an opponent carries in a module; the validator rejects carried loot the type couldn't produce.
_Avoid_: Loot table, Treasure class

**Possessions**:
What a character holds: its equipment, its stowed gear, its ammunition, its treasure and its purse. An adventure starts holding them, and they change only there. Settling a victory or an escape replaces them with what the character holds at the end.
_Avoid_: Inventory (the items carried in one adventure), Loot

**Equipment**:
The weapons and armour a character has equipped, armour first and then the weapon it attacks with and any second light weapon. Its armour class and attacks are derived from it.
_Avoid_: Gear list, Loadout (the derived reading of it, in code)

**Stowed gear**:
Catalogue weapons, armour and shields a character carries but has not equipped. Gear found is stowed as it is taken; equipping, unequipping, wielding and dropping move gear between the equipment, the stowed gear and the room.
_Avoid_: Pack, Backpack, Inventory (the module items carried in one adventure)

**Gear**:
A catalogue weapon, armour or shield, or a bundle of 20 arrows or bolts. A module places gear as an item hidden in a feature or on an opponent, found once per character like treasure; it is equipment, not loot, so carrying it out is not escaping with loot.
_Avoid_: Loot, Treasure (which has no catalogue numbers)

**Ammunition**:
The arrows and bolts a character holds, kept as a count of each. A ranged weapon spends one of its kind with each attack and is refused with none; half of those spent in a fight are recovered when it is won. Bought, sold and found in bundles of 20.
_Avoid_: Quiver (a found item's name, not the count), Missiles

**Object interaction**:
The one free interaction a combatant has each turn (SRD 5.2). Drawing, stowing or swapping a weapon in a fight uses it; a second weapon change that turn is refused.
_Avoid_: Free action, Utilize (the action a second interaction would take)

**Starting kit**:
One of the named sets of common-tier equipment a player chooses from at creation, of equal value within 3 gp. There is no starting coin.
_Avoid_: Starting gear package, Class equipment

**Weapon mastery**:
A Fighter's mastery of a kind of weapon, chosen at creation (three at levels 1–3), and a fourth chosen at level 4. The weapon's mastery property (Sap, Vex, Graze or Nick) applies only while the character wields that weapon.
_Avoid_: Proficiency (Fighters are proficient with every weapon), Weapon skill

**Extra attack (light weapon)**:
The SRD 5.2 Light property's one extra attack with a second light weapon after attacking with a light weapon on the same turn; a bonus action unless Nick makes it part of the Attack action.
_Avoid_: Extra Attack (the level-5 Fighter feature), Off-hand attack

**Extra Attack**:
The level-5 Fighter feature: the Attack action makes two attacks, each at any living opponent. Each attack is a separate action call; the engine refuses a third.
_Avoid_: Extra attack (the light weapon's), Multiattack (a monster's)

**Merchant**:
A creature in a module that trades: it sells the catalogue gear it stocks at catalogue prices, buys carried gear at half price, and buys gems and art objects at their full value. Each trade takes its authored minutes. Merchants exist only inside adventures.
_Avoid_: Shop, Market (there is none between adventures), Vendor

**Trade**:
Buying from or selling to a merchant, outside a fight in its room. Stock and prices are the engine's; selling equipped gear needs the player's confirmation in the panel. Trades are part of the adventure: settling a victory or an escape keeps their result, and a defeat or abandonment undoes them.
_Avoid_: Purchase (for selling too), Haggle

**Ledger**:
The record on a character of each treasure, coin and gear it has found and each XP award it has been credited, so that each is earned once. It is kept apart from the possessions and only grows: losing an item never takes its find away.
_Avoid_: History, Achievements

**Settling**:
Ending an adventure in the character library, once. After a victory or an escape the character's possessions are replaced with what it holds at the end, its new finds and XP awards are added to its ledger, and it rests to full health. After a defeat it is marked defeated at 0 HP with its possessions and ledger as they were at the start.
_Avoid_: Crediting (which suggests adding), Rewarding

**Pending treasure**:
Treasure and coin the character carries during an adventure but has not kept yet. It can be used in that adventure at once, and coin spent there with a merchant. Settling a victory or an escape replaces the character's possessions with what it holds at the end, pending treasure included; a defeat or abandonment rolls the character back to how it started, as if the adventure never happened.
_Avoid_: Loot (when kept treasure is meant), Inventory

**XP award**:
One source of experience points a character can earn once: winning an encounter (its opponents' stat-block XP) or reaching an ending that awards XP. Awards are credited only on surviving completion.
_Avoid_: Milestone, Score

**Exit room**:
A room the character can leave the adventure from. Leaving is the player's final choice, never the AI DM's. Not to be confused with a room's exits, the passages out of it.
_Avoid_: Exit (alone, which means a passage out of a room), Retreat

**Escape**:
An ending the player chooses by leaving from an exit room: with loot when the character carries treasure or coin found in that adventure, without it otherwise. Like a victory, it is surviving completion.
_Avoid_: Retreat, Flee (which a fled monster does), Quit

**Abandonment**:
Giving up an adventure in progress from the character sheet. The character's possessions, ledger and XP stay as they were when the adventure started, and it can start another.
_Avoid_: Escape, Quit

**Adventure module**:
A playable scenario defining its setting, encounters, challenges, rewards, and intended characters.
_Avoid_: Character sheet, Adventure session

**Room**:
A place in an adventure module, joined to others by two-way passages. There is no map: a character is in one room at a time, and entering a room whose fight has not been won begins it.
_Avoid_: Location, Square, Tile

**Feature**:
Something fixed in a room that the character can examine, such as a chest or a ledger. Examining it may make its discovery. Not to be confused with a class feature, such as Second Wind, which the code calls a feature in combat contexts.
_Avoid_: Object (too broad), Item (an item can be taken)

**Discovery**:
The authored fact a character learns by first examining a feature, which may reveal an item hidden in it. The engine decides it; the AI DM cannot invent one.
_Avoid_: Clue, Journal entry

**Door**:
A barrier in a passage between two rooms, stuck or locked. A stuck door is forced open with a check; a locked one opens with its key, or is picked or broken open with a check. Once open it stays open.
_Avoid_: Gate, Exit (the way itself)

**Trap**:
A hidden danger in a passage. Searching a room may find it, and a found trap may be disarmed; going through an armed trap springs it once, with a saving throw against its damage.
_Avoid_: Hazard

**Ability check**:
A d20 roll plus one ability's modifier, and the proficiency bonus when the check uses a skill the character is proficient in, against an authored DC. Each check is rolled once and its outcome remembered, so asking again never rerolls it; only an authored retry rolls it again.
_Avoid_: Skill roll, Test

**Retry**:
Another try at a failed check, offered only when its adventure module authors one: after a cost, paid before the roll (damage, or a tool used up), or after a changed circumstance. Without one, a check is never tried again; asking for one changes nothing. A check whose success would only open ways that are now closed offers none: there is nothing left to try for.
_Avoid_: Reroll, Second chance

**Circumstance**:
An authored fact about the adventure session that a check can depend on: the character holds a named item, has made a named discovery or has won a named encounter (or hasn't). It can give a check advantage or disadvantage, or allow a retry once it changes; the check's card names it.
_Avoid_: Situational modifier, Condition (which is a fight's)

**Tool**:
A mundane item a module places, such as a rope or an iron spike, that does nothing by itself: a circumstance or a retry's cost names it. It is not kept after the adventure.
_Avoid_: Gear (a catalogue weapon, armour or shield), Kit

**Topic**:
Something a creature can be asked about, with its authored answer. Some need a check, with an answer for success and one for failure. The AI DM offers only these topics.
_Avoid_: Subject, Question

**Adventure session**:
One character's particular playthrough of an adventure module, with its own events, world state, and conversation history.
_Avoid_: Character, Adventure module

**Recommended level range**:
The inclusive span of character levels an adventure module is intended to suit for its stated character count and supported classes.
_Avoid_: Character level, Automatic difficulty scaling

**Conversation history**:
The player's messages, AI replies, and authoritative result cards as they appeared during a saved play session. It can be revisited after resuming or completing the adventure, but it does not establish game facts.
_Avoid_: Journal, game state

**Save slot**:
A single local record of an adventure session, including its authoritative game state and conversation history. It is saved automatically as play progresses. Each adventure session has its own save beside the character library, and the library remembers which one to continue.
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
A fight between two sides, the party and its opponents, each holding one or more combatants. It ends when every combatant on one side is defeated or has fled.
_Avoid_: Battle, Combat (when one fight is meant)

**Combatant**:
One creature in an encounter, with its own hit points, armour class, attack and initiative roll. The player character is one; each opponent is another.
_Avoid_: Monster (for the player character), Unit

**Monster**:
A kind of creature characters fight, defined once in the bestiary by its stat block (SRD 5.2, or a house block derived from one), a default description, its level band (the character levels it suits) and its treasure type. An opponent is a monster placed in an encounter, under the monster's name or one the module gives it ("Tall Skeleton"); whether it is a boss belongs to the opponent, not the monster.
_Avoid_: Enemy (an opponent, in a fight), Creature (one the character can talk to)

**Bestiary**:
The shared collection of monsters adventure modules name by id, in its own file with its own format version. A module may still author a one-off stat block inline for an opponent that no other module needs.
_Avoid_: Monster manual, Stat block library

**Morale**:
A house rule on top of 5e: a side's nerve, checked when its first combatant falls and again at half strength. Each monster on it with a morale DC makes a Wisdom saving throw; one that fails is fleeing, and on its next turn it has fled: it is out of the fight, leaves no body and takes what it carried with it, and gives half its XP if it exchanged blows with the character first, or none. Undead and mindless monsters have no morale DC and never check.
_Avoid_: Rout, Retreat

**Surrender**:
What a monster does instead of fleeing when it fails morale and its adventure module authors a surrender for it: on its next turn it yields and is out of the fight, leaving no body. Once the fight is won it is a creature to talk to about its authored topics, and a topic may have it offer what it carries: it is a named person giving treasure (see Treasure). It gives half its XP if it exchanged blows with the character first, or none, plus any XP the module awards for sparing it.
_Avoid_: Capture (it is not taken prisoner), Yield (as a term)

**Condition**:
A state the engine puts on a combatant in a fight, such as poisoned, prone or paralysed, with what gave it, how many of the combatant's turns it lasts and the save that ends it. Conditions change rolls (advantage, disadvantage, failed saves and critical hits) and may stop the combatant acting; they end with the fight, and the AI DM can only report them.
_Avoid_: Status effect, Debuff

**Rider**:
What a hit with a monster's attack does besides its damage: extra damage of its own type, and a condition, avoided by a successful saving throw if the rider names one.
_Avoid_: On-hit effect, Proc

**Trait**:
A rule a monster's stat block carries beyond its attacks, such as Pack Tactics (advantage on its attacks while an ally is alive and able to act) or Undead Fortitude (a Zombie's Constitution save to stay at 1 HP instead of falling). Multiattack, the several attacks some monsters make each turn, is an action, not a trait.
_Avoid_: Ability (an ability score), Feature (the character's)

**Damage type**:
One of the 13 SRD 5.2 kinds of damage, such as bludgeoning, poison or radiant, carried by every damage roll. A creature's resistance to a type halves that damage, its vulnerability doubles it and its immunity ignores it; the engine applies them after rolling.
_Avoid_: Element, Damage kind

**Initiative**:
The d20 + initiative bonus each combatant rolls when an encounter begins; higher totals act first, ties going to the higher Dexterity and then a seeded roll-off.
_Avoid_: Turn order (the result, not the roll)

**Defeated character**:
A character whose adventure session ended at 0 HP. It stays in the library but cannot start another adventure; there are no death saving throws.
_Avoid_: Dead character, Unconscious

**Difficulty**:
An adventure module's declared challenge for its recommended level range: Easy, Medium or Hard. The balance gate checks that the module is neither more lethal nor easier than it declares; a shipped module is declared at the strictest difficulty whose survival threshold it clears by at least 3 points (#252). Not to be confused with the Difficulty Class (DC) of a single check.
_Avoid_: Challenge rating (a monster's, not a module's), DC

**Check policy**:
How the balance harness grades checks (#285): seeded rolls them as a player meets them; always-fail and always-succeed land every check in its worst or best reachable band. The balance gate requires a module to stay completable, and within its difficulty, when every check fails.
_Avoid_: Check mode, Dice mode

**Ordinary enemy**:
An opponent a module doesn't mark as a boss. The balance gate's one-hit-kill cap applies only to ordinary enemies; a boss is exempt.
_Avoid_: Average enemy, Minion (a stat block's name)

**Format version**:
The single version number carried by a character library, adventure save, trace, adventure module or bestiary file. Changing a format bumps it; until the owner declares a stable release, a loader refuses an older version with a message naming the file, and never migrates it.
_Avoid_: Rules version, Content version, Schema version
