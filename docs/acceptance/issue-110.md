# Issue 110: one Examine action in Hollow Beacon v13

Checked on 3 October 2026 on `feat/issue-110-examine`, in the browser's default
character mode.

## Change

New Hollow Beacon character adventures start **v13**
(`adventures/hollow-beacon-examine.json`). Its release tuple is
`hollow-beacon` 13, `character-adventure-rules-v2`, schema 17, engine
`character-adventure-engine-v1`. The schema is unchanged. Only the rules
version is new, because the mechanics change.

- **One action.** v13 offers `examine` in place of `inspect` and `search`. If
  the target is one the engine's search would currently accept (it is visible,
  the player is not in combat, and the search would record something new), the
  engine runs that search and records the discovery in the same turn.
  Otherwise it returns the inspect description. Examine is a mutation tool, so
  the one-mutation-per-turn limit applies to it. Dice, time and results stay
  engine-owned, as before.
- **AI contract.** v13 uses `character-adventure-dm-v3` and
  `character-adventure-tools-v3`. The tool description and the system prompt
  say that a request to look at, look over, read, study, search, inspect or
  examine one visible thing means examine. A v13 runtime refuses `inspect` and
  `search` calls, and a v12 runtime refuses `examine`.
- **Browser.** Each feature, exit, item, set of remains and carried item has
  one **Examine** option in v13. In combat, the blocked-route label and the
  travel notice say "examine". The Beacon Tower lead says "Examine the fixed
  tower work order…". In the v13 content, player-facing text that told the
  player to inspect or search now says examine. Ids are unchanged.
- **Typed commands (CLI).** In v13, `examine`, `inspect` and `search` all parse
  to one `examine` action. It tries the search first; a refused or empty search
  draws no dice and changes nothing, and the action then describes.
- **Saves and traces.** An AI examine that searched is saved as the engine's
  own `search` action. A typed examine is saved as `examine`. Both emit the
  `search-performed` domain event and reload exactly. Command and AI traces
  under v13 replay.
- **Releases.** v12 no longer starts new adventures, but its row stays in
  `src/browser-releases.ts`, so v12 saves continue with Inspect and Search under
  their original rules. Nothing is migrated. Stonebridge v1 is unchanged.

## Scripted evidence

`tests/issue-110.test.mjs`:

- v13 loads with the new tuple. v12 keeps `character-adventure-rules-v1`.
- v13 offers `examine` and neither `inspect` nor `search`. v12 is the reverse.
- Examining the setting plate records `altered-setting` in one call. Examining
  it again only describes and changes nothing. An exit only describes, and a
  feature in another room is refused without a change.
- The peaceful journey commits the plate, the wagon ruts, the work order and
  the warning board through `examine`, then wins.
- Typed `examine`, `inspect` and `search` are one action in v13. v12 keeps
  `inspect` and `search` and does not know `examine`.
- The browser offers a single **Examine** option for the plate in v13, and
  **Inspect** and **Search** in v12.
- The release policy starts v13 rather than v12, and both continue.
- AI examine, typed examine and v12 AI search commits survive a save reload,
  with `search-performed`.
- The typed request "Look the setting plate over carefully." commits the
  discovery in one `runDmTurn`. The model saw only `examine`, and its AI trace
  replays. A v13 command trace with typed examine replays.
- Through the HTTP server, a v12 library session continues. It offers Inspect
  and Search; Inspect changes nothing and Search records the discovery.

The shared #94 journey (`tests/fixtures/issue-94-journey.mjs`) now plays v13.
The plate, work-order and board steps (“Look the setting plate over
carefully.”, “Read through the tower work order.”, “Study the final warning
board.”) expect `examine`. The real-browser #94 journey, the
`character-journey-browser` career journey, the issue-93 completion journey and
the scripted AI-trace journey all pass on v13.

## Live check

`scripts/qualify-examine-live.mjs` plays the #94 journey without provider
calls, using the scripted interpreter, and saves a copy of the library just
before the plate, the work order and the warning board. Each trial then runs
once on its own copy through the shipped HTTP server and save authority:

| Checkpoint | Request                                        | Trials |
| ---------- | ---------------------------------------------- | ------ |
| Plate      | Typed “Look the setting plate over carefully.” | 3      |
| Plate      | Click **Examine** on the setting plate         | 1      |
| Work order | Typed “Read through the tower work order.”     | 2      |
| Board      | Typed “Study the final warning board.”         | 2      |

A dry run (`--dry-run`, scripted provider) committed all 8 trials with the
expected `examine` call and discovery, using 16 scripted calls. The live run is
pending until a budget is agreed. The proposed hard cap is 24 provider calls.

## Limits

- Stonebridge v1 still has separate Inspect and Search. Changing it would need
  its own release.
- The CLI help text still lists `inspect` and `search`. In v13 both run
  Examine.
