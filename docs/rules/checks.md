# Checks, item uses and fight actions

## Checks

- **Examining.** Examining a feature shows its description and makes its
  authored discovery, once; examining again repeats it. An item hidden in a
  feature becomes visible when that feature is first examined. Examining draws
  no dice, except that a feature may have a check, made the first time it is
  examined: its bands then make the discovery and reveal what is hidden.
- **Ability checks.** d20 + the ability's modifier, + the proficiency bonus when
  proficient in the skill (twice with Expertise), against the module's DC. A
  natural 20 or 1 is just its number. Each check is rolled once and its outcome
  remembered: trying again is refused, never rerolled. Every check site (a
  door's force, pick or break, a room search, a trap's disarm, a topic, a
  feature) goes through one check path: one d20 from the session's seeded
  stream, a check event, then the site's event, the outcome remembered under the
  site's id.
- **Graded checks.** An authored check grades its total into a band: **failure
  by 5 or more** (DC − 5 or less), **failure**, **success**, or **success by 5
  or more** (DC + 5 or more).
  - An unauthored band by 5 or more counts as the plain band; an unauthored
    plain band does only what the site always does (a door opens, a trap is
    disarmed, a topic gets its words).
  - A band's effects: a **discovery**; an **item** revealed (a band never awards
    an item, and finds are once per character); **damage** (SRD 5.2 dice, no
    save; 0 HP ends the adventure in the effect's defeat ending); a route
    **opened** (a hidden passage is no exit at all until a band opens it, then
    an exit from both sides) or **closed** (for the rest of the adventure, its
    door and trap gone); or a flag **set**.
  - The band is remembered with the check, so its revelations survive a reload.
    The DM narrates only the band and effects the tool returns, and a tool call
    with an argument the tool doesn't list is refused without a roll.
  - A room search is one Perception roll for the whole room, so a trap's find DC
    is never graded.
- **Alternative approaches.** An authored check may offer two to four
  approaches, each a different skill or ability with its own DC; the bands
  belong to the obstacle, whichever approach is rolled. An Athletics or Strength
  approach may be marked `"movement": "climb"` or `"jump"`, so a Thief makes it
  with Dexterity (Second-Story Work); marking any other is refused. An action
  naming no approach, or one not offered, is refused without a roll. Once one is
  rolled, the outcome is remembered for every approach unless the module authors
  a retry, which offers every approach again.
- **Retries.** A check is never tried again unless its module authors a
  **retry**: **after a cost** (damage, or a carried tool the module names, used
  up) or **after a changed circumstance** (the character holds a named item, has
  made a named discovery or has won a named encounter).
  - It is offered only after a failure, while its condition holds: a cost retry
    after every failure while the cost can be paid; a circumstance retry once
    for each change, so not when the circumstance already held at the last try.
  - The cost is paid before the roll; damage that drops the character to 0 HP
    ends the adventure in the cost's defeat ending, and the check is not made.
  - The retry rolls again from the seeded stream, and its band applies on top of
    what earlier tries revealed (a closed way stays closed).
  - Once a check's success could only open ways that have all been closed, it
    offers no other try; a success that would also make a discovery or reveal an
    item keeps its retry.
  - A check with several approaches offers one retry per approach. A DM tool
    call asking for a retry where none is offered is refused without a roll.
- **Circumstances.** Each approach may name circumstances that give it
  **advantage** or **disadvantage**: the character holds a named item, has made
  a named discovery, has won a named encounter, or a named flag is set (with
  `not`, isn't). Each has an authored name, given as the source. They combine
  with Remarkable Athlete as SRD 5.2 says, and are judged when the check is
  rolled, after a retry's cost. The DM can't grant either. A trap's find has
  none.
- **Tools.** A module item of kind `tool` (a rope, an iron spike) does nothing
  by itself and weighs nothing: a circumstance or a retry's cost names it. It is
  not kept after the adventure.
- **Tactical Mind.** A level-2+ Fighter may add 1d10 to a failed check; see
  [the Fighter](classes.md).
- **Saving throws.** d20 + the ability's modifier, + the proficiency bonus in
  the saves the class's definition lists (`savingThrows`), against the DC.
  Traps, monster riders, concentration and other effects call for them; a
  condition that fails a save (paralysed for Dexterity) fails it without a roll.

## Using an item on a feature

A feature may accept items the character carries (`uses`: up to four, each
`{ "item", "text", "effects", "consumes" }`, one per item): fitting a stone
snake into a door, throwing meat to a chained beast.

- Each use has the module's words, may use the item up (`"consumes": true`), and
  has 1–6 effects drawn from a band's: a discovery, an item revealed, damage
  (which can end the adventure in its defeat), a passage opened (a hidden one)
  or closed, or a flag set.
- A use takes no roll, is made once and is remembered (`featureUses`).
- The engine refuses, without effect, a use in a fight, on a feature not here,
  of an item not carried or not accepted, and one already made.

## Fight actions

A feature may offer a **fight action** (`fightAction`:
`{ "once", "check", "bands" }`), the single-player stand-in for teamwork against
a big monster: toppling a statue onto an opponent, pushing a foe into a chasm.

- On its turn, with its action, the character makes the check (one approach, or
  2–4 as `{ "approaches" }`, each a skill or ability and a DC only) against one
  opponent still in the fight, and the band's effects land on that opponent:
  - `{ "type": "damage", "dice", "sides", "modifier", "damageType" }`, dealt as
    a spell's damage is (resistances, Undead Fortitude, its fall and morale);
  - `{ "type": "condition", "condition", "turns" }`: prone, poisoned or
    paralysed for that many of its turns, with no save (prone always 1);
  - `{ "type": "remove" }`, which takes it out of the fight.
- A band has words, 1–2 effects of different types, or both; a removal stands
  alone. A band left out, or with only words, does nothing to the opponent; an
  unauthored band by 5 or more counts as the plain band.
- A removed opponent counts as defeated for XP, checks morale as a fall does,
  and leaves no body, so what it carried is lost. The validator never lets a
  removal reach an opponent carrying a door's key or an item a use needs.
- `"once": "fight"` is once in each encounter fought in its room (fleeing and
  coming back is the same fight); `"once": "adventure"` is once per adventure.
  One that can remove an opponent must be once per adventure.
- The check is rolled once from the seeded stream and remembered
  (`fightActions`, `removedOpponents`). Poison or fear gives it disadvantage;
  Tactical Mind and Guidance don't apply.
- The engine refuses, without a roll, a fight action outside a fight, on a
  feature not here or with none, one already used, one with several approaches
  and none chosen, against an opponent not in the fight, and one when it isn't
  the character's turn or its action is spent.
