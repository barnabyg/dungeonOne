# Gameplay UI redesign

The browser now prioritizes the current scene, available choices and the saved
story. Parchment reading surfaces, charcoal framing, amber accents and compact
target portraits establish the fantasy tone. Inventory, Character, Journal and
Hints open from the toolbar. Seed, session diagnostics, New game and Refresh
adventure live in Game menu. Normal successful turns use one Saved indicator;
failures and interrupted turns still explain whether an action committed.

Friendly NPC menus lead with conversation; duplicate no-check persuasion choices
are omitted while real claims and checks remain. Deliberate violence shows danger
styling and stakes. A persistent encounter panel shows opponent HP and whose turn
it is, with legal Attack, Cover and carried healing controls rebuilt from verified
state. During combat, routes explicitly offer inspection. Known dangerous Hollow
Beacon routes show their public arrival stakes before movement.

Journal separates Evidence and Leads, retaining observation, testimony and belief
attribution. Known world supplies are journal information, not carried inventory.
Carried items expose legal inspection, use and fitting actions. Character identifies
the supported Fighter and its combat profile without inventing equipment. Day and
the public deadline replace the misleading clock-cap fraction in scene text.

## Adventures and images

The renderer reads the adventure title, opening, current scene, character label
and optional deadline from presentation data. Its neutral fantasy dice motif has
no location or plot meaning. Optional PNG/JPEG/WebP packs select a location image
using the adventure ID, content version and current location ID; unavailable or
broken images fall back to the motif. Only the current image is projected. The
pack stays outside the immutable adventure and save formats and makes no model
calls. See README for the copyable `--artwork` command and manifest format.

This is a reusable presentation hook, not a new adventure loader or image generator.
The browser still supports Hollow Beacon v4-v11; command mode retains its existing
other-adventure support. A renderer contract fixture verifies a different title,
Ranger label, grotto scene and adventure without a deadline. It does not claim that
the browser can already run that fictitious adventure. Future generated artwork
should be cached during authoring and describe public, stable surroundings, without
introducing evidence or revealing undiscovered events.

Released content, rules, saves, histories, replay and the AI turn contract remain
unchanged. Existing player files are not replaced. Routine saved notices and
original result card titles remain in saved history even when display labels are
shortened or redundant success notices are suppressed.
Inline emphasis in narration, scene text and information panels appears as bold
text with a subtle amber highlight, or italics. Existing saved replies receive the
same styling without rewriting their text. HTML and links are not interpreted.

## Player checks

Prerequisites: Node.js 24.x, installed dependencies, Microsoft Edge or another
desktop browser, and a valid `OPENAI_API_KEY` in the launch environment. Gameplay
uses the live provider; opening information panels does not. From the repository
root, use a separate save path:

```powershell
npm.cmd run build
npm.cmd run browser -- --seed 0 --save .\ui-redesign-player-save.json
```

Open the printed `http://127.0.0.1:<available-port>` URL. New slots run **Hollow
Beacon: Final Warning**, version 11. Use an unused file for the following opening
checks. Do not replace an existing player save merely to repeat them.

1. Click **Start adventure**. Expect Watch Yard, an authored opening, Fighter HP
   20/20, Day 0 and the Day 3 caravan deadline with 3 days remaining. Expand **Read
   the scene** for the complete description and objective. The clock maximum 14
   must not appear as the caravan's deadline.
2. Select **Captain Iona**. The ordinary beacon/watch conversation comes first;
   the genuine safe-signal claim retains persuasion and its check stakes. Attack
   appears last with a danger treatment and its no-retreat warning. Close options
   or press Escape. Opening and closing options must spend no action or dice.
3. Open **Inventory**, **Character**, **Journal** and **Hints**. Expect carried
   items in Inventory, HP/AC/attack in Character, classified records in Evidence,
   and actionable leads in the Leads view. World supplies belong in Journal.
   Escape returns focus to the toolbar button. None of these reads spends time,
   changes inventory or calls the provider.
4. Travel **Watch Loft (0 days)** → **Signal Records Room (0 days)**. Select the
   **beacon setting plate**, then **Search**. Select **spare signal component**,
   then **Take**. Open Inventory: expect the carried component and **Inspect**.
   Inspect it; expect information without spending the item, time or dice.
5. Close information. Return **Watch Loft (0 days)** → **Watch Yard (0 days)**.
   Read the warning on **Ridge Trail (2 days)** before clicking. Expect Day 2 and
   a ridge-raider encounter. Enemy HP, your HP and turn ownership remain visible.
   Select **Attack (1 action)** in the encounter panel. Expect one attack/enemy
   response and the same currently legal combat controls after the reply.
6. Use **Brace cover (1 action)**. Expect its verified cover/enemy response; the
   one-use cover button disappears. During combat, click an **Inspect route**
   button: only inspection is offered, without movement. Continue attacking until
   victory or defeat; normal travel returns only if you survive and combat ends.
7. Reload after a completed reply. Expect the same story, HP, day, inventory and
   encounter state, with no repeated attack. Open Game menu → **Refresh adventure**
   for the same verified read. In a second tab, an action from an old position must
   be rejected and refreshed without spending another action.
8. At about 390 pixels wide, expect compact scene/status, a readable story with
   reachable composer, and then nearby choices. Focusing the composer brings the full
   form into view. Enter sends once; Shift+Enter adds a line. Open Journal, switch
   views and Escape back to its toolbar button. Repeat with a shorter viewport.
9. In Game menu, open **New game**, read the replacement warning and **Cancel**.
   Progress must remain unchanged. Confirm replacement only on this disposable
   test slot if you want to verify the fresh opening and empty history.

For a free-text check, type these messages separately inside the browser composer:

```text
Inspect the spare signal component
```

After pickup, expect the carried item's public description and no consumption.
The live DM may request clarification; choose Inventory → Inspect for an exact
supported action.

```text
What can I learn from the people here?
```

At Watch Yard, expect guidance grounded in people currently in view, without an
invented movement, injury or item spend. This checks live prose and is not covered
by the offline verification provider.

```text
Describe where I am, emphasizing the location name.
```

At Watch Yard, expect the location name as styled emphasis if the DM marks it for
emphasis. Paired asterisks must not appear around it. Reload: the same styling and
words return, with the original provider reply still stored unchanged. This also
applies to earlier saved replies that contain inline emphasis markers.

To restart, wait until **Saved** appears and the turn controls are enabled, then
press Ctrl+C in the launcher. Rerun exactly:

```powershell
npm.cmd run browser -- --seed 0 --save .\ui-redesign-player-save.json
```

Open its newly printed URL. The occupied browser slot resumes automatically;
there is no browser `--resume` switch. Do not type command-mode `quit` into a CLI
session for a save you intend to resume; it closes that saved session.

For artwork, follow README's manifest example using real local raster files and
append `--artwork .\artwork\manifest.json` to the same command. Expect the Watch
Yard image at Watch Yard, the loft image after travel, and a neutral motif in rooms
without an entry. A pack for a different adventure/version must never display.
Restart after changing the pack. Adding or removing artwork must not change the
saved gameplay state. An invalid pack fails before modifying the slot.

## Verification and limits

New real-browser tests cover desktop reading space, meaningful NPC choices,
information reads without model/state changes, component pickup and Inventory
inspection, persistent combat/cover, stale-tab rejection, exact reload restoration,
phone/reduced-height layout and keyboard access. Artwork checks cover identity and
version isolation, current-location projection, missing/broken-image fallbacks,
local raster loading, and invalid manifests. Existing saved browser journeys,
completion, hints and failure/recovery tests exercise the redesigned controls.
An emphasis test covers bold/italic rendering, inert HTML-like text, exact saved
prose, no state/RNG mutation, and restoration on reload.

Canonical verification: `npm.cmd run verify` passed on 2 October 2026 with all
676 tests passing, zero failures and zero warnings. Formatting, style, type checks,
static bug analysis, dependency/audit/secret checks, and clean build/package
validation also passed. Browser tests use an offline deterministic provider and
the actual UI/API/save boundary; they do not assess live prose quality or latency.
Desktop (1280×720), phone-width (390×844) and reduced-height views were also
inspected in the in-app browser with a separate offline save: NPC conversation,
component discovery/pickup, Inventory inspection, route warnings, combat entry and
an attack with continuing controls. Screenshots are in the ignored
`.scratch/ui-review` folder. These observations do not replace a live player test.

Physical phones and their on-screen keyboards, screen-reader usability, live
provider prose and enjoyment with unfamiliar players remain untested. Automatic
image generation, maps, additional classes, retreat, surrender and equipment
management are outside this presentation change.
