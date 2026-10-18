# Exploring

An adventure module is a set of rooms joined by two-way passages. There is no tactical grid and no movement speed: the character is in one room at a time, with no position inside it, and starts in the module's start room.

## The map

Each room sits on one cell of a square grid on a floor, placed by the module's author; the validator keeps the layout readable with the rules in `src/map-5e.ts`. [`docs/module-authoring.md`](../module-authoring.md) gives the layout rules and the mapping tool, `npm.cmd run map`. The map lays out rooms only. Each exit's **direction** is worked out from the map: up or down for a passage between floors, else the compass point (one of eight) from its room's cell to the far room's. The DM describes the ways out by their directions.

## Moving and fleeing

- **Moving.** The character goes through an exit to the room beyond. Entering a room whose fight has not been won begins it at once: initiative is rolled, and opponents who win it act first. A room whose fight was won stays clear. In a fight the character can't simply go: it may only flee, or leave while every foe left is turned.
- **Fleeing a fight** ([house rule](house-rules.md)). On its turn, with its action, the character may flee through any exit it could otherwise go through; a shut door, a closed way or a way not yet found is refused without a roll.
  - Before it goes, each opponent still in the fight and able to act (not incapacitated, so not turned, asleep or paralysed) makes one attack against it, in initiative order, standing in for opportunity attacks. A Multiattack makes one of its attacks, a die choosing which. A hit may wait for Uncanny Dodge or a reaction spell as any other does.
  - 0 HP from one of these attacks is a defeat in the fight's defeat ending, and the character never leaves. A Rogue that has taken Disengage this turn draws no attacks.
  - It then goes through the exit as a move does: a trap on the way springs, and the move counts. Fleeing into an exit room offers leaving as usual.
  - The fight stays unresolved in its room. Its fallen stay fallen; opponents that fled or surrendered stay gone (and count as driven off or spared if it is won later); those still standing keep their hit points and are met again on coming back. Their conditions and the character's effects lasting the fight end.
  - Foes don't follow: pursuit needs monster movement. A fled wandering encounter is met again only if a later rest is interrupted, with the same wounds.
  - A monster's own fleeing is morale (see [combat.md](combat.md)), not this.

## Regions and long modules

- **Regions.** A module may group its rooms into regions, such as an upper and a lower level, each with a display name. In such a module every room belongs to one region.
- **Moves.** The session counts the character's moves: each time it goes through an exit into another room, sneaking in included. A refused move, or a trap on the way that ends the adventure, adds none. A region's wandering table rolls on the moves that end in that region (`regionMoves`).
- **Long modules.** A module with two or more regions may declare itself long (`"long": true`). A house rule for a module too big for two short rests and one long rest: rests are counted per region, two short and one long in each, the long one only at a rest site, so every region of a long module needs a rest site. A rest is refused at its region's limit; going back to a region doesn't give its rests back. The session still counts the adventure's rests in all. A long module has twice the treasure budget for its maximum level and an XP limit one level higher (see [balance.md](balance.md)).

## Flags

A module may declare **flags**: named facts about the session, such as "the portcullis is raised", that only ever turn on (a door that opens and later shuts is two flags).

- **Who sets them.** The engine alone sets a flag, from what the character does: a feature examined (`sets` on the feature, whatever its check's band), an item taken or given (`sets` on the item), a room first entered (`sets` on the room; the start room's is set as the adventure begins), an encounter's outcome (`sets` on the encounter: `won`, `bypassed`, `peaceful` or `fled`), or a check's band (a `set` effect). Setting a flag again changes nothing. No DM tool takes a flag, so a player asking for one changes nothing.
- **Passages.** A passage may be open only once a flag is set (`openWhen`) or closed once one is (`closeWhen`), anywhere in the module: a lever in one room raises a portcullis in another. A way a flag keeps shut or has closed is refused like a band-closed one, its door and trap gone while it is closed.
- **Sure flags.** Reachability counts only flags set **for sure** (`sureFlagSetters` in `src/adventure-5e.ts`). A room sets a flag for sure by: entering it; examining a feature, by its own `sets` or a flag every band of its check sets; taking an item in plain sight or hidden in an unchecked feature of the room (not one a band may never reveal, nor one an opponent carries); or ending its fight, by its `won` flag, and for an encounter with a reaction only if `peaceful` sets the same flag. A fight flags place counts only where it surely is. A flag only some bands of a check set is never sure.
- The flags set are part of the session's state, in the order set, so a reload replays them.

### Encounters that appear, vanish or move

- An encounter may be in its room only once a flag is set (`presentWhile`), only until one is (`presentUntil`), or in another room once one is (`movesTo`: `{ "roomId", "when" }`); at most one of the three.
- Only an encounter not yet met goes where the flags place it. Once the character has sneaked up on it, been lain in wait for, met its reaction, fought it, slipped past it or fled it, it stays where it was met (`metEncounters`).
- A moved encounter keeps everything else, and what its opponents carry goes with it.
- When a flag places an unmet fight in the character's own room, its opponents come in and the fight begins as one walked into would, after a reaction roll if it reacts, with no one lying in wait and no one surprised. Nothing comes in while a fight is under way there, while the character waits unseen, or while opponents react to it.
- The encounter whose fight wins the adventure, and the wandering encounter, never appear, vanish or move. No room may hold two encounters, whatever their flags.
- Reachability counts a placed fight only where it is sure to be met: one that moves once its new room is reached and either its flag is set for sure or its own room is reached too; one that appears once its room is reached and its flag is set for sure; one that vanishes never. When an essential room or every exit lies behind a flag only such a fight sets, the validator names the encounter.

### Alarms

A module may declare an **alarm** (`alarm`: `{ "flag", "text", "fights"? }`): one of its flags, which only **noise** sets. Nothing else may set it: no `sets`, `set` effect or use.

- **Noise** is: a sneak into a fight that fails by 5 or more; a fight in one of the alarm's `fights` regions (each `{ "region", "round" }`, round 1–10) that goes on past that round, the wandering encounter's included; a check that lands in a band marked `"noisy": true`; or an opponent that flees a fight and survives it, counted when the fight is won or the character leaves it.
- The engine raises the alarm once, at the first noise, and records what raised it (`alarm` in the session's state); later noise changes nothing, and noise from the action that ends the adventure raises nothing. The result's `alarm` event is what a rule answering the alarm reads.
- What the alarm changes is authored with flag conditions, as for any flag. Once raised, the module's `text` shows in every room.
- Reachability never counts the alarm as set: a way only it opens is never counted on, and a passage it closes can't be the only way to an essential room or every exit.

### Features and topics that change with flags

- A feature may have another description while a flag is set (`changed`: `{ "when", "description" }`). Its discovery and check are unchanged.
- A creature's topic may be offered only once a flag is set (`offeredWhile`), only until one is (`offeredUntil`), or both. A topic not offered can't be asked. One already asked and since withdrawn keeps what the creature said, but can't be asked or retried.
- A surrendered opponent hands over what it carries only through a topic's `gives`, so such a topic can't be withdrawn and may wait only on a flag set for sure.
- Reachability counts a topic's check only once it is surely offered: never one that can be withdrawn, and one that waits on a flag only once that flag is set for sure.

## Using an item on a feature

A feature may accept items the character carries (`uses`: up to four, each `{ "item", "text", "effects", "consumes" }`, one per item): fitting a stone snake into a door, throwing meat to a chained beast.

- Each use has the module's words, may use the item up (`"consumes": true`), and has 1–6 effects drawn from a band's: a discovery, an item revealed, damage (which can end the adventure in its defeat), a passage opened (a hidden one) or closed, or a flag set.
- A use takes no roll, is made once and is remembered (`featureUses`).
- The engine refuses, without effect, a use in a fight, on a feature not here, of an item not carried or not accepted, and one already made.

## Wandering encounter tables

A region may have a wandering encounter table (`wandering`: `{ "chance", "every"?, "entries" }`): a chance from 1 to 100, and 1 to 6 entries, each an **omen** (`{ "omen" }`, words only) or a wandering encounter (`{ "encounterId", "omen" }`, an encounter in no room, with the words it becomes once it has come).

- **When it rolls.** A d100 from the session's seeded stream: every `every` moves (1–20) within the region (without `every`, moves never roll); before each short or long rest in the region; and when the alarm is raised, with the table of the region the character is in.
- **What comes.** At the chance or less an entry comes, and the same d100 picks it: the entries share the chance equally in order, so the chance must be at least the number of entries.
- A wandering encounter begins its fight where the character is. Its opponents carry nothing and never surrender; losing its fight ends the adventure in its defeat ending. It **comes at most once** (`wanderersCome`, even if fled) and is then its omen. An omen changes nothing and may come again.
- On a rest, a fight that comes interrupts it: the rest restores nothing and isn't counted. An omen, or nothing, lets the rest go on.
- A move whose roll falls due but that meets a fight (or a foe unseen or reacting, or a Tactical Mind offer) loses that roll. The alarm's roll waits instead: raised in a fight, it is rolled once the character is out of it, with the table of the region where it was raised (`wanderingDue`).
- Wandering encounters count against a module's encounters, at most `MAX_ENCOUNTERS = 30`.

## Fight actions

A feature may offer a **fight action** (`fightAction`: `{ "once", "check", "bands" }`), the single-player stand-in for teamwork against a big monster: toppling a statue onto an opponent, pushing a foe into a chasm.

- On its turn, with its action, the character makes the check (one approach, or 2–4 as `{ "approaches" }`, each a skill or ability and a DC only) against one opponent still in the fight, and the band's effects land on that opponent:
  - `{ "type": "damage", "dice", "sides", "modifier", "damageType" }`, dealt as a spell's damage is (resistances, Undead Fortitude, its fall and morale);
  - `{ "type": "condition", "condition", "turns" }`: prone, poisoned or paralysed for that many of its turns, with no save (prone always 1);
  - `{ "type": "remove" }`, which takes it out of the fight.
- A band has words, 1–2 effects of different types, or both; a removal stands alone. A band left out, or with only words, does nothing to the opponent; an unauthored band by 5 or more counts as the plain band.
- A removed opponent counts as defeated for XP, checks morale as a fall does, and leaves no body, so what it carried is lost. The validator never lets a removal reach an opponent carrying a door's key or an item a use needs.
- `"once": "fight"` is once in each encounter fought in its room (fleeing and coming back is the same fight); `"once": "adventure"` is once per adventure. One that can remove an opponent must be once per adventure.
- The check is rolled once from the seeded stream and remembered (`fightActions`, `removedOpponents`). Poison or fear gives it disadvantage; Tactical Mind and Guidance don't apply.
- The engine refuses, without a roll, a fight action outside a fight, on a feature not here or with none, one already used, one with several approaches and none chosen, against an opponent not in the fight, and one when it isn't the character's turn or its action is spent.

## Known rooms

- The session remembers the rooms visited (`visitedRoomIds`) and the fights fled (`fledEncounterIds`).
- The engine projects the **known rooms**: every room visited, and every room seen through a visited room's exits (a hidden way only once opened), grouped by region in the module's order.
- A visited room has a record as the engine sees it now: discoveries, creatures talked to and what they said, doors on its open ways, traps found or sprung, and its fight once met. A room only seen has its name alone.
- The DM's scene summarises the known rooms other than the current one. A flag's id is never shown: the character knows a flag only by the ways it opened or closed and by the alarm.
- **Scene cap.** The summary is capped at 4,096 bytes as JSON (`KNOWN_ROOMS_SCENE_BYTES` in `src/runtime-5e.ts`). Over it, the rooms visited first lose their records first and keep their ways, then the rooms only seen are left out, then the rooms visited first.
- The summary decides nothing: no tool takes a known room, and `move` goes only through the scene's exits.

## Checks

- **Examining.** Examining a feature shows its description and makes its authored discovery, once; examining again repeats it. An item hidden in a feature becomes visible when that feature is first examined. Examining draws no dice, except that a feature may have a check, made the first time it is examined: its bands then make the discovery and reveal what is hidden.
- **Ability checks.** d20 + the ability's modifier, + the proficiency bonus when proficient in the skill (twice with Expertise), against the module's DC. A natural 20 or 1 is just its number. Each check is rolled once and its outcome remembered: trying again is refused, never rerolled. Every check site (a door's force, pick or break, a room search, a trap's disarm, a topic, a feature) goes through one check path: one d20 from the session's seeded stream, a check event, then the site's event, the outcome remembered under the site's id.
- **Graded checks.** An authored check grades its total into a band: **failure by 5 or more** (DC − 5 or less), **failure**, **success**, or **success by 5 or more** (DC + 5 or more).
  - An unauthored band by 5 or more counts as the plain band; an unauthored plain band does only what the site always does (a door opens, a trap is disarmed, a topic gets its words).
  - A band's effects: a **discovery**; an **item** revealed (a band never awards an item, and finds are once per character); **damage** (SRD 5.2 dice, no save; 0 HP ends the adventure in the effect's defeat ending); a route **opened** (a hidden passage is no exit at all until a band opens it, then an exit from both sides) or **closed** (for the rest of the adventure, its door and trap gone); or a flag **set**.
  - The band is remembered with the check, so its revelations survive a reload. The DM narrates only the band and effects the tool returns, and a tool call with an argument the tool doesn't list is refused without a roll.
  - A room search is one Perception roll for the whole room, so a trap's find DC is never graded.
- **Alternative approaches.** An authored check may offer two to four approaches, each a different skill or ability with its own DC; the bands belong to the obstacle, whichever approach is rolled. An Athletics or Strength approach may be marked `"movement": "climb"` or `"jump"`, so a Thief makes it with Dexterity (Second-Story Work); marking any other is refused. An action naming no approach, or one not offered, is refused without a roll. Once one is rolled, the outcome is remembered for every approach unless the module authors a retry, which offers every approach again.
- **Retries.** A check is never tried again unless its module authors a **retry**: **after a cost** (damage, or a carried tool the module names, used up) or **after a changed circumstance** (the character holds a named item, has made a named discovery or has won a named encounter).
  - It is offered only after a failure, while its condition holds: a cost retry after every failure while the cost can be paid; a circumstance retry once for each change, so not when the circumstance already held at the last try.
  - The cost is paid before the roll; damage that drops the character to 0 HP ends the adventure in the cost's defeat ending, and the check is not made.
  - The retry rolls again from the seeded stream, and its band applies on top of what earlier tries revealed (a closed way stays closed).
  - Once a check's success could only open ways that have all been closed, it offers no other try; a success that would also make a discovery or reveal an item keeps its retry.
  - A check with several approaches offers one retry per approach. A DM tool call asking for a retry where none is offered is refused without a roll.
- **Circumstances.** Each approach may name circumstances that give it **advantage** or **disadvantage**: the character holds a named item, has made a named discovery, has won a named encounter, or a named flag is set (with `not`, isn't). Each has an authored name, given as the source. They combine with Remarkable Athlete as SRD 5.2 says, and are judged when the check is rolled, after a retry's cost. The DM can't grant either. A trap's find has none.
- **Tools.** A module item of kind `tool` (a rope, an iron spike) does nothing by itself and weighs nothing: a circumstance or a retry's cost names it. It is not kept after the adventure.
- **Tactical Mind.** A level-2+ Fighter may add 1d10 to a failed check; see [the Fighter](classes.md).
- **Saving throws.** d20 + the ability's modifier, + the proficiency bonus in the saves the class's definition lists (`savingThrows`), against the DC. Traps, monster riders, concentration and other effects call for them; a condition that fails a save (paralysed for Dexterity) fails it without a roll.

## Doors, traps and thieves' tools

- **Doors.** A passage may have a door. A stuck door opens with **Force**, a Strength (Athletics) check. A locked door opens with **Pick** (a Dexterity check with thieves' tools), **Break** (the check the module names) or **Unlock**, offered while the character carries the door's key, with no roll. Each approach is tried once; an opened door stays open from both sides. Going through a shut door is refused.
- **Traps.** A passage may have a hidden trap. In a module with traps, every room offers **Search**, one check per room, with Wisdom (Perception) or Intelligence (Investigation), whichever the character is better at (Perception on a tie). Every search shows the same DC, the lowest find DC of any trap in the module, so the DC never gives a trap away; the search finds each hidden trap on the room's exits whose find DC the total meets. A found trap offers **Disarm**, tried once; a failed disarm leaves it armed. Going through an armed trap, found or not, springs it once: a saving throw, then its damage, halved (rounding down) on a success. A trap that drops the character to 0 HP ends the adventure in its defeat ending.
- **Thieves' tools** pick a lock or disarm a trap. Pick is a Dexterity check with them, and a module may author a trap's disarm the same way, alone or as one of its approaches. The proficiency bonus is added only when the class is proficient with them (the Rogue). The check is offered only while the character carries a set: without one, a disarm offers only its other approaches. The shipped traps offer thieves' tools or a bare-handed Dexterity check at the same DC, so any class can disarm them and a Rogue adds its proficiency.

## Talking, taking and potions

- **Talking.** A room may hold creatures to talk to, each with authored topics. Talk asks about one topic: the creature answers with its words, or, for a topic with a check, its band's words. Each topic is asked once.
- **Taking.** A visible item is taken and carried. Taking anything not visible is refused.
- **Potions of Healing.** A Potion of Healing restores 2d4 + 2 HP, a Potion of Greater Healing 4d4 + 4, never above maximum HP. Outside a fight it is drunk at once; in a fight it takes the bonus action, so it competes with Second Wind, or the reaction as Last Stand at 0 HP (see [House rules](house-rules.md)). Administering it to another creature is not used.
- **Not during a fight.** Moving, examining, taking, opening doors, searching, disarming and talking are refused until the fight is won. In a fight a character can only drink a potion, take the combat actions or flee.

## The browser

The browser applies no rule of its own: the server projects each action, and a refused action stays disabled with the engine's reason.
