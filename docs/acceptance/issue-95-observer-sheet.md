# Issue 95: session host sheet

This sheet is for whoever runs a blind player session (the project owner or a
helper). Players get only [the player sheet](issue-95-player-sheet.md). Don't
show them this sheet, the adventure JSON, the tests, the route fixtures or the
earlier acceptance documents.

## What counts

- **Unfamiliar player:** someone who hasn't played Dungeon One, read its
  content or watched someone else play it. The project owner's own play is
  recorded as owner feedback, not as one of the three.
- **Hints are allowed.** Record each **Hints** opening and each **Request a
  stronger hint** separately.
- **Story coaching is not allowed.** Telling a player what to do, where to go,
  what to examine or which ending to pick is coaching. If you coach, write down
  exactly what you said. That run then doesn't count toward "finished without
  story coaching". Help with setup, the launcher, Ctrl+C or a browser problem
  isn't coaching; record it as technical help.
- **Pace:** let players play at their own speed. Don't hurry them and don't pad
  the session. Record the actual time spent playing, without set-up time.

## Preparing a session

Use a clean checkout of the commit you are testing:

```powershell
git clone https://github.com/barnabyg/dungeonOne.git dungeonOne-playtest
Set-Location dungeonOne-playtest
git switch --detach <branch-or-commit under test>
npm.cmd ci
npm.cmd run build
$env:OPENAI_API_KEY = "<key>"
npm.cmd run browser -- --seed 0 --characters .\.scratch\increment-8-player-01\characters.json
```

Players 02 and 03 use `--seed 1` with `increment-8-player-02` and `--seed 2`
with `increment-8-player-03`. Each player has a separate library, so no player
sees another player's character or journeys.

A remote player can share their screen while you watch. Alternatively, they
can run the steps on the player sheet themselves and then send you their
`.scratch\increment-8-player-NN` folder.

## During the session

Note the start and end times, every break (Ctrl+C and rerun), and anything the
player says out loud. Copy any confusing input and the response to it
**word for word**. That matters more than anything else in these notes.

The browser's own data covers the rest. After the session, the player's folder
holds:

- `characters.json`: the character sheet, level and XP.
- `character-adventures\<id>.json`: the adventure, its full conversation and
  result cards, and the seed.

Neither file contains the API key. The adventure file includes the player's
own messages. Keep these files private, and anonymise any quotes before you
add them to the repository.

## Recording a session

Copy this block into `docs/acceptance/issue-95-sessions/player-NN.md`. Write it
in your own words, and use the player number, never the player's name. Or
paste your notes into the chat and the implementation agent writes it up.

```markdown
# Player NN

- Date / commit:
- Played: <minutes of play> over <n> sittings
- Content / model / seed: hollow-beacon v14 / gpt-5.6-luna / <seed>
- Character: preset <Balanced|Stout|Scout>; before L1 0 XP; after L<n> <xp> XP
- Save and continue: <Ctrl+C + rerun count; did it resume correctly?>
- Hints: <n> ordinary, <n> stronger (what prompted each)
- Story coaching: none | <exact words>
- Technical help: none | <what>
- Path: <rough route in the player's own terms>
- Ending: <ending | defeat | abandoned | stopped>, on time or late
- Would choose another adventure like this: yes | no | unsure — "<their words>"

## Confusing moments (verbatim)

| #   | Player typed / clicked | Game replied (text or card) | What they expected |
| --- | ---------------------- | --------------------------- | ------------------ |

## Contradictions

<narration vs cards/journal/sheet; NPC or place facts that disagreed>

## Fun, UI and UX notes

<what they enjoyed, what dragged, what they skipped, what they looked for and
couldn't find>
```

## After each session

Send the record (or the raw notes) to the implementation agent. Each problem
gets a specific fix, and the affected route is played again before the next
player. A fix doesn't count until it has been rechecked.
