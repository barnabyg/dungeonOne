# Combat

## Combat

An encounter has two sides: the party, one player character of any class, and
one or more opponents. Rampage and the rules for party allies are implemented
but unused, as there are no companions. Every die comes from the session's
seeded stream and is recorded with the action that drew it. The engine alone
decides dice, turn order, targets, hits, damage, conditions and endings: the AI
DM's tools are offered only while the engine would accept them, from the same
projection as the browser's buttons, and no tool takes a roll, damage, advantage
or outcome argument.

- **Initiative.** d20 + Dexterity modifier; higher acts first. Ties go to the
  higher Dexterity score, then to a d20 roll-off among those still tied,
  repeated. A surprised combatant rolls with disadvantage; a level-3 Champion
  with advantage (Remarkable Athlete); both cancel. Combatants act in initiative
  order, round after round; a defeated opponent takes no more turns and can't be
  targeted.
- **Turn economy.** One action, one bonus action, one reaction and one object
  interaction (see [Changing gear](gear.md#changing-gear)) per turn. Drinking a
  potion takes the bonus action (SRD 5.2). The player's turn lasts until it is
  ended or nothing is left that the engine would accept. Only Uncanny Dodge,
  reaction spells such as Shield and Last Stand's potion use a reaction:
  opportunity attacks need positions. The player fleeing a fight draws one
  attack from each foe in their place, which takes no reaction (see
  [Exploring](exploring.md) and [House rules](house-rules.md)). Opponents only
  attack.
- **Attacks.** A natural 20 (19–20 for a Champion) is a critical hit, rolling
  the damage dice twice; a natural 1 always misses. Damage is never below 0.
  With Great Weapon Fighting and a weapon in two hands, each 1 or 2 on a damage
  die counts as 3. Advantage and disadvantage come only from engine rules; with
  both, one d20 is rolled, and the kept die decides natural 1s and 20s.
- **Light-weapon extra attack (Light, SRD 5.2).** Holding two light weapons,
  after attacking with the first, the character may make one extra attack that
  turn with the second, against any living opponent. Its damage adds no ability
  modifier unless negative or with Two-Weapon Fighting. It takes the bonus
  action, unless the second weapon has Nick and is mastered, which makes it part
  of the Attack action. Once per turn, Action Surge included.
- **Weapon masteries** apply only to a mastered weapon being wielded.
  - _Sap:_ a creature hit that survives has disadvantage on its next attack
    roll, which spends it; it also ends at the start of the attacker's next
    turn.
  - _Vex:_ a damaging hit on a creature that survives gives advantage on the
    attacker's next attack roll against it, with any weapon; it lapses at the
    end of the attacker's next turn.
  - _Graze:_ a miss, natural 1s included, still deals the damage modifier, if
    above 0.
  - _Nick:_ acts only on the light-weapon extra attack.
- **Heavy weapons.** Disadvantage for a heavy melee weapon below Strength 13,
  and a heavy ranged weapon below Dexterity 13.
- **Ranged weapons.** A ranged attack spends one arrow or bolt; with none it is
  refused before any die is rolled. Without positions every opponent closes in,
  so (a house rule) a ranged weapon attack or ranged spell attack has **no
  disadvantage in a fight's first round** (the opening volley) and
  **disadvantage from round 2** ("Close combat"), standing in for SRD 5.2's
  disadvantage within 5 feet of a foe. A won fight recovers half the arrows and
  bolts spent in it, rounded down; a lost fight or abandoned adventure rolls
  ammunition back. Opponents make no ranged attacks, and stat-block riders that
  need advantage (the Goblin Warrior's extra 1d4) are not used.
- **Opponents.** Each attacks a living party combatant; with more than one, a
  seeded die picks which, counting in initiative order. A stat block's
  `multiattack` (2–4) is how many attacks it makes; with more than one attack, a
  seeded die picks which for each (SRD 5.2 names the attacks a block combines;
  here the die chooses among all). Without Multiattack it makes its first
  attack. Every trait is used deterministically:
  - _Pack Tactics:_ advantage while an ally on its side is alive and able to
    act, beside the target or not.
  - _Nimble Escape_ (goblins, the house Kobold): changes nothing, as there are
    no opportunity attacks to avoid and no cover to hide in; a test checks a
    fight plays the same without it.
  - _Rampage_ (house, after the gnoll's): a bonus attack after dropping a
    combatant to 0 HP; unused with a party of one.
  - _Undead Fortitude:_ reduced to 0 HP by damage that is neither radiant nor
    from a critical hit, it makes a Constitution save against DC 5 + the damage
    taken (attack and rider, after resistance), + 5 for each such save it made
    earlier in the fight ([house rule](house-rules.md)); on a success it has 1
    HP instead. It may save each time.
- **Damage.** Every damage roll has one of SRD 5.2's 13 damage types; any other
  is refused. After the roll (critical dice, Great Weapon Fighting and modifier
  included), immunity makes it 0, resistance halves it (rounding down) and
  vulnerability doubles it; a rider's damage and Graze's are adjusted by their
  own type. A monster's save adds its challenge rating's proficiency bonus in
  each of its `saveProficiencies`.
- **Hit points.** An opponent has its stat block's average hit points, scaled by
  the opponent hit points [setting](settings.md) (75%, 100% by default, 125% or
  150%, rounded up, at least 1); wounds it carries out of a fight are on that
  maximum. Its XP is the stat block's.
- **Defeat and death.** A combatant at 0 HP is defeated. When every opponent is
  defeated, fled or surrendered, the encounter's victory ending follows if it
  names one; otherwise the character explores on. The player character at 0 HP
  is defeated at once, with **no death saving throws**, unless it takes **Last
  Stand** (house rule, #499): brought to 0 HP by an opponent's attack with a
  healing potion and its reaction free, it makes a death saving throw (d20, 11
  or higher by default; the Last Stand [setting](settings.md) makes it 10, off
  or automatic, with no save); on a success it may drink the potion with its
  reaction and rise to the potion's roll, or fall, and nothing else happens
  until it answers. A fallen character's adventure ends in the module's defeat
  ending, the sheet is saved at 0 HP and marked defeated, and the character can
  never start another adventure.
- **Refused actions** (out of turn, at an absent, friendly or defeated target,
  with a spent action, a feature not usable now, after the fight) get an
  engine-written reason, change nothing and draw no dice.

### Conditions

The engine records each condition with what gave it, how many of the bearer's
turns it lasts and the save that ends it; no tool can give, remove or change
one. In play: **poisoned**, **prone** and **paralysed** (monster riders;
paralysed also from Hold Person), **incapacitated** and **unconscious** (Sleep),
and **frightened** with **incapacitated** (Turn Undead). A rider may give only
poisoned, prone or paralysed. Restrained, charmed and exhaustion are not in
play. Each works as in SRD 5.2, with these abstractions:

- Without positions every attacker counts as within 5 feet, so every attack on a
  prone, paralysed or unconscious combatant has advantage, and every hit on a
  paralysed or unconscious one is a critical hit.
- A prone combatant spends its next turn getting up, attacking at disadvantage,
  and stands at its end.
- A paralysed player can only end the turn; a paralysed opponent does nothing
  but any repeat save. A paralysed ally doesn't count for Pack Tactics. The
  Ghoul's claw has no exemption for Undead or elf targets.
- A frightened creature's source is always in sight, and its bar on moving
  closer changes nothing. A turned undead is incapacitated too, so it can't act.
- An incapacitated combatant loses concentration.
- A hit that drops the target to 0 HP gives no condition and rolls no save. The
  same condition again replaces the old one. A stat block's condition immunity
  means the rider rolls no save.
- At the end of each of its turns a combatant rolls each repeat save its
  conditions allow, then conditions whose turns have run out end. Every
  condition ends with the fight.

## Rests

Every adventure starts with every hit point, hit die and feature use, as a rest
between adventures restores them all (see [Characters](characters.md)). During
an adventure they carry from fight to fight, and only rests restore them. Each
feature's class data says how many uses it has at each level and what a short
and a long rest restore. Hit dice (one of the class's die per level) are spent
only on a short rest and never in a fight.

- **Where.** Outside a fight, in a room with no unresolved hostile encounter
  (none, or one won or ended peacefully); a long rest only in a room marked
  `restSite: true`, which the map marks once visited.
- **How many (a house rule).** **Two short rests and one long rest per
  adventure**, or per region in a long module. SRD 5.2's limits are the clock
  and one long rest a day, and this game has no clock. The short rests per
  adventure [setting](settings.md) makes it 0, 1, 2 (the default), 3, 4 or
  unlimited; the long rest setting (default on) off offers no long rest
  anywhere.
- **Short rest.** The player chooses how many hit dice to spend. Each heals its
  roll + the Constitution modifier (at least 0), and spending stops at full HP.
  Then each feature regains its short-rest uses.
- **Long rest.** Restores every hit point, hit die and long-rest use. It doesn't
  give back short rests taken.
- **Refused:** a rest that would restore nothing, in a fight, with foes in the
  room, or past the limit.
- **Interrupted.** Each rest first rolls a d100 for a wandering encounter where
  the module has one: its single `wanderingEncounter` (rolled only on rests, at
  most once) or the region's wandering table (see
  [Flags](flags.md#wandering-encounter-tables)). At the chance or less (doubled,
  up to 100, with the wandering encounters [setting](settings.md) at double; no
  roll at all with it off) the rest restores nothing and doesn't count (SRD
  5.2), and the wandering fight begins there. A wandering encounter is in no
  room: its opponents leave no body to search and can't surrender, react, lurk
  or be sneaked past, and its fight can't end the adventure in victory.
- A rest rolls back with the adventure if it is abandoned or lost.
