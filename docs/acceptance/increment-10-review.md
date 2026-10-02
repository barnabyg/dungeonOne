# Independent characters: two-axis review

Fixed point: `cdf2a2f8d1fcc13191a8f4c4d59f65249f979454`, the agreed source-review
baseline. Diff command: `git diff cdf2a2f8d1fcc13191a8f4c4d59f65249f979454...HEAD`.
The ref resolved and the diff was nonempty. Two independent read-only reviewers
used the implementation skill's code-review workflow. The spec sources were the
increment 10 plan, Fighter rules v1 and ADR 0003. Standards sources were AGENTS,
verification guidance, domain guidance and the supplied smell baseline.

## Standards

The initial review reported two hard recovery findings and one heuristic:

- Stale file-owner reclamation compared bytes and then unlinked separately. Two
  processes could remove each other's replacement lock, violating recoverable,
  once-only handoff. Replaced with OS-owned exclusion; a real killed child and
  eight concurrent contenders now prove one owner.
- Failure between creating a lock file and publishing its JSON could strand an
  empty owner record. Ownership no longer depends on persisted JSON; a separate
  regression covers empty and truncated prior lock artifacts.
- Possible Duplicated Code: association, frozen-sheet and progress checks were
  repeated across turns, completion and browser projections. Shared predicates
  now check module, seed, starting sheet, generation, revision and progress.

The read-only follow-up confirmed all three resolved and found no concrete
introduced defect. The deterministic port fallback fails closed on collision.

## Spec

The initial review reported three requirements implemented incorrectly or partly:

- Simultaneous recovery could violate exclusive character ownership. The same
  OS-owned exclusion fix resolves this spec finding.
- The AI could call an ability check after a refusal or unrelated request,
  consuming its one attempt and earning pending XP. Dispatch now requires an
  affirmative request for the offered check before consuming any dice.
- Creation showed raw scores but omitted the required derived-capability review
  before Save. The form now shows modifiers, HP, gear, AC, attack, damage and
  initiative, using the same rules as the saved sheet.

The read-only follow-up confirmed all three resolved and found no concrete
introduced defect or additional scope expansion. Frozen-sheet replay, stable
reward identities, surviving-completion advancement, retained historical
sessions and two-module continuity matched the inspected spec.

Remaining findings: Standards 0 (initially 3; worst was concurrent ownership);
Spec 0 (initially 3; worst was concurrent ownership).
