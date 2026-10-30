# Gear

## Weapons and armour

`src/equipment-5e.ts` holds the SRD 5.2 catalogue (every weapon, ammunition,
armour, shield, thieves' tools and +1 item, with price, weight, damage and type,
properties, mastery and tier) and the one rules module that derives AC and
attacks from what is equipped. Prices are stored in copper.

- **Cheaper is never strictly better.** Within each table no item is both
  cheaper and strictly better than another; a test checks it, counting a used
  mastery and a lighter weapon as advantages (so the light crossbow's bigger die
  doesn't make the bows redundant).
- **Tiers** limit where an item can appear: starting kits hold common items
  only; see [Treasure](treasure.md#treasure) and
  [Trading](#trading-with-merchants).
- **Masteries.** Sap, Vex, Graze and Nick are used (see [Combat](combat.md)).
  Slow (club, light crossbow, longbow) is omitted: it reduces speed, which needs
  positions. Topple (quarterstaff) is unused, as no class here masters a
  quarterstaff. A mastery can be chosen only for a weapon whose mastery is used
  (`MASTERY_WEAPONS`).
- **Ranged weapons.** Ranges are omitted: every target is in range. Loading
  limits a weapon to one attack per action, which matters only with Extra
  Attack.
- **Attacks.** The first weapon listed is the one attacked with. Finesse uses
  the higher of Strength and Dexterity, for attack and damage; ranged uses
  Dexterity; others Strength. A versatile weapon uses its larger die when
  nothing else is held.
- **Hands.** A two-handed weapon (every ranged weapon) refuses a shield or
  second weapon. A second weapon is held only for the light-weapon extra attack,
  so both must be light, and it refuses a shield. No ranged weapon is light.
- **Armour class.** Body armour's AC plus Dexterity up to its cap (heavy adds
  none), or 10 + Dexterity without; +2 for a shield the class is trained with;
  +1 for Defense while wearing body armour (a shield alone is not armour); +1
  each for +1 armour and a trained +1 shield.
- **Untrained armour (SRD 5.2).** Body armour of a category the class isn't
  trained with gives disadvantage on every D20 Test using Strength or Dexterity:
  weapon attacks, Strength and Dexterity checks and skills (sneaking's Stealth
  included), Strength and Dexterity saves, and initiative. The roll names the
  armour as its source ("Chain mail (untrained)"). An untrained shield adds no
  AC. The Fighter is trained with all armour and shields.
- **Strength and Dexterity requirements.** Heavy armour below its Strength score
  costs 10 feet of speed in SRD 5.2; without positions the shortfall is recorded
  and nothing changes, so equipping it is allowed. A heavy melee weapon attacks
  with disadvantage below Strength 13, and a heavy ranged weapon (the longbow)
  below **Dexterity 13**.
- **Thieves' tools** are carried, never equipped: stowed gear that can be
  dropped, bought and sold. See [Exploring](exploring.md).

## Carrying capacity

SRD 5.2's capacity is Strength × 15 lb, and its only consequence, slower speed,
does nothing without positions. So (a house rule) the engine **refuses**
whatever would take a character over capacity. The carrying capacity
[setting](settings.md) makes it Strength × 5, × 10, × 15 (the default) or × 20
lb, or unlimited: then nothing is refused for weight, and the sheet and the
adventure show the weight carried with no capacity.

- **Weights.** Catalogue items weigh their SRD 5.2 weight, equipped or stowed.
  Arrows and bolts count one by one (7 arrows weigh 0.35 lb). Coin weighs 50 to
  the pound, carried as the fewest coins worth the purse. Modules author no
  weights: a Potion of Healing weighs ½ lb, a key nothing, and treasure 1 lb
  each.
- **Refused:** taking anything (dropped gear and ammunition included) and
  buying, when the weight afterwards would exceed capacity; the reply names the
  weight, the load and the capacity. Dropping, equipping and selling are never
  refused for weight.
- **Over capacity.** No count limits stowed gear. A sheet over capacity stays
  valid and loads, but can take nothing until it drops or sells enough. Every
  starting kit fits the 45 lb capacity of Strength 3.

## Changing gear

A character carries what it has equipped and its **stowed** gear (catalogue
weapons, armour and shields not equipped). AC and attacks always come from what
is equipped.

- **Finding gear.** A module places an item of kind `gear` naming a catalogue
  item, in a feature or on an opponent; taking stows it, and a bundle of arrows
  or bolts adds 20. Each piece is found once per character, kept or not. Gear is
  not loot: carrying it out doesn't make an escape _with loot_.
- **Outside a fight.** **Equip** body armour (the old armour is stowed), a
  shield, or a second light weapon beside a light one held. **Wield** stows the
  weapons held and takes up a stowed one; a two-handed weapon is refused with a
  shield worn. **Unequip** armour, a shield or a second weapon; the last weapon
  held stays in hand, as unarmed strikes are not modelled. **Drop** stowed gear
  only; it lies in the room and can be taken back.
- **Donning and doffing (SRD 5.2).** Light armour 1 minute on and 1 off, medium
  5 and 1, heavy 10 and 5; a shield the Utilize action. The result reports the
  time. There are no deadline clocks yet; when they come they will count it, and
  each trade's minutes.
- **In a fight: one object interaction per turn.** Drawing a second light weapon
  or swapping the weapon held uses the turn's one object interaction and no
  action; a second change that turn is refused. This abstracts SRD 5.2's
  equipping or unequipping a weapon with each attack and a second interaction
  costing the Utilize action. A Thief's Fast Hands makes a second change with
  its bonus action. Armour and shields can't be changed and nothing dropped
  until the fight ends.
- **Keeping it.** A victory or an escape keeps exactly what the character holds
  at the end; a defeat or abandonment leaves it as it started.

## Trading with merchants

A module may make a creature a **merchant**, with catalogue stock and the
minutes (1–60) each trade takes; a reaction may make its opponents one (see
[Parley, tolls and trade](talk-and-stealth.md#parley-tolls-and-trade)). Trading
happens only inside adventures, outside a fight, in the merchant's room.

- **Prices.** A merchant sells its stock without limit at catalogue price times
  the merchant prices [setting](settings.md): × 0.5, × 0.75, × 1 (the default),
  × 1.5 or × 2, rounded to the nearest copper and at least 1 cp. It buys carried
  catalogue gear at the merchant buy-back setting's 25%, 50% (the default), 75%
  or 100% of catalogue price, **rounded down to the copper**, and gems and art
  objects at their full held value. It buys no potions and no magic items. The
  AI DM can name only offers the engine lists, never a price.
- **Ammunition** trades by the 20, at the same settings: 1 gp to buy and 5 sp to
  sell at the defaults; fewer than 20 can't be sold.
- **Stock.** Common gear always; uncommon only when the module's lowest
  recommended level is 3 or more; never rare or magic. The validator enforces
  this. No starting kit has a bow, so bows come only from merchants and finds:
  the Abandoned Delve's pedlar, the first merchant a career is sure to meet,
  sells a shortbow and arrows, and the Coldwater Weirgate's toll-hall bandits
  trade a dagger, a shortbow and arrows.
- **Buying** is refused with too little coin or if it would break carrying
  capacity.
- **Selling.** Equipped gear sells only once the player confirms it, so the AI
  DM has no offer for it. Sold body armour is doffed first; the last weapon held
  is never sold.
- **Coin and treasure** found earlier can be spent or sold at once; the ledger
  records the find, so neither becomes findable again, and escaping after
  selling found treasure is escaping with loot.
- **Rollback.** A victory or escape keeps the trades; a defeat or abandonment
  restores coin and gear.
- **The shop.** In the browser a merchant's card has **Trade**, which opens the
  shop over the session area (opening it takes no time; its door's bell rings):
  the wares, the chosen item's details with its one Buy or Sell and what it
  leaves in the purse, and the pack grouped by what the merchant pays (treasure,
  gear marked worn or in hand, ammunition, and what it doesn't buy). Buttons
  trade only there; the AI DM's trade tool still trades in the merchant's room.
  **Sell all treasure** names the coin and minutes first, then sells each gem
  and art object as its own trade. A band's reaction trade opens the same shop,
  and leaving it returns to the reaction.
- **The balance gate** plays no trades, but its one-hit-kill measure tries each
  weapon a merchant sells, as it does each placed weapon.
