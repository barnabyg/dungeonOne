# Casting classes

Cleric and Wizard. What the class notes share is at the top of
[Classes](classes.md).

## Cleric

- **Divine Order**, chosen at creation: _Protector_ (heavy armour and martial
  weapons) or _Thaumaturge_ (one more cantrip at every level, and its Wisdom
  modifier, at least +1, added to Arcana and Religion checks).
- **Kits** (#541) wear a chain shirt and a shield, as SRD 5.2's option A does:
  _Mace, chain shirt and shield_ (the default) or _Club, dagger, chain shirt and
  shield_, the dagger stowed. Both orders are trained with them (light and
  medium armour and shields): AC 13 + Dexterity (at most +2) + 2.
- **Prepared spells** change only between adventures (house rule); a new level's
  spells and cantrip are owed on the sheet (see [characters.md](characters.md)).
  Cantrips are never swapped.
- **Thaumaturgy and Light** are flavour only: never offered as a cast, and
  refused if cast. Light is on the list so a Thaumaturge, who knows the other
  four cantrips, has one to learn at level 4.
- **Channel Divinity** (level 2): two uses through level 5, a short rest
  restoring one and a long rest all. Each use is a Magic action against the
  spell save DC, only in a fight.
  - _Divine Spark:_ 1d8 + Wisdom modifier, either healing another creature on
    the character's side or making an opponent save on Constitution or take the
    total as radiant or necrotic damage, half on a success. It never targets the
    character, so without companions it has no healing target (single-player).
  - _Turn Undead:_ every undead opponent still in the fight and not already
    turned saves on Wisdom (no positions, so all are in range); one that fails
    is Frightened and Incapacitated for the fight. House rules: a turned undead
    repeats the save at the end of each of its turns, and its turning also ends
    when it is attacked (an attack roll or harmful spell aimed at it, hit or
    miss), as well as when it takes damage or the turner is Incapacitated or
    falls. A creature immune to both conditions isn't turned. Refused when no
    undead foe is left to turn. Every combatant carries its stat block's
    `creatureType`; every character is humanoid.
  - _Every foe turned_ (house rule): while every opponent still in the fight is
    turned, the character may attack them (ending that one's turning) or leave
    the room by an exit. Leaving keeps the fight unresolved: the fallen stay
    fallen, the standing ones keep their wounds and are met again unturned, and
    their XP comes only if the fight is later won. Effects lasting the fight
    end; the character keeps its hit points, slots and uses.
- **Life Domain** (level 3), its only subclass:
  - _Domain spells_ are always prepared and don't count against the prepared
    spells. A chosen spell that becomes always prepared leaves the choices,
    freeing the pick.
  - _Disciple of Life:_ a slot spell that restores hit points restores 2 + the
    slot's level more. Aid raises hit points rather than restoring them, and
    Divine Spark is no spell, so neither gains it.
  - _Preserve Life:_ a Channel Divinity use restores up to five times the Cleric
    level to the character while Bloodied, never above half its maximum. Without
    companions only the character is healed. Refused at half or more.
- **Level 4** brings the Ability Score Improvement alone, and a new cantrip.
- **Sear Undead** (level 5): each Turn Undead rolls d8s equal to the Wisdom
  modifier (at least one) once; each undead that fails its save takes the total
  as radiant damage, which doesn't end its turning. An undead immune to both
  conditions that fails still takes it.
- **The domain's level-5 spells** are omitted: Revivify needs a companion to
  revive (the character's own fall ends the adventure), and Mass Healing Word is
  off the list.
- **Spell list exclusions.** Aura of Vitality isn't a Cleric spell in SRD 5.2.
  Mass Healing Word and Beacon of Hope (#555) heal or help only the caster
  alone, worse than the spells kept. Protection from Energy (#555) resists acid,
  cold, fire, lightning and thunder, and no shipped foe deals them. Revivify,
  Dispel Magic, Remove Curse and the Cleric's other 3rd-level spells need
  companions, time, curses or enemy spells the game doesn't have.

## Wizard

- **Spellbook** (house rule): part of the sheet, not an item, so it can't be
  lost, sold or found. The Wizard prepares only spells in it. Each level after
  1st writes two Wizard spells into it of a level it has slots for, owed on the
  sheet. A Wizard that gains two levels at once owes each level's two of a level
  its slots at that level allowed. Between adventures, a Wizard spell on a spell
  scroll it holds may be copied into it for 50 gp per spell level from the
  purse, if the spell is of a level it has slots for and not already in the
  book; copying uses up the scroll (see
  [treasure.md](treasure.md#spell-scrolls-and-wands)). Ray of Sickness and Ice
  Knife are on the list so a level-2 Wizard always has two 1st-level spells to
  write.
- **Ritual Adept** is omitted: a ritual takes ten minutes more, and with no
  clock there is no time for it.
- **Arcane Recovery** (house rule: automatic): once per long rest, the first
  short rest that has a slot to regain also regains spent slots totalling up to
  half the Wizard level, rounded up, highest first, none of 6th level or higher,
  after the rest's own recovery. There is no choice to make and no AI DM tool. A
  short rest is offered at full HP while Arcane Recovery would regain a slot.
- **Scholar** (level 2): Expertise in one proficient skill among Arcana,
  History, Investigation, Medicine, Nature and Religion, owed on the sheet.
- **Evoker** (level 3), its only subclass:
  - _Evocation Savant_ is flavour only: its free Evocation spells are omitted.
  - _Potent Cantrip:_ when a damaging cantrip misses with its attack roll or its
    target succeeds on its save, the target still takes half the damage, rounded
    down, and nothing else. SRD 5.2 gives both cases; every Wizard cantrip is an
    attack roll, so the engine rolls the damage on such a miss. Levelled spells
    are unchanged.
- **Level 4** brings the Ability Score Improvement alone, and a new cantrip.
- **Memorize Spell** (level 5): when the Wizard finishes a short rest, it may
  swap one prepared 1st-level or higher spell for another in its spellbook. It
  is the one change to prepared spells during an adventure, and the swap lasts
  only that adventure: it lives in the session (`prepared`), and the library's
  prepared spells never change. Each short rest may swap again; an interrupted
  rest swaps nothing. A rest whose only gain is the swap is offered at full
  health.
- **Spell list exclusions.** At 2nd level, Misty Step, Web, Invisibility,
  Darkness and the rest of SRD 5.2's need positions, time or senses the game
  doesn't model. At 3rd, Counterspell and Dispel Magic have no foe spells to
  work on, Protection from Energy (#555) no foe dealing its types, and Fly,
  Blink, Gaseous Form, Fear, Stinking Cloud, Sleet Storm and the rest need
  positions, time or senses.
