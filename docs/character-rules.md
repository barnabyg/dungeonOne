# Fighter rules, version 1

These are Dungeon One house rules inspired by early D&D. They retain ascending armor class and d20 attacks; they do not claim fidelity to a published edition. One Fighter plays at levels 1–3.

Scores use these modifiers: 3 = −3, 4–5 = −2, 6–8 = −1, 9–12 = 0, 13–15 = +1, 16–17 = +2, 18 = +3. Three balanced-total presets favor general play, strength/endurance, or agility/awareness. Scores remain fixed throughout a career.

All Fighters carry chain mail, a shield, and a longsword. Armor class is 16 plus Dexterity, with positive Dexterity capped at +1 by chain mail. Initiative uses Dexterity. Melee attack bonus is level + 1 + Strength. Longsword damage is 1d8 + Strength, with a minimum of 1 on a hit; critical hits roll two dice. Strength is applied once. Maximum HP is 18 + Constitution at level 1; each later level adds 8 + Constitution.

An authored check names one of the six abilities and adds that score's modifier to a d20. Difficulties and circumstances belong to the module. Optional checks never guard the only essential clue.

Level 2 starts at 1,000 XP; level 3 at 2,500 XP. XP above 2,500 remains recorded, while level 3 is the supported cap. Adventure XP is pending until surviving completion. Rewards have stable identities and are earned once per character across plays and module revisions. Level changes and permanent career rewards are accepted together after verified completion. Failure, abandonment, and defeat discard pending XP. Defeated characters cannot start another adventure.

Completion preserves remaining HP. An explicit between-adventure rest restores HP and clears transient adventure conditions before another start. Permanent equipment carries; quest items, discoveries, relationships, clocks, and remembered checks belong to their adventure. One character may have one active session. A frozen starting sheet, independent library revision, and accepted completion receipt protect replay and prevent competing careers.

# Fighter rules, version 2

Version 2 adds one way to make a Fighter: **roll abilities (3d6 in order)**. The engine rolls three d6 for each ability in order, Strength first and Charisma last, from a stream seeded by the browser's startup seed. The player sees every die before saving. The player may reroll the whole set as often as they like, but cannot reroll a single ability, keep part of a set, or rearrange scores. A set can make a Fighter only if it meets the Fighter minimums: Strength 9, Dexterity 9 and Constitution 7. A set below them must be rerolled.

The sheet records `rulesVersion: "fighter-rules-v2"` and the dice in `abilityRolls`, and each ability score must equal its three dice. Presets still make version 1 sheets, which never carry `abilityRolls`. Everything else in version 1 applies unchanged, so a module that declares `fighter-rules-v1` also accepts version 2 Fighters. The Strength and Dexterity minimums come from balance qualification: one band lower and survival in Hollow Beacon's level 1 fight falls below 80%. Constitution 7 is the traditional Fighter minimum. Balance alone would allow Constitution 4, and Constitution 3 fails. `tests/character-balance.test.mjs` qualifies every permitted modifier combination at each recommended level, with the other three abilities at 3, and checks that the excluded bands fail.

Builds that predate version 2 reject a version 2 sheet, so they cannot read a character library that contains a rolled character.
