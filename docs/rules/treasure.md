# Treasure and magic items

## Treasure

`src/treasure-5e.ts` holds the treasure catalogue (gems and art objects, such as
`art-25gp`, and their values) and the parameter tables that hold treasure to a
module's level.

- **Gems and art objects** are trade goods that only sell, at full value. A
  module names a catalogue entry (`"treasure": "art-25gp"`) and gives it its own
  name and description. All are common.
- **Treasure found** ([setting](settings.md)): 50%, 75%, 100% (the default) or
  150% of a gem or art object's catalogue value is what it is worth when found,
  rounded down to the copper; coin taken is scaled the same way (see
  [Characters](characters.md)). A kept gem or art object records the value it
  was found with and sells for it in any later adventure, whatever the settings
  are then. Potions, scrolls, gear and magic items are not scaled.
- **Items found** ([setting](settings.md)): Normal (the default) or Scarce. On
  Scarce each potion, piece of gear (ammunition included), spell scroll and wand
  a module places, lying in a room, hidden in a feature or carried by an
  opponent, is missing with an even chance, drawn from the session's seed and
  the item's id, so a reload or a rerun misses the same ones. Coin, gems and
  art, keys, tools, caster items, any item a door's key or a feature's use
  names, and any item that sets a flag when taken are never missing. A missing
  item isn't there for the player or the AI DM, and the ledger never records it,
  so a later adventure draws for it again. Merchant stock is unchanged.
- **Potions.** Potion of Healing: common, 50 gp. Potion of Greater Healing:
  uncommon, 4d4 + 4 HP, 200 gp (half an uncommon magic item's 400 gp, as for
  every consumable). No merchant buys a potion.
- **Never used up.** Treasure is sold or carried out: the validator refuses a
  feature use that consumes it.
- **Budget.** The coin, gems and art objects a module hides are totalled;
  potions, scrolls, gear and magic items are outside the budget, limited by
  their tiers. The validator refuses more than **50 gp at maximum recommended
  level 1, 100 gp at 2, 300 gp at 3, 450 gp at 4 and 600 gp at 5**
  (`TREASURE_BUDGETS`, tunable); a long module gets twice that
  (`LONG_MODULE_BUDGET_FACTOR`). A module's treasure should be **75–100% of its
  budget**; a test checks the shipped modules.
- **Gems and art by level** (`TRADE_GOOD_LIMITS`, tunable): low-level treasure
  is mostly copper and silver. The validator refuses more than **one gem or art
  object in a module for level 1, or two for level 2**, carried ones included,
  long or not. From level 3 there is no limit beyond the budget.
- **Tiers by level** (`TIER_MIN_LEVEL`): a hidden item's tier must be allowed at
  the module's maximum recommended level: common always, uncommon from level 3,
  rare never. Merchant stock goes by the _lowest_ recommended level instead, on
  purpose: gear on sale must suit every level, while a find may reward the
  highest.
- **First loot behind a fight.** No loot in a start or exit room: the gate's
  cautious run would grab it and leave. A module whose victory ends it hides its
  treasure on the way to the final fight, as the last foe's body is never
  searched.

## Magic items

The catalogue holds SRD 5.2's **+1 Weapon**, **+1 Armor** and **+1 Shield** for
every weapon, body armour and the shield (`shortsword-plus-1`). None needs
attunement.

- **The bonus.** +1 to a weapon's attack and damage rolls (the light-weapon
  extra attack's damage included; Graze still deals only the ability modifier),
  +1 to armour's AC, and +1 to a trained shield's +2.
- **Otherwise mundane.** It keeps its mundane item's every other property,
  mastery included; masteries are chosen from mundane weapons and apply to their
  +1 versions.
- **Tier and worth.** Its tier is uncommon, or its mundane item's when that is
  rarer (+1 plate is rare, so no module can hide it). It is worth 400 gp but
  outside every budget.
- **Placement.** Only when a module's maximum recommended level is 3 or more
  (`MAGIC_ITEM_LIMITS`), in a feature or on an inline opponent: one magic item
  any class may use (a wand counts) and one more in the **caster slot**, which
  takes only a caster item (see [Caster items](#caster-items)). Two caster items
  may fill both. Each wand and caster item also has its own minimum level, the
  lowest maximum recommended level of a module that may hide it
  (`MAGIC_ITEM_MIN_LEVEL`, one editable table); rare stays refused.
- **Merchants don't buy or stock magic items**: the validator refuses magic
  stock, and the engine refuses the sale.

## Caster items

`CASTER_ITEMS` in `src/magic-items-5e.ts` holds the magic items that require
attunement by a spellcaster or by named classes. A module places a `caster-item`
naming its `casterItem`, in a feature or on an inline opponent; it is found
once, weighs nothing and is outside the budget.

- **Attunement (SRD 5.2, D2).** Allowed only for an item restricted to
  spellcasters (a class with spells: Cleric, Wizard) or named classes; the
  validator refuses one any class may attune. A character attunes as it picks
  the item up, to at most 3 at once (`ATTUNEMENT_LIMIT`): the first 3 it holds
  that its class may attune, in the order found. Attunement is worked out from
  what it holds, never stored. An item it can't attune does nothing, and its
  text says why.
- **Wand of the War Mage +1** (uncommon, attunement by a spellcaster): +1 to the
  holder's spell attack rolls, cantrips and levelled spells alike, a spiritual
  weapon's and a draining touch's too; a scroll keeps its own bonus. Ignoring
  half cover is omitted: there are no positions.
- **Pearl of Power** (uncommon wondrous item, attunement by a spellcaster):
  outside a fight, using it (**Regain a slot** on its "You carry" entry, or the
  AI DM's `use_item`) regains one spent spell slot of 3rd level or lower, the
  highest spent (the engine picks it, a simplification), once per long rest; a
  long rest or the rest between adventures makes it work again. SRD 5.2's Magic
  action in a fight is omitted (owner's choice). It is refused with no slot
  spent, in a fight, once used, and for a holder not attuned; the AI DM's status
  says whether it is used.
- **Shown** in "You carry" and on the sheet with its effect and whether it is
  attuned; the spell attack bonus includes the wand's. The AI DM sees each as
  any carried item, and no tool changes a bonus.
- **Kept or lost** like gear. No merchant sells or buys one. The harness plays
  the wand as the bonus it gives (it is passive) and uses a Pearl of Power as
  soon as a slot is spent outside a fight (see
  [balance-harness.md](balance-harness.md)).

## Spell scrolls and wands

`src/magic-items-5e.ts` holds SRD 5.2's **Spell Scroll** and **Wand of Magic
Missiles**. A module places a `scroll` naming its `spell` or a `wand`
(`"wand": "wand-of-magic-missiles"`), in a feature or on an inline opponent;
each is found once per character and weighs nothing.

- **Scrolls** hold one levelled spell from `SPELLS` cast on the reader's turn:
  no cantrips and no reaction spells. Only a class with the spell on its list
  can read it. It casts with no slot, at the scroll's DC and attack bonus
  (`SCROLL_CASTING`) and the reader's modifier for healing, at the spell's own
  level (no Disciple of Life), and is used up. Later rolls of a lasting effect
  use the reader's own DC, a simplification.
- **A scroll takes the spell's own casting time**, neither faster nor slower,
  and spends none of the turn's one slot.
- **Above the reader's slots (SRD 5.2):** a spellcasting-ability check against
  DC 10 + the spell's level, no proficiency; a failure wastes the scroll.
- **The wand** has 7 charges and works for any class. It takes the action: 1
  charge casts Magic Missile at 1st level, each extra charge raises it a level,
  up to 3rd (the game's highest; SRD 5.2 allows 7). Its last charge rolls a d20,
  crumbling it on a 1. A long rest at a rest site restores 1d6 + 1 charges, so a
  short wand makes a long rest worth offering; between adventures it refills.
- **Kept or lost** like gear: a read scroll is gone; a defeat or abandonment
  restores those held at the start.
- **Copying (SRD 5.2).** Between adventures a Wizard may copy a scroll's spell
  into its spellbook at 50 gp a level (`COPY_COST_PER_LEVEL`), if it is on its
  list, of a level it has slots for and not already known. Copying uses up the
  scroll, so its value isn't counted twice. The spell goes in the sheet's
  `copiedSpells`, apart from each level's owed spells.
- **Treasure.** A 1st-level scroll is common, 50 gp; a 2nd- or 3rd-level one
  uncommon, 200 gp (`SCROLL_VALUES`, `SCROLL_TIERS`), outside the budget. The
  wand is a magic item. No merchant sells or buys either. The harness never
  reads a scroll or uses a wand.

## Monster loot

Every bestiary monster has a **treasure type** (`treasureType` in
`adventures/5e/bestiary.json`), a house rule. The five types and what each
carries are `TREASURE_TYPES` in `src/treasure-5e.ts`: `none`, `copper`,
`silver`, `silver-and-trinket` and `gold`. No type gives potions or gear.

- **Rolled at authoring time.** `npm.cmd run loot -- <module.json> --seed <n>`
  (`src/loot-5e.ts`) rolls each bestiary opponent's type and writes it into the
  module as items it carries (`<opponent>-coins`, `<opponent>-trinket`); the
  same file and seed roll the same loot. It skips an opponent that already
  carries loot (a key isn't loot), type `none`, an inline opponent, and one
  whose fight ends the adventure; it refuses a roll that breaks the budget. An
  author may lower or remove what was rolled; rolling again rolls only for an
  opponent left with none.
- **Validated.** What a bestiary opponent carries, keys aside, must be loot its
  type could produce: its coin only, no more than its dice can roll, and at most
  one of its trinkets. An inline opponent's loot is the author's. Carried loot
  counts toward the budget.
- **Misfit loot** goes in a feature of the same room, or is re-rolled.
- **On the body.** Loot appears once the fight is won and the body searched. One
  that flees takes it; one that surrenders keeps it unless asked (see
  [Morale and surrender](talk-and-stealth.md#morale-and-surrender)).
