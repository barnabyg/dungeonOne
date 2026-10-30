# Classes

Each class's definition in `src/<class>-5e.ts` (`fighter`, `rogue`, `cleric`,
`wizard`) holds its numbers: hit die, saves, skills, training, masteries by
level, features with their uses and recovery, ability priority, creation
defaults, kits and, for a caster, its slots, cantrips, prepared counts and spell
list. Creation, XP, level-up choices and rests between adventures are in
[characters.md](characters.md); each spell's effect is in `src/spells-5e.ts` and
the casting rules in [spells.md](spells.md); house rules are listed in
[house-rules.md](house-rules.md). This file holds what the definitions don't
say: engine abstractions, omitted features and house rules. Every class is
offered at creation and plays levels 1–5.

The Cleric and Wizard are in [Casting classes](classes-casters.md).

## Fighter

- **Fighting Style** (level 1), one of four SRD 5.2 feats, each applying only
  with the gear it needs. The sheet says whether the style applies with what is
  equipped now.
  - _Archery:_ +2 to attack rolls with a ranged weapon, not to damage. Nothing
    is thrown without positions, so a dagger gets nothing.
  - _Defense:_ +1 AC while wearing body armour.
  - _Great Weapon Fighting:_ with a two-handed weapon, or a versatile one held
    in two hands (no shield, nothing else in hand), each 1 or 2 on a damage die
    counts as 3, critical-hit dice included.
  - _Two-Weapon Fighting:_ the light-weapon extra attack adds the ability
    modifier to its damage. It changes nothing else.
- **Second Wind** is refused at full health (house rule).
- **Weapon Mastery:** three kinds of weapon at creation, a fourth with the
  level-4 Ability Score Improvement. Graze, Nick, Sap and Vex are used. Slow
  needs positions and Cleave and Push are omitted; Topple (the quarterstaff's)
  is not offered, as no class masters a quarterstaff yet.
- **Tactical Mind** (level 2): right after the Fighter fails an ability check at
  a check site (a door, a search, a disarm, a topic, a feature), while it has a
  use of Second Wind left, it may add 1d10 to the check's total; the d20 is
  never rerolled. The check is graded again and the new band replaces the old
  one, so asking again is still refused; the site's outcome and, when the band
  changes, its words and effects follow the new band. What the failure already
  did, such as its damage, stands. The use of Second Wind is spent only if the
  check now succeeds. The offer lasts until the next accepted action, and is
  never made after a saving throw, a sneak, a lurk, a parley or Hide, which act
  on their result at once.
- **Champion** (level 3), its only subclass: Improved Critical (19–20) and
  Remarkable Athlete (advantage on initiative and Strength (Athletics) checks;
  its movement after a critical hit is omitted).
- **Extra Attack** (level 5): the Attack action makes two attacks, each at any
  living opponent, so the second may follow the first after its target falls.
  The second must come in the same turn or is lost. Action Surge gives a second
  Attack action with its own two attacks, and the light-weapon extra attack
  still follows (three in all, five with Action Surge). A Loading weapon fires
  once an action whatever the attacks the action allows.
- **Tactical Shift** (level 5) is omitted: it moves the character, and there are
  no positions.

## Rogue

- **Armour.** The Rogue is trained with light armour only. Medium or heavy
  armour, or a shield, costs it as SRD 5.2 says (see [gear.md](gear.md)). Its
  kits pack leather, a shortsword and thieves' tools, and are worth more than
  other classes' by design.
- **Expertise** (level 1): two skill proficiencies double their proficiency
  bonus. Expertise in Perception doubles it in passive Perception too.
- **Sneak Attack** (level 1) is engine-only: the engine applies it whenever its
  rules are met (a hit with a Finesse or ranged weapon, advantage without
  disadvantage, once per turn), and the player never asks for it; the AI DM has
  no tool or argument for it (house rule: it is never saved for a later attack).
  Advantage comes only from the engine's rules (Vex, a prone or paralysed
  target, Hide, Steady Aim and the like). Its dice are doubled by a critical hit
  and count in the damage a resistance halves. A miss, Graze included, deals
  none, and the turn's Sneak Attack is still to come. It may come from the
  light-weapon extra attack. The ally-adjacent clause is omitted until
  companions (see [house-rules.md](house-rules.md)).
- **Thieves' Cant** is flavour only.
- **Thieves' tools** proficiency adds the bonus to picking a lock or a tools
  disarm (see [exploring.md](exploring.md)).
- **Cunning Action** (level 2): Hide and Disengage, each a bonus action.
  - _Hide_ (abstraction): a Stealth check against the best passive Perception
    among the opponents still in the fight (10 for one without). On a success
    the Rogue is hidden: its next attack roll has advantage. Hiding lasts until
    it attacks or the fight ends, and a hidden Rogue can't hide again. A failure
    spends the bonus action. Untrained armour and the poisoned condition give
    the check disadvantage. Each Hide is rolled once and never rerolled by
    asking again. SRD 5.2's Hide needs cover or heavy obscurement, a DC 15 check
    and gives the Invisible condition; without positions or lighting it gives
    only the next attack's advantage, and foes attack the Rogue as usual.
  - _Disengage:_ fleeing later that turn draws no attacks (see
    [combat.md](combat.md)). It does nothing else, so it is offered only while
    the action a flight takes is left and some way out of the room is open. With
    none it is refused ("No way out"), and the AI DM is offered no `disengage`
    tool.
  - _Dash_ is omitted: with no movement it would do nothing.
- **Steady Aim** (level 3): a bonus action, offered while the Rogue still has an
  attack to make this turn, giving advantage on its next attack roll this turn;
  the advantage ends with that attack or the turn. SRD 5.2 allows it only if the
  Rogue hasn't moved; with no positions it never moves, so it can be used every
  turn. Steady Aim and Hide share the bonus action; a Rogue already hidden may
  still take Steady Aim, and one attack spends both.
- **Thief** (level 3), its only subclass:
  - _Fast Hands:_ in a fight, once the turn's object interaction is spent, the
    bonus action can draw, stow or swap a weapon again. Sleight of Hand checks
    and thieves' tools are used only outside fights, where nothing is timed, so
    there it changes nothing.
  - _Second-Story Work:_ there is no climb speed or jump distance. Instead a
    module marks a Strength check (Athletics or plain Strength) that climbs or
    jumps with `"movement": "climb"` or `"jump"`, and a Thief makes it with
    Dexterity in place of Strength, keeping its Athletics proficiency. Unmarked
    checks, such as forcing a door, use Strength.
- **Level 4** brings the Ability Score Improvement alone: the Rogue masters two
  kinds of weapon at every level.
- **Cunning Strike** (level 5): when the attack would deal Sneak Attack, the
  Rogue may give up Sneak Attack dice for one effect, chosen with the attack
  before the d20 is rolled (house rule). The dice go before damage is rolled
  (doubled on a critical hit), and the effect follows the damage. Saves are
  against 8 + Dexterity modifier + proficiency bonus.
  - _Poison_ (1d6): a Constitution save or poisoned for up to 10 of the target's
    turns (SRD 5.2's minute), repeating the save at the end of each. It needs no
    Poisoner's Kit, which the game doesn't have.
  - _Trip_ (1d6): a Large or smaller target makes a Dexterity save or is knocked
    prone, and gets up at the end of its next turn.
  - _Withdraw_ is omitted: it moves the Rogue.
  - An effect is offered only while the attack would deal Sneak Attack if it
    hits; a miss spends nothing. One effect per attack. Neither is offered
    against a target immune to its condition, nor Trip against a Huge or
    Gargantuan one.
- **Uncanny Dodge** (level 5), a reaction: when an opponent's attack roll hits,
  the fight waits before the damage is rolled, and nothing else can be done
  until the Rogue halves the damage or takes the hit. The total is halved once,
  rounding down. When the attack deals two types, each part is halved rounding
  down and any point that loses goes to the larger part (the weapon's on a tie):
  7 slashing + 3 poison becomes 4 + 1. The reaction comes back at the start of
  the Rogue's turn, and taking a hit keeps it. A paralysed Rogue can't react.
  With no positions, darkness or invisibility, every attacker counts as seen.
