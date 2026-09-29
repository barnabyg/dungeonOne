# Issue #72: alternate routes through Raiders at the Crossroads

`adventures/raider-crossroads.json` is authored schema 5, content ID/version
`raider-crossroads`/`1`, rules `chapel-clues-rules-v6`, and digest
`sha256:0cbbb34657074e466dd45fb307d7b3b62f59e28fcaa910e6c51185cd692256f2`.
It starts at Lysa's stone hall at the edge of town. Lysa is the quest giver;
Neri and the physical route register are in the cellar. The Cellar Guard,
Raider Scout, restorative tonic, cellar exit and crate, square passage and
cart, lane shutter, and hall masonry and notice frame are named visible
targets. The raider plan runs from 0 to 8 abstract time units. A horn sounds
at 2; at 7 the short passage closes, while the back lane remains open. The
register is a physical, searchable clue. Its discovery does not require a
social roll or a living NPC. Resolution at the hall has four explicit choices:
file, post, refuse, or leave town. Filing and posting require the discovery;
refusal and departure are available immediately. Each ending reports Neri's
actual fate and whether a report was delivered; filing remains possible if
Lysa dies. `resolve leave-town` represents walking out along the road beside
the town-edge hall and ends the session.

The currently playable fixture uses existing mechanics only. The visible
crate, cart, shutter, masonry, and tonic establish targets for later action
profiles; their presence does not grant an improvisation command yet. In this
schema-5 fixture, accepted movement, search, talk, take, use, and attack cost
one abstract unit each; `wait 1` through `wait 3` cost their stated units.
Reads, rejected commands, and resolution cost zero. The late route remains
reachable after the clock reaches its maximum. Adventure validation reports
`ok: true` and four `analysis-incomplete` advisories: the static analyzer
cannot prove actor-fate ending alternatives or dialogue-created rescue/report
milestones. The CLI witnesses below exercise those boundaries directly.

## Seeded route witnesses and public review

Use Node 24.x, npm 11.6.4, `npm.cmd ci`, and `npm.cmd run build` from the
repository root. All routes use seed `0`, command mode, and no API key. Each
input file is executable through the CLI and checked by
`tests/issue-72.test.mjs` against public output, saved state, and diagnostic
replay.

| Route | Checked-in inputs | Public scene, journal, and ending |
| --- | --- | --- |
| Help and deliver on time | [`on-time.txt`](inputs/issue-72-on-time.txt) | Lysa accepts help; the square offers the short Hall exit; the journal attributes Safe route to the cellar register; `file-register` ends at 6/8 with `deadline-met`. Neri remains alive in the cellar, not rescued. |
| Post publicly | [`post.txt`](inputs/issue-72-post.txt) | The register is posted at the hall at 5/8 with `deadline-met`; Neri remains in the cellar. |
| Refuse | [`refuse.txt`](inputs/issue-72-refuse.txt) | Lysa acknowledges refusal; the journal still has no discovery; `refuse-errand` records `register-undelivered` and does not claim a rescue or report. |
| Leave town | [`leave.txt`](inputs/issue-72-leave.txt) | The starting hall offers departure; `leave-town` records `departed-without-report` at 0/8. |
| Failed social request, late delivery, item carried | [`late.txt`](inputs/issue-72-late.txt) | Seed 0 fails `talk guard request-passage persuade`; the register remains searchable. At 7/8 the raiders close the short passage, the square offers Back Lane, and the journal records the missed deadline. The tonic is carried unused. `file-register` records the late report at 8/8. |
| Witness unavailable | [`unavailable.txt`](inputs/issue-72-unavailable.txt) | Neri dies at the cellar; the register remains searchable. The ending says Neri died and claims no rescue. |
| Quest giver unavailable | [`quest-giver-unavailable.txt`](inputs/issue-72-quest-giver-unavailable.txt) | Lysa dies at the hall; the register remains searchable. The hall shows her remains and permits filing without her. |
| Attack then refuse | [`attack-refuse.txt`](inputs/issue-72-attack-refuse.txt) | Lysa dies at the hall; refusal says the player leaves her desk without accepting, and records her casualty without claiming a conversation. |

The failed guard check is optional. Its one-attempt result does not gate the
route register, Neri, or the hall. The tonic is likewise optional: the on-time
route never takes it, and the late route can carry it without consuming it.
The guard's success reply only points out the route; it does not claim an NPC
movement the engine did not perform.

To replay one complete standalone witness, run:

```powershell
New-Item -ItemType Directory -Force .scratch/issue-72 | Out-Null
Get-Content .\docs\acceptance\inputs\issue-72-on-time.txt | node dist/cli.js --adventure-file .\adventures\raider-crossroads.json --seed 0 --trace .\.scratch\issue-72\on-time.json
node dist/cli.js --replay .\.scratch\issue-72\on-time.json
```

Expect `Trace verified successfully`. Trace files contain the full authored
adventure and player actions; use private paths for actual play.

## Manual late route with restart

Start with a fresh private save path:

```powershell
node dist/cli.js --adventure-file .\adventures\raider-crossroads.json --seed 0 --save .\.scratch\issue-72\late-save.json --trace .\.scratch\issue-72\late-first.json
```

At each `>` prompt, enter these commands separately:

1. `wait 3` — horn sounds; Raider plan reaches 3/8.
2. `move square` — square still offers Hall and Cellar; plan reaches 4/8.
3. `move cellar` — Neri, guard, scout, register, crate, and tonic are visible;
   plan reaches 5/8.
4. `talk guard request-passage persuade` — seed 0 fails the social check. The
   guard refuses guidance but says the register remains available; plan 6/8.
5. `search route-register` — Safe route is recorded in the journal; the raiders
   close the short passage at 7/8. The back lane remains open.

Wait for the next `>` prompt, then press **Ctrl+C** in PowerShell. Restart:

```powershell
node dist/cli.js --resume .\.scratch\issue-72\late-save.json --trace .\.scratch\issue-72\late-second.json --previous-trace .\.scratch\issue-72\late-first.json
```

Type these commands after restart:

1. `take restorative-tonic` — the tonic enters inventory; plan reaches 8/8.
2. `move square` — only Cellar and Back Lane are offered; the closed short
   passage is still visible.
3. `journal` — Safe route cites the cellar register and `deadline-missed` is
   recorded.
4. `move back-lane`, then `move hall` — the reporting desk is still open.
5. `resolve file-register` — the ending says the report arrived after the
   deadline, with Neri still alive in the cellar.
6. `journal` — resolution is `file-register` with `register-filed` and
   `deadline-missed`.

Verify the saved diagnostic chain:

```powershell
node dist/cli.js --replay .\.scratch\issue-72\late-first.json .\.scratch\issue-72\late-second.json
```

## Frozen judgment matrix for the next action contract

The following decisions refer to visible content in this fixture. “Planned”
means a future validated profile under a new rules tuple; only the explicit
current commands above work today. Costs in this table are **future day-clock
costs**, not this schema-5 fixture's abstract units. A rejected or impossible
request has no draw, resource use, or day cost.

| Player attempt | Visible target/resource and intended category | Day cost and truthful continuation |
| --- | --- | --- |
| Attack the quest giver | Lysa in the hall; legal existing `attack lysa` combat action. | Local combat costs 0 days under the proposed day policy. If Lysa dies, her remains appear and the register can still be filed at her desk; no later dialogue from her. |
| Refuse the quest | Lysa and `resolve refuse-errand` at the hall; legal explicit ending. `talk lysa refuse ask` first records the stated refusal while preserving the chance to reconsider. | Talking and resolution cost 0 days. The ending says the register was not delivered and records Neri's actual fate. |
| Leave town | Road beside the hall and `resolve leave-town`; legal explicit ending. | Resolution costs 0 days. The ending records departure without a report or rescue claim. |
| Burn the quest location | Hall masonry; impossible to burn stone. The wooden notice frame is distinct and combustible, but no profile currently authorizes setting it alight. | Impossible request costs 0 days and explains the material limit. A future smoke/distraction profile may offer the frame only if validated and the player's intent permits that narrower action; the hall itself never burns without an explicit structural state model. Filing or leaving remains available. |
| Deceive an ally | Visible Lysa at the hall, or the Cellar Guard at the cellar; planned opposed check against the addressed actor, with speaker-scoped knowledge. | A committed attempt costs 1 day whether it succeeds or fails; an unavailable actor costs 0. Failure must leave the register searchable and refusal/departure possible. A claimed fact never becomes true merely because it was said. |
| Wait several days | `raider-plan` clock; planned `wait days N` with `N` in 1–3. Current `wait 1`–`wait 3` uses abstract units. | N days pass. Crossed thresholds fire in order once; a closed short passage sends the player through Back Lane. Reads, bad bounds, and terminal requests cost 0. |
| Use an item unusually | Owned restorative tonic offered to the visible Cellar Guard as a planned bribe or distraction resource; ordinary `use restorative-tonic` remains healing only. | Planned accepted offer costs 1 day and consumes exactly one tonic if the profile says it is given. An absent, spent, or unowned tonic rejects at 0 days. The register remains the non-social route. |
| Barricade or obstruct a passage | Square's stone short passage and market cart, or cellar exit and heavy crate; planned physical profile using co-visible target and resource. | A committed attempt costs 1 day and must change the actual connection and scene, or report failure. Back Lane provides a late route; a mere description never closes an exit. |
| Distract the guard | Cellar Guard plus co-visible crate or owned tonic; planned checked profile. | A committed attempt costs 1 day even on a failed check. The guard's position/response changes only on declared effects; the register remains available. |
| Follow the witness | Neri, only after the player witnesses the authored move from Cellar to Square; planned follow profile. | A committed follow costs 1 day and uses an open adjacent connection. If Neri is dead, unseen, or the connection has closed, reject at 0 days and show the available route instead. |

## Contract decisions before runtime changes

- **Command grammar:** `attempt <profile-id> <target-id> [with <resource-id>]`.
  Profile, target, and resource are stable IDs offered from the public scene.
  Examples for later work are `attempt barricade short-passage with
  market-cart` and `attempt offer guard with restorative-tonic`. Ambiguous
  wording asks for one missing ID before mutation. AI interpretation may
  choose only a currently offered proposal. The canonical proposal records
  `familyId`, `profileId`, `targetId`, optional `resourceId` and `approach`,
  and bounded original intent; the engine alone selects difficulty, dice,
  legality, time, effects, and narration facts.
- **Day policy for the new tuple:** day 0 at start. Local movement, ordinary
  search/talk/take/use/combat, reads, rejected proposals, and endings cost 0
  days. A committed improvised physical, social, resource, or follow profile
  costs 1 day on success or failure unless its validated profile explicitly
  declares another bounded cost. `wait days N` costs exactly N days (1–3).
  Thresholds apply after the action, in ascending order, before the action is
  saved and narrated. A profile cannot be retried by paraphrase after its
  one-attempt failure. These decisions do not reinterpret schema-5 ticks.
- **Persistence and diagnostics:** a future accepted proposal is one typed
  action with stable IDs, one atomic transition, declared events, resulting
  state and RNG position in the existing save/trace chain. Invalid proposals
  do not commit. New schema/rules and prompt/tool/engine versions will pin
  replay without modifying old content digests. Mixed command-to-AI resumed
  play is allowed by saves today, but existing schema-5 mixed-mode diagnostic
  segments fail replay (`Replay divergence at segment 1 mode`, recorded in
  issue #71). The new tuple must replay mixed-mode segments before that
  capability is claimed. Until then, use same-mode segments for diagnostics;
  do not treat a successful save continuation as verified trace replay.

## Schema-5 compatibility baseline

The released `consequence-journey`/`1` digest remains
`sha256:0bb560a9e34656ff02c93a2711c3b49e3f7353a03e52e02abbb3d595203cef9d`.
With seed 0 and the checked-in issue-71 on-time inputs, its save ends at
Raider plan 4/6 with `register-filed` and `deadline-met`. The save uses format
3, its attached trace uses format 5, and a separate standalone trace of the
same route replays successfully. `tests/issue-72.test.mjs` records these
values as a regression baseline. No existing schema-5 adventure was edited.
