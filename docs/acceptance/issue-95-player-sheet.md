# Dungeon One: player sheet

You are playing **Hollow Beacon**, a short solo fantasy adventure for a level-1
Fighter. An AI Dungeon Master narrates in your browser, and a rules engine
decides dice, time, damage and results. Play the way you want to. There is no
right way to play and no time limit. We want your honest reactions: what was
fun, what was dull, and what confused you.

Please don't read the files in `adventures/`, `tests/` or `docs/` before
playing. They give away the story.

## Before you start

You need Windows with PowerShell 7, Node 24.x, a desktop browser and an internet
connection. The person running the session gives you a checkout and an
`OPENAI_API_KEY`. Each player has their own number (`01`, `02`, `03`) and
seed, so check yours in the table below.

| Player | Seed | Character library                                  |
| ------ | ---- | -------------------------------------------------- |
| 01     | 0    | `.\.scratch\increment-8-player-01\characters.json` |
| 02     | 1    | `.\.scratch\increment-8-player-02\characters.json` |
| 03     | 2    | `.\.scratch\increment-8-player-03\characters.json` |

Set up once, from the checkout folder:

```powershell
npm.cmd ci
npm.cmd run build
$env:OPENAI_API_KEY = "<key from the session host>"
```

Start the game (player 01 shown; use your own seed and library):

```powershell
npm.cmd run browser -- --seed 0 --characters .\.scratch\increment-8-player-01\characters.json
```

The launcher prints a `http://127.0.0.1:<port>` address and usually opens it.
If it doesn't, open the address yourself. Keep the PowerShell window open while
you play.

## Making your character

1. Select **Adventures** at the top of the page. The first time, the form for
   a new character opens straight away.
2. Type a name and pick a preset (**Balanced**, **Stout** or **Scout**). A
   preset sets your six ability scores; the preview shows them with HP, armour
   class and attack. Select **Save character**. You get a level-1 Fighter with
   0 XP.
3. Your new character is selected, with **Hollow Beacon** and its recommended
   levels (1–2) listed below. Select **Start Hollow Beacon…**. The story
   begins in the conversation.

## Playing

- Type what your character does or says in ordinary language, then press
  Enter. One action per message works best. You can also ask the Dungeon
  Master a question.
- You can also click people, places and things in the scene to see options for
  them.
- Wait for each reply to finish and for the message box to come back before
  you send the next message.
- **Character sheet**, **Inventory**, **Journal** and **Hints** open side panels.
  Opening them costs no game time and doesn't involve the AI. **Hints** gives a
  gentle nudge, and **Request a stronger hint** gives a firmer one. Use them
  whenever you like; the session host notes when you do.
- Cards titled **Resolved action** (and similar) are the game's official
  record of what happened. If the narration ever disagrees with a card, the
  card is right. Please tell us when that happens.
- Your character can die. A defeated character can't start another adventure,
  so you would need to create a new character to play again.

## Taking a break

You can stop at any time once a reply has finished and the message box is
enabled. Press **Ctrl+C** in the PowerShell window. Later, run **exactly the
same command** again and open the new address. Your adventure continues where
you left off. There is no separate "load game" step.

## The ending

When your adventure ends, you see the outcome, any XP earned, and possibly a
level-up. The game then switches to **Review**: you can still read everything,
but you can't take more actions. Restarting the launcher brings Review back,
and the XP isn't awarded twice.

## Starting over (only if you want to)

Open **Adventures** and select your character:

- **After an ending:** select **Rest between adventures**, then start again.
- **In the middle of an adventure:** select **Abandon adventure** and confirm.
  Your earlier journey stays listed under **Saved adventures**. Then select
  **Rest between adventures** and start again.

## If something goes wrong

- **The game says no action was committed:** nothing happened. Send your
  message again.
- **The game says your action was saved but the reply failed:** don't repeat
  it. Reload the page to see the result.
- **Anything else:** tell the session host what you typed and what you saw.

## Afterwards

The session host asks a few short questions. One of them is whether you would
choose to play another adventure like this one, so think about your honest
answer.
