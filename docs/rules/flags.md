# Flags and wandering encounters

## Flags

A module may declare **flags**: named facts about the session, such as "the
portcullis is raised", that only ever turn on (a door that opens and later shuts
is two flags).

- **Who sets them.** The engine alone sets a flag, from what the character does:
  a feature examined (`sets` on the feature, whatever its check's band), an item
  taken or given (`sets` on the item), a room first entered (`sets` on the room;
  the start room's is set as the adventure begins), an encounter's outcome
  (`sets` on the encounter: `won`, `bypassed`, `peaceful` or `fled`), or a
  check's band (a `set` effect). Setting a flag again changes nothing. No DM
  tool takes a flag, so a player asking for one changes nothing.
- **Passages.** A passage may be open only once a flag is set (`openWhen`) or
  closed once one is (`closeWhen`), anywhere in the module: a lever in one room
  raises a portcullis in another. A way a flag keeps shut or has closed is
  refused like a band-closed one, its door and trap gone while it is closed.
- **Sure flags.** Reachability counts only flags set **for sure**
  (`sureFlagSetters` in `src/adventure-5e.ts`). A room sets a flag for sure by:
  entering it; examining a feature, by its own `sets` or a flag every band of
  its check sets; taking an item in plain sight or hidden in an unchecked
  feature of the room (not one a band may never reveal, nor one an opponent
  carries); or ending its fight, by its `won` flag, and for an encounter with a
  reaction only if `peaceful` sets the same flag. A fight flags place counts
  only where it surely is. A flag only some bands of a check set is never sure.
- The flags set are part of the session's state, in the order set, so a reload
  replays them.

### Encounters that appear, vanish or move

- An encounter may be in its room only once a flag is set (`presentWhile`), only
  until one is (`presentUntil`), or in another room once one is (`movesTo`:
  `{ "roomId", "when" }`); at most one of the three.
- Only an encounter not yet met goes where the flags place it. Once the
  character has sneaked up on it, been lain in wait for, met its reaction,
  fought it, slipped past it or fled it, it stays where it was met
  (`metEncounters`).
- A moved encounter keeps everything else, and what its opponents carry goes
  with it.
- When a flag places an unmet fight in the character's own room, its opponents
  come in and the fight begins as one walked into would, after a reaction roll
  if it reacts, with no one lying in wait and no one surprised. Nothing comes in
  while a fight is under way there, while the character waits unseen, or while
  opponents react to it.
- The encounter whose fight wins the adventure, and the wandering encounter,
  never appear, vanish or move. No room may hold two encounters, whatever their
  flags.
- Reachability counts a placed fight only where it is sure to be met: one that
  moves once its new room is reached and either its flag is set for sure or its
  own room is reached too; one that appears once its room is reached and its
  flag is set for sure; one that vanishes never. When an essential room or every
  exit lies behind a flag only such a fight sets, the validator names the
  encounter.

### Alarms

A module may declare an **alarm** (`alarm`: `{ "flag", "text", "fights"? }`):
one of its flags, which only **noise** sets. Nothing else may set it: no `sets`,
`set` effect or use.

- **Noise** is: a sneak into a fight that fails by 5 or more; a fight in one of
  the alarm's `fights` regions (each `{ "region", "round" }`, round 1–10) that
  goes on past that round, the wandering encounter's included; a check that
  lands in a band marked `"noisy": true`; or an opponent that flees a fight and
  survives it, counted when the fight is won or the character leaves it.
- The engine raises the alarm once, at the first noise, and records what raised
  it (`alarm` in the session's state); later noise changes nothing, and noise
  from the action that ends the adventure raises nothing. The result's `alarm`
  event is what a rule answering the alarm reads.
- What the alarm changes is authored with flag conditions, as for any flag. The
  module's `text` is told once, in the result that raises the alarm; from then
  on the room panel shows "The alarm is raised." in every room, and the AI DM's
  scene keeps the module's words.
- Reachability never counts the alarm as set: a way only it opens is never
  counted on, and a passage it closes can't be the only way to an essential room
  or every exit.

### Features and topics that change with flags

- A feature may have another description while a flag is set (`changed`:
  `{ "when", "description" }`). Its discovery and check are unchanged.
- A creature's topic may be offered only once a flag is set (`offeredWhile`),
  only until one is (`offeredUntil`), or both. A topic not offered can't be
  asked. One already asked and since withdrawn keeps what the creature said, but
  can't be asked or retried.
- A surrendered opponent hands over what it carries only through a topic's
  `gives`, so such a topic can't be withdrawn and may wait only on a flag set
  for sure.
- Reachability counts a topic's check only once it is surely offered: never one
  that can be withdrawn, and one that waits on a flag only once that flag is set
  for sure.

## Wandering encounter tables

A region may have a wandering encounter table (`wandering`:
`{ "chance", "every"?, "entries" }`): a chance from 1 to 100, and 1 to 6
entries, each an **omen** (`{ "omen" }`, words only) or a wandering encounter
(`{ "encounterId", "omen" }`, an encounter in no room, with the words it becomes
once it has come).

- **When it rolls.** A d100 from the session's seeded stream: every `every`
  moves (1–20) within the region (without `every`, moves never roll); before
  each short or long rest in the region; and when the alarm is raised, with the
  table of the region the character is in.
- **What comes.** At the chance or less an entry comes, and the same d100 picks
  it: the entries share the chance equally in order, so the chance must be at
  least the number of entries.
- **The wandering encounters [setting](settings.md).** Normal (the default)
  rolls as above. Double doubles each table's chance, up to 100, and the entries
  share the doubled chance. Off rolls nothing: no omens and no wandering
  encounters, on moves, rests or the alarm; the alarm's other effects still
  apply.
- A wandering encounter begins its fight where the character is. Its opponents
  carry nothing and never surrender; losing its fight ends the adventure in its
  defeat ending. It **comes at most once** (`wanderersCome`, even if fled) and
  is then its omen. An omen changes nothing and may come again.
- On a rest, a fight that comes interrupts it: the rest restores nothing and
  isn't counted. An omen, or nothing, lets the rest go on.
- A move whose roll falls due but that meets a fight (or a foe unseen or
  reacting, or a Tactical Mind offer) loses that roll. The alarm's roll waits
  instead: raised in a fight, it is rolled once the character is out of it, with
  the table of the region where it was raised (`wanderingDue`).
- Wandering encounters count against a module's encounters, at most
  `MAX_ENCOUNTERS = 30`.
