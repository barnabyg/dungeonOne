# Bestiary

The bestiary (`adventures/5e/bestiary.json`, `src/bestiary-5e.ts`) holds the
monsters modules name by id. Each has a default description, a `levelBand` (the
character levels it suits), a `treasureType` (see
[Monster loot](treasure.md#monster-loot)) and a stat block with its XP and
`morale`: a DC from 1 to 30, or `"never"`, which every Undead has (see
[Morale](talk-and-stealth.md#morale-and-surrender)). A stat block may list
`traits` (Pack Tactics, Undead Fortitude, Nimble Escape, Rampage), `multiattack`
(2–4 attacks a turn), a `stealth` bonus, `saveProficiencies`, damage
resistances, vulnerabilities and immunities, and `conditionImmunities`
(poisoned, prone, paralysed, or exhaustion, which only makes it succeed on
Sleep's saves). An attack may have a `rider`: extra damage and a condition
(poisoned, prone or paralysed) with an optional save; poisoned and paralysed
last 1–10 turns and may repeat the save. A monster without Multiattack uses only
its first attack.

The Giant Spider's poison and the knockdowns of the Wolf, Mastiff, Dire Wolf and
Brown Bear are derived house riders: SRD 5.2's numbers differ, and its
knockdowns land on any hit with no save, which would cost a prone character a
turn on nearly every hit. SRD 5.2 has no kobold or gnoll, so the Kobold and the
Gnoll Ravager are house stat blocks with their own numbers and wording, not SRD
content.

| Monster (id)                            | Source               | CR (XP)   | Levels | Attacks used                       | Traits                      |
| --------------------------------------- | -------------------- | --------- | ------ | ---------------------------------- | --------------------------- |
| Giant Rat (`giant-rat`)                 | SRD 5.2              | 1/8 (25)  | 1      | Bite                               | Pack Tactics                |
| Goblin Minion (`goblin-minion`)         | SRD 5.2              | 1/8 (25)  | 1      | Dagger                             | Nimble Escape               |
| Kobold (`kobold`)                       | House                | 1/8 (25)  | 1      | Spike                              | Nimble Escape, Pack Tactics |
| Bandit (`bandit`)                       | SRD 5.2              | 1/8 (25)  | 1–2    | Scimitar                           |                             |
| Mastiff (`mastiff`)                     | SRD 5.2, house rider | 1/8 (25)  | 1–2    | Bite                               |                             |
| Goblin Warrior (`goblin-warrior`)       | SRD 5.2              | 1/4 (50)  | 1–2    | Scimitar                           | Nimble Escape               |
| Zombie (`zombie`)                       | SRD 5.2              | 1/4 (50)  | 1–2    | Slam                               | Undead Fortitude            |
| Skeleton (`skeleton`)                   | SRD 5.2              | 1/4 (50)  | 1–2    | Shortsword                         |                             |
| Wolf (`wolf`)                           | SRD 5.2, house rider | 1/4 (50)  | 2–3    | Bite                               | Pack Tactics                |
| Hobgoblin Warrior (`hobgoblin-warrior`) | SRD 5.2              | 1/2 (100) | 2–3    | Longsword                          | Pack Tactics                |
| Goblin Boss (`goblin-boss`)             | SRD 5.2              | 1 (200)   | 2–3    | Scimitar, one a turn               | Nimble Escape               |
| Ghoul (`ghoul`)                         | SRD 5.2              | 1 (200)   | 2–3    | Claw                               |                             |
| Bugbear Warrior (`bugbear-warrior`)     | SRD 5.2              | 1 (200)   | 2–3    | Light Hammer                       |                             |
| Giant Spider (`giant-spider`)           | SRD 5.2, house rider | 1 (200)   | 3–4    | Bite                               |                             |
| Gnoll Ravager (`gnoll`)                 | House                | 1 (200)   | 3–4    | Multiattack: two of Spear and Bite | Rampage                     |
| Ogre (`ogre`)                           | SRD 5.2              | 2 (450)   | 4–5    | Greatclub                          |                             |
| Dire Wolf (`dire-wolf`)                 | SRD 5.2, house rider | 1 (200)   | 3–5    | Bite                               | Pack Tactics                |
| Brown Bear (`brown-bear`)               | SRD 5.2, house rider | 1 (200)   | 3–5    | Multiattack: two of Bite and Claw  |                             |
| Bandit Captain (`bandit-captain`)       | SRD 5.2              | 2 (450)   | 4–5    | Multiattack: two Scimitar          |                             |
| Owlbear (`owlbear`)                     | SRD 5.2              | 3 (700)   | 5      | Multiattack: two Rend              |                             |
| Warrior Veteran (`warrior-veteran`)     | SRD 5.2              | 3 (700)   | 5      | Multiattack: two Greatsword        |                             |

SRD 5.2 monsters left out because their blocks need what the engine lacks: the
Hobgoblin Captain (a 10-foot aura), the Minotaur of Baphomet (10-foot reach and
a charge) and the Wight (Life Drain lowers maximum hit points, and it raises
zombies).

Left out of the stat blocks, so the engine never meets them:

- the Ghoul's Multiattack and its Bite's necrotic damage; it fights with its
  paralysing Claw;
- the Goblin Boss's Multiattack (two attacks made it far deadlier than its CR
  suggests);
- every reaction: the Goblin Boss's Redirect Attack, and the Bandit Captain's
  and Warrior Veteran's Parry;
- ranged attacks: the Hobgoblin Warrior's Longbow, the Bugbear Warrior's thrown
  Light Hammer, the Ogre's Javelin, the Bandit Captain's Pistol and the Warrior
  Veteran's Heavy Crossbow;
- the Bugbear Warrior's Grab, Abduct and 10-foot reach (no grappling, no
  positions);
- the Kobold's Sunlight Sensitivity (no light), and the Gnoll Ravager's Rampage
  move;
- the Brown Bear's fixed Bite and Claw: a die picks each of its two attacks, so
  it may bite or claw twice;
- every monster's skills, senses, languages, speed and gear.

The SRD 5.2 stat blocks are from the System Reference Document 5.2 by Wizards of
the Coast LLC, licensed under CC-BY-4.0
(https://creativecommons.org/licenses/by/4.0/legalcode).
