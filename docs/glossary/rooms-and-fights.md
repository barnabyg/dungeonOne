# Rooms and fights

Terms for a module's places and what happens in them. The rest of the glossary starts at [`CONTEXT.md`](../../CONTEXT.md).

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

**Caster slot**:
A module's second magic item, from level 3, beside the one any class may use; only a caster item fills it.
_Avoid_: Bonus slot, Second slot
