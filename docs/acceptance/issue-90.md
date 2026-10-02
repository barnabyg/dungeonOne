# Issue 90: proof, watch authority, or force at the tower

Hollow Beacon v10 introduces Vey guarding the controls at Beacon Tower. Before
arrival, public leads name the tower operator without disclosing Vey. Search the
fixed tower work order and compare it with the observed setting plate or refugee
sighting frame: Vey acknowledges the signed diversion and stands aside. These
reports use no check, time or dice and preserve HP, items and Vey's life.

Alternatively, relay a real caution to Iona, earning her trust, and ask her to
authorize tower intervention. Present that warrant while she is alive: Vey
complies with watch authority, explicitly without confessing. Unsupported
safe-signal belief alone cannot produce a warrant. Dead Iona removes this
offer; either physical proof route remains open. Vey's remembered DC 12
persuasion check grants no control even on success, and never blocks evidence.

A deliberate attack starts a distinct third encounter using existing attack,
carried healing, initiative, damage and turn rules. No retreat or surrender is
available after attacking; 0 HP ends in defeat and Review mode. Before attacking,
players may leave to gather proof. Dead Vey cannot speak. Search the control
access panel afterward to secure the abandoned controls, with a casualty and
possible HP cost rather than an identical hidden flag.

Both approaches record `confrontation-resolved` and open the final warning board
and runner's provisional instructions. Reading the board records the decision
boundary and explains verified safe signal, slower human warning and urgent
risky signal stakes. **Issue #91 owns those three final commitments, conditional
consequences and terminal outcomes.** Arrival, control, board review and the old
hold/light/refuse/leave instructions remain nonterminal here. The composer and
onward exits stay available. Killing the nonessential runner removes their
speech but leaves the physical board accessible.

Control does not repair the beacon. A carried component can be fitted once at
the now-accessible socket, with no healing or rescue claim. Missing/spent items
prevent another placement/light offer, while the board and human-warning
preparation remain reachable. The valley/drainage route arrives on Day 5 with
both earlier enemies bypassed. Late arrival leaves proof and control available;
the keeper and caravan remain unconfirmed.

## Version and compatibility

The new tuple is content 10, schema 15, rules `chapel-clues-rules-v16`, engine
`chapel-clues-engine-v20`, prompt `chapel-clues-dm-v23`, tools
`chapel-clues-tools-v20`. Schema 15 permits public stakes on ordinary dialogue
subjects; previous schemas retain their social-intent validation. Contextual
NPC attacks are intersected with engine tools and declare the defeat/no-retreat
policy before combat. Subjects expose stakes to the page and local hints.

New launcher slots and confirmed New game use v10. Existing v4-v9 browser slots
retain their released content, rules and history, including completed v4 Review
mode; earlier CLI adventures remain readable. No released content/digest or save
envelope was rewritten and no migration occurs. Save and trace validation admit
the new tuple alongside historical ones.

## Browser player checks

Prerequisites: Node 24.x, `npm.cmd ci`, a desktop browser, and a valid
`OPENAI_API_KEY` in the launcher environment. From `C:\docs\git\dungeonOne`,
use a new disposable slot:

```powershell
npm.cmd run build
npm.cmd run browser -- --seed 0 --save .\.scratch\issue-90-proof\slot.json
```

Open the printed loopback URL and select **Start adventure**. Type separately,
waiting for each complete reply and enabled composer:

```text
Travel to Watch Loft
Travel to Signal Records Room
Search beacon setting plate
Take spare signal component
Travel to Watch Loft
Travel to Watch Yard
Travel to Valley Road
Travel to Ridge Shelter
Travel to Drainage Walk
Travel to Beacon Tower
```

Expect Day 5, 20/20 HP, a carried component and two living bypassed enemies.
Vey/work order appear; final warning board and socket use are unavailable.
Select **Vey**, then **Persuade: Ask Vey to stand down**. Seed 0 fails the
remembered check and grants no control. A repeat cannot reroll. Select **tower
work order**, then **Search**: Journal records the source-attributed document.
Select **Vey**, read the **Present the work order and setting plate** stakes,
then select that subject. Expect attributed Vey speech acknowledging diversion,
an engine card saying Vey stood aside, unchanged HP/day/items, and accessible
board/socket. Select the socket or component, then **Fit signal component**:
expect the component consumed, socket fitted, no healing and no rescue.

Select **final warning board**, then **Search**. Expect next-act stakes and the
journal decision entry, enabled composer and onward exits. Asking the runner to
hold the beacon remains nonterminal. Trying to fit the component again rejects
without another spend or die draw.

For alliance, start another empty slot:

```powershell
npm.cmd run browser -- --seed 0 --save .\.scratch\issue-90-alliance\slot.json
```

Type separately:

```text
Travel to Keeper's Path
Search damaged shutter latch
Travel to Watch Yard
```

Select **Captain Iona**, **Relay a caution to the watch**, then **Authorize
intervention at the tower**. Expect her attributed warrant, without proof or
rescue. Follow the valley/shelter/drainage/tower route above; select **Vey**,
then **Present Iona's intervention warrant**. Expect compliance, explicitly no
confession, unchanged HP/day, and open warning-board preparation. No component
is carried, so the verified-light instruction remains unavailable. Physical
comparisons remain independent fallback routes.

For force, start a new slot:

```powershell
npm.cmd run browser -- --seed 0 --save .\.scratch\issue-90-force\slot.json
```

Travel via Valley Road, Ridge Shelter, Drainage Walk, then Beacon Tower without
proof or warrant. Select **Vey**, read the **Attack (1 action)** policy, and
attack. Continue attacking Vey until the engine records their death. Expect
initiative/attack/damage/HP cards; movement, speech and search are unavailable
during combat. Dead Vey has no speech. Select **control access panel**, **Search**,
then **final warning board**, **Search**. Expect the casualty-bearing control
record, no repair/rescue and active gameplay.

To continue, press Ctrl+C in the launcher after a completed reply, especially
after the first Vey attack, then run the same browser command and save path.
Open the newly printed URL: exact history, player/opponent HP, turn, clock,
items and knowledge return without repeated enemy action. Browser mode has no
`--resume` flag. A second tab's old report/attack must reject and refresh without
repeating a mutation. Confirmed New game starts v10; Cancel preserves the slot.

## CLI regression adapter

Command mode needs no provider configuration:

```powershell
npm.cmd start -- --adventure-file .\adventures\hollow-beacon-confrontation.json --seed 9 --save .\.scratch\issue-90-cli.json
```

Type separately inside the game:

```text
move ridge-trail
brace cart
attack raider
attack raider
attack raider
move ridge-shelter
recover station
move tower-approach
attack sentry
attack sentry
move beacon-tower
attack vey
attack vey
attack vey
attack vey
search control-access
search final-warning-board
```

Expect first victory at 3/20 HP, recovery to 11/20 HP, sentry victory at 6/20 HP,
and Vey's death with 4/20 HP remaining. All three fights finish on Day 2 and the
decision remains active. For a resumable checkpoint, wait for the next `>` prompt
after an action, press Ctrl+C, then run exactly:

```powershell
npm.cmd start -- --resume .\.scratch\issue-90-cli.json
```

`quit` closes the saved session. CLI proof uses `search tower-work-order`,
`talk vey plate-proof ask` after observing the watch plate, or
`talk vey frame-proof ask` after observing the refugee sighting frame. Neither
requires persuasion. Use `use component at socket` and `search final-warning-board`
after control; both keep the session open.

## Automated evidence and limits

[Seed witnesses](issue-90-seeds.json) retain exact full-combat routes for seeds
0, 5, 8, 9 and 10. Final HP is respectively 16, 14, 9, 4 and 10; all Day 2.
These samples show viability, not survival for every seed or strategy.

`tests/issue-90.test.mjs` exercises command/runtime and scripted-AI proof/force
journeys, process restart and chained replay with exact checkpoint/RNG agreement.
Checks cover failed persuasion, independent refugee proof, late/bypassed fights,
living/dead Iona, missing/spent component, dead Vey, tuple and historical v9
validation. Real Edge/Playwright page/API/storage journeys cover typed/clicked
proof and force, watch alliance, actual Iona death and proof fallback, attributed
speakers, engine cards, stale requests, narration failure, killed process during
Vey combat, automatic continuation, and active gameplay at the final decision.
Slots, profiles and ports are isolated; no live provider credits are used.

The canonical command is `npm.cmd run verify`. Full-verification and independent
Standards/Spec review results are reported at implementation handoff. Live
provider paraphrase quality, unfamiliar-player testing and #91's terminal
outcomes remain unqualified or outside this ticket.
