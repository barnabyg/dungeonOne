# Increment 16 ticket proposal

Status: approved by the project owner and published as GitHub issues #333–#350 on 9 October 2026. Every issue has the `ready-for-agent` label and native blocking links. The published issues are the source of truth for each ticket's scope and acceptance criteria; this document is the publication record. Source: the [D&D 5e expansion plan](dnd-expansion-implementation-plan.md), section 9 (increment 16, magic), with the owner decisions in its section 10. Baseline: `main` at `3df17d1`.

**Playable result:** the character can rest inside an adventure, and two spellcasting classes, the Cleric and the Wizard, join the Fighter and the Rogue at levels 1–5. Magic items, scrolls and wands can be found. Every shipped module qualifies for all four classes, and a new release module uses rests, spells and magic items.

## 1. Review of the plan's slices

The plan's six slices (16.1–16.6) were written before increments 13–15 landed. Checked against `main`, these points change the breakdown:

| Plan says                                                     | Finding on `main`                                                                                                                                                                                                                                                              | Consequence                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16.1: rests have "time cost … and clock interaction"          | The clock was dropped in increment 14 (owner, 8 October). The adventure has no time at all; only trade and donning minutes are reported.                                                                                                                                       | Rests need their own cost model: a limit per adventure and authored interruptions. Owner decision D1.                                                                 |
| 16.1: Fighter and Rogue features recover inside adventures    | Feature uses are two hard-coded counters (`CharacterResources.secondWindUses`, `actionSurgeUses`, `runtime-5e.ts:243`). `recovery` has one value, `"rest-between-adventures"` (`class-5e.ts:291`). Hit dice are not tracked anywhere.                                          | A gameplay-neutral prefactor first: feature uses as a map keyed by feature id, recovery as `short-rest` / `long-rest`, and a hit-dice pool. Spell slots reuse it.     |
| 16.2: one slice for the whole casting engine                  | There is no Magic action, no save-for-half path in a fight (only traps, out of combat), `rollSave` is private and tied to a condition, durations exist only as condition `turnsLeft`, and the only reaction is Uncanny Dodge.                                                  | Split: casting (slots, cantrips, attack/save/auto-hit/healing spells), then durations, concentration and reaction spells, then areas.                                 |
| 16.3/16.4 list only 1st-level spells                          | Levels run 1–5. A level-5 Cleric or Wizard casts 3rd-level spells and has level 2–5 class features (Channel Divinity, subclass at 3, ASI at 4, Sear Undead / Memorize Spell at 5).                                                                                             | Split each class by level band, as the Rogue was (#306–#308). The spell list needs owner approval (D3).                                                               |
| 16.4: "Sleep can end fights outright; the gate must catch it" | That is the 2014 Sleep (an HP pool, no save). SRD 5.2 Sleep is a Wisdom save, Incapacitated first and Unconscious only after a second failed save, concentration, in a 5-ft sphere. Much weaker, but still a fight-ender against a lone enemy.                                 | Keep the requirement but give the gate a defined measure for control spells (D5).                                                                                     |
| Areas of effect                                               | Omitted (`character-rules.md`, "Rules that need positions"). Burning Hands, Sleep, Shatter, Fireball and Spirit Guardians all need them.                                                                                                                                       | A slice that abstracts areas as a target count (D4).                                                                                                                  |
| Conditions                                                    | Only poisoned, prone and paralysed exist. The owner deferred frightened and unconscious "until a monster needs them" (6 October).                                                                                                                                              | Spells now need Incapacitated, Unconscious (Sleep) and Frightened (Turn Undead). Added in the slices that first use them. Hold Person reuses paralysed.               |
| Ranged attacks                                                | House rule: no disadvantage in round 1, disadvantage from round 2 (no positions). Fire Bolt, Guiding Bolt, Ray of Frost and Scorching Ray are ranged spell attacks.                                                                                                            | The rule would apply to them. Owner decision D6, because it shapes Wizard survival.                                                                                   |
| 16.5: magic items under the 13.4 budget                       | `TREASURE_BUDGETS` is 150 gp × max level. SRD 5.2 values an uncommon item far above a level-1–3 budget. Uncommon tier is allowed from level 3, rare never. No `+1` or attunement code exists.                                                                                  | Magic items need a budget rule (D10). Split +1 gear from scrolls and wands, since only scrolls and wands need casters.                                                |
| 16.6: release for all four classes                            | `GATE_CLASSES = ["fighter","rogue"]`. The two-class gate takes about 58 s of the 90 s reference-CPU cap; browser startup is about 24 s. Class ids are hard-coded in seven places (`class-5e.ts:324`, `character-5e.ts:70,79`, `balance-5e.ts:88,2437`, two scripts, one test). | Four classes roughly double gate time. A gate-speed ticket before qualification (D12). Caster harness policies and the four-class qualification are separate tickets. |
| Undead for Turn Undead                                        | Zombie, Skeleton and Ghoul exist. The Abandoned Delve, Drowned Chapel, Gravedigger's Lodge, Silvervein Mine and Warden's Crypt use them. Creature type is on the stat block, not the combatant.                                                                                | Turn Undead has targets in five modules; the combatant needs its creature type.                                                                                       |

Kept from the plan: rests before magic, Cleric and Wizard as the two classes, Life Domain and Evoker as the SRD 5.2 subclasses, `+1` gear waiting for this increment (owner, 6 October), a release adventure at the end.

Left out of increment 16 (recommend recording as deferred in the rules document):

- Rituals, and spells whose use needs time or distance: Detect Magic, Identify, Misty Step, Fly, Counterspell (no monster casts).
- Spell components and spellcasting foci (a focus may sit in a kit for flavour; it has no rule).
- Monster spellcasters.
- Conditions given by checks outside a fight that last until a rest (deferred to "in-adventure rests" in increment 14). Rests make them possible, but no module needs them yet.
- Attunement (D11).

## 2. Proposed tickets

IDs T1–T18 map to issues #333–#350 in order (T1 is #333, T18 is #350). "Owner pause" marks a ticket that stops for owner approval before content is written, as #306 and #311 did.

### T1 — Track feature uses and hit dice as data (prefactor)

**What to build.** Replace the hard-coded `secondWindUses` / `actionSurgeUses` counters with a map of feature uses keyed by feature id, read from class data. `recovery` becomes `short-rest` (a number of uses regained, or all) or `long-rest`. Add a hit-dice pool (class hit die × level) to the adventure session. No rest is offered yet: everything still refreshes between adventures.

**Acceptance criteria**

- [ ] Golden tests: Fighter and Rogue derive identical uses, HP and gate reports at every level.
- [ ] Session format bumped; old sessions refused with the standard message.
- [ ] Class data records SRD 5.2 recovery: Second Wind regains one use on a short rest and all on a long rest; Action Surge recovers on either.

**Blocked by:** none.

### T2 — Take a short rest

**What to build.** A `rest` tool and action, outside a fight, in a room with no unresolved hostile encounter. The character spends hit dice one at a time (die + Con modifier each, minimum 0 per die), then features with short-rest recovery regain uses. Short rests are limited per adventure (D1). The browser shows hit dice left and a Rest control; the ending card's "a rest before the next adventure restores…" text stays for between adventures. The harness rests when below its heal threshold and rests remain; `rest` is added to `PLAYED_ACTIONS`.

**Acceptance criteria**

- [ ] Refused in a fight, in a room with a live encounter, at the limit, and with no hit dice left and nothing to recover.
- [ ] Engine tests for hit-dice healing and per-feature recovery; a browser → API → storage test of a rest and an abandoned adventure that restores the starting sheet.
- [ ] The DM prompt describes resting; the DM can't grant a rest the engine refuses.
- [ ] Every shipped module still qualifies for both classes (survival can only rise; record the new numbers).
- [ ] Rules document updated (house rule for the limit).

**Blocked by:** T1.

### T3 — Long rests and interrupted rests

**What to build.** A long rest at a module-authored rest site only (D1), restoring HP, all hit dice and all feature uses. Each module may author a wandering encounter that can interrupt a rest: a seeded roll against an authored chance, the encounter fires at most once, and an interrupted rest gives nothing. The validator checks rest sites and the wandering encounter; the gate counts the wandering encounter's XP in the XP limit. Harness rest policy updated.

**Acceptance criteria**

- [ ] A long rest is refused away from an authored site and after the module's limit.
- [ ] An interrupted rest starts the authored fight; its XP counts once.
- [ ] Adventure format bumped; the gate reports rests taken and rests interrupted.
- [ ] Rules document updated.

**Blocked by:** T2.

### T4 — Cast spells from slots

**What to build.** A class-agnostic casting engine, exercised by a test-only caster (as `test-fighter-5e.ts` is):

- a spell data file (SRD 5.2): level, school, casting time (action, bonus action, reaction), effect kind, damage type, save ability, upcast rule;
- spell slots per class level from class data, spent per cast and recovered on a long rest (T1's recovery);
- cantrips with level scaling at 5;
- spell attack bonus and save DC (8 + proficiency + spellcasting ability);
- effect kinds: spell attack, save for half or none (a public save path in `encounter-5e.ts`, not tied to a condition), auto-hit (Magic Missile), healing;
- a Magic action in `TurnEconomy`, the 2024 one-slot-per-turn rule (a bonus-action spell and an action spell can't both spend slots), a `cast` tool with spell, slot level and target, and refusals the DM can't narrate around;
- casting out of a fight (healing only for now).

**Acceptance criteria**

- [ ] Engine tests for each effect kind, slot spending and refusal (no slot, unknown or unprepared spell, two levelled spells in a turn).
- [ ] Damage types meet existing resistances, immunities and Undead Fortitude (radiant bypasses it).
- [ ] Trace and session formats bumped; replay reproduces casts.
- [ ] `cast` marked in `PLAYED_ACTIONS`.

**Blocked by:** T1.

### T5 — Durations, concentration and reaction spells

**What to build.** Ongoing spell effects with durations (D9), concentration (one spell at a time; a Constitution save on damage, DC max(10, half the damage), capped at 30; ends at 0 HP for monsters, irrelevant for the character), and buff effects: bonus to attacks and saves (Bless), AC (Shield of Faith, Mage Armor). Reaction spells through the Uncanny Dodge reaction path, generalised: Shield (+5 AC until the start of the caster's next turn, offered when hit). The browser shows active effects and concentration.

**Acceptance criteria**

- [ ] Engine tests: concentration breaks on a failed save and when a second concentration spell is cast; durations end as D9 says.
- [ ] Shield can turn a hit into a miss and is offered only with a reaction and a slot.
- [ ] Rules document records the duration abstraction.

**Blocked by:** T4.

### T6 — Area spells hit several opponents

**What to build.** Abstract areas of effect as a maximum number of opponents per spell (D4), chosen by the caster; one damage roll, a save each. Update the "Rules that need positions" table.

**Acceptance criteria**

- [ ] Engine tests for multi-target save-for-half damage and the target cap.
- [ ] The DM tool takes a list of targets; more than the cap is refused.

**Blocked by:** T4.

### T7 — Create a level-1 Cleric (owner pause: kits and spell list)

**What to build.** SRD 5.2 Cleric level 1 as class data: d8, Wisdom and Charisma saves, light and medium armour and shields, simple weapons, Divine Order (Protector or Thaumaturge), cantrips and prepared spells chosen at creation and changed between adventures (D8). Spells from the approved list (D3), including Sacred Flame, Guidance (graded checks), Cure Wounds, Healing Word, Bless, Guiding Bolt, Shield of Faith, Inflict Wounds. Kits approved by the owner (D7). Creation in the browser offers Fighter, Rogue or Cleric and the spell choices; the sheet shows slots, prepared spells, save DC and attack bonus. `ClassId` widened; library format bumped.

**Acceptance criteria**

- [ ] Golden numbers for a level-1 Cleric of each Divine Order.
- [ ] Browser → API → storage: create a Cleric, cast in a fight, heal out of a fight, end the adventure; slots refresh between adventures.
- [ ] The DM prompt describes the Cleric's offered spells.
- [ ] The harness can play a Cleric (heals with spells before potions); gate reports it, not yet judged.

**Blocked by:** T5.

### T8 — Create a level-1 Wizard (owner pause: kits and spell list)

**What to build.** SRD 5.2 Wizard level 1: d6, Intelligence and Wisdom saves, no armour training, simple weapons, a spellbook of six level-1 spells, prepared spells (D8), Ritual Adept recorded as omitted, Arcane Recovery on a short rest. Spells from the approved list, including Fire Bolt, Ray of Frost, Shocking Grasp, Magic Missile, Shield, Mage Armor, Sleep and Burning Hands. Sleep needs Incapacitated and Unconscious (attacks against have advantage and hit critically, as paralysed already does; damage wakes it). Kits approved by the owner (D7). Browser creation and sheet as for the Cleric, plus the spellbook.

**Acceptance criteria**

- [ ] Engine tests for Sleep's two-step save, waking on damage, and immunity for creatures immune to exhaustion. SRD 5.2 gives Zombie and Skeleton exhaustion immunity, but the bestiary records only poisoned for its three undead, so the bestiary gains it (bestiary format bumped).
- [ ] Arcane Recovery regains slots totalling half the Wizard level (rounded up), once per long rest, only on a short rest.
- [ ] Browser → API → storage journey as for the Cleric.
- [ ] The harness can play a Wizard (casts Mage Armor at the start); gate reports it, not yet judged.

**Blocked by:** T2, T5, T6.

### T9 — Cleric levels 2–3: Channel Divinity and the Life Domain

**What to build.** Channel Divinity (uses by level, one regained on a short rest, all on a long rest): Divine Spark and Turn Undead. Turn Undead needs Frightened and the combatant's creature type; turned undead act as D13 says. Life Domain at 3: Disciple of Life, Preserve Life, domain spells. 2nd-level slots and spells from the approved list (for example Aid, Lesser Restoration, Spiritual Weapon, Hold Person). Level-up card offers new spell choices with explanations (#319 style).

**Acceptance criteria**

- [ ] Engine tests for Turn Undead against Zombie, Skeleton and Ghoul, and its end on damage.
- [ ] Engine tests for Disciple of Life's bonus healing and Preserve Life.
- [ ] Golden numbers for levels 2–3.

**Blocked by:** T7, T2.

### T10 — Cleric levels 4–5: ASI and Sear Undead

**What to build.** Level-4 ASI through the existing pending-choice flow (#286), Sear Undead at 5 (Turn Undead deals radiant damage), 3rd-level slots and spells from the approved list (for example Spirit Guardians, Mass Healing Word cut as single-character). Cantrip scaling at 5.

**Acceptance criteria**

- [ ] Golden numbers for levels 4–5; a level-4 Cleric can't start an adventure until the ASI is chosen.
- [ ] Engine tests for Sear Undead and each new spell.

**Blocked by:** T9, T6.

### T11 — Wizard levels 2–3: Scholar and the Evoker

**What to build.** Scholar (Expertise in one of Arcana, History, Investigation, Medicine, Nature or Religion; add any missing skill where first used), two new spellbook spells per level, 2nd-level slots and spells (for example Scorching Ray, Hold Person, Shatter, Invisibility as hide-like advantage). Evoker at 3: Evocation Savant (recorded as flavour or omitted) and Potent Cantrip (half damage on a successful save for damaging cantrips).

**Acceptance criteria**

- [ ] Golden numbers for levels 2–3; level-up card offers the two new spells.
- [ ] Engine tests for Potent Cantrip and each new spell.

**Blocked by:** T8.

### T12 — Wizard levels 4–5: ASI and Memorize Spell

**What to build.** Level-4 ASI, Memorize Spell at 5 (swap one prepared spell on a short rest), 3rd-level slots and spells from the approved list (for example Fireball, Lightning Bolt).

**Acceptance criteria**

- [ ] Golden numbers for levels 4–5.
- [ ] Engine tests for Memorize Spell and each new spell.

**Blocked by:** T11, T3.

### T13 — Find +1 weapons, armour and shields

**What to build.** SRD 5.2 `+1` weapons (attack and damage), armour and shields (AC) as uncommon items with an equipment rarity and the magic-item budget rule (D10). Monster damage resistance to non-magical attacks is not in SRD 5.2's 2024 stat blocks, so magic matters only for its bonus. Shown on the sheet and in "You carry".

**Acceptance criteria**

- [ ] Engine tests for the bonus on attack, damage and AC.
- [ ] The validator enforces the budget rule and tier-by-level; the one-hit-kill check counts placed `+1` weapons.

**Blocked by:** T1 (only for sequencing; can start in parallel with T2).

### T14 — Find spell scrolls and wands

**What to build.** Spell scrolls (cast a spell on the reader's class list with no slot; the scroll is used up; a Wizard may copy a scroll's spell into the spellbook between adventures for the SRD cost), Wand of Magic Missiles (charges, regains charges on a long rest per D9's "dawn" reading). Usable from "You carry" and in a fight as the Magic action.

**Acceptance criteria**

- [ ] A Fighter or Rogue can't use a scroll; a Cleric can't use a Wizard scroll.
- [ ] Engine tests for charges, recovery and scroll copying.
- [ ] Treasure budget and tier rules apply.

**Blocked by:** T7, T8, T3.

### T15 — Speed up the gate for four classes

**What to build.** Keep the four-class gate inside the CPU cap and browser startup acceptable (D12). Candidates, in order: run each class's gate in a worker thread; reuse T1–T4's profile caching for spells; share seeded runs between the seeded and always-fail check passes where results can't differ. Gate reports stay hash-identical.

**Acceptance criteria**

- [ ] Before/after timings recorded; gate reports hash-identical for Fighter and Rogue.
- [ ] Browser startup with four classes within the owner's limit.

**Blocked by:** T7, T8.

### T16 — Judge casters in the gate

**What to build.** Caster harness policies (D5): `spend-early` (best slot first) and `conserve` (cantrips until HP falls below the heal threshold); the gate uses the weakest character with `conserve` for survival. The one-hit-kill check judges each caster's best repeatable attack (cantrip or weapon), reports levelled spells, and judges control spells by D5's measure. Career simulation runs per class; each must reach `CAREER_REQUIRED_LEVEL` (D14). Class lists stop being hard-coded where they still are.

**Acceptance criteria**

- [ ] Gate reports per class show survival, one-hit kill, control-spell chance and XP.
- [ ] Engine and harness tests for both policies.
- [ ] `GATE_CLASSES` has four classes behind a test that lists them.

**Blocked by:** T10, T12, T15, T3.

### T17 — Qualify the shipped modules for four classes (owner pause: each adaptation)

**What to build.** Run the four-class gate over all 14 shipped modules. Fix what fails with the smallest content change (a potion, a rest site, a weaker guard), each adaptation approved by the owner, as in #310. Undead-heavy modules check Turn Undead isn't a fight-ender against D5.

**Acceptance criteria**

- [ ] Every shipped module qualifies for every class at its declared difficulty.
- [ ] The career check passes for every class.
- [ ] CPU cap test passes.

**Blocked by:** T13, T14, T16.

### T18 — Release a magic module and write the increment 16 handoff (owner pause: module design)

**What to build.** A new hand-authored module that uses rests (a rest site and a wandering encounter), undead for Turn Undead, a spell scroll and a `+1` item, and gives casters and non-casters different routes. The owner approves premise, map, monsters, rest design and treasure before content is written. Player handoff in `docs/acceptance/increment-16-release.md`; plan and README updated.

**Acceptance criteria**

- [ ] Qualifies for all four classes at its declared difficulty.
- [ ] Handoff with automated, implementer and owner evidence, and one launch command for the manual scenarios.

**Blocked by:** T17.

### Dependency summary

| Ticket | Plan slice | Title                                            | Blocked by        |
| ------ | ---------- | ------------------------------------------------ | ----------------- |
| T1     | 16.1       | Track feature uses and hit dice as data          | None              |
| T2     | 16.1       | Take a short rest                                | T1                |
| T3     | 16.1       | Long rests and interrupted rests                 | T2                |
| T4     | 16.2       | Cast spells from slots                           | T1                |
| T5     | 16.2       | Durations, concentration and reaction spells     | T4                |
| T6     | 16.2       | Area spells hit several opponents                | T4                |
| T7     | 16.3       | Create a level-1 Cleric                          | T5                |
| T8     | 16.4       | Create a level-1 Wizard                          | T2, T5, T6        |
| T9     | 16.3       | Cleric levels 2–3: Channel Divinity, Life Domain | T7, T2            |
| T10    | 16.3       | Cleric levels 4–5: ASI and Sear Undead           | T9, T6            |
| T11    | 16.4       | Wizard levels 2–3: Scholar and the Evoker        | T8                |
| T12    | 16.4       | Wizard levels 4–5: ASI and Memorize Spell        | T11, T3           |
| T13    | 16.5       | Find +1 weapons, armour and shields              | T1                |
| T14    | 16.5       | Find spell scrolls and wands                     | T7, T8, T3        |
| T15    | 16.6       | Speed up the gate for four classes               | T7, T8            |
| T16    | 16.6       | Judge casters in the gate                        | T10, T12, T15, T3 |
| T17    | 16.6       | Qualify the shipped modules for four classes     | T13, T14, T16     |
| T18    | 16.6       | Release a magic module and write the handoff     | T17               |

T1 starts alone. After T1: T2, T4 and T13 in parallel. After T4: T5 and T6. The Cleric (T7→T9→T10) and Wizard (T8→T11→T12) chains then run in parallel.

If 18 tickets is too many for one increment, the cleanest cut is T10 and T12 (levels 4–5 for casters) into an increment 16b; the career check would then stop at level 3 for casters.

## 3. Owner decisions

The owner accepted every recommendation below on 9 October 2026; they are recorded in the plan's section 10 and repeated in each issue.

| #   | Decision                             | Recommendation                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Rest limits and cost without a clock | Short rests anywhere cleared, at most **two per adventure** (the 5e adventuring-day assumption). Long rests only at a **module-authored site, at most one**. Any rest can be interrupted by the module's authored wandering encounter (seeded chance, fires once). A module with no wandering encounter can't interrupt.               |
| D2  | Hit dice on a long rest              | SRD 5.2: regain all. Between adventures everything still refreshes.                                                                                                                                                                                                                                                                    |
| D3  | Spell list                           | A curated SRD 5.2 list, about 4 cantrips and 6–8 spells per class per spell level 1–3, only spells that work without positions or time. The ticket for each class pauses for approval of its list, as kits did for #306.                                                                                                               |
| D4  | Areas of effect                      | Each area spell declares a maximum number of opponents, set by a documented heuristic (cone: length ÷ 10; sphere or emanation: radius ÷ 5; line: length ÷ 30; minimum 1), caster's choice of targets. That gives Burning Hands 2, Sleep 1, Shatter 2, Fireball 4, Spirit Guardians 3. Alternative: every opponent.                     |
| D5  | "Too easy" for casters               | Judge the best repeatable attack (cantrip or weapon) against the existing one-hit-kill caps; report levelled damage spells, as the Rogue's Sneak Attack is reported. Judge control spells (Sleep, Hold Person, Turn Undead): the chance one cast at the opening takes an ordinary enemy out of the fight must stay under the same cap. |
| D6  | Ranged spell attacks in melee        | Keep the existing rule (disadvantage from round 2). It is SRD-faithful, and Shocking Grasp and Shield become real choices. Flag: it may push Wizard survival below Hard on some modules.                                                                                                                                               |
| D7  | Starting kits                        | Follow the stingy-kit rule: common tier, no coin, equal value within each class within 3 gp. Cleric: leather and a mace, or leather, shield and a club (if within tolerance). Wizard: quarterstaff, or two daggers, plus a spellbook. Owner approves in T7/T8.                                                                         |
| D8  | When spells are prepared             | Between adventures in the library only, for this increment. Memorize Spell (T12) is the one in-adventure change.                                                                                                                                                                                                                       |
| D9  | Durations without time               | Up to 1 minute: ends when the fight ends. 10 minutes to 1 hour: ends at the next rest. 8 hours or "until dawn": ends at a long rest or the adventure's end. Mage Armor cast at the start therefore lasts the adventure unless the character long-rests.                                                                                |
| D10 | Magic items and the treasure budget  | Pricing magic items at SRD 5.2's rarity values doesn't fit levels 1–3 (one uncommon item exceeds the whole budget). Instead: **at most one uncommon permanent item per module, only at level 3+, outside the gp budget**; scrolls and potions priced at fixed values inside it. Merchants don't sell magic items in this increment.    |
| D11 | Attunement                           | Skip it: ship no item that needs attunement in this increment.                                                                                                                                                                                                                                                                         |
| D12 | Gate cost with four classes          | Do T15 before raising the cap. If it can't hold 90 s, owner chooses a new cap; browser startup target under 40 s.                                                                                                                                                                                                                      |
| D13 | Turned undead without positions      | Turned undead can't act or attack until damaged or the minute ends. If every remaining opponent is turned, the character may leave the room or attack them (which ends the turn on that one).                                                                                                                                          |
| D14 | Career check per class               | Each class's weakest character with its default kit must have some career reach level 5, like the Fighter.                                                                                                                                                                                                                             |

Open decisions 7 (companions) and 9 (level cap after 5) are not affected.

## Publication index

| Issue                                                     | Ticket | Title                                            | Blocked by             |
| --------------------------------------------------------- | ------ | ------------------------------------------------ | ---------------------- |
| [#333](https://github.com/barnabyg/dungeonOne/issues/333) | T1     | Track feature uses and hit dice as data          | None                   |
| [#334](https://github.com/barnabyg/dungeonOne/issues/334) | T2     | Take a short rest                                | #333                   |
| [#335](https://github.com/barnabyg/dungeonOne/issues/335) | T3     | Long rests and interrupted rests                 | #334                   |
| [#336](https://github.com/barnabyg/dungeonOne/issues/336) | T4     | Cast spells from slots                           | #333                   |
| [#337](https://github.com/barnabyg/dungeonOne/issues/337) | T5     | Durations, concentration and reaction spells     | #336                   |
| [#338](https://github.com/barnabyg/dungeonOne/issues/338) | T6     | Area spells hit several opponents                | #336                   |
| [#339](https://github.com/barnabyg/dungeonOne/issues/339) | T7     | Create a level-1 Cleric                          | #337                   |
| [#340](https://github.com/barnabyg/dungeonOne/issues/340) | T8     | Create a level-1 Wizard                          | #334, #337, #338       |
| [#341](https://github.com/barnabyg/dungeonOne/issues/341) | T9     | Cleric levels 2–3: Channel Divinity, Life Domain | #339, #334             |
| [#342](https://github.com/barnabyg/dungeonOne/issues/342) | T10    | Cleric levels 4–5: ASI and Sear Undead           | #341, #338             |
| [#343](https://github.com/barnabyg/dungeonOne/issues/343) | T11    | Wizard levels 2–3: Scholar and the Evoker        | #340                   |
| [#344](https://github.com/barnabyg/dungeonOne/issues/344) | T12    | Wizard levels 4–5: ASI and Memorize Spell        | #343, #335             |
| [#345](https://github.com/barnabyg/dungeonOne/issues/345) | T13    | Find +1 weapons, armour and shields              | #333                   |
| [#346](https://github.com/barnabyg/dungeonOne/issues/346) | T14    | Find spell scrolls and wands                     | #339, #340, #335       |
| [#347](https://github.com/barnabyg/dungeonOne/issues/347) | T15    | Speed up the gate for four classes               | #339, #340             |
| [#348](https://github.com/barnabyg/dungeonOne/issues/348) | T16    | Judge casters in the gate                        | #342, #344, #347, #335 |
| [#349](https://github.com/barnabyg/dungeonOne/issues/349) | T17    | Qualify the shipped modules for four classes     | #345, #346, #348       |
| [#350](https://github.com/barnabyg/dungeonOne/issues/350) | T18    | Release a magic module and write the handoff     | #349                   |
