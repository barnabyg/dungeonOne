# Exploring

An adventure module is a set of rooms joined by two-way passages. There is no
tactical grid and no movement speed: the character is in one room at a time,
with no position inside it, and starts in the module's start room.

## The map

Each room sits on one cell of a square grid on a floor, placed by the module's
author; the validator keeps the layout readable with the rules in
`src/map-5e.ts`. [`docs/module-authoring.md`](../module-authoring.md) gives the
layout rules and the mapping tool, `npm.cmd run map`. The map lays out rooms
only. Each exit's **direction** is worked out from the map: up or down for a
passage between floors, else the compass point (one of eight) from its room's
cell to the far room's. The DM describes the ways out by their directions.

## Moving and fleeing

- **Moving.** The character goes through an exit to the room beyond. Entering a
  room whose fight has not been won begins it at once: initiative is rolled, and
  opponents who win it act first. A room whose fight was won stays clear. In a
  fight the character can't simply go: it may only flee, or leave while every
  foe left is turned.
- **Fleeing a fight** ([house rule](house-rules.md)). On its turn, with its
  action, the character may flee through any exit it could otherwise go through;
  a shut door, a closed way or a way not yet found is refused without a roll.
  - Before it goes, each opponent still in the fight and able to act (not
    incapacitated, so not turned, asleep or paralysed) makes one attack against
    it, in initiative order, standing in for opportunity attacks. A Multiattack
    makes one of its attacks, a die choosing which. A hit may wait for Uncanny
    Dodge or a reaction spell as any other does.
  - 0 HP from one of these attacks is a defeat in the fight's defeat ending, and
    the character never leaves. A Rogue that has taken Disengage this turn draws
    no attacks, and nor does any flight with the fleeing draws attacks
    [setting](settings.md) off.
  - It then goes through the exit as a move does: a trap on the way springs, and
    the move counts. Fleeing into an exit room offers leaving as usual.
  - The fight stays unresolved in its room. Its fallen stay fallen; opponents
    that fled or surrendered stay gone (and count as driven off or spared if it
    is won later); those still standing keep their hit points and are met again
    on coming back. Their conditions and the character's effects lasting the
    fight end.
  - Foes don't follow: pursuit needs monster movement. A fled wandering
    encounter is met again only if a later rest is interrupted, with the same
    wounds.
  - A monster's own fleeing is morale (see [combat.md](combat.md)), not this.

## Regions and long modules

- **Regions.** A module may group its rooms into regions, such as an upper and a
  lower level, each with a display name. In such a module every room belongs to
  one region.
- **Moves.** The session counts the character's moves: each time it goes through
  an exit into another room, sneaking in included. A refused move, or a trap on
  the way that ends the adventure, adds none. A region's wandering table rolls
  on the moves that end in that region (`regionMoves`).
- **Long modules.** A module with two or more regions may declare itself long
  (`"long": true`). A house rule for a module too big for two short rests and
  one long rest: rests are counted per region, two short (the
  [setting](settings.md)) and one long in each, the long one only at a rest
  site, so every region of a long module needs a rest site. A rest is refused at
  its region's limit; going back to a region doesn't give its rests back. The
  session still counts the adventure's rests in all. A long module has twice the
  treasure budget for its maximum level and an XP limit one level higher (see
  [balance-gate.md](balance-gate.md)).

## Known rooms

- The session remembers the rooms visited (`visitedRoomIds`) and the fights fled
  (`fledEncounterIds`).
- The engine projects the **known rooms**: every room visited, and every room
  seen through a visited room's exits (a hidden way only once opened), grouped
  by region in the module's order.
- A visited room has a record as the engine sees it now: discoveries, creatures
  talked to and what they said, doors on its open ways, traps found or sprung,
  and its fight once met. A room only seen has its name alone.
- The DM's scene summarises the known rooms other than the current one. A flag's
  id is never shown: the character knows a flag only by the ways it opened or
  closed and by the alarm.
- **Scene cap.** The summary is capped at 4,096 bytes as JSON
  (`KNOWN_ROOMS_SCENE_BYTES` in `src/runtime-5e.ts`). Over it, the rooms visited
  first lose their records first and keep their ways, then the rooms only seen
  are left out, then the rooms visited first.
- The summary decides nothing: no tool takes a known room, and `move` goes only
  through the scene's exits.

## Doors, traps and thieves' tools

- **Doors.** A passage may have a door. A stuck door opens with **Force**, a
  Strength (Athletics) check. A locked door opens with **Pick** (a Dexterity
  check with thieves' tools), **Break** (the check the module names) or
  **Unlock**, offered while the character carries one of the door's keys (it may
  have a spare), with no roll. Each approach is tried once; an opened door stays
  open from both sides. Going through a shut door is refused.
- **Traps.** A passage may have a hidden trap. In a module with traps, every
  room offers **Search**, one check per room, with Wisdom (Perception) or
  Intelligence (Investigation), whichever the character is better at (Perception
  on a tie). Every search shows the same DC, the lowest find DC of any trap in
  the module, so the DC never gives a trap away; the search finds each hidden
  trap on the room's exits whose find DC the total meets. A found trap offers
  **Disarm**, tried once; a failed disarm leaves it armed. Going through an
  armed trap, found or not, springs it once: a saving throw, then its damage,
  halved (rounding down) on a success. A trap that drops the character to 0 HP
  ends the adventure in its defeat ending.
- **Thieves' tools** pick a lock or disarm a trap. Pick is a Dexterity check
  with them, and a module may author a trap's disarm the same way, alone or as
  one of its approaches. The proficiency bonus is added only when the class is
  proficient with them (the Rogue). The check is offered only while the
  character carries a set: without one, a disarm offers only its other
  approaches. The shipped traps offer thieves' tools or a bare-handed Dexterity
  check at the same DC, so any class can disarm them and a Rogue adds its
  proficiency.

## Talking, taking and potions

- **Talking.** A room may hold creatures to talk to, each with authored topics.
  Talk asks about one topic: the creature answers with its words, or, for a
  topic with a check, its band's words. Each topic is asked once.
- **Taking.** A visible item is taken and carried. Taking anything not visible
  is refused.
- **Potions of Healing.** A Potion of Healing restores 2d4 + 2 HP, a Potion of
  Greater Healing 4d4 + 4, never above maximum HP. Outside a fight it is drunk
  at once; in a fight it takes the bonus action, so it competes with Second
  Wind, or the reaction as Last Stand at 0 HP (see
  [House rules](house-rules.md)). Administering it to another creature is not
  used.
- **Not during a fight.** Moving, examining, taking, opening doors, searching,
  disarming and talking are refused until the fight is won. In a fight a
  character can only drink a potion, take the combat actions or flee.

## The browser

The browser applies no rule of its own: the server projects each action, and a
refused action stays disabled with the engine's reason.
