# Rules that need positions

The game has no tactical grid: the map lays out rooms, not positions inside
them. Each 5e rule that needs distance is listed here with how it is handled:

| Rule                                                     | Handling                                           |
| -------------------------------------------------------- | -------------------------------------------------- |
| Movement speed                                           | Omitted                                            |
| Reach                                                    | Omitted                                            |
| Opportunity attacks                                      | Fleeing draws one attack from each foe able to act |
| Areas of effect                                          | A maximum number of opponents (see below)          |
| Ranged attack within 5 ft of a foe (disadvantage)        | None in round 1; disadvantage from round 2         |
| Weapon ranges (normal and long)                          | Omitted: every target is in range                  |
| Masteries that move or need range, such as Push          | Omitted                                            |
| Cleave, Push and Slow masteries                          | Omitted; no Slow weapon is mastered                |
| Heavy armour below its Strength (speed −10 ft)           | Recorded on the profile; no effect                 |
| The dagger's Thrown property                             | Deferred                                           |
| Remarkable Athlete's movement after a critical hit       | Omitted                                            |
| Who an opponent can reach                                | Every living party combatant is in reach           |
| Prone: advantage only for attackers within 5 feet        | Every attacker counts as within 5 feet             |
| Standing up from prone (half its speed)                  | Prone until the end of its next turn               |
| Pack Tactics: an ally within 5 feet of the target        | Any living ally able to act counts                 |
| Paralysed: hits are critical from within 5 feet          | Every attacker counts as within 5 feet             |
| Nimble Escape: Disengage (no opportunity attacks)        | No effect: there are none to avoid                 |
| Rampage: move up to half its speed before the bite       | Omitted; the bonus attack is kept                  |
| Sneak Attack: an ally within 5 feet of the target        | Omitted: the game is single-player                 |
| Cunning Action: Dash                                     | Omitted: not offered                               |
| Cunning Action: Disengage                                | Fleeing this turn draws no attacks                 |
| Hide: cover or heavy obscurement, Invisible              | Abstracted: next attack has advantage              |
| Steady Aim: only if the Rogue hasn't moved               | Always met: the Rogue never moves                  |
| Second-Story Work: climb speed, Dexterity jumps          | Dexterity on checks a module marks                 |
| Cunning Strike: Withdraw                                 | Omitted: not offered                               |
| Uncanny Dodge: an attacker the Rogue can see             | Every attacker can be seen                         |
| Reach 10 ft (Bugbear Warrior)                            | Omitted, as all reach                              |
| Spell ranges, touch included                             | Omitted: every target is in range                  |
| Ranged spell attack within 5 ft of a foe                 | None in round 1; disadvantage from round 2         |
| Shocking Grasp: no opportunity attacks                   | Omitted: there are none                            |
| Sacred Flame: no benefit from cover                      | Omitted: there is no cover                         |
| Bless: up to three creatures within 30 feet              | One target: the game is single-player              |
| An area also catching allies or the caster               | Only the opponents the caster chooses              |
| Ray of Frost: speed −10 ft                               | Omitted                                            |
| Chromatic Orb: the orb leaps to another creature         | Omitted                                            |
| Thunderwave: pushes 10 feet                              | Omitted                                            |
| Sleep: an ally shakes the sleeper awake                  | Omitted: no allies; only damage wakes it           |
| Unconscious: hits are critical from within 5 feet        | Every attacker counts as within 5 feet             |
| Turn Undead: undead within 30 feet                       | Every undead opponent still in the fight           |
| Turned: moves as far from the Cleric as it can           | Incapacitated: it doesn't act                      |
| Frightened: can't move closer, source in sight           | Omitted; disadvantage kept                         |
| Divine Spark: a creature within 30 feet                  | Any opponent; no ally to heal (single-player)      |
| Preserve Life: Bloodied creatures within 30 feet         | The character alone                                |
| Spiritual Weapon: moving 20 feet                         | Attacks any opponent; moving omitted               |
| Aid: up to three creatures within 30 feet                | One target: the game is single-player              |
| Hold Person: a humanoid within 60 feet                   | Any humanoid opponent                              |
| Prayer of Healing: five creatures within 30 feet         | The character alone                                |
| Spirit Guardians: speed halved in the emanation          | Omitted                                            |
| Spirit Guardians: a foe ends its turn there              | Caught foes, at the end of their turns             |
| Scorching Ray: each ray at a target in range             | Rays split evenly among the targets named          |
| Ice Knife: creatures within 5 feet of the target         | The target alone                                   |
| Mind Spike: knows the target's location                  | Omitted; no concentration kept                     |
| Blur and Mirror Image: Blindsight, Truesight             | Omitted: no monster has them                       |
| Protection from Evil and Good: a willing creature        | The character alone                                |
| Protection from Evil and Good: charm, fright, possession | Omitted: no opponent does them                     |

**Areas of effect.** Without positions an area spell catches a maximum number of
opponents, set by its shape and size: a cone's length ÷ 10, a cube's side ÷ 10,
a sphere's or emanation's radius ÷ 5, a line's length ÷ 30, rounded up and at
least 1 (`maxTargets` in `src/spells-5e.ts`). The caster chooses which
opponents, each once and at most that many; fewer is allowed. Allies and the
caster are never caught.

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
