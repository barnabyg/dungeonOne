# Balance gate

The harness that plays the runs is in [Balance harness](balance-harness.md).

A module is offered in the browser only if it qualifies at its declared
difficulty for every class creation offers (`gateModule`; `GATE_CLASSES` is
`OFFERED_CLASS_IDS`; `gateAdventure` judges one class), and `npm.cmd run verify`
fails if a built-in module doesn't. The gate plays each class's characters on
seeds 0–199 and all three check policies. How to choose the declared difficulty
is in [the authoring guide](../module-authoring.md#settled-authoring-rules).

| Difficulty | Required-path survival | One-hit-kill cap |
| ---------- | ---------------------- | ---------------- |
| Easy       | ≥ 95%                  | 50%              |
| Medium     | ≥ 85%                  | 40%              |
| Hard       | ≥ 75%                  | 30%              |

- **Allowance for play the gate doesn't model** (#556). The judged runs never
  talk, use Tactical Mind, sneak or use fight actions, so a player does better
  than they measure. Every judged survival figure (required path, declared
  routes and region sweeps, seeded and always-fail) is credited 2 points
  (`UNMODELLED_PLAY_ALLOWANCE`) before it is set against the threshold, and the
  verdict line gives both figures. Reported figures are not credited.

- **Too deadly.** The weakest character, playing _cautious_, must survive at
  least the difficulty's share of runs with every kit at every recommended
  level, on seeded checks and again with every check failing, where the module
  must also stay completable. The verdict names the kit and level it survives
  least with. Judged runs never sneak, flee or use fight actions: only the
  reported styles do. A seeded run that made no check stands in for its
  always-fail run.
- **Casters.** A caster plays its first `POLICY_SEED_COUNT` seeds with each kit
  at each level by both casting policies, and every other run by the one that
  survived more of them; each kit's line names it. Casters are judged from level
  3 (`CASTER_JUDGED_LEVEL`): early magic is weak, so a level below is reported,
  not judged, and a module whose levels are all below passes the check. The
  career check still requires some weakest-caster career to reach level 5.
- **Declared routes.** Each declared route is judged as the fewest-fights route
  is (the weakest character, _cautious_, every kit and level, seeded and
  always-fail), and every route must survive. The verdict gives each route's
  lines after the fewest-fights route's. A route that can't be followed fails
  the module as `unfollowable-route`, naming the room no way reaches and why:
  only talking opens it, or a flag nothing sets for sure. The reported styles
  play the fewest-fights route alone.
- **Region sweeps.** In a long module, for each region the _cautious_ style
  visits every room not marked `avoidable`, the nearest unvisited next, fights
  what waits there, then goes on to the objective (the victory room comes last).
  Each sweep is judged as a route is, but one difficulty lower than the module's
  (`sweepDifficulty`; Hard stays Hard). A deadly room the character may leave
  alone is marked `avoidable`. The gate fails a module as `avoidable-on-route`
  when a required path passes an avoidable room, and as `unsweepable-region`
  when a sweep can't reach one of its rooms. A module that isn't long is not
  swept.
- **Too easy.** Early levels must never be easy. For the strongest character at
  the maximum recommended level, with the kit, placed weapon and Fighting Style
  that kill each enemy most often, the gate takes each ordinary (non-boss)
  enemy's chance of dying to one attack from full HP: hit chance, critical hits,
  masteries, damage defences and Undead Fortitude counted, but not a second
  attack in the turn. A ranged weapon the module places or sells is tried as an
  opening volley by a Dexterity-first build. More than half the ordinary enemies
  over the cap fails the module; a module with none passes. A caster's best
  attack may be a damaging cantrip on its class list (`spellKillChance`), judged
  when it beats every weapon. The Rogue's plain attack is judged; its advantage
  from Hide or Steady Aim, and each enemy's chance against a levelled damage
  spell, are reported. Fight actions are never counted.
- **Too easy by control.** For a caster with control at the maximum level, each
  ordinary enemy's chance that one control at the fight's opening (a control
  spell it has slots for, or Turn Undead) keeps it from acting for
  `CONTROL_TURNS` turns (`controlChance`): it must fail its first save and each
  repeated save until then. Sleep's target rolls both its saves with advantage.
  An immune enemy, or one of a type the control doesn't affect, has no chance.
  More than half the ordinary enemies over the cap fails the module.
- **XP.** A character starting one XP short of the level above the module's
  maximum, and earning all the XP the module offers (every encounter's
  stat-block XP, wandering ones included, or its bypass or peaceful XP when
  more, plus the most any ending awards), must not pass the maximum + 1, or + 2
  in a long module. Levels 6–8 use the SRD 5.2 XP table for this check though
  characters stop at 5. The _always-succeed_ branch, the strongest character
  playing _direct_, counts too if it earns more.

A module the harness can't play fails with the harness's named reason. The
verdict gives each class in turn, naming each check and whether it passed, with
a line per check-policy branch.

**Reported, not judged.** The gate also reports stealth-first, reactions (each
reaction policy), retreat, use-room, the alarm (which runs raised it, by what
and on which seeds), wandering encounters (the runs that met and fell in one;
those fights already count in survival and their XP in the limit), the
spend-early runs and the rests taken. `passesGate`, which decides what the
browser offers, ignores them all. A reported style's run is reused from the
judged run on its seed when it would play the same.

**Class parity.** At each recommended level from 4 (`PARITY_LEVEL`), the module
verdict sets each caster's weakest kit on the fewest-fights route beside the
Fighter's, from the judged runs (the weakest character, _cautious_, seeded and
always-fail, the caster's better casting policy), and gives the gap in points.
It plays no runs of its own, except at a level where the caster is sure to hold
an item: there it plays the same runs carrying it. **It is judged** (#541, D4):
a caster more than 5 points (`PARITY_POINTS`) behind the Fighter on either
branch fails the module, in `passesGate` and verify alike, and the line names
the class, level and gap. A module whose levels are all below 4 has no parity
line.

**Sure-held items** (#539, D5). A caster item counts for a class at a level when
it lies in a room on the required path of a module played earlier (ahead in the
browser's order, `earlierModules`) whose lowest recommended level is that level
or less, hidden in a feature with no check (a failed check may leave it hidden,
and an opponent may flee or surrender with what it carries), is never missing on
Scarce (no caster item is), and the class may attune it; at most 3
(`sureHeldItems`). The too-easy checks and the parity line play with them, and
the verdict names them ("carrying the …"); the survival check plays without
them, so it stays a lower bound. The callers that know the shipped set (the
recorded verdicts, the browser, `npm.cmd run balance`) pass the earlier modules;
a module gated alone holds none. The career simulation plays what each character
holds, attuned items included. On the shipped modules it gives:

| Module gated    | Level | Classes        | Sure-held items                                          |
| --------------- | ----- | -------------- | -------------------------------------------------------- |
| Thornwood Lodge | 4, 5  | Cleric, Wizard | Wand of the War Mage +1 (Coldwater Weirgate's dry shelf) |

Thornwood's own Pearl of Power counts for no module, as none is played after it;
a Fighter or Rogue holds nothing that counts.

**Recorded verdicts.** `npm.cmd test` gates the four built-in modules for every
class once, on worker threads (`tests/fixtures/gate-workers.mjs`), and pins each
module's figures, so a change that alters how the gate plays fails. The browser
server reads `adventures/5e/gate-verdicts.json` (`src/gate-verdicts-5e.ts`),
each verdict keyed by a SHA-256 hash of the loaded module, and gates only a
module whose hash has changed. An engine change doesn't change the hash, so
`shipped-modules.test.mjs` checks the file against the gate's results; when a
change moves a verdict, run `npm.cmd run gate:verdicts` and commit the file.

**Test timeouts are hang guards, not performance budgets.** A gate job that
freezes is stopped and fails, naming its module and class; no test asserts how
long the gate takes. Set such timeouts generously and don't creep them up.
