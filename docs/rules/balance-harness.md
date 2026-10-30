# Balance harness

The verdict is in [Balance gate](balance-gate.md).

## Balance harness

`src/balance-5e.ts` plays any 5e module through the real runtime and measures
how dangerous it is. `npm.cmd run balance` reports on the built-in modules, or
the module files named after it, for each class, then gives the balance gate's
verdict on each and exits 1 if any fails or doesn't qualify (`--help` lists its
options). The gate always plays every check policy and every class, whatever the
options say.

- **Characters.** For each class, 10,000 creations are rolled with
  4d6-drop-lowest from a fixed seed, placed by the class's own priority, and
  ranked by the sum of the ability modifiers its creation gives; the weak and
  strong characters are the 5th and 95th percentiles. Each takes the class's
  creation defaults (`FIGHTER_DEFAULT_CHOICES` and the other classes' defaults),
  so other choices, such as other masteries, are not gated. The report plays the
  class's default kit; the gate plays every kit. Each plays at every recommended
  level, at full health with that level's XP. Level choices follow
  `gateLevelChoice`: the Ability Score Improvement goes to the attack ability
  (the class's first primary ability, or Dexterity for a Dexterity-first build)
  until 20, then by the class's ability priority; the Fighter's fourth mastery
  is a weapon the module places or sells that the gate is trying, else the first
  unmastered in catalogue order. A caster picks each level's cantrips and spells
  in its list's order (`withOwedChoices`).
- **Objective and required path.** A module's objective is its victory if it has
  one, or else getting out with loot (treasure or coin). The required path is
  the route to it through the fewest fights, then the fewest moves: to the
  victory fight, or to the nearest loot and out by the nearest exit. Every other
  room, and its fight, is optional. No style talks, so the gate judges the route
  a player who never talks must take: the nearest loot is the nearest such a
  player can reach, and a module whose objective only talking reaches fails as
  `unreachable-objective`. On a declared route the required path first passes
  the route's rooms in order, then goes on to the objective.
- **Route planning.** A door with a check counts as passable until it blocks the
  way. A door only a key opens counts only with one of its keys carried;
  otherwise the plan fetches the nearest of its keys that isn't lost, and the
  door stays shut once every key is lost. A way a flag opens is shut until the
  flag is set; the plan then goes to the nearest room where something not yet
  done sets it for sure (as the validator counts it). It never plans through a
  way a flag has closed. A way only an item used on a feature opens: the plan
  fetches the item first, then goes to the feature and uses it. A hidden passage
  only talking opens is never passable.
- **Styles.** Each picks only actions `projectActions` offers as available.
  _direct_ enters every room and fights every fight, healing below a quarter of
  its hit points. _cautious_ skips optional fights but looks into optional rooms
  with no fight, searches each room for traps and disarms those it finds, and
  heals below half. _avoid-optional_ enters only the required rooms and heals
  below a quarter, but goes round by any room where a flag has closed the way.
  _stealth-first_ plays as _cautious_, but sneaks into every fight it would
  enter and, unseen, slips past it unless its goal is in that room or the way on
  is shut, when it ambushes; a fight it slipped past is met again if its route
  comes back. _retreat_ plays as _cautious_, but below its heal threshold with
  no heal left it flees each fight once toward the nearest exit, by a way out
  with no fight on it (after Disengage when it has it), and then leaves.
  _use-room_ plays as _cautious_, but with no heal left uses the room's fight
  action whenever offered, against the opponent with the most hit points, by its
  first approach. Only _retreat_ flees and only _use-room_ uses fight actions.
- **What every style does.** It examines every feature and fallen body, takes
  every item, attacks the opponent with the fewest hit points (with the
  light-weapon extra attack on it), uses Action Surge once the action is spent,
  and tries a shut door's key, then force, pick and break. It takes another try
  a module offers, but never one whose damage could leave it below its heal
  threshold. It never talks and never uses Tactical Mind (every Second Wind is
  kept for healing), so the gate stays a lower bound. It answers a reaction roll
  by the run's reaction policy: _attack_ by default, or _peaceful_.
- **Class play.** A Rogue takes Hide or Steady Aim before an attack and Hide
  after it, adds Cunning Strike to a Sneak Attack, halves every hit it can with
  Uncanny Dodge, and picks a lock before breaking the door (see
  [the Rogue](classes.md#rogue)). A Cleric heals itself below the heal threshold
  with a spell before a potion (a bonus-action spell in a fight, the most
  healing dice out of one); spends Turn Undead whenever an undead foe is left to
  turn, attacking turned foes only once every foe is turned, and never leaves a
  room with every foe turned; uses Divine Spark on the weakest untouched foe
  while a use remains for Turn Undead or Preserve Life; and uses Preserve Life
  after its healing spells. A Wizard casts Mage Armor once before its first
  fight, a ranged cantrip in round 1 and a melee one from round 2, and Shield
  only when its +5 turns a hit into a miss. Every class takes Last Stand
  whenever its death saving throw offers it, drinking the first potion offered
  (house rule, #499). A caster holding a Pearl of Power uses it as soon as a
  slot is spent outside a fight (#538).
- **Casting policies** (`CASTING_POLICIES`). A caster plays every style by
  _conserve_ (the default) or _spend-early_. Both heal as above and otherwise
  act with a damaging cantrip on the weakest foe, ahead of a weapon. _conserve_
  casts a levelled spell only below the heal threshold with no heal left.
  _spend-early_ casts one every turn it can: with two or more foes untouched, a
  control spell (Sleep, Hold Person) on the one with the most hit points, never
  one immune; otherwise the damage spell worth most (`castValue`). Neither casts
  a second concentration spell, nor any other buff, curse or restoration spell.
  A foe asleep or turned is left alone while others stand.
- **Check policies.** _seeded_, the default, rolls every check as a player meets
  it. _always-fail_ and _always-succeed_ make every check total the lowest or
  highest any character of the module's maximum level could make
  (`extremeTotals`), so each lands in its worst or best reachable band; a search
  finds no trap, or every trap. The d20 is still drawn, so other dice stay
  seeded; trap saving throws stay seeded. Loot a failed check left hidden is
  left behind, and so is loot an opponent carried that left no body (it fled,
  surrendered or ended peacefully). **A lost key with no way on strands the run,
  and the gate fails it:** a key lost either way counts as absent, the run plans
  around its door, and a run left with no way on or out is stranded. The module
  must give another way, such as another route or a door that can be picked,
  forced or broken.
- **Metrics,** per level, percentile and style: survival and completion, fights
  slipped past and fled, endings, each fight's HP lost, rounds and defeat rate,
  healing and rests used, trap damage, XP and treasure, and each opponent's
  chance of dying to one attack from full HP.
- **Failures.** A module the harness can't play fails with a named reason:
  `unsupported-action` (the runtime offers an action no style knows),
  `step-limit` (a run takes too many actions), `stranded` (a run is alive with
  no action that leads on or out; the reason names the check policy, every check
  made with its band and any passage it closed, and every lost key),
  `unreachable-objective` (when only talking would reach it, the reason names
  the route talking opens) or `unsimulated-trait` (an opponent lists a trait the
  engine doesn't apply; only an unvalidated module meets it).
- **New kinds.** The harness projects only the action kinds and spells a style
  may play. Spells and exploring's kinds are listed by hand in
  `src/balance-5e.ts` (`CAST_SPELLS`, `FIRST_ACTIONS`, `EXAMINING` and the
  `EXPLORE_` sets): a spell a new policy casts, or a kind a style takes while
  exploring, must be named there, or the harness never sees it offered.

## Career simulation

`npm.cmd run career` (`src/career-5e.ts`) asks whether a new character can reach
level 5 by playing the shipped modules. It plays one career per seed: the gate's
weakest character of a class, with the class's default choices and kit (and the
_conserve_ policy for a caster), from level 1 and 0 XP. It plays the modules in
the browser's order, each once, as soon as its level reaches the module's
minimum, in the _cautious_ style on seeded checks; a module no career reaches is
reported as not played. Between modules a surviving character settles as the
library does (keeps what it holds, is credited its XP, rests to full) and makes
any pending level choice by the gate's policy; a defeat ends the career. The
check passes when some career reaches the required level, so a module set whose
XP can't carry a career that far fails. `npm.cmd run verify` runs it for every
class the gate judges. Each module is gated on its own; the career takes the
modules as given. The report gives each module's careers played, survival, mean
XP credited and falls, then how many careers ended at each level.

## Encounter estimate

`npm.cmd run estimate` (`src/estimate-5e.ts`) estimates a fight from bestiary
ids before it is written into a module. The fight becomes a one-room module
whose start room holds it, and the harness plays it with the gate's sampled
characters and seeds at the chosen levels, with every kit in every style. It
reports each monster's one-hit-kill chance and the caps it is over, the
survival, HP lost and rounds for each kit and style, and the gate's verdict at
each difficulty. A module with more rooms, potions or other fights will measure
differently. The estimate counts every monster as ordinary: mark a boss in the
module to exempt it from the cap. An unknown id fails as `unknown-monster`, and
an unsimulated trait as `unsimulated-trait`.
