# Gear and treasure

## Weapons and armour

`src/equipment-5e.ts` holds the SRD 5.2 catalogue (every weapon, ammunition, armour, shield, thieves' tools and +1 item, with price, weight, damage and type, properties, mastery and tier) and the one rules module that derives AC and attacks from what is equipped. Prices are stored in copper.

- **Cheaper is never strictly better.** Within each table no item is both cheaper and strictly better than another; a test checks it, counting a used mastery and a lighter weapon as advantages (so the light crossbow's bigger die doesn't make the bows redundant).
- **Tiers** limit where an item can appear: starting kits hold common items only; see [Treasure](#treasure) and [Trading](#trading-with-merchants).
- **Masteries.** Sap, Vex, Graze and Nick are used (see [Combat](combat.md)). Slow (club, light crossbow, longbow) is omitted: it reduces speed, which needs positions. Topple (quarterstaff) is unused, as no class here masters a quarterstaff. A mastery can be chosen only for a weapon whose mastery is used (`MASTERY_WEAPONS`).
- **Ranged weapons.** Ranges are omitted: every target is in range. Loading limits a weapon to one attack per action, which matters only with Extra Attack.
- **Attacks.** The first weapon listed is the one attacked with. Finesse uses the higher of Strength and Dexterity, for attack and damage; ranged uses Dexterity; others Strength. A versatile weapon uses its larger die when nothing else is held.
- **Hands.** A two-handed weapon (every ranged weapon) refuses a shield or second weapon. A second weapon is held only for the light-weapon extra attack, so both must be light, and it refuses a shield. No ranged weapon is light.
- **Armour class.** Body armour's AC plus Dexterity up to its cap (heavy adds none), or 10 + Dexterity without; +2 for a shield the class is trained with; +1 for Defense while wearing body armour (a shield alone is not armour); +1 each for +1 armour and a trained +1 shield.
- **Untrained armour (SRD 5.2).** Body armour of a category the class isn't trained with gives disadvantage on every D20 Test using Strength or Dexterity: weapon attacks, Strength and Dexterity checks and skills (sneaking's Stealth included), Strength and Dexterity saves, and initiative. The roll names the armour as its source ("Chain mail (untrained)"). An untrained shield adds no AC. The Fighter is trained with all armour and shields.
- **Strength and Dexterity requirements.** Heavy armour below its Strength score costs 10 feet of speed in SRD 5.2; without positions the shortfall is recorded and nothing changes, so equipping it is allowed. A heavy melee weapon attacks with disadvantage below Strength 13, and a heavy ranged weapon (the longbow) below **Dexterity 13**.
- **Thieves' tools** are carried, never equipped: stowed gear that can be dropped, bought and sold. See [Exploring](exploring.md).

## Carrying capacity

SRD 5.2's capacity is Strength × 15 lb, and its only consequence, slower speed, does nothing without positions. So (a house rule) the engine **refuses** whatever would take a character over capacity.

- **Weights.** Catalogue items weigh their SRD 5.2 weight, equipped or stowed. Arrows and bolts count one by one (7 arrows weigh 0.35 lb). Coin weighs 50 to the pound, carried as the fewest coins worth the purse. Modules author no weights: a Potion of Healing weighs ½ lb, a key nothing, and treasure 1 lb each.
- **Refused:** taking anything (dropped gear and ammunition included) and buying, when the weight afterwards would exceed capacity; the reply names the weight, the load and the capacity. Dropping, equipping and selling are never refused for weight.
- **Over capacity.** No count limits stowed gear. A sheet over capacity stays valid and loads, but can take nothing until it drops or sells enough. Every starting kit fits the 45 lb capacity of Strength 3.

## Changing gear

A character carries what it has equipped and its **stowed** gear (catalogue weapons, armour and shields not equipped). AC and attacks always come from what is equipped.

- **Finding gear.** A module places an item of kind `gear` naming a catalogue item, in a feature or on an opponent; taking stows it, and a bundle of arrows or bolts adds 20. Each piece is found once per character, kept or not. Gear is not loot: carrying it out doesn't make an escape _with loot_.
- **Outside a fight.** **Equip** body armour (the old armour is stowed), a shield, or a second light weapon beside a light one held. **Wield** stows the weapons held and takes up a stowed one; a two-handed weapon is refused with a shield worn. **Unequip** armour, a shield or a second weapon; the last weapon held stays in hand, as unarmed strikes are not modelled. **Drop** stowed gear only; it lies in the room and can be taken back.
- **Donning and doffing (SRD 5.2).** Light armour 1 minute on and 1 off, medium 5 and 1, heavy 10 and 5; a shield the Utilize action. The result reports the time. There are no deadline clocks yet; when they come they will count it, and each trade's minutes.
- **In a fight: one object interaction per turn.** Drawing a second light weapon or swapping the weapon held uses the turn's one object interaction and no action; a second change that turn is refused. This abstracts SRD 5.2's equipping or unequipping a weapon with each attack and a second interaction costing the Utilize action. A Thief's Fast Hands makes a second change with its bonus action. Armour and shields can't be changed and nothing dropped until the fight ends.
- **Keeping it.** A victory or an escape keeps exactly what the character holds at the end; a defeat or abandonment leaves it as it started.

## Treasure

`src/treasure-5e.ts` holds the treasure catalogue (gems and art objects, such as `art-25gp`, and their values) and the parameter tables that hold treasure to a module's level.

- **Gems and art objects** are trade goods that only sell, at full value. A module names a catalogue entry (`"treasure": "art-25gp"`) and gives it its own name and description. All are common. Kept treasure keeps its value for a later adventure.
- **Potions.** Potion of Healing: common, 50 gp. Potion of Greater Healing: uncommon, 4d4 + 4 HP, 200 gp (half an uncommon magic item's 400 gp, as for every consumable). No merchant buys a potion.
- **Never used up.** Treasure is sold or carried out: the validator refuses a feature use that consumes it.
- **Budget.** Everything a module hides is totalled (coin, gems, art, potions and scrolls at value, gear at catalogue price, an ammunition bundle at 1 gp; not magic items). The validator refuses more than **150 gp × the maximum recommended level** (`TREASURE_BUDGETS`, tunable); a long module gets twice that (`LONG_MODULE_BUDGET_FACTOR`). A module's treasure should be **75–100% of its budget**, as a mixed hoard of gems, art and coin; a test checks the shipped modules.
- **Tiers by level** (`TIER_MIN_LEVEL`): a hidden item's tier must be allowed at the module's maximum recommended level: common always, uncommon from level 3, rare never. Merchant stock goes by the _lowest_ recommended level instead, on purpose: gear on sale must suit every level, while a find may reward the highest.
- **First loot behind a fight.** No loot in a start or exit room: the gate's cautious run would grab it and leave. A module whose victory ends it hides its treasure on the way to the final fight, as the last foe's body is never searched.

## Magic items

The catalogue holds SRD 5.2's **+1 Weapon**, **+1 Armor** and **+1 Shield** for every weapon, body armour and the shield (`shortsword-plus-1`). None needs attunement.

- **The bonus.** +1 to a weapon's attack and damage rolls (the light-weapon extra attack's damage included; Graze still deals only the ability modifier), +1 to armour's AC, and +1 to a trained shield's +2.
- **Otherwise mundane.** It keeps its mundane item's every other property, mastery included; masteries are chosen from mundane weapons and apply to their +1 versions.
- **Tier and worth.** Its tier is uncommon, or its mundane item's when that is rarer (+1 plate is rare, so no module can hide it). It is worth 400 gp but outside every budget.
- **Placement.** At most one magic item per module (a wand counts), only when its maximum recommended level is 3 or more (`MAGIC_ITEM_LIMITS`), in a feature or on an inline opponent. The validator refuses attunement.
- **Merchants don't buy or stock magic items**: the validator refuses magic stock, and the engine refuses the sale.

## Spell scrolls and wands

`src/magic-items-5e.ts` holds SRD 5.2's **Spell Scroll** and **Wand of Magic Missiles**. A module places a `scroll` naming its `spell` or a `wand` (`"wand": "wand-of-magic-missiles"`), in a feature or on an inline opponent; each is found once per character and weighs nothing.

- **Scrolls** hold one levelled spell from `SPELLS` cast on the reader's turn: no cantrips and no reaction spells. Only a class with the spell on its list can read it. It casts with no slot, at the scroll's DC and attack bonus (`SCROLL_CASTING`) and the reader's modifier for healing, at the spell's own level (no Disciple of Life), and is used up. Later rolls of a lasting effect use the reader's own DC, a simplification.
- **A scroll takes the spell's own casting time**, neither faster nor slower, and spends none of the turn's one slot.
- **Above the reader's slots (SRD 5.2):** a spellcasting-ability check against DC 10 + the spell's level, no proficiency; a failure wastes the scroll.
- **The wand** has 7 charges and works for any class. It takes the action: 1 charge casts Magic Missile at 1st level, each extra charge raises it a level, up to 3rd (the game's highest; SRD 5.2 allows 7). Its last charge rolls a d20, crumbling it on a 1. A long rest at a rest site restores 1d6 + 1 charges, so a short wand makes a long rest worth offering; between adventures it refills.
- **Kept or lost** like gear: a read scroll is gone; a defeat or abandonment restores those held at the start.
- **Copying (SRD 5.2).** Between adventures a Wizard may copy a scroll's spell into its spellbook at 50 gp a level (`COPY_COST_PER_LEVEL`), if it is on its list, of a level it has slots for and not already known. Copying uses up the scroll, so its value isn't counted twice. The spell goes in the sheet's `copiedSpells`, apart from each level's owed spells.
- **Treasure.** A 1st-level scroll is common, 50 gp; a 2nd- or 3rd-level one uncommon, 200 gp (`SCROLL_VALUES`, `SCROLL_TIERS`), inside the budget. The wand is a magic item. No merchant sells or buys either. The harness never reads a scroll or uses a wand.

## Monster loot

Every bestiary monster has a **treasure type** (`treasureType` in `adventures/5e/bestiary.json`), a house rule. The five types and what each carries are `TREASURE_TYPES` in `src/treasure-5e.ts`: `none`, `copper`, `silver`, `silver-and-trinket` and `gold`. No type gives potions or gear.

- **Rolled at authoring time.** `npm.cmd run loot -- <module.json> --seed <n>` (`src/loot-5e.ts`) rolls each bestiary opponent's type and writes it into the module as items it carries (`<opponent>-coins`, `<opponent>-trinket`); the same file and seed roll the same loot. It skips an opponent that already carries loot (a key isn't loot), type `none`, an inline opponent, and one whose fight ends the adventure; it refuses a roll that breaks the budget. An author may lower or remove what was rolled; rolling again rolls only for an opponent left with none.
- **Validated.** What a bestiary opponent carries, keys aside, must be loot its type could produce: its coin only, no more than its dice can roll, and at most one of its trinkets. An inline opponent's loot is the author's. Carried loot counts toward the budget.
- **Misfit loot** goes in a feature of the same room, or is re-rolled.
- **On the body.** Loot appears once the fight is won and the body searched. One that flees takes it; one that surrenders keeps it unless asked (see [Morale and surrender](combat.md#morale-and-surrender)).

## Trading with merchants

A module may make a creature a **merchant**, with catalogue stock and the minutes (1–60) each trade takes; a reaction may make its opponents one (see [Parley, tolls and trade](combat.md#parley-tolls-and-trade)). Trading happens only inside adventures, outside a fight, in the merchant's room.

- **Prices.** A merchant sells its stock without limit at catalogue price. It buys carried catalogue gear at **half price, rounded down to the copper**, and gems and art objects at full value. It buys no potions and no magic items. The AI DM can name only offers the engine lists, never a price.
- **Ammunition** trades by the 20: 1 gp to buy, 5 sp to sell; fewer than 20 can't be sold.
- **Stock.** Common gear always; uncommon only when the module's lowest recommended level is 3 or more; never rare or magic. The validator enforces this. No starting kit has a bow, so bows come only from merchants and finds: the Coldwater Weirgate's toll-hall bandits trade a dagger, a shortbow and arrows.
- **Buying** is refused with too little coin or if it would break carrying capacity.
- **Selling.** Equipped gear sells only once the player confirms it, so the AI DM has no offer for it. Sold body armour is doffed first; the last weapon held is never sold.
- **Coin and treasure** found earlier can be spent or sold at once; the ledger records the find, so neither becomes findable again, and escaping after selling found treasure is escaping with loot.
- **Rollback.** A victory or escape keeps the trades; a defeat or abandonment restores coin and gear.
- **The balance gate** plays no trades, but its one-hit-kill measure tries each weapon a merchant sells, as it does each placed weapon.
