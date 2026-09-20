# Issue 35 — Multi-scene evaluation coverage

Issue #35 extends the existing interpretation library and evaluator. It does
not add a second harness. The deterministic scripted cases are guardrail and
contract evidence only; no live-model quality or human-enjoyment claim follows
from them.

## Evaluator contract

- Both adventures run through `runDmTurn` with their real runtime, prompts,
  offered schemas, validation, authoritative state, continuations, and
  fallbacks.
- The evaluator report format is version 2. Every run records its exact prompt
  and tool-schema version plus the complete requests sent to the provider.
- Secret withholding, belief attribution, no fabricated outcomes, and ending
  intent require 100% reviewed compliance. Missing judgments and provider
  failures cannot qualify.
- Live cases include authoritative potion consumption during combat and an
  explicit offered public-disclosure choice, alongside the knowledge, social,
  adversarial, unavailable-target, and terminal cases.
- `PRIVATE_MOTIVE` is the exact pre-authorization boundary marker. Its absence
  is checked mechanically, but semantic review remains required for paraphrases.
- The minimum remains three repetitions. Existing interpretation thresholds and
  all Stolen Signet cases remain in the same library.

## Deterministic scenario matrix

| Contract | Existing or extended boundary coverage |
| --- | --- |
| Both offline and scripted-AI resolutions | `tests/resolution.test.mjs` |
| Social success/failure, all approaches, retry lock | `tests/chapel-dialogue.test.mjs` |
| Compound requests and unavailable targets | `tests/chapel-dialogue.test.mjs`, `tests/dm-interpretation-cases.test.mjs` |
| Potion use and fighter defeat | `tests/potion.test.mjs`, `tests/chapel.test.mjs` |
| Mara, Oren, Tavi, and combined casualties | `tests/casualties.test.mjs` |
| Provider failure after disclosure, healing, rescue, and resolution | `tests/chapel-dialogue.test.mjs`, `tests/potion.test.mjs`, `tests/ledger-rescue.test.mjs`, `tests/resolution.test.mjs` |
| Speaker history after general transcript eviction at the CLI boundary | `tests/chapel-dialogue.test.mjs` |
| Trace export/replay and legacy fixtures | `tests/chapel.test.mjs`, `tests/cli.test.mjs` |
| Tampered rolls, revelations, consumed items, endings, and local reads | `tests/chapel-dialogue.test.mjs`, `tests/potion.test.mjs`, `tests/resolution.test.mjs`, `tests/chapel.test.mjs`, `tests/issue-34.test.mjs` |

No personal live transcript, provider credential, request header, raw provider
error, hidden reasoning, or SDK payload is tracked. Live reports stay under the
ignored `.dm-evaluations` directory.

## Maintainer commands

Deterministic contracts:

```powershell
npm.cmd run verify
```

Separate live campaign (not part of verification):

```powershell
$env:OPENAI_API_KEY = "<your-api-key>"
npm.cmd run eval:dm -- --model <exact-model-id> --judgments .dm-evaluations\judgments.json
```

Review every requested manual judgment in the generated report. A scripted pass
must be described only as harness/guardrail evidence.
