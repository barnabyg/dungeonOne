# Balance tools

Terms for the harness, the gate and the release runs. The rest of the glossary starts at [`CONTEXT.md`](../../CONTEXT.md).

**Balance harness**:
The tool that plays modules through the real runtime with rolled characters, in several styles and policies, and reports the outcomes.
_Avoid_: Simulator, Bot

**Balance gate**:
The harness's pass or fail verdict on a module at its declared difficulty, judged on its weakest character. The browser offers only modules that pass it.
_Avoid_: Balance check, Qualification

**Play style**:
How the harness plays a run: _direct_, _cautious_ (the gate's judged style) and _avoid-optional_, plus the reported-only _stealth-first_, _retreat_ and _use-room_. [The harness rules](../rules/balance-harness.md) define each.
_Avoid_: Strategy, Difficulty, Retreat (for a character fleeing a fight)

**Check policy**:
How the harness grades checks: rolled, always in their worst band, or always in their best.
_Avoid_: Check mode, Dice mode

**Casting policy**:
How the harness spends a caster's slots: conserve or spend-early.
_Avoid_: Caster style, Nova

**Reaction policy**:
How the harness answers a reaction band: attack whenever offered (judged) or take a peaceful option whenever offered (reported).
_Avoid_: Diplomacy style

**Control chance**:
The gate's measure of a control spell or feature against an ordinary enemy: the chance one use keeps it out of the fight. It is judged against the one-hit-kill cap.
_Avoid_: Lockdown chance

**Required path**:
The rooms the harness passes to the objective by the fewest fights, then the fewest moves.
_Avoid_: Route (a declared one), Main path

**Route**:
A way from a module's entrance to its objective that the module declares, as the rooms it must pass. The gate judges each declared route.
_Avoid_: Path (the required path), Branch, Track

**Way family**:
The kind of strength a way past an obstacle tests: might (force, break, a fight for the key), skill (thieves' tools, sneaking), mind (an Intelligence or Wisdom check) or voice (talking). See the authoring guide.
_Avoid_: Route family (a route is declared), Approach (a check's option)

**Region sweep**:
The gate's run through one region of a long module, visiting every room not marked avoidable before going on to the objective; it is judged one difficulty lower.
_Avoid_: Clear, Full run, Exploration

**Avoidable room**:
A long module's room left out of its region's sweep, off every declared route.
_Avoid_: Optional room (every room off the required path is optional), Secret room

**Release run**:
A test that plays a module to an ending through the browser server, typing each step to the AI DM as a player would. Its step list, called `route` in code, is not a declared route.
_Avoid_: Playthrough (the harness's), Handoff run

**Generated release run**:
A release run whose steps come from the harness's cautious run on a fixed seed. It proves a module playable through the AI DM, not that particular moments happen.
_Avoid_: Auto route, Scripted run (the hand-written kind)

**Sure-held item**:
A caster item every career is sure to hold at a level, because it lies on an earlier module's required path behind no failable check. The gate's too-easy checks and class parity play with it.
_Avoid_: Expected item, Carried item

**Class parity**:
The gate's check of a weak caster's survival against a weak Fighter's; see [the gate](../rules/balance-gate.md).
_Avoid_: Class balance, Fairness
