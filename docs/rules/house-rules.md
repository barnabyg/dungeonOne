# House rules and positions

## House rules

- A player character at 0 HP is defeated at once; there are no death saving throws.
- **Last Stand** (#499): when an opponent's attack brings the character to 0 HP in a fight while it carries a Potion of Healing or Greater Healing and its reaction is free (and it isn't incapacitated), it makes one death saving throw: a d20 with no modifier, 11 or higher (an even chance; SRD 5.2's is 10). On a failure it falls. The Last Stand [setting](settings.md) makes the DC 11 (the default) or 10, turns Last Stand off (the character falls at once) or makes it automatic (no death saving throw: the fall always waits). On a success the fall waits: the player drinks one potion with the reaction, rising to the potion's roll, or falls; with both kinds the player picks which. At 0 HP its concentration ends and the hit gives no condition. Damage outside a fight (a trap, a check) offers none.
- Second Wind is refused at full health, so a use is never wasted. The 2024 rules allow it.
- At most one long rest per adventure, only at a module's rest site; SRD 5.2 allows one a day anywhere safe. An interrupted rest takes no time and may be taken again. With the long rest [setting](settings.md) off (default on) no room is a rest site; a wand still regains its charges between adventures.
- At most two short rests per adventure (the default short rests [setting](settings.md): 0 to 4, or unlimited), each in a room with no unresolved hostile encounter; SRD 5.2 limits them only by time. A short rest takes no time, as there is no clock, and a rest that would restore nothing is refused.
- A Potion of Healing is refused at full health for the same reason, and so is a healing spell.
- Magic Missile's darts all strike the one target the spell names; SRD 5.2 lets them be split among targets. Their damage is added up and lands as one: resistance halves the total, and Undead Fortitude's DC counts it all.
- Guidance adds its d4 to the next graded check, whatever its skill, and then ends; SRD 5.2 adds it to every check with one chosen skill for the minute.
- Prepared spells change only between adventures, in the library; SRD 5.2 lets a Cleric change them after a long rest, and a Wizard after a long rest from its spellbook.
- A new level's spells are prepared on the sheet before the next adventure; SRD 5.2 lets a Cleric prepare them after a long rest. A new level's cantrip is learned on the sheet the same way, and cantrips are never swapped; SRD 5.2 lets a Cleric replace one cantrip on gaining a level.
- Spirit Guardians end with the fight, not at the next rest as the duration bands would give a 10-minute spell.
- Bestow Curse lays one of two curses: disadvantage on the target's attacks against the character, or 1d8 necrotic more from its attacks and spells.
- Leaving a room is allowed mid-fight only while every foe left is turned, or by fleeing; the fight stays unresolved, its fallen stay fallen, and its standing foes are met again, unturned, on coming back, with the hit points they had when the character left.
- Fleeing a fight draws one attack from each foe still in it and able to act, before the character goes, in place of opportunity attacks; SRD 5.2 gives an opportunity attack only to a foe the character moves out of reach of, with its reaction. A Rogue's Disengage avoids them. Foes never follow. With the fleeing draws attacks [setting](settings.md) off (default on), every flight draws none, as after Disengage, and Disengage is refused as doing nothing.
- Prayer of Healing's short rest gives back feature uses only, not hit dice, and doesn't count toward the short rests allowed.
- Arcane Recovery applies by itself on the first short rest that has a slot to regain; SRD 5.2 lets the Wizard choose when, and which slots.
- The Wizard's spellbook is part of the sheet, not an item: it can't be lost, stolen or sold. Spells are copied into it from scrolls between adventures (see [gear.md](gear.md)). A new level's spellbook spells and Scholar's Expertise are chosen on the sheet before the next adventure; SRD 5.2 adds them as the level is gained.
- Evocation Savant is flavour only: its free Evocation spells are omitted.
- Memorize Spell's swap lasts only the adventure it is made in; the library's prepared spells are unchanged.
- Haste is cast on the caster only, its extra action makes one weapon attack only, and its lethargy follows any end before the fight's. Slow catches four, not six, and its riders on speed, reactions and spellcasting are omitted.
- Spell durations are bands, not minutes: up to 1 minute ends with the fight, 10 minutes to 1 hour at the next rest, 8 hours at a long rest or the adventure's end. Mage Armor gives nothing while armour is worn rather than ending.
- Ability scores are rolled once with 4d6-drop-lowest and placed freely; there are no rerolls.
- Starting gear is common tier only: each class's kits hold its weapons and, for a class that wears it, leather armour; one class's kits are of equal value (within `KIT_VALUE_TOLERANCE`), and there is no starting coin unless the starting coin [setting](settings.md) gives some.
- Sneak Attack is dealt whenever its rules are met; SRD 5.2 lets the Rogue choose. Without a choice of when to deal it, it is never saved for a later attack.
- Hide is a Stealth check against the opponents' best passive Perception, not SRD 5.2's DC 15, and gives only advantage on the next attack, not the Invisible condition (see [the Rogue](classes.md#rogue)).
- Cunning Strike is chosen with the attack, before the d20 is rolled, and applies only if the attack hits and deals Sneak Attack; a miss spends nothing. Its Poison needs no Poisoner's Kit (see [the Rogue](classes.md#rogue)).
- Uncanny Dodge is answered when the hit is known, before its damage is rolled.
- A character holds a second weapon only for the light-weapon extra attack, so both weapons must be light. Two weapons and a shield, or a two-handed weapon with a shield or a second weapon, are refused.
- A character always holds a weapon: its last one can be swapped but not unequipped, as unarmed strikes are not modelled.
- In a fight, one weapon change per turn, with the object interaction; armour and shields change only outside a fight.
- A character carries up to its Strength × 15 lb (the default [setting](settings.md)); taking or buying more is refused rather than slowing it, as there are no positions.
- Armour's stealth disadvantage gives disadvantage on the Stealth check to sneak in.
- Lurking opponents make one Stealth roll for the group, by the least stealthy of them; SRD 5.2 leaves a group's hiding to the DM.
- Morale, surrender, reaction rolls, parley, tolls and trade are house rules on top of 5e (see [combat.md](combat.md)).
- An opponent has its stat block's average hit points at the default opponent hit points [setting](settings.md); 75%, 125% or 150% scales them, rounded up and at least 1. Its XP is unchanged.

## Rules that need positions

The game has no tactical grid: the map lays out rooms, not positions inside them. Each 5e rule that needs distance is listed here with how it is handled:

| Rule                                               | Handling                                           |
| -------------------------------------------------- | -------------------------------------------------- |
| Movement speed                                     | Omitted                                            |
| Reach                                              | Omitted                                            |
| Opportunity attacks                                | Fleeing draws one attack from each foe able to act |
| Areas of effect                                    | A maximum number of opponents (see below)          |
| Ranged attack within 5 ft of a foe (disadvantage)  | None in round 1; disadvantage from round 2         |
| Weapon ranges (normal and long)                    | Omitted: every target is in range                  |
| Masteries that move or need range, such as Push    | Omitted                                            |
| Cleave, Push and Slow masteries                    | Omitted; no Slow weapon is mastered                |
| Heavy armour below its Strength (speed −10 ft)     | Recorded on the profile; no effect                 |
| The dagger's Thrown property                       | Deferred                                           |
| Remarkable Athlete's movement after a critical hit | Omitted                                            |
| Who an opponent can reach                          | Every living party combatant is in reach           |
| Prone: advantage only for attackers within 5 feet  | Every attacker counts as within 5 feet             |
| Standing up from prone (half its speed)            | Prone until the end of its next turn               |
| Pack Tactics: an ally within 5 feet of the target  | Any living ally able to act counts                 |
| Paralysed: hits are critical from within 5 feet    | Every attacker counts as within 5 feet             |
| Nimble Escape: Disengage (no opportunity attacks)  | No effect: there are none to avoid                 |
| Rampage: move up to half its speed before the bite | Omitted; the bonus attack is kept                  |
| Sneak Attack: an ally within 5 feet of the target  | Omitted: the game is single-player                 |
| Cunning Action: Dash                               | Omitted: not offered                               |
| Cunning Action: Disengage                          | Fleeing this turn draws no attacks                 |
| Hide: cover or heavy obscurement, Invisible        | Abstracted: next attack has advantage              |
| Steady Aim: only if the Rogue hasn't moved         | Always met: the Rogue never moves                  |
| Second-Story Work: climb speed, Dexterity jumps    | Dexterity on checks a module marks                 |
| Cunning Strike: Withdraw                           | Omitted: not offered                               |
| Uncanny Dodge: an attacker the Rogue can see       | Every attacker can be seen                         |
| Reach 10 ft (Bugbear Warrior)                      | Omitted, as all reach                              |
| Spell ranges, touch included                       | Omitted: every target is in range                  |
| Ranged spell attack within 5 ft of a foe           | None in round 1; disadvantage from round 2         |
| Shocking Grasp: no opportunity attacks             | Omitted: there are none                            |
| Sacred Flame: no benefit from cover                | Omitted: there is no cover                         |
| Bless: up to three creatures within 30 feet        | One target: the game is single-player              |
| An area also catching allies or the caster         | Only the opponents the caster chooses              |
| Ray of Frost: speed −10 ft                         | Omitted                                            |
| Chromatic Orb: the orb leaps to another creature   | Omitted                                            |
| Thunderwave: pushes 10 feet                        | Omitted                                            |
| Sleep: an ally shakes the sleeper awake            | Omitted: no allies; only damage wakes it           |
| Unconscious: hits are critical from within 5 feet  | Every attacker counts as within 5 feet             |
| Turn Undead: undead within 30 feet                 | Every undead opponent still in the fight           |
| Turned: moves as far from the Cleric as it can     | Incapacitated: it doesn't act                      |
| Frightened: can't move closer, source in sight     | Omitted; disadvantage kept                         |
| Divine Spark: a creature within 30 feet            | Any opponent; no ally to heal (single-player)      |
| Preserve Life: Bloodied creatures within 30 feet   | The character alone                                |
| Spiritual Weapon: moving 20 feet                   | Attacks any opponent; moving omitted               |
| Aid: up to three creatures within 30 feet          | One target: the game is single-player              |
| Hold Person: a humanoid within 60 feet             | Any humanoid opponent                              |
| Prayer of Healing: five creatures within 30 feet   | The character alone                                |
| Spirit Guardians: speed halved in the emanation    | Omitted                                            |
| Spirit Guardians: a foe ends its turn there        | Caught foes, at the end of their turns             |
| Mass Healing Word: six creatures within 60 feet    | The character alone                                |
| Beacon of Hope: creatures within 30 feet           | The character alone                                |
| Scorching Ray: each ray at a target in range       | Rays split evenly among the targets named          |
| Ice Knife: creatures within 5 feet of the target   | The target alone                                   |
| Mind Spike: knows the target's location            | Omitted; no concentration kept                     |
| Blur and Mirror Image: Blindsight, Truesight       | Omitted: no monster has them                       |

**Areas of effect.** Without positions an area spell catches a maximum number of opponents, set by its shape and size: a cone's length ÷ 10, a cube's side ÷ 10, a sphere's or emanation's radius ÷ 5, a line's length ÷ 30, rounded up and at least 1 (`maxTargets` in `src/spells-5e.ts`). The caster chooses which opponents, each once and at most that many; fewer is allowed. Allies and the caster are never caught.

| Area spell       | Area                  | Most opponents |
| ---------------- | --------------------- | -------------- |
| Burning Hands    | 15-foot cone          | 2              |
| Shatter          | 10-foot-radius sphere | 2              |
| Fireball         | 20-foot-radius sphere | 4              |
| Thunderwave      | 15-foot cube          | 2              |
| Sleep            | 5-foot-radius sphere  | 1              |
| Spirit Guardians | 15-foot emanation     | 3              |
| Lightning Bolt   | 100-foot line         | 4              |
| Slow             | 40-foot cube          | 4              |
