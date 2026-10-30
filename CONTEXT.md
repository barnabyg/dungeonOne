# Adventure Play

Terms for Dungeon One's characters, adventures and balance tools. The game uses the 2024 5e rules in SRD 5.2 ([ADR 0005](docs/adr/0005-start-afresh-on-5e-and-suspend-compatibility.md)); this glossary holds only the project's own terms and where it narrows or departs from 5e.

This file holds the terms for characters and adventures. Read the others when your work touches them:

- [Rooms and fights](docs/glossary/rooms-and-fights.md): rooms, regions, the map, flags, checks, encounters, morale, talk, and some spell and class terms.
- [Balance tools](docs/glossary/balance-tools.md): the harness, the gate, routes and release runs.

## Language

**Player**:
The human who chooses a character and controls its actions during an adventure.
_Avoid_: Character, Fighter

**Character**:
A persistent adventurer with a class, abilities, possessions and progress, brought to one adventure at a time.
_Avoid_: Player, Adventure save

**Character library**:
The player's saved characters, including those not on an adventure.
_Avoid_: Party, Save slot (one adventure session's record)

**Pending creation**:
The ability rolls of a character being created, saved before the player sees them; there are no rerolls.
_Avoid_: Roll (when the saved set is meant), Draft character

**Class definition**:
The data a class is made of, from which every derived number on a sheet comes; no class is hard-coded in the engine.
_Avoid_: Class rules, Hard-coded Fighter

**Test caster**:
A test-only casting class and its fixed character, Sage. Creation never offers it and the gate never plays it.
_Avoid_: Wizard, Cleric (for the test caster)

**Feature**:
Something fixed in a room that the character can examine, such as a chest. Not a class feature, such as Second Wind, which combat code also calls a feature.
_Avoid_: Object (too broad), Item (an item can be taken)

**Feature uses**:
How many more times the character can use each limited class feature, spell slots included, in the current adventure.
_Avoid_: Charges, Second Wind counter

**Level choice**:
A choice a new level brings, such as an Ability Score Improvement, made on the sheet after settling. Until it is made the character cannot start another adventure.
_Avoid_: Level-up (the card that shows a new level), Feat

**Spells owed**:
The spells and cantrips a new level lets a caster choose that it hasn't chosen yet. Like a level choice, they block the next adventure.

**Preparing spells**:
Changing a caster's prepared spells, allowed only between adventures on its sheet; Memorize Spell is the one swap made during an adventure. A Wizard prepares only from its spellbook.
_Avoid_: Memorising (Memorize Spell is the Wizard's feature)

**Short rest**:
A rest in a room with no foes left, limited per adventure (per region in a long module). It spends hit dice and restores short-rest uses.
_Avoid_: Breather, Camp

**Long rest**:
A rest at a rest site, limited like a short rest, that restores everything.
_Avoid_: Sleep, Camp

**Rest site**:
A room a module marks as a safe place to rest, where a long rest may be taken.
_Avoid_: Camp, Safe room

**Possessions**:
What a character holds: its equipped gear, stowed gear, ammunition, treasure and purse. An adventure starts holding them, and they change only there.
_Avoid_: Inventory (the items carried in one adventure), Loot

**Stowed gear**:
Gear a character carries but has not equipped, as found gear is when taken.
_Avoid_: Pack, Backpack, Inventory

**Gear**:
A catalogue weapon, armour, shield or bundle of ammunition. It is equipment, not loot, so carrying only gear out is not escaping with loot.
_Avoid_: Loot, Treasure (which has no catalogue numbers)

**Starting kit**:
One of a class's named sets of common equipment offered at creation, roughly equal in value. There is no starting coin.
_Avoid_: Starting gear package, Class equipment

**Tool**:
A mundane item a module places, such as a rope, that does nothing by itself: a circumstance or a retry's cost names it. It is not kept after the adventure.
_Avoid_: Gear (a catalogue item, thieves' tools included), Kit

**Treasure**:
A gem or art object a character finds by examining something, or is given by a named creature, with a catalogue value a merchant pays in full. It is never simply awarded, and is kept only by surviving.
_Avoid_: Reward XP, Drop

**Purse**:
The coin a character holds, one sum shown in mixed denominations. Found coin goes straight into it and is not treasure. A new character's purse is empty.
_Avoid_: Wallet, Gold (for coin in general), Balance

**Pending treasure**:
Treasure and coin carried during an adventure but not yet kept, though it can be spent there.
_Avoid_: Loot (when kept treasure is meant), Inventory

**Treasure budget**:
The most the coin, gems and art objects a module hides may be worth, set by its maximum recommended level. Potions, scrolls, gear and magic items are outside it, limited by their tiers; see [treasure](docs/rules/treasure.md#treasure).
_Avoid_: Loot table, Hoard

**Treasure type**:
What a bestiary monster carries, as coin dice and perhaps a trinket. An authoring-time roll writes it into a module as items an opponent carries.
_Avoid_: Loot table, Treasure class

**Merchant**:
A creature in a module that sells gear at catalogue prices and buys gear at half and treasure at full value. There is no market between adventures.
_Avoid_: Shop, Market, Vendor

**Trade**:
Buying from or selling to a merchant, outside a fight in its room. Trades are part of the adventure: settling keeps them, and a defeat or abandonment undoes them.
_Avoid_: Purchase (for selling too), Haggle

**Ledger**:
The record on a character of every treasure, coin and gear find and every XP award credited, so each is earned once. It only grows: losing an item never takes its find away.
_Avoid_: History, Achievements

**Settling**:
Ending an adventure in the library, once. A victory or escape keeps what the character holds, adds its finds and awards to the ledger and rests it to full; a defeat leaves it at 0 HP as it started.
_Avoid_: Crediting (which suggests adding), Rewarding

**XP award**:
One source of XP a character earns once: an encounter won, slipped past or ended peacefully (one award whichever way), or an ending. Credited only on surviving.
_Avoid_: Milestone, Score

**Objective**:
What a module's play aims at: its victory ending if it has one, or else getting out with loot. Leaving short of it gives up the ending's award.
_Avoid_: Goal, Quest

**Exit room**:
A room the character can leave the adventure from. Leaving is the player's choice, never the AI DM's.
_Avoid_: Exit (alone, which means a passage out of a room), Retreat

**Escape**:
An ending the player chooses by leaving from an exit room, with or without loot. Like a victory, it is surviving completion.
_Avoid_: Retreat, Flee, Quit

**Fleeing a fight**:
Leaving a fight under way through a usable exit with the character's action; each foe able to act first gets one attack, in place of opportunity attacks. The fight stays unresolved and nobody follows.
_Avoid_: Escape (the ending), Fled (a monster that failed morale), Retreat (the harness style), Running away

**Abandonment**:
Giving up an adventure in progress from the sheet. The character stays exactly as it was when the adventure started and can start another.
_Avoid_: Escape, Quit

**Defeated character**:
A character whose adventure ended at 0 HP. It stays in the library but cannot adventure again. A character at 0 HP is defeated for good, apart from [Last Stand](docs/rules/house-rules.md)'s single death saving throw.
_Avoid_: Dead character, Unconscious

**Adventure module**:
A playable scenario: its rooms, encounters, rewards and recommended levels.
_Avoid_: Adventure session

**Adventure session**:
One character's playthrough of one adventure module, with its own events, world state and conversation history.
_Avoid_: Character, Adventure module

**Save slot**:
The local record of one adventure session, saved automatically after every action beside the character library.
_Avoid_: Manual save point

**Conversation history**:
The player's messages, AI replies and engine result cards of a session. It can be revisited but never establishes game facts.
_Avoid_: Journal, Game state

**Difficulty**:
A module's declared challenge for its levels: Easy, Medium or Hard. The balance gate checks it is neither deadlier nor easier than declared. Not a check's DC.
_Avoid_: Challenge rating (a monster's), DC

**Caster item**:
A magic item that requires attunement by a spellcaster or by named caster classes, such as the Wand of the War Mage +1 or the Pearl of Power. A module may hide one in its caster slot.
_Avoid_: Wizard item, Spell item

**Attunement**:
A character's bond with a magic item that requires it. Here it is worked out from what the character holds, never stored: the first 3 items its class may attune, in the order found.
_Avoid_: Equipped, Activated

**Format version**:
The one version number each file format carries. A change bumps it, and until a stable release a loader refuses older files by name, never migrating them.
_Avoid_: Rules version, Content version, Schema version
