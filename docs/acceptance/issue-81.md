# Issue #81: The Hollow Beacon opening

This is a short opening for a future full adventure, not a finished valley map.
The authored file is `adventures/hollow-beacon.json`, content ID/version
`hollow-beacon`/`1`, schema 4, and rules `chapel-clues-rules-v5`. It has its own
validated digest. No existing adventure file or released save, trace, or runtime
tuple is changed. Command mode needs no API key.

## Opening plan

At dusk the beacon is dark, a caravan approaches the fork, and the keeper is
missing. Iona wants a signal. Sera fears an unverified light could bring
pursuers. The player can follow either visible lead and then decide whether to
hold or light the beacon. The cause of the outage, the keeper's fate, and the
effect of any later signal on pursuers remain unknown.

| Location or encounter        | Route                      | Decision or discovery purpose                                                                                                                                      |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Watch Yard; Captain Iona     | Start and return hub       | Hear the stakes, relay a caution that posts a yellow flag, and decide the opening's signal outcome. Refusal and departure are available here before investigation. |
| Refugee Camp; Sera           | Watch Yard ↔ Refugee Camp  | Hear the keeper's warning as attributed testimony; decide whether to trust or pass it on.                                                                          |
| Keeper's Path; shutter latch | Watch Yard ↔ Keeper's Path | Inspect physical damage without claiming proof of sabotage; bring the observation back. The service gate is locked and the keeper is absent.                       |

The opening timeline is intentionally local: (1) dusk, no signal, caravan
approaching; (2) the player follows either lead; (3) if the player relays a
caution, Iona posts a yellow flag and sends runners to hold the caravan at the
fork; (4) the player chooses a signal outcome or leaves the matter unsettled.
Relaying a caution requires following one lead first. The player may refuse or
walk away from Iona's post without investigating.
There is no elapsed-time clock in this opening. Later caravan arrival and the
keeper's whereabouts are outside the authored slice, so no branch claims them.

| Person or source | Knows or shows                                               | Belief or limit                                                                                |
| ---------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Iona             | Beacon dark, caravan coming, keeper missing from known posts | Has not visited the camp or service gate. She only receives a caution if the player relays it. |
| Sera             | Keeper missing; recounts their warning                       | Fears an unverified signal could lead pursuers to the caravan; saw no tampering.               |
| Shutter latch    | Bent outward at the service gate                             | Does not identify who touched it or prove a false signal.                                      |
| Keeper           | Absent in the opening                                        | No witnessed fate, motive, or current location is established.                                 |

## Provisional ending truth table

Holding or lighting the beacon requires a camp conversation or latch search.
Refusal and departure are available immediately. The terminal engine status
marks a closed session; the authored resolution text supplies the story truth.

| Choice                   | Signal and caravan truth                                                             | Keeper and caution truth                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Hold the beacon          | No light is sent. Watch runners guide the caravan to a stop at the fork.             | Keeper remains missing. An earlier caution flag, if posted, remains.                                    |
| Light the beacon         | Watch lights the beacon for the approaching caravan. Who else follows it is unknown. | Keeper remains missing. An earlier caution flag, if posted, remains while runners relay the new signal. |
| Refuse the watch         | Player declines to decide; no signal is claimed on their behalf.                     | Watch's later decision and keeper's fate are unresolved.                                                |
| Walk away from the watch | Player leaves Iona's post and crosses the Watch Yard without deciding the signal.    | Watch's later decision, caravan's fate, and keeper's fate are unknown.                                  |

## Player test

Prerequisites: Node 24.x and npm 11.6.4. From the repository root run
`npm.cmd ci` once and `npm.cmd run build`. Use a private save and trace path;
they contain the full adventure snapshot and player actions. Start a fresh
command-mode session in PowerShell:

```powershell
New-Item -ItemType Directory -Force .scratch/issue-81 | Out-Null
node dist/cli.js --adventure-file .\adventures\hollow-beacon.json --seed 0 --save .\.scratch\issue-81\save.json --trace .\.scratch\issue-81\first.json
```

At each `>` prompt, type:

1. `look` — Watch Yard names Refugee Camp and Keeper's Path. Holding or lighting is not yet offered; refusal and departure are.
2. `move refugee-camp` — Sera is present and the yard remains an exit.
3. `talk sera keeper-warning ask` — Sera attributes the warning to the missing keeper, states she saw no tampering, and the journal records testimony.
4. `move watch-yard` — no warning has reached the watch yet.
5. `talk iona relay-warning ask` — Iona posts the yellow flag and sends runners, leaving the beacon dark.
6. `move keeper-path` — the keeper is absent; the damaged latch is visible.

After the next `>` prompt, press **Ctrl+C**. The accepted move has been saved.
Start a new process:

```powershell
node dist/cli.js --resume .\.scratch\issue-81\save.json --trace .\.scratch\issue-81\second.json --previous-trace .\.scratch\issue-81\first.json
```

At each resumed `>` prompt, type:

1. `move watch-yard` — the public scene still shows Iona's yellow flag and runners holding the caravan.
2. `talk iona response ask` — Iona explicitly recalls the warning and says the final signal decision remains.
3. `resolve hold-beacon` — the ending keeps the beacon dark, guides the caravan to a stop, and leaves the keeper missing.

The input segments are checked in as `inputs/issue-81-first.txt` and
`inputs/issue-81-second.txt`. To verify the ordered traces:

```powershell
node dist/cli.js --replay .\.scratch\issue-81\first.json .\.scratch\issue-81\second.json
```

Expect `Trace verified successfully`. Use a fresh save path for each alternate
route. To follow the other lead, start again, then type `move keeper-path`,
`search shutter-latch`, `journal`, `move watch-yard`, and
`resolve light-beacon`. The journal identifies an observation but does not
name a saboteur. For an immediate refusal or departure, start a fresh session
and type `resolve refuse-watch` or `resolve walk-away` respectively. Neither
ending says that the signal was settled.

## Review and verification

On 30 September 2026, a read-only AI reviewer played the CLI opening before
reading the authored JSON, tests, or this handoff. The reviewer reported that
the dark beacon, approaching caravan, and two leads were clear and that `look`
gave usable commands. Sera's warning read as testimony; the latch remained an
observation with unknown cause. Refusal and departure gave truthful immediate
responses. The reviewer found that Iona's first `brief` did not acknowledge
returning from a lead. Iona now acknowledges the return without pretending to
know an unreported finding, and the caution action is offered after a lead.
The reviewer also found that `look` after lighting repeated an outdated dark
beacon description, and that a departure ending still showed the Watch Yard.
The yard and lamp descriptions now state facts valid before and after either
signal outcome. The departure choice now leaves Iona's post within the Watch
Yard, so the saved location and ending agree. This is a CLI review by an unfamiliar AI
reader, not a human player or a live model quality test; no map expansion has
followed it.

The test suite checks both leads, truthful immediate exits, a split command
route, a split scripted-AI route, equal canonical states, and replay. Scripted
AI checks orchestration, not live model prose.
