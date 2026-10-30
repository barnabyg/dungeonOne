# Morale, stealth and talk

## Morale and surrender

**Morale (a house rule).** Every stat block has a `morale` DC, or `"never"` for
undead and mindless monsters, which never check. The DCs are house numbers in
`adventures/5e/bestiary.json`; read them there (copies of the list in these docs
went stale).

- A side checks when its first combatant falls, and again when defeat or flight
  leaves it at half its starting numbers or fewer; each check once per fight,
  and once when both come together.
- Each combatant on the side still in the fight, with a DC and not already
  fleeing, makes a Wisdom save in initiative order. One that fails is fleeing:
  on its next turn it leaves instead of acting, unless incapacitated. Until then
  it can be attacked.
- **No free attack on a fleeing creature**: there are no opportunity attacks
  without positions, and none is added.
- A fled monster can't be attacked, leaves no body and takes what it carried. It
  counts toward its side's half strength.
- The player character has no morale DC.
- The morale [setting](settings.md): at Normal (the default) the DCs are the
  bestiary's; Never flee gives no opponent a DC, so none flees or surrenders;
  Flee easily adds 2 to each DC. Undead and mindless monsters never check under
  any choice.

**Surrender.** A module may author a `surrender` for an opponent that checks
morale (never an undead or mindless one): a description, topics and optional XP
for sparing it. Bestiary monsters carry none.

- It surrenders instead of fleeing, the same way: on a failed morale save it
  yields on its next turn, unless paralysed, and can be attacked until then.
- A surrendered opponent can't be attacked, counts toward half strength and
  leaves no body. Once the fight is won it is a creature in the room with its
  authored topics.
- A topic may `give` items the opponent carries: answering it (after a passed
  check, if it has one) puts them in the room to take; a failed check offers
  nothing and is not tried again. If it is cut down instead, its body holds
  them; if it flees, they leave with it.

**XP for fled and surrendered foes.** This is the one statement of the rule.

- A fled or surrendered opponent gives **half its XP, rounded down, if it
  exchanged blows with the character first** (attacked or was attacked, hit or
  miss), and none otherwise.
- A spared (surrendered) opponent also gives the module's sparing XP, if any.
- Both go in the fight's one encounter award ("Defeated Goblin 1; drove off
  Goblin 2; spared Goblin 3"), earned once.
- The harness plays fleeing and surrender through the real runtime and never
  talks; its XP check counts, for an opponent that may surrender, the greater of
  its XP and half its XP plus its sparing XP.

## Sneaking and surprise

**Stealth** is a Dexterity skill; armour with SRD 5.2 Stealth disadvantage
(chain mail, plate) or untrained armour gives the check disadvantage. **Passive
Perception** is in every stat block (the bestiary's SRD 5.2 value, or 10 +
Wisdom modifier for a house block; the validator refuses an inline block without
one). The character's is 10 + Wisdom modifier + its Perception proficiency bonus
(doubled with Expertise), ±5 for advantage or disadvantage on Perception (both
cancel).

- **Sneaking in.** Offered only into a room where a fight not yet won waits. It
  takes the same way as going in (a door must be open; a trap on the way springs
  first), then rolls Stealth against the highest passive Perception among the
  fight's opponents. Meeting it leaves the character **unseen**: the fight has
  not begun. Missing it starts the fight.
- **Ambush (SRD 5.2 surprise).** Unseen, the character may ambush: every
  opponent is surprised and rolls initiative with disadvantage. There is no
  surprise round.
- **Sneaking past.** Unseen, the character may leave by any open way, back the
  way it came included, or leave the adventure from an exit room. The fight is
  **bypassed**: still there, its opponents keep what they carry, and coming back
  meets it again. While unseen nothing else in the room can be done but drinking
  a potion.
- **Remembered.** The Stealth check is kept with its fight and never rerolled,
  so coming back to a bypassed fight starts it. Only an encounter with
  `sneakAgain: true` offers a fresh sneak after slipping past, replacing the old
  check.
- **XP.** A bypassed fight gives no XP unless the encounter authors `bypassXp`,
  credited on surviving completion under the encounter's own award when it was
  slipped past and never won. An encounter is credited once: slipping past and
  then winning it in the same adventure earns the fight's XP alone, and winning
  it in a later adventure earns nothing more.
- **Lurking monsters.** An encounter marked `lurking: true` rolls once, the
  first time the character comes into its room (going in, sneaking in or
  starting there): the opponent with the lowest Stealth bonus (`stealth`, or
  else its Dexterity modifier) rolls for all of them against the character's
  passive Perception. Meeting it, the character is **surprised**; missing it,
  the fight opens normally. The roll is kept and never rerolled.
- **Sneaking into a lurking room.** The character's Stealth is rolled first,
  then the lurkers'. Sneak succeeds and lurkers fail: the character is unseen.
  Sneak fails and lurkers succeed: only the character is surprised. Both
  succeed: they stumble on each other, everyone is surprised, and there is no
  ambush or slipping past. Both fail: the fight opens normally.
- The engine alone decides surprise; no AI DM tool declares or removes it.

## Reaction rolls

A house rule on top of 5e, which leaves how a creature greets the characters to
the DM. The Coldwater Weirgate's encounters use reactions, parleys, tolls, a
trade and peaceful XP.

**Eligibility.** A module makes an encounter reaction-eligible by giving it a
`reaction` (default off). It may mark opponents `reacts: true`: then only they
react and the rest follow; otherwise all react. The validator refuses a
reaction-eligible encounter with any mindless opponent (an Undead, or morale
`"never"`), even a follower.

**When it is rolled.** When a reaction-eligible fight would begin with no one
surprised, after any sneak or lurking roll: on going in or starting there, after
a failed sneak, when lurkers were spotted, and on coming back to a fight slipped
past. Never while the character is unseen, on an ambush, or when anyone is
surprised.

**The roll.** 2d6 + Charisma modifier, looked up in `REACTION_TABLE` in
`src/reaction-5e.ts`, the one place to retune it:

| 2d6 + Charisma | Band        |
| -------------- | ----------- |
| 2 or less      | Hostile     |
| 3–5            | Unfriendly  |
| 6–8            | Uncertain   |
| 9–11           | Indifferent |
| 12 or more     | Friendly    |

- **Options.** Hostile always fights at once. Every other band offers only what
  the module authors for it, at least one of **attack** (no one surprised),
  **let pass**, and **parley**, **toll** or **trade** (below). Until the
  character chooses, nothing else can be done; an option not offered is refused.
- **Let pass** settles the encounter: its room is free, no fight waits there,
  sneaking in is not offered, and the opponents keep what they carry. A reaction
  may author `peacefulXp` (1–10,000), credited on surviving completion under the
  encounter's own award: an encounter is credited once, whether won, slipped
  past or ended peacefully.
- **Remembered.** The roll is kept with its fight and never rerolled.

## Parley, tolls and trade

These extend the reaction-roll house rule: SRD 5.2 has Persuasion, Deception and
Intimidation, but how they move an attitude is the DM's call, and here the
module's. A reaction may author each once; a band offers one only by naming it.
Every band must still offer attack or let pass, so the character can always end
the reaction.

- **Parley.** `{ "approaches": [...], "bands": {...} }`. One to three
  approaches, each `{ "skill", "dc" }`, a different one of `persuasion`,
  `deception` and `intimidation`, DC 5–30. The graded check's bands each have
  optional `text` and either a `shift` (−4 to 4, not 0: bands toward friendly or
  hostile, stopping at either end) or an `outcome`: `let-pass`, `fight` (no one
  surprised) or `surprise-attack` (only on `failure-by-5`: the character is
  surprised). A by-5 band left out counts as plain failure or success; a band
  left out or with only words leaves the reaction as it was. A shift to hostile
  begins the fight. One parley per encounter, remembered: its band stands, the
  parley is no longer offered, and it has no circumstances or retry.
- **Toll.** `{ "coins": { "gp", "sp", "cp" }, "text"? }`. Paying ends the
  encounter peacefully, for its peaceful XP; too little coin is refused. The
  coin rolls back with the adventure. Nothing lowers or waives a toll.
- **Trade.** A merchant's stock and minutes, under every merchant rule (see
  [Trading with merchants](gear.md#trading-with-merchants)). While the band
  holds and offers trade, the reacting opponents are a merchant. Trading ends
  nothing and is not a `react` option: it is open until the character answers
  the reaction.
- **The harness.** Its _attack_ policy (the default) attacks whenever offered;
  _peaceful_ takes let pass, then an affordable toll, then a parley with its
  best approach, and attacks only when none is offered. It never trades.
