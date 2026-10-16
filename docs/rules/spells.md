# Spellcasting

The casting engine is class-agnostic. `src/spells-5e.ts` holds every spell as SRD 5.2 data (level, school, casting time, effect, damage, save, duration, concentration, cantrip growth and upcasting), and its header describes each effect kind; the engine reads only this data. Each class's definition (`src/cleric-5e.ts`, `src/wizard-5e.ts`) holds its spell list, slot table and spellcasting ability. The test-only Test Caster (`src/test-caster-5e.ts`, the character Sage) exercises the engine in tests, scripted DM cases and trace replay.

- **Spell attack bonus and save DC.** As SRD 5.2: a spell attack adds the proficiency bonus and the spellcasting modifier; the save DC is 8 + both.
- **Slots are feature uses** (`spell-slots-1` and on). They last from fight to fight; a long rest or a rest between adventures restores them all, and a short rest restores none (the Wizard's Arcane Recovery aside). A levelled spell spends one slot of its level or higher, and a higher slot upcasts it. A cantrip spends none.
- **Known and prepared spells.** The sheet records the cantrips known and the spells prepared: the class's counts for its level (fewer only while a new level leaves some to choose), each on the class's list, each of a level the character has slots for, and none it always has prepared (the Life Domain's). A Wizard prepares only spells in its spellbook. Prepared spells change only between adventures, in the library (see [house rules](house-rules.md)), except for the level-5 Wizard's Memorize Spell swap, whose rule is in [house-rules.md](house-rules.md).

## In a fight

- **Casting.** An action spell takes the Magic action; a bonus-action spell takes the bonus action. Only one slot may be spent a turn (SRD 5.2): after a levelled spell another is refused, though a cantrip is not. Action Surge's extra action can cast a cantrip, not a second levelled spell. A reaction spell is cast on an opponent's turn, so its slot isn't the turn's one.
- **Spell attacks** roll like weapon attacks (a natural 20 is a critical hit, a natural 1 misses; advantage and disadvantage from the same engine rules). Departures from SRD:
  - a ranged spell attack follows the ranged-weapon rule: no disadvantage in round 1, disadvantage from round 2; a melee one has none;
  - a spell never deals Sneak Attack, which needs a weapon;
  - radiant damage, or a critical spell attack, bypasses Undead Fortitude.
- **Save spells.** The target saves against the caster's DC (a paralysed target fails a Dexterity save unrolled): a failure takes the damage, a success half (rounded down) or none. A single-target spell rolls no damage when a success would take none.
- A target a spell drops is defeated and its side checks morale, as for an attack. Damage meets resistance, vulnerability and immunity as any damage does.
- **Refusals.** The engine refuses before any die: an unknown spell, one not known or prepared, a slot for a cantrip, a slot level the character lacks or has spent, a second slot in a turn, a spent action or bonus action, a damaging spell at anything but a living opponent still fighting, and a healing spell at a foe or at full health. A refused cast stays disabled with the engine's reason.

## Concentration

A caster concentrates on one spell at a time; which spells need it is in the data. Casting another concentration spell ends the first. Damage that leaves the caster standing, in a fight or out of one (a trap), calls for a Constitution save against the higher of 10 and half the damage, rounded down, at most 30 (SRD 5.2); a failure ends the spell. Each attack is one source of damage, its rider included, and calls for one save. Being incapacitated or falling also ends it.

## Ongoing effects and durations

A buff puts an effect on its target (only the caster, until companions). Durations are bands, not minutes ([house rules](house-rules.md)): up to 1 minute ends with the fight, 10 minutes to 1 hour at the next rest, 8 hours at a long rest or the adventure's end; Shield's one round ends at the start of the caster's next turn, or with the fight.

- Only a completed rest ends an effect: a rest a wandering encounter interrupts ends nothing.
- An effect that outlasts a fight is carried into the next with the character's hit points and slots, and none survives the adventure.
- A spell already on its target can't be cast on it again, so no duration is renewed.
- A spell lasting no longer than a fight is cast only in one.
- Mage Armor is refused on a target wearing armour, and gives nothing if armour is put on later.

## Area spells

Without positions, an area spell catches at most a number of opponents set by its shape and size: a cone's length ÷ 10, a cube's side ÷ 10, a sphere's or emanation's radius ÷ 5, a line's length ÷ 30, rounded up, at least 1 (`maxTargets` in `src/spells-5e.ts`). So Burning Hands and Shatter catch 2, Thunderwave's 15-foot cube 2, Sleep 1, Spirit Guardians 3, and Fireball, Lightning Bolt and Slow 4. The caster chooses them, each once; more, a repeat or an ally is refused before any die, and a spell without an area has one target.

The damage is rolled once, even if every target then succeeds. Each target, in the order chosen, saves against the caster's DC and takes the full damage or half (rounded down), through its own resistances. A target it drops checks morale before the next one saves.

## Reaction spells

Shield uses the reaction path Uncanny Dodge uses. When an opponent's attack roll hits a caster with Shield prepared, its reaction free and a 1st-level slot or higher left, the fight waits before the damage is rolled; the caster casts Shield or takes the hit (a character with Uncanny Dodge too is offered both, as one reaction). Shield's +5 AC counts against the triggering attack, so a total below the new AC misses, though a natural 20 still hits, and it covers the attacker's other attacks that turn. Its Magic Missile trigger never comes: no monster casts.

## Outside a fight

Only a healing spell, a spell whose effect outlasts a fight, or Guidance may be cast outside a fight, on the character, spending its slot. Prayer of Healing, with its ten-minute casting time, may be cast only outside one.

## Spells that depart from SRD 5.2

Omissions that need positions are in [Rules that need positions](house-rules.md#rules-that-need-positions); the house rules for Magic Missile, Guidance, Spirit Guardians, Bestow Curse, Haste and Slow are in [house-rules.md](house-rules.md).

- **Guidance:** its d4 goes to the next graded check; a Stealth check to sneak or hide is not graded, so it doesn't spend it.
- **Resistance:** cast only in a fight, against a damage type some opponent still in the fight deals with an attack or its rider. Once a turn it takes 1d4 off an attack's damage of that type (the weapon's first, else the rider's), before Uncanny Dodge halves it.
- **Thaumaturgy:** flavour only. It is on the sheet but never cast; the DM may describe it, but it changes nothing.
- **Chill Touch:** no monster regains hit points, so its rider has no effect.
- **Lesser Restoration:** blinded and deafened don't exist, so it ends paralysis or poison, in that order. Conditions end with a fight, so it is cast only in one.
- **Hold Person:** on both the Cleric's and the Wizard's lists. It works only on a humanoid; a creature immune to paralysis succeeds unrolled; its extra targets from a higher slot are omitted.
- **Prayer of Healing:** heals its dice with no modifier (Disciple of Life adds its bonus) and gives a short rest's feature uses (see house rules), once per long rest. Like every healing spell it is refused at full HP, even when its uses would come back.
- **Spirit Guardians:** catches up to three opponents chosen at casting, who save again at the end of each of their turns. The damage is always radiant, as alignment isn't modelled.
- **Bestow Curse:** its curse is chosen at casting, from attacks or necrotic. The necrotic curse adds 1d8 to the character's attack rolls and spells against the target (doubled on a critical), not Divine Spark, Sear Undead or a Graze miss. Its longer durations from higher slots are out of reach.
- **Sleep** (house rule): the target makes both its Wisdom saves with advantage, as an alert foe in a fight resists it. A first failure incapacitates it until the end of its next turn; a second makes it unconscious until the spell ends, which is the fight or the caster's concentration. Damage wakes it. A creature immune to exhaustion succeeds unrolled.
- **Ray of Sickness:** the poison lasts until the end of the target's next turn, standing for SRD 5.2's "until the end of your next turn".
- **Ice Knife:** the burst catches only the target, hit or miss; a target the knife drops isn't burst.
- **Scorching Ray:** the rays are split as evenly as they go among up to as many targets as there are rays, the first named taking any extra. A ray whose target is down goes to the next target named still in the fight.
- **Mirror Image:** its d6s are rolled after any reaction, so a hit Shield turns into a miss rolls none.
- **Haste:** the extra action is the turn's first attack made outside an Attack action, so the action is left for a spell; Extra Attack still follows the action.
- **Vampiric Touch:** each later turn's touch takes the Magic action and no slot.

## The balance harness

The harness plays casters by a casting policy (`CASTING_POLICIES` in `src/balance-5e.ts`); see [balance.md](balance.md).
