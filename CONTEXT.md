# Adventure Play

Terms for Dungeon One's characters, adventures and balance tools. The game uses the 2024 5e rules in SRD 5.2 ([ADR 0005](docs/adr/0005-start-afresh-on-5e-and-suspend-compatibility.md)); this glossary holds only the project's own terms and where it narrows or departs from 5e.

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

**Ongoing effect**:
What a spell or feature leaves on a target while it lasts. With no clock, it ends by its duration's band: the turn, the fight, the next rest or the adventure.
_Avoid_: Buff (in player text), Aura

**Area spell**:
A spell whose effect fills an area. With no positions it catches up to a set number of opponents the caster chooses.
_Avoid_: AoE, Splash

**Turned**:
An undead opponent held by Turn Undead until it saves or is hurt or attacked. While every foe left is turned the character may leave without fleeing; the fight stays unresolved.
_Avoid_: Fleeing (a turned undead never leaves the fight)

**Sneak Attack**:
The Rogue's extra damage, applied by the engine whenever its rules are met. Its ally-adjacent clause is omitted, as there are no positions.
_Avoid_: Backstab, Sneaking in (which is about surprise)

**Disengage**:
The Rogue's bonus action that lets it flee a fight later that turn without drawing attacks. It does nothing else.
_Avoid_: Dash, Withdraw

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
The most a module's findable coin, treasure, gear and consumables may be worth, set by its maximum recommended level; each item's tier must also suit that level.
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
A character whose adventure ended at 0 HP. It stays in the library but cannot adventure again; there are no death saving throws.
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

**Room**:
A place in a module, joined to others by passages. A character is in one room at a time, with no position inside it.
_Avoid_: Location, Square, Tile

**Region**:
A named group of a module's rooms, such as an upper or lower level, which may span floors.
_Avoid_: Level (a character's), Area (an area spell's), Zone

**Long module**:
A module of two or more regions that declares itself long: rests are counted per region, every region has a rest site, and it gets a larger treasure budget and XP limit.
_Avoid_: Big module, Campaign

**Map**:
The layout of a module's rooms on grid cells and floors, joined by passages. It is not a tactical grid, and the player sees only what has been explored.
_Avoid_: Grid (a tactical one), Board, Plan

**Layout sketch**:
A design-stage map of a module before its content exists, a subset of a module's fields that the full module fills in.
_Avoid_: Draft module, Mock-up, Plan

**Known rooms**:
The rooms the character has visited or seen through an exit, each with a record of what it learned there, which the AI DM sees too.
_Avoid_: Journal, Log, Clue

**Discovery**:
The authored fact a character learns by first examining a feature, which may reveal a hidden item. The AI DM cannot invent one.
_Avoid_: Clue, Journal entry

**Topic**:
Something a creature can be asked about, with its authored answer. The AI DM offers only these.
_Avoid_: Subject, Question

**Flag**:
A named fact a module declares about a session, such as "the portcullis is raised", that only ever turns on. The engine sets it from what the character does; the AI DM cannot.
_Avoid_: Switch, Variable, Trigger, Quest state

**Alarm**:
A module's flag that only noise sets. What it changes is authored with flag conditions, and the AI DM cannot raise or lower it.
_Avoid_: Alert, Alarm level, Awareness

**Noise**:
What raises a module's alarm: an authored set of loud outcomes, such as a badly failed sneak or a long fight.
_Avoid_: Sound, Disturbance

**Sound tag**:
The named sound the engine puts on a result line for what its rolls cannot show, such as coin taken or a spell cast. The browser plays it only for a result that arrives now, never for history shown again.
_Avoid_: Sound effect, Cue

**Spell family**:
The group of spells that sound alike when cast, such as fire, healing or control. Every spell has one; a cantrip plays its family's sound more quietly.
_Avoid_: Spell school (the SRD's own grouping), Element

**Use (of an item on a feature)**:
Using a carried item on a room's feature as the module allows, such as fitting a carving into a door. Each use is made once.
_Avoid_: Combine, Apply

**Fight action**:
A room feature the character can turn on one opponent in a fight, such as toppling a statue: the single-player stand-in for teamwork.
_Avoid_: Environmental attack, Interaction, Hazard

**Circumstance**:
An authored fact about the session a check can depend on, such as holding a named item. It can give advantage or disadvantage, or allow a retry once it changes.
_Avoid_: Situational modifier, Condition (which is a fight's)

**Retry**:
Another try at a failed check, offered only when the module authors one, after a cost or a changed circumstance. Otherwise each check is rolled once and asking again changes nothing.
_Avoid_: Reroll, Second chance

**Encounter**:
A fight between the character and its opponents. It ends when one side is all defeated, fled or surrendered.
_Avoid_: Battle, Combat (when one fight is meant)

**Monster**:
A kind of creature defined once in the bestiary. An opponent is a monster placed in an encounter, perhaps renamed; being a boss belongs to the opponent.
_Avoid_: Enemy (an opponent, in a fight), Creature (one the character can talk to)

**Bestiary**:
The shared file of monsters that modules name by id. A module may still give a one-off stat block inline.
_Avoid_: Monster manual, Stat block library

**Ordinary enemy**:
An opponent a module doesn't mark as a boss; only these face the gate's one-hit-kill cap.
_Avoid_: Average enemy, Minion (a stat block's name)

**Condition**:
A state the engine puts on a combatant, such as prone or poisoned, which lasts a set number of turns or until a save and ends with the fight. The AI DM can only report it.
_Avoid_: Status effect, Debuff

**Morale**:
A house rule: when a side's first combatant falls and again at half strength, each monster with morale saves or flees, taking what it carries. Undead and mindless monsters never check.
_Avoid_: Rout, Retreat

**Surrender**:
What a monster does instead of fleeing when it fails morale and its module authors a surrender: it yields, and after the fight is a creature to talk to that may hand over what it carries.
_Avoid_: Capture, Yield (as a term)

**Sneaking in**:
Entering a fight's room with a Stealth check against its opponents' best passive Perception: success leaves the character unseen, failure starts the fight.
_Avoid_: Ambush roll, Sneak attack (a Rogue feature)

**Unseen**:
In a fight's room after sneaking in: the character may spring an ambush or slip past, and anything else is refused.
_Avoid_: Hidden (which a later Hide action means), Invisible

**Bypassed encounter**:
A fight the character slipped past unseen. It stays unresolved and is met again on coming back; it gives XP only where the module authors it.
_Avoid_: Avoided fight, Skipped encounter, Cleared

**Lurking encounter**:
An encounter whose opponents lie in wait: on first entry their Stealth is rolled against the character's passive Perception, and may surprise it.
_Avoid_: Ambush (the character's), Hidden monsters, Trap

**Reaction roll**:
A house rule: when a reaction-eligible fight would begin with no one surprised, 2d6 + Charisma picks the opponents' attitude band, which offers its module's options. Only a parley moves it.
_Avoid_: Reaction (the action-economy term), Attitude check, Morale

**Reaction-eligible**:
An encounter whose module gives it a reaction. None of its opponents may be mindless.
_Avoid_: Talkative, Peaceful encounter

**Parley**:
Talking reacting opponents round with one graded social check, which may move the band, let the character pass or start the fight. One per encounter.
_Avoid_: Diplomacy, Negotiation, Social check

**Toll**:
The coin reacting opponents let the character pass for, paid from the purse; it ends the encounter peacefully. Nothing lowers or waives it.
_Avoid_: Bribe, Fee

**Peaceful resolution**:
An encounter settled with no fight, by letting pass, a toll or a parley. The room is free and never fought; the opponents keep what they carry.
_Avoid_: Cleared (which means won), Bypassed encounter

**Wandering encounter**:
An encounter in no room that comes upon the character where it is, from its region's table, at most once. The AI DM cannot summon or prevent one.
_Avoid_: Random encounter, Ambush, Random monster

**Omen**:
A wandering table entry that is words only. It brings no fight and may recur; a wandering encounter that has come becomes its omen.
_Avoid_: Clue, Sign, Portent

**Balance harness**:
The tool that plays modules through the real runtime with rolled characters, in several styles and policies, and reports the outcomes.
_Avoid_: Simulator, Bot

**Balance gate**:
The harness's pass or fail verdict on a module at its declared difficulty, judged on its weakest character. The browser offers only modules that pass it.
_Avoid_: Balance check, Qualification

**Play style**:
How the harness plays a run: _direct_, _cautious_ (the gate's judged style) and _avoid-optional_, plus the reported-only styles that sneak, flee or use fight actions.
_Avoid_: Strategy, Difficulty

**Stealth-first**:
The play style that sneaks into every fight it can and slips past those that aren't its goal; reported, never judged.
_Avoid_: Sneaky style, Rogue style

**Retreat**:
The play style that flees a fight when low with no heal left, then leaves; reported, never judged.
_Avoid_: Fleeing style, Escape (the ending)

**Check policy**:
How the harness grades checks: rolled, always in their worst band, or always in their best. A module must stay completable when every check fails.
_Avoid_: Check mode, Dice mode

**Casting policy**:
How the harness spends a caster's slots: conserve (cantrips until hurt) or spend-early. The gate judges each caster on whichever survives more.
_Avoid_: Caster style, Nova

**Reaction policy**:
How the harness answers a reaction band: attack whenever offered (judged) or take a peaceful option whenever offered (reported).
_Avoid_: Diplomacy style

**Control chance**:
The gate's measure of a control spell or feature against an ordinary enemy: the chance one use keeps it out of the fight. It is judged against the one-hit-kill cap.
_Avoid_: Lockdown chance

**Required path**:
The rooms the harness passes to the objective by the fewest fights, then the fewest moves.
_Avoid_: Route (a declared one), Main path

**Route**:
A way from a module's entrance to its objective that the module declares, as the rooms it must pass. The gate judges each declared route.
_Avoid_: Path (the required path), Branch, Track

**Way family**:
The kind of strength a way past an obstacle tests: might (force, break, a fight for the key), skill (thieves' tools, sneaking), mind (an Intelligence or Wisdom check) or voice (talking). See the authoring guide.
_Avoid_: Route family (a route is declared), Approach (a check's option)

**Region sweep**:
The gate's run through one region of a long module, visiting every room not marked avoidable before going on to the objective; it is judged one difficulty lower.
_Avoid_: Clear, Full run, Exploration

**Avoidable room**:
A long module's room left out of its region's sweep, off every declared route.
_Avoid_: Optional room (every room off the required path is optional), Secret room

**Release run**:
A test that plays a module to an ending through the browser server, typing each step to the AI DM as a player would. Its step list, called `route` in code, is not a declared route.
_Avoid_: Playthrough (the harness's), Handoff run

**Generated release run**:
A release run whose steps come from the harness's cautious run on a fixed seed. It proves a module playable through the AI DM, not that particular moments happen.
_Avoid_: Auto route, Scripted run (the hand-written kind)

**Format version**:
The one version number each file format carries. A change bumps it, and until a stable release a loader refuses older files by name, never migrating them.
_Avoid_: Rules version, Content version, Schema version
