# Combat and talk

## Combat

An encounter has two sides: the party, one player character of any class, and one or more opponents. Rampage and the rules for party allies are implemented but unused, as there are no companions. Every die comes from the session's seeded stream and is recorded with the action that drew it. The engine alone decides dice, turn order, targets, hits, damage, conditions and endings: the AI DM's tools are offered only while the engine would accept them, from the same projection as the browser's buttons, and no tool takes a roll, damage, advantage or outcome argument.

- **Initiative.** d20 + Dexterity modifier; higher acts first. Ties go to the higher Dexterity score, then to a d20 roll-off among those still tied, repeated. A surprised combatant rolls with disadvantage; a level-3 Champion with advantage (Remarkable Athlete); both cancel. Combatants act in initiative order, round after round; a defeated opponent takes no more turns and can't be targeted.
- **Turn economy.** One action, one bonus action, one reaction and one object interaction (see [Changing gear](gear.md#changing-gear)) per turn. Drinking a potion takes the bonus action (SRD 5.2). The player's turn lasts until it is ended or nothing is left that the engine would accept. Only Uncanny Dodge, reaction spells such as Shield and Last Stand's potion use a reaction: opportunity attacks need positions. The player fleeing a fight draws one attack from each foe in their place, which takes no reaction (see [Exploring](exploring.md) and [House rules](house-rules.md)). Opponents only attack.
- **Attacks.** A natural 20 (19–20 for a Champion) is a critical hit, rolling the damage dice twice; a natural 1 always misses. Damage is never below 0. With Great Weapon Fighting and a weapon in two hands, each 1 or 2 on a damage die counts as 3. Advantage and disadvantage come only from engine rules; with both, one d20 is rolled, and the kept die decides natural 1s and 20s.
- **Light-weapon extra attack (Light, SRD 5.2).** Holding two light weapons, after attacking with the first, the character may make one extra attack that turn with the second, against any living opponent. Its damage adds no ability modifier unless negative or with Two-Weapon Fighting. It takes the bonus action, unless the second weapon has Nick and is mastered, which makes it part of the Attack action. Once per turn, Action Surge included.
- **Weapon masteries** apply only to a mastered weapon being wielded.
  - _Sap:_ a creature hit that survives has disadvantage on its next attack roll, which spends it; it also ends at the start of the attacker's next turn.
  - _Vex:_ a damaging hit on a creature that survives gives advantage on the attacker's next attack roll against it, with any weapon; it lapses at the end of the attacker's next turn.
  - _Graze:_ a miss, natural 1s included, still deals the damage modifier, if above 0.
  - _Nick:_ acts only on the light-weapon extra attack.
- **Heavy weapons.** Disadvantage for a heavy melee weapon below Strength 13, and a heavy ranged weapon below Dexterity 13.
- **Ranged weapons.** A ranged attack spends one arrow or bolt; with none it is refused before any die is rolled. Without positions every opponent closes in, so (a house rule) a ranged weapon attack or ranged spell attack has **no disadvantage in a fight's first round** (the opening volley) and **disadvantage from round 2** ("Close combat"), standing in for SRD 5.2's disadvantage within 5 feet of a foe. A won fight recovers half the arrows and bolts spent in it, rounded down; a lost fight or abandoned adventure rolls ammunition back. Opponents make no ranged attacks, and stat-block riders that need advantage (the Goblin Warrior's extra 1d4) are not used.
- **Opponents.** Each attacks a living party combatant; with more than one, a seeded die picks which, counting in initiative order. A stat block's `multiattack` (2–4) is how many attacks it makes; with more than one attack, a seeded die picks which for each (SRD 5.2 names the attacks a block combines; here the die chooses among all). Without Multiattack it makes its first attack. Every trait is used deterministically:
  - _Pack Tactics:_ advantage while an ally on its side is alive and able to act, beside the target or not.
  - _Nimble Escape_ (goblins, the house Kobold): changes nothing, as there are no opportunity attacks to avoid and no cover to hide in; a test checks a fight plays the same without it.
  - _Rampage_ (house, after the gnoll's): a bonus attack after dropping a combatant to 0 HP; unused with a party of one.
  - _Undead Fortitude:_ reduced to 0 HP by damage that is neither radiant nor from a critical hit, it makes a Constitution save against DC 5 + the damage taken (attack and rider, after resistance); on a success it has 1 HP instead. It may save each time.
- **Damage.** Every damage roll has one of SRD 5.2's 13 damage types; any other is refused. After the roll (critical dice, Great Weapon Fighting and modifier included), immunity makes it 0, resistance halves it (rounding down) and vulnerability doubles it; a rider's damage and Graze's are adjusted by their own type. A monster's save adds its challenge rating's proficiency bonus in each of its `saveProficiencies`.
- **Hit points.** An opponent has its stat block's average hit points, scaled by the opponent hit points [setting](settings.md) (75%, 100% by default, 125% or 150%, rounded up, at least 1); wounds it carries out of a fight are on that maximum. Its XP is the stat block's.
- **Defeat and death.** A combatant at 0 HP is defeated. When every opponent is defeated, fled or surrendered, the encounter's victory ending follows if it names one; otherwise the character explores on. The player character at 0 HP is defeated at once, with **no death saving throws**, unless it takes **Last Stand** (house rule, #499): brought to 0 HP by an opponent's attack with a healing potion and its reaction free, it makes a death saving throw (d20, 11 or higher by default; the Last Stand [setting](settings.md) makes it 10, off or automatic, with no save); on a success it may drink the potion with its reaction and rise to the potion's roll, or fall, and nothing else happens until it answers. A fallen character's adventure ends in the module's defeat ending, the sheet is saved at 0 HP and marked defeated, and the character can never start another adventure.
- **Refused actions** (out of turn, at an absent, friendly or defeated target, with a spent action, a feature not usable now, after the fight) get an engine-written reason, change nothing and draw no dice.

### Conditions

The engine records each condition with what gave it, how many of the bearer's turns it lasts and the save that ends it; no tool can give, remove or change one. In play: **poisoned**, **prone** and **paralysed** (monster riders; paralysed also from Hold Person), **incapacitated** and **unconscious** (Sleep), and **frightened** with **incapacitated** (Turn Undead). A rider may give only poisoned, prone or paralysed. Restrained, charmed and exhaustion are not in play. Each works as in SRD 5.2, with these abstractions:

- Without positions every attacker counts as within 5 feet, so every attack on a prone, paralysed or unconscious combatant has advantage, and every hit on a paralysed or unconscious one is a critical hit.
- A prone combatant spends its next turn getting up, attacking at disadvantage, and stands at its end.
- A paralysed player can only end the turn; a paralysed opponent does nothing but any repeat save. A paralysed ally doesn't count for Pack Tactics. The Ghoul's claw has no exemption for Undead or elf targets.
- A frightened creature's source is always in sight, and its bar on moving closer changes nothing. A turned undead is incapacitated too, so it can't act.
- An incapacitated combatant loses concentration.
- A hit that drops the target to 0 HP gives no condition and rolls no save. The same condition again replaces the old one. A stat block's condition immunity means the rider rolls no save.
- At the end of each of its turns a combatant rolls each repeat save its conditions allow, then conditions whose turns have run out end. Every condition ends with the fight.

## Rests

Every adventure starts with every hit point, hit die and feature use, as a rest between adventures restores them all (see [Characters](characters.md)). During an adventure they carry from fight to fight, and only rests restore them. Each feature's class data says how many uses it has at each level and what a short and a long rest restore. Hit dice (one of the class's die per level) are spent only on a short rest and never in a fight.

- **Where.** Outside a fight, in a room with no unresolved hostile encounter (none, or one won or ended peacefully); a long rest only in a room marked `restSite: true`.
- **How many (a house rule).** **Two short rests and one long rest per adventure**, or per region in a long module. SRD 5.2's limits are the clock and one long rest a day, and this game has no clock. The short rests per adventure [setting](settings.md) makes it 0, 1, 2 (the default), 3, 4 or unlimited; the long rest setting (default on) off offers no long rest anywhere.
- **Short rest.** The player chooses how many hit dice to spend. Each heals its roll + the Constitution modifier (at least 0), and spending stops at full HP. Then each feature regains its short-rest uses.
- **Long rest.** Restores every hit point, hit die and long-rest use. It doesn't give back short rests taken.
- **Refused:** a rest that would restore nothing, in a fight, with foes in the room, or past the limit.
- **Interrupted.** Each rest first rolls a d100 for a wandering encounter where the module has one: its single `wanderingEncounter` (rolled only on rests, at most once) or the region's wandering table (see [Exploring](exploring.md)). At the chance or less (doubled, up to 100, with the wandering encounters [setting](settings.md) at double; no roll at all with it off) the rest restores nothing and doesn't count (SRD 5.2), and the wandering fight begins there. A wandering encounter is in no room: its opponents leave no body to search and can't surrender, react, lurk or be sneaked past, and its fight can't end the adventure in victory.
- A rest rolls back with the adventure if it is abandoned or lost.

## Morale and surrender

**Morale (a house rule).** Every stat block has a `morale` DC, or `"never"` for undead and mindless monsters, which never check. The DCs are house numbers in `adventures/5e/bestiary.json`; read them there (copies of the list in these docs went stale).

- A side checks when its first combatant falls, and again when defeat or flight leaves it at half its starting numbers or fewer; each check once per fight, and once when both come together.
- Each combatant on the side still in the fight, with a DC and not already fleeing, makes a Wisdom save in initiative order. One that fails is fleeing: on its next turn it leaves instead of acting, unless incapacitated. Until then it can be attacked.
- **No free attack on a fleeing creature**: there are no opportunity attacks without positions, and none is added.
- A fled monster can't be attacked, leaves no body and takes what it carried. It counts toward its side's half strength.
- The player character has no morale DC.
- The morale [setting](settings.md): at Normal (the default) the DCs are the bestiary's; Never flee gives no opponent a DC, so none flees or surrenders; Flee easily adds 2 to each DC. Undead and mindless monsters never check under any choice.

**Surrender.** A module may author a `surrender` for an opponent that checks morale (never an undead or mindless one): a description, topics and optional XP for sparing it. Bestiary monsters carry none.

- It surrenders instead of fleeing, the same way: on a failed morale save it yields on its next turn, unless paralysed, and can be attacked until then.
- A surrendered opponent can't be attacked, counts toward half strength and leaves no body. Once the fight is won it is a creature in the room with its authored topics.
- A topic may `give` items the opponent carries: answering it (after a passed check, if it has one) puts them in the room to take; a failed check offers nothing and is not tried again. If it is cut down instead, its body holds them; if it flees, they leave with it.

**XP for fled and surrendered foes.** This is the one statement of the rule.

- A fled or surrendered opponent gives **half its XP, rounded down, if it exchanged blows with the character first** (attacked or was attacked, hit or miss), and none otherwise.
- A spared (surrendered) opponent also gives the module's sparing XP, if any.
- Both go in the fight's one encounter award ("Defeated Goblin 1; drove off Goblin 2; spared Goblin 3"), earned once.
- The harness plays fleeing and surrender through the real runtime and never talks; its XP check counts, for an opponent that may surrender, the greater of its XP and half its XP plus its sparing XP.

## Sneaking and surprise

**Stealth** is a Dexterity skill; armour with SRD 5.2 Stealth disadvantage (chain mail, plate) or untrained armour gives the check disadvantage. **Passive Perception** is in every stat block (the bestiary's SRD 5.2 value, or 10 + Wisdom modifier for a house block; the validator refuses an inline block without one). The character's is 10 + Wisdom modifier + its Perception proficiency bonus (doubled with Expertise), ±5 for advantage or disadvantage on Perception (both cancel).

- **Sneaking in.** Offered only into a room where a fight not yet won waits. It takes the same way as going in (a door must be open; a trap on the way springs first), then rolls Stealth against the highest passive Perception among the fight's opponents. Meeting it leaves the character **unseen**: the fight has not begun. Missing it starts the fight.
- **Ambush (SRD 5.2 surprise).** Unseen, the character may ambush: every opponent is surprised and rolls initiative with disadvantage. There is no surprise round.
- **Sneaking past.** Unseen, the character may leave by any open way, back the way it came included, or leave the adventure from an exit room. The fight is **bypassed**: still there, its opponents keep what they carry, and coming back meets it again. While unseen nothing else in the room can be done but drinking a potion.
- **Remembered.** The Stealth check is kept with its fight and never rerolled, so coming back to a bypassed fight starts it. Only an encounter with `sneakAgain: true` offers a fresh sneak after slipping past, replacing the old check.
- **XP.** A bypassed fight gives no XP unless the encounter authors `bypassXp`, credited on surviving completion under the encounter's own award when it was slipped past and never won. An encounter is credited once: slipping past and then winning it in the same adventure earns the fight's XP alone, and winning it in a later adventure earns nothing more.
- **Lurking monsters.** An encounter marked `lurking: true` rolls once, the first time the character comes into its room (going in, sneaking in or starting there): the opponent with the lowest Stealth bonus (`stealth`, or else its Dexterity modifier) rolls for all of them against the character's passive Perception. Meeting it, the character is **surprised**; missing it, the fight opens normally. The roll is kept and never rerolled.
- **Sneaking into a lurking room.** The character's Stealth is rolled first, then the lurkers'. Sneak succeeds and lurkers fail: the character is unseen. Sneak fails and lurkers succeed: only the character is surprised. Both succeed: they stumble on each other, everyone is surprised, and there is no ambush or slipping past. Both fail: the fight opens normally.
- The engine alone decides surprise; no AI DM tool declares or removes it.

## Reaction rolls

A house rule on top of 5e, which leaves how a creature greets the characters to the DM. The Coldwater Weirgate's encounters use reactions, parleys, tolls, a trade and peaceful XP.

**Eligibility.** A module makes an encounter reaction-eligible by giving it a `reaction` (default off). It may mark opponents `reacts: true`: then only they react and the rest follow; otherwise all react. The validator refuses a reaction-eligible encounter with any mindless opponent (an Undead, or morale `"never"`), even a follower.

**When it is rolled.** When a reaction-eligible fight would begin with no one surprised, after any sneak or lurking roll: on going in or starting there, after a failed sneak, when lurkers were spotted, and on coming back to a fight slipped past. Never while the character is unseen, on an ambush, or when anyone is surprised.

**The roll.** 2d6 + Charisma modifier, looked up in `REACTION_TABLE` in `src/reaction-5e.ts`, the one place to retune it:

| 2d6 + Charisma | Band        |
| -------------- | ----------- |
| 2 or less      | Hostile     |
| 3–5            | Unfriendly  |
| 6–8            | Uncertain   |
| 9–11           | Indifferent |
| 12 or more     | Friendly    |

- **Options.** Hostile always fights at once. Every other band offers only what the module authors for it, at least one of **attack** (no one surprised), **let pass**, and **parley**, **toll** or **trade** (below). Until the character chooses, nothing else can be done; an option not offered is refused.
- **Let pass** settles the encounter: its room is free, no fight waits there, sneaking in is not offered, and the opponents keep what they carry. A reaction may author `peacefulXp` (1–10,000), credited on surviving completion under the encounter's own award: an encounter is credited once, whether won, slipped past or ended peacefully.
- **Remembered.** The roll is kept with its fight and never rerolled.

## Parley, tolls and trade

These extend the reaction-roll house rule: SRD 5.2 has Persuasion, Deception and Intimidation, but how they move an attitude is the DM's call, and here the module's. A reaction may author each once; a band offers one only by naming it. Every band must still offer attack or let pass, so the character can always end the reaction.

- **Parley.** `{ "approaches": [...], "bands": {...} }`. One to three approaches, each `{ "skill", "dc" }`, a different one of `persuasion`, `deception` and `intimidation`, DC 5–30. The graded check's bands each have optional `text` and either a `shift` (−4 to 4, not 0: bands toward friendly or hostile, stopping at either end) or an `outcome`: `let-pass`, `fight` (no one surprised) or `surprise-attack` (only on `failure-by-5`: the character is surprised). A by-5 band left out counts as plain failure or success; a band left out or with only words leaves the reaction as it was. A shift to hostile begins the fight. One parley per encounter, remembered: its band stands, the parley is no longer offered, and it has no circumstances or retry.
- **Toll.** `{ "coins": { "gp", "sp", "cp" }, "text"? }`. Paying ends the encounter peacefully, for its peaceful XP; too little coin is refused. The coin rolls back with the adventure. Nothing lowers or waives a toll.
- **Trade.** A merchant's stock and minutes, under every merchant rule (see [Trading with merchants](gear.md#trading-with-merchants)). While the band holds and offers trade, the reacting opponents are a merchant. Trading ends nothing and is not a `react` option: it is open until the character answers the reaction.
- **The harness.** Its _attack_ policy (the default) attacks whenever offered; _peaceful_ takes let pass, then an affordable toll, then a parley with its best approach, and attacks only when none is offered. It never trades.
