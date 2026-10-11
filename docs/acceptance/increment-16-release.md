# Increment 16: magic — release and player handoff

Issue #350, 11 October 2026, branch `feat/350-magic-module`. Increment 16
adds:

- **Rests.** A short rest spends hit dice (#334). A long rest is taken at a
  module's rest site, and a wandering encounter can interrupt either kind
  (#335). Feature uses and hit dice are tracked as data (#333).
- **Spellcasting.** Casting from slots (#336), with durations,
  concentration and reaction spells (#337), and area spells (#338).
- **The Cleric.** Levels 1–5 (#339, #341, #342), with Turn Undead and the
  Life Domain.
- **The Wizard.** Levels 1–5 (#340, #343, #344), with a spellbook and the
  Evoker.
- **Magic items.** +1 weapons, armour and shields (#345), and spell scrolls
  and the Wand of Magic Missiles (#346).
- **A faster gate that judges casters.** The gate was sped up (#347), now
  judges all four classes (#348), and every shipped module qualifies for
  them (#349).

This ticket releases _The Hollow Chantry_, which uses rests, undead,
scrolls and a +1 weapon, and hands the increment to players. The
[rules document](../character-rules.md) lists every rule, abstraction and
house rule.

The evidence comes in three kinds, kept apart below:

- **automated:** tests and scripts anyone can rerun;
- **implementer:** what the implementer ran and saw;
- **owner:** the manual scenarios for the project owner, with space for
  results.

## What changed in this ticket

- **The Hollow Chantry** (`adventures/5e/hollow-chantry.json`): level 3,
  declared Medium. The owner approved the premise, room map, monsters, rest
  design and treasure in the #350 session, before the content was written.
  The dead of a hillside chantry have woken. Its prior broke open the
  reliquary under the floor for its gold and died there. The module has
  eight rooms, and you enter and leave by the porch:
  - **Chantry Porch** (start and exit): a notice nailed to the door names
    both ways down. There is no loot here.
  - **Nave** (required path): the **Dead Sexton** (a Zombie) fights. The
    altar hides two Potions of Healing, and the sexton's pew hides the
    grille's key. The key is in the pew, not on the body, because undead
    carry nothing (#240).
  - **Vestry**: the **rest site**. Its press holds a Spell Scroll (Cure
    Wounds) and a Potion of Healing.
  - **The sexton's way**: the **iron grille** opens three ways:
    - its key;
    - a pick: Dexterity DC 13 with thieves' tools;
    - a break: Athletics DC 14.

    The grille leads to the **Sexton's Stair**, where the **Charnel
    Corpse** (a Zombie) fights. A box there holds 10 gp and a Potion of
    Healing.

  - **Ossuary** (optional, off the stair): a **Ghoul** guards the founder's
    tomb. The tomb holds the **+1 Mace**, a jet brooch and a garnet.
  - **The priests' way**: the **warding sigils** in the nave yield to
    Arcana or Religion (DC 13) and open a hidden stair:
    - the **Priests' Stair** holds a Spell Scroll (Magic Missile) and an
      azurite;
    - the **Prior's Cell** below it holds the **Prior's Guard** (a
      Skeleton).
  - **Undercroft**: the **Risen Prior** (a Zombie, the boss) fights.
    Winning ends the adventure: _The chantry at rest_, 400 XP.
  - **The restless dead**: a wandering Zombie interrupts a rest on a d100
    roll of 25 or less. It comes once at most.
- **Treasure and XP.** The treasure is 445 gp of the 450 gp level-3
  budget, counting four potions and two 1st-level scrolls at 50 gp each.
  The +1 Mace is the module's one magic item, outside the budget (D10).
  The fights, the restless dead included, offer 450 XP, and the ending 400.
- **Two level-3 caster libraries** for the scenarios, in
  `docs/acceptance/inputs/increment-16/`. Both are built from the same dice
  with the default choices and kit (`tests/fixtures/level-3-casters.mjs`):
  - **Mira**: a Life Domain Cleric, Protector, with 24 HP and AC 12;
  - **Vela**: an Evoker, with 20 HP, AC 12 and Expertise in Arcana.

## Automated evidence

- `npm.cmd run verify` passes with zero warnings: formatting, lint, types,
  static analysis, tests, audit, secret scan and package checks (see
  _Implementer evidence_). CI reruns it on the PR's final commit.
- **Balance gate.** _The Hollow Chantry_ qualifies as Medium for all four
  classes (200 seeds, weakest kit at level 3):

  | Class   | Cautious (judged), weakest kit         | Every check fails |
  | ------- | -------------------------------------- | ----------------- |
  | Fighter | 98.0% (two daggers and leather)        | 98.0%             |
  | Rogue   | 99.0% (shortsword, dagger and leather) | 99.0%             |
  | Cleric  | 96.5% (mace, two daggers and leather)  | 96.5%             |
  | Wizard  | 90.0% (quarterstaff and dagger)        | 92.0%             |

  The weakest kit is the gate's, not the scenarios' characters' own.

  - **Thresholds.** Medium needs 85%, and 88% with the 3 points of slack
    the label rule asks. The Wizard sets the label, 2 points over that.
  - **Too easy.** Turn Undead keeps a zombie or the ghoul out of the fight
    for three turns 27.5% of the time, and the skeleton 34.3%. Both are
    under Medium's 40% cap.
  - **The +1 Mace.** The strongest Fighter, wielding the found mace, kills
    the Prior's Guard with one blow 60% of the time. That is one of five
    ordinary foes, and the cap fails a module only past half.

- **Content, routes and journeys** (`tests/hollow-chantry.test.mjs`):
  - the map, the fights, both ways down, the treasure and the budget;
  - a Fighter's journey by the grille to victory with the +1 Mace;
  - a Wizard's journey by the ward;
  - a failed ward, which leaves the stair hidden;
  - a Rogue picking the grille;
  - a Cleric reading the vestry's scroll;
  - a long rest, both restored and interrupted.

  `tests/shipped-modules.test.mjs` pins the gate figures above.

- **The handoff journeys** (`tests/issue-350-browser.test.mjs`):
  scenarios 1–3 below. Each runs in a real browser on its seed and is
  checked against the library file on disk and against an engine journey
  with the same clicks. The tests assert the lines and the HP at the end of each fight that the scenarios quote, so
  a change that moves them fails.
- **All four classes complete every shipped module.**
  `tests/shipped-modules.test.mjs` qualifies all fifteen modules for the
  Fighter, Rogue, Cleric and Wizard, and checks that each class's career
  reaches level 5 (D14).
- **Increment 16 behavior**, each tested browser → API → storage:

  | Behavior                         | Test                                                       |
  | -------------------------------- | ---------------------------------------------------------- |
  | Hit dice and feature uses        | `issue-333-browser.test.mjs`                               |
  | Short rest                       | `issue-334-browser.test.mjs`, `issue-350-browser.test.mjs` |
  | Long rest, interrupted rests     | `issue-335-browser.test.mjs`, `issue-350-browser.test.mjs` |
  | Durations, concentration, Shield | `issue-337-browser.test.mjs`                               |
  | Area spells                      | `issue-338-browser.test.mjs`                               |
  | The Cleric, levels 1–5           | `issue-339/341/342-browser.test.mjs`                       |
  | Turn Undead                      | `issue-341-browser.test.mjs`, `issue-350-browser.test.mjs` |
  | The Wizard, levels 1–5           | `issue-340/343/344-browser.test.mjs`                       |
  | +1 gear                          | `issue-345-browser.test.mjs`, `issue-350-browser.test.mjs` |
  | Spell scrolls and the wand       | `issue-346-browser.test.mjs`, `issue-350-browser.test.mjs` |
  | The Hollow Chantry               | `issue-350-browser.test.mjs`                               |

  Casting from slots (#336) is tested through the runtime and the Cleric
  and Wizard browser tests. The gate tickets (#347–#349) have engine tests
  only, because they don't change what the browser shows.

## Implementer evidence

**Prototype.** Before the owner approved the design, the implementer
gated drafts of the module. A Ghoul on the required path, or any fight
against two undead at once, left the weakest level-3 Cleric at 25–45%.
Its Turn Undead policy stretched one fight against a single skeleton to
about nine rounds. So every required fight has one undead foe, and the
Ghoul is optional.

**Gate time.** The gate over all fifteen modules took 117.7 seconds of raw
CPU and 112.8 seconds of reference CPU on the implementer's machine,
against the 150-second cap. The chantry alone took 12.6 seconds. Before
#348 cut the casters' policy runs, a raw time of about 116 seconds measured
150.2 on a CI runner, so CI is the check that matters here.

**Verify.** On Windows 11 with Node.js 24.13.0, `npm.cmd run verify` passed
in the #350 worktree on the branch's final commit, ending "Verification
passed with zero warnings." It was not rerun from a clean clone; CI on the
PR runs it from a fresh checkout.

**Live AI run.** None was made for this release. The live release harness
has no route for this module, and a live run needs the owner's approval
and a key. Scenario 4 below is the AI DM check.

## Owner scenarios

Prerequisites: Node.js 24.x, npm 11.6.4, a desktop browser, and from the
project directory:

```powershell
npm.cmd ci
npm.cmd run build
```

Each scenario has its own library under `.scratch\release-350\`, copied
from `docs\acceptance\inputs\`. To retry, move that scenario's folder aside
and start again from its first step.

The dice are seeded, so the results below hold only if you take **exactly**
the listed actions, in order. These roll nothing: moving between rooms
(except into a fight), examining a feature without a check, taking,
wielding, reloading and restarting.

**In every fight, take your turn by this rule**, one button at a time, until
"The fight is over.":

1. If **Take the hit** is offered, press it (never Shield).
2. Mira only: if **Turn Undead (2 of 2 left)** is enabled, press it.
3. A caster only: in the spell choice, pick Vela's scroll ("Magic Missile —
   Spell Scroll (Magic Missile)") if it is listed, or else her cantrip
   ("Fire Bolt (cantrip)" for Vela, "Sacred Flame (cantrip)" for Mira).
   Press **Cast** if it is enabled.
4. Otherwise press the first enabled **Attack** button.
5. Otherwise press **End turn**.

Never drink a potion, use Second Wind or use Action Surge in a fight.

Launch without a key so the typing box is off. If a key is set in your shell,
clear it first:

```powershell
$env:OPENAI_API_KEY = ""
```

To restart mid-way: wait until the last reply is complete and the buttons are
enabled, press Ctrl+C in PowerShell, then rerun the exact same command.

### 1. The sexton's way and the founder's +1 Mace (Fighter)

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-350\fighter | Out-Null; Copy-Item .\docs\acceptance\inputs\increment-13\level-3-ada.json .\.scratch\release-350\fighter\characters.json; npm.cmd run browser -- --seed 0 --characters .\.scratch\release-350\fighter\characters.json
```

Ada is a level-3 Fighter (28 HP, AC 14) with a mace and no thieves' tools.

1. Open Ada's sheet. Expect _The Hollow Chantry_ tagged Level 3 and Medium.
   **Start** it.
2. **Go** Nave. The Dead Sexton fights. Ada wins at 28/28.
3. **Examine** Altar and **Take** both potions. **Examine** Sexton's Pew.
   Expect "In the coat's pocket is a heavy iron key on a loop of twine." and
   **Take** Sexton's Key.
4. **Go** Vestry, **Examine** Vestment Press, and **Take** Sealed Parchment
   and Potion of Healing. Under "You carry", the Spell Scroll (Cure Wounds)
   offers no enabled **Read**: a Fighter reads no scroll.
5. **Go** Nave and press **Unlock** on the Iron Grille. Expect "You unlock
   the Iron Grille with the Sexton's Key."
6. **Go** Sexton's Stair. The Charnel Corpse fights; Ada wins at 23/28.
   **Examine** Sexton's Box and **Take** both items.
7. **Go** Ossuary. Expect "Initiative: Ghoul 20 + 2 = 22". The Ghoul's
   first claw hits, and expect "Ada makes a Constitution saving throw
   against being paralysed: 14 + 4 = 18 against DC 10. Success." Ada wins
   at 13/28.
8. **Examine** Founder's Tomb and **Take** the Founder's Mace ("You take the
   Founder's Mace and stow it."), the Jet Brooch and the Founder's Garnet.
   Under "You carry", the +1 Mace explains its bonus.
9. Press **Wield** on the +1 Mace. Expect "You stow the mace and wield the
   +1 mace. AC 14; +1 Mace +6 to hit, 1d6 + 4 bludgeoning."
10. **Go** Sexton's Stair, then **Go** Undercroft. Expect "Ada attacks Risen
    Prior with +1 Mace: 18 + 6 = 24 against AC 8. Hit. Damage 4 + 4 = 8
    bludgeoning". Ada wins in two blows, at 13/28.
11. Expect **The chantry at rest**:
    - +50 XP each for the Dead Sexton, the Charnel Corpse and the Risen
      Prior;
    - +200 XP for the Ghoul;
    - +400 XP for the ending.

    The sheet shows 750 more XP, the +1 Mace in hand, the brooch and garnet,
    and the unread scroll under **Magic items**.

### 2. An interrupted rest, the ward and a scroll (Wizard)

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-350\wizard | Out-Null; Copy-Item .\docs\acceptance\inputs\increment-16\level-3-vela.json .\.scratch\release-350\wizard\characters.json; npm.cmd run browser -- --seed 17 --characters .\.scratch\release-350\wizard\characters.json
```

Vela is a level-3 Evoker with 900 XP, 20 HP and AC 12. She has not cast
Mage Armor.

1. **Start** _The Hollow Chantry_ and **Go** Nave. Fight by the rule with
   Fire Bolt. Vela wins at 14/20.
2. **Go** Vestry. The room panel says "This is a safe place to rest. Long
   rests: 1 of 1 left in this adventure". Press **Long rest**. Expect:
   - "You keep watch as you rest: d100 16, 25 or less: the Wandering
     Corpse comes upon you. Your long rest is interrupted and restores
     nothing.";
   - the Wandering Corpse fights in the vestry.

   Vela wins at 7/20.

3. Press **Long rest** again: an interrupted rest uses none of the
   allowance. Expect "You take a long rest: you regain 13 HP (20/20 HP) and
   0 hit dice (3 of 3 d6 left). Long rests: 0 of 1 left in this adventure."
4. **Go** Nave and press **Examine** on the Warding Sigils **with Arcana**.
   Expect "Arcana check: d20 7 + 3 + 4 proficiency (Expertise) = 14 against
   DC 13. Success." and "The way to the Priests' Stair is open."
5. **Go** Priests' Stair, **Examine** Lamp Niche, and **Take** Rolled
   Parchment and Azurite Chip.
6. **Go** Prior's Cell. The Prior's Guard acts first and hits; press **Take
   the hit**. Then choose the scroll in the spell choice and **Cast**.
   Expect:
   - "You cast Magic Missile at Prior's Guard from the Spell Scroll (Magic
     Missile), which is used up.";
   - "Magic Missile: 3 missiles hit Prior's Guard. Damage 4 + 2 + 3 + 3 = 12
     force; Prior's Guard has 1/13 HP."

   Fire Bolt finishes it.

7. **Go** Undercroft and fight by the rule. Vela wins at 6/20.
8. Expect **The chantry at rest**: +50 XP each for the Dead Sexton, the
   Wandering Corpse, the Prior's Guard and the Risen Prior, and +400 for
   the ending. The sheet lists no magic items: the scroll was read.

### 3. Turn Undead, a Cure Wounds scroll and a short rest (Cleric)

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-350\cleric | Out-Null; Copy-Item .\docs\acceptance\inputs\increment-16\level-3-mira.json .\.scratch\release-350\cleric\characters.json; npm.cmd run browser -- --seed 59 --characters .\.scratch\release-350\cleric\characters.json
```

Mira is a level-3 Life Domain Cleric with 900 XP, 24 HP and AC 12. Cure
Wounds is not among her prepared spells.

1. **Start** _The Hollow Chantry_ and **Go** Nave. Press **Turn Undead (2 of
   2 left)**. Expect:
   - "Dead Sexton makes a Wisdom saving throw against Turn Undead: 12 + 0 =
     12 against DC 13. Failure.";
   - the zombie frightened and incapacitated.

   Next turn, casting Sacred Flame at it ends the turning ("Turn Undead
   ends on Dead Sexton: it is attacked."). Fight on by the rule. Mira wins
   at 3/24.

2. **Go** Vestry, **Examine** Vestment Press, and **Take** Sealed Parchment
   and Potion of Healing.
3. Under "You carry", press **Read** on the Spell Scroll (Cure Wounds).
   Expect "You cast Cure Wounds on yourself from the Spell Scroll (Cure
   Wounds), which is used up." and "Cure Wounds: 6 + 2 + 3 = 11; you regain
   11 HP and have 14/24 HP."
4. Under **Short rest**, leave the hit dice at 3 and press **Rest**. A rest
   stops spending hit dice at full HP, so it spends only 2. Expect:
   - "You keep watch as you rest: d100 74, over 25: nothing disturbs
     you.";
   - "You take a short rest and spend 2 hit dice (1 of 3 d8 left). Short
     rests: 1 of 2 left in this adventure.";
   - "Channel Divinity regains 1 use (2 of 2 left)."
5. **Go** Nave, **Examine** Sexton's Pew, **Take** Sexton's Key, and press
   **Unlock** on the Iron Grille.
6. **Go** Sexton's Stair. Turn Undead reaches the Charnel Corpse. Mira wins
   at 24/24.
7. **Go** Undercroft and fight by the rule. Mira wins at 15/24.
8. Expect **The chantry at rest**: +50 XP each for the Dead Sexton, the
   Charnel Corpse and the Risen Prior, and +400 for the ending.

### 4. The AI DM: a rest, the ward and a scroll (needs `OPENAI_API_KEY`)

```powershell
$env:OPENAI_API_KEY = "<your key>"
New-Item -ItemType Directory -Force .\.scratch\release-350\ai | Out-Null; Copy-Item .\docs\acceptance\inputs\increment-16\level-3-vela.json .\.scratch\release-350\ai\characters.json; npm.cmd run browser -- --seed 17 --characters .\.scratch\release-350\ai\characters.json
```

Start _The Hollow Chantry_ with Vela. Type one at a time, and wait for each
reply:

- "Go into the nave." The fight starts. "Cast fire bolt at the sexton."
  Expect a Fire Bolt card, the DM never rolling itself. Fight on with the
  buttons or by typing until it is over.
- "Go to the vestry and sleep there for the night." Expect the engine's
  long-rest card: on this seed the restless dead interrupt it (d100 16).
  The DM must not grant the rest, or call it off, itself.
- "Sleep again." Expect a long rest that restores Vela, and "Long rests: 0
  of 1 left". Then "Rest again." Expect the DM to say no long rest is
  left, without calling a tool.
- "Go back to the nave and study the sigils with my knowledge of magic."
  Expect an **Arcana** check card (DC 13), not Religion.
- "Take the priests' stair and search the niche." After taking the
  parchment, in the Prior's Cell: "Read the magic missile scroll at the
  skeleton." Expect a cast card naming the Spell Scroll (Magic Missile),
  which is used up.

### Owner results

Record each scenario's outcome, and any wording or behavior that surprised
you, separately from the evidence above.

| Scenario                                    | Date | Result | Notes |
| ------------------------------------------- | ---- | ------ | ----- |
| 1. The sexton's way and the +1 Mace         |      |        |       |
| 2. An interrupted rest, the ward, a scroll  |      |        |       |
| 3. Turn Undead, a scroll and a short rest   |      |        |       |
| 4. The AI DM: a rest, the ward and a scroll |      |        |       |

## Limits

- **The gate barely plays the caster's way or the rest site.** The gate's
  cautious runs plan the grille route, which needs no check, so they never
  take the priests' way. They rarely reach the vestry hurt enough to rest:
  the reported long rests are 0.0 a run. The ward, the scrolls and the
  vestry are tested by journeys and these scenarios, not by the gate.
- **The ward suits a Wizard.** Vela's Arcana has Expertise (+7). Mira, with
  the Cleric's default skills, rolls Religion at −1 against DC 13. A
  Cleric who takes Religion, or the Thaumaturge order, reads it as easily.
- **Turning one foe, then attacking it, wastes the turning.** Attacking a
  turned undead ends its turning (D13). Scenario 3 follows a fixed rule,
  not the best play.
- **The phone layout.** On a phone, revealing two or three items at once
  beside a Wizard's Cast panel can overflow the action dock (the gap
  recorded in #346). It happens in the vestry, the lamp niche and the
  founder's tomb. The handoff tests run at 1280 px.
- **Agent choices from #345 now reach players.** Merchants won't buy the
  +1 Mace, and a +1 item's tier is the higher of uncommon and its mundane
  item's tier.
- **The gate's CPU budget.** Locally the gate takes 112.8 of its 150
  reference seconds (see _Implementer evidence_).
- **One sample.** No live AI run was made. AI interpretation varies between
  runs; `npm.cmd run eval:dm` measures it across cases. Unfamiliar-player
  testing has not been done.
- **Prepared libraries.** The scenarios start from prepared libraries
  rather than characters played up from level 1. The career simulation
  (`npm.cmd run career`) plays that path in the engine.
- **Fragile seeds.** A change to the Zombie, Skeleton or Ghoul, to any
  class's fights, or to the dice order will move the release seeds. The
  handoff tests fail when they do.
- **Throwaway formats** until the owner declares a stable release (ADR
  0005): library 25, session 50, trace 44, adventure module 30, bestiary 10,
  prompt `5e-dm-v34`. The input libraries are in library format 25. When
  that changes, regenerate Mira's and Vela's from `libraryOf` in
  `tests/fixtures/level-3-casters.mjs`, and Ada's from `libraryAt` in
  `src/test-fighter-5e.ts`; their tests say so.
