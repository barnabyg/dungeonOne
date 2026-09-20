# Increment 4 migration contract (issue 39)

This is the contract for the subsequent data loader and generic runtime tickets,
not a claim that format 4 or external adventures are implemented. The chapel
remains the startup default. Save/resume, generation, scripts, clocks and new
rule systems are excluded. Historical exports are diagnostic evidence, not saves.

## Compatibility inventory

All supported exports use `mulberry32-v1`, an unsigned 32-bit initial seed, and
re-execution from a fresh session. Recorded state is an expectation, never input
state. Unsupported cross-products fail; the rows below are not independent
version ranges. Command exports have no prompt/tool identity.

| Format / mode  | Adventure ID            | Content               | Rules                       | DM prompt                                                                                      | Tools                       |
| -------------- | ----------------------- | --------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------- |
| 1 command      | stolen-signet or absent | 1                     | stolen-signet-rules-v1      | n/a                                                                                            | n/a                         |
| 1 command      | stolen-signet or absent | 2                     | stolen-signet-rules-v2      | n/a                                                                                            | n/a                         |
| 2 AI           | stolen-signet or absent | 2                     | stolen-signet-rules-v2      | stolen-signet-dm-v2, v3 or v4 (full prefix on each)                                            | stolen-signet-tools-v1      |
| 3 command / AI | chapel (required)       | chapel-exploration-v1 | chapel-exploration-rules-v1 | chapel-exploration-dm-v1                                                                       | chapel-exploration-tools-v1 |
| 3 command / AI | chapel (required)       | chapel-discovery-v2   | chapel-discovery-rules-v2   | chapel-discovery-dm-v2                                                                         | chapel-discovery-tools-v2   |
| 3 command / AI | chapel (required)       | chapel-dialogue-v3    | chapel-dialogue-rules-v3    | chapel-dialogue-dm-v3                                                                          | chapel-dialogue-tools-v3    |
| 3 command / AI | chapel (required)       | chapel-social-v4      | chapel-social-rules-v4      | chapel-social-dm-v4                                                                            | chapel-social-tools-v4      |
| 3 command / AI | chapel (required)       | chapel-guardian-v5    | chapel-guardian-rules-v5    | chapel-guardian-dm-v5                                                                          | chapel-guardian-tools-v5    |
| 3 command / AI | chapel (required)       | chapel-potion-v6      | chapel-potion-rules-v6      | chapel-potion-dm-v6                                                                            | chapel-potion-tools-v6      |
| 3 command / AI | chapel (required)       | chapel-rescue-v7      | chapel-rescue-rules-v7      | chapel-rescue-dm-v7                                                                            | chapel-rescue-tools-v7      |
| 3 command / AI | chapel (required)       | chapel-resolution-v8  | chapel-resolution-rules-v8  | chapel-resolution-dm-v8                                                                        | chapel-resolution-tools-v8  |
| 3 command / AI | chapel (required)       | chapel-casualties-v9  | chapel-casualties-rules-v9  | chapel-casualties-dm-v9, chapel-qualified-dm-v10, chapel-qualified-dm-v11, chapel-human-dm-v12 | chapel-casualties-tools-v9  |

Missing ID means signet only in formats 1–2; it never means the startup default.
Format 3 requires its mode and chapel ID. Historical signet rules v1 retain the
invisible-goblin inspection rejection. Chapel before v8 treats `resolve` as
unknown. Historical adapters preserve their state shapes, feature gates and
draw order, including absence of later discoveries, social locks, items,
relocations, resolution or numeric NPC HP. Prompt versions before v12 retain the
recorded potion/look compatibility exception in replay.

AI local kinds: signet and chapel v1 have help/quit; chapel v2–v5 add journal;
chapel v6–v9 add status/inventory. The decoder remains responsible for exact
format, prompt, tools, RNG, local kinds and state validation; runtime selection
is explicit and independent of startup selection. Model/provider metadata is
diagnostic and replay never calls a provider.

## Finite document vocabulary

Schema identity describes document syntax (`schemaVersion: 1`); content identity
is `(id, contentVersion)`; rules identity selects implemented mechanics
(`rulesVersion`). Engine, prompt and tool identities are separate. None implies
support for an unknown version of another. Content changes require a new content
version; mechanical changes require a new rules version. A version label is not
a content digest.

Use entity arrays, rejecting duplicate JSON keys before decoding and duplicate
IDs before indexing. Namespaces are locations, connections, doors, features,
actorDefinitions, actors (placed instances), equipment, items (unique placed
collectibles), facts, discoveries, quests, milestones, topics, challenges,
interactions, endings and consequences. IDs are unique within each namespace;
all references have a statically specified target namespace. The player is the
reserved actor `player`. Sources are tagged feature/actor references with an
explicit location. A monster definition and a placed combatant are distinct.

IDs match `[a-z][a-z0-9]*(?:-[a-z0-9]+)*`, maximum 64 ASCII characters. Command
aliases contain 1–8 such tokens separated by a single space, at most 128
characters. Input matching trims, lowercases and collapses whitespace, then
treats hyphens as token boundaries. Keep Unicode display labels separate.
Explicit aliases preserve accepted old labels. Validate collisions after
normalization within each verb/argument namespace wherever visibility can
overlap; if overlap cannot be disproved, reject the ambiguity. Topic and approach
tokens remain single tokens so `talk <actor> <topic> <approach>` is unambiguous.
No regex programs, callbacks, expressions, arbitrary property paths or includes.

Conditions are tagged nodes with a finite vocabulary:

| Node                                     | Parameters / meaning                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| all, any                                 | Ordered nonempty child condition list; conjunction/disjunction          |
| not                                      | One condition; runtime only where static positive analysis cannot apply |
| playerAt, actorAt                        | Location; actorAt also names a placed actor                             |
| actorAlive, actorDead                    | Placed actor; inactive is neither alive nor dead                        |
| itemCarried, itemAvailable, itemConsumed | Unique item; available means its placement is the player's location     |
| doorOpen                                 | Door ID                                                                 |
| discoveryKnown                           | Discovery ID                                                            |
| questStatus                              | Quest ID and active/resolved status                                     |
| milestoneRecorded                        | Milestone ID                                                            |
| encounterCleared                         | Placed hostile actor ID                                                 |
| challengeAttempted, challengeResult      | Challenge ID; result success/failure                                    |
| sessionStatus                            | playing/victory/defeat/quit                                             |

Effects are only: `grantDiscovery(discoveryId)`, `recordMilestone(milestoneId)`,
`relocateLivingActor(actorId, locationId)`, `transferItem(itemId, destination)`
(destination player/location/absent), `consumeItem(itemId)`, `openDoor(doorId)`,
`recordConsequence(consequenceId)`, `completeQuest(questId)` and
`completeSession(endingId)`. Ending data defines outcome and eligible truthful
consequence/fate variants. A transfer cannot duplicate ownership, consumption
requires ownership, and relocation cannot revive anyone.

Engine operations, not general effects, own movement, combat activation,
initiative, attacks, death, healing and social checks. Their supported profiles
hold bounded dice/modifier/DC/HP values and explicit success/failure or lifecycle
effect lists. Death records the current location once; no arbitrary set-HP effect.
Healing consumes one owned item, rolls authored dice, caps HP, and in combat
permits the same opponent response as today. One opponent may be active.

Bound documents to 1 MiB UTF-8, 32 JSON nesting levels, 256 entries per entity
namespace, 4096 characters per prose field, 64 condition nodes per interaction,
8 condition levels, 32 effects per branch, 16 branches per interaction and 8
dice per damage/healing profile with 2–100 sides. Numbers are safe integers;
HP is 0–10000, modifiers -100–100, DC/AC 0–100. Reject unknown fields and
unsupported mechanics. These limits are a loader contract, not new gameplay.

## Ordering and atomicity

1. Parse input and resolve a unique visible reference. Validate tool shape,
   intent, session status, combat restrictions and every prerequisite before any
   draw. A rejection changes no state and consumes no randomness.
2. Evaluate branch conditions against the pre-action state; first matching
   branch in document order wins. Reject conflicting effects (different writes
   to one placement/status, consume and transfer, or multiple completions).
3. Resolve the engine operation in existing mechanical order: initiative rolls,
   opening opponent attack if due; attack roll then damage only on a hit;
   player healing before opponent retaliation; one social d20 on the first
   permitted challenge attempt. Preserve natural-roll rules and equality success.
4. Apply its finite effects in document order to a private next state, followed
   by the explicitly attached lifecycle effects (death/encounter clear). No
   recursive dispatch or continuously evaluated triggers. Commit once. Impossible
   effect targets must be rejected by validation before an operation can roll.
5. Emit ordered mechanical and authored events from the committed transition.
   Select presentation variants from the resulting state, first match wins.
   Narration failure never rolls back or repeats a committed action.

Discovery/milestone/consequence additions, rescue, opening and completion are
idempotent; an existing discovery keeps its original source and acquisition
order. Challenge ID owns a lifetime retry lock across all approaches. Evidence
follow-up does not reset it. Terminal gameplay mutations are rejected; reflection,
reads and quit remain available. Reads never discover facts or establish death.

## Authored behavior extraction inventory

Each row is a required data mapping and named regression scenario. Test files
are under `tests/`; current implementation sources are `src/adventure.ts`,
`session.ts`, `chapel.ts`, `chapel-tools.ts`, `runtime.ts`, `parser.ts`,
`presenter.ts` and `dm-turn.ts`. This inventory covers presentation as well as
state changes; extraction must not preserve a hard-coded ID behind a new wrapper.

| Existing branch                                                                                               | Data representation                                                                       | Regression scenario / evidence                                                                                              |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Signet entrance, door, directed routes, visible features/exits                                                | Locations, connections, door and aliases                                                  | `session.test.mjs`, `game-tools.test.mjs`: navigation, visibility and door rejection; historical-victory golden             |
| Signet goblin entry, opening attack, win/defeat, revisit                                                      | Actor definition/instance, encounter activation and cleared condition                     | `combat.test.mjs`, `session.test.mjs`; historical-victory/defeat goldens                                                    |
| Signet collectible and leave objective                                                                        | Item placement; explicit exit interaction requiring carried signet and reliquary location | `session.test.mjs`, `cli.test.mjs`: leave failures and victory                                                              |
| Chapel five rooms, inn default, boundaries and visible names                                                  | Location graph, features, public descriptions and suggestions                             | `chapel.test.mjs`: exploration and public scene; chapel command goldens                                                     |
| Notice provides route; damaged record links unsafe repairs independently of speakers                          | Two search interactions granting observation discoveries and milestones                   | `chapel.test.mjs`: evidence is local and order-independent                                                                  |
| Mara missing-person testimony and ferry belief                                                                | Separate fact classifications, source attribution, approved topics and once-only grants   | `chapel-dialogue.test.mjs`: Mara's public account                                                                           |
| NPC knowledge, ignorance, beliefs, wants, voice and permitted release differ                                  | Private actor knowledge and explicit topic release lists; approved reply variants         | `chapel-dialogue.test.mjs`: scoped requests, untrusted prose and history eviction                                           |
| Oren ask versus persuade/deceive/intimidate; equality success; refusal and physical fallback                  | Challenge ID, approach profiles, ordered success/failure facts, retry policy and leads    | `chapel-dialogue.test.mjs`: shared retry lock, invalid attempts and committed failure; chapel-public-social-fallback golden |
| Ledger unlocks Oren's later account without rerolling                                                         | Higher-priority discovery-conditioned topic branch                                        | `ledger-rescue.test.mjs`: evidence bypasses failed check without resetting lock                                             |
| Guardian blocks ledger and Tavi; defeat opens access without quest completion                                 | Encounter visibility/availability conditions; guardian-cleared milestone                  | `chapel.test.mjs`: clear, defeat, revisit; `ledger-rescue.test.mjs`: hidden evidence                                        |
| Potion visibility, collection, inventory, single use, healing cap and retaliation                             | Unique item placement, healing profile, collection/use aliases                            | `potion.test.mjs`: capped healing, invalid uses, lethal retaliation; chapel-potion-defeat golden                            |
| Explicit potion collection must call take, not look; ambiguous intent cannot fabricate mutation               | Token/phrase intent mapping to offered operation; generic consistency check               | `issue-37.test.mjs`, `issue-38.test.mjs`, `dm-interpretation-cases.test.mjs`                                                |
| Ledger gives conclusive sourced evidence; Tavi dialogue rescues living Tavi to inn                            | Search grant plus living-actor relocation and fate/rescue milestones                      | `ledger-rescue.test.mjs`: atomic relocation, stale requests, provider failure                                               |
| Post-ledger/rescue guidance reflects actual location, life and next steps                                     | Ordered scene, lead, conversation and authoritative narration variants                    | `issue-38.test.mjs`; `ledger-rescue.test.mjs`; no stale crypt guidance after rescue                                         |
| Living NPC attacks, one active enemy, persistent HP, death at actual location                                 | Actor combat profiles and actor-died lifecycle; stored death location                     | `casualties.test.mjs`: fatal attacks and provider failure                                                                   |
| Tavi crypt remains require explicit search; inspect does not establish fate                                   | Dead-actor feature with death-location condition and search milestone                     | `casualties.test.mjs`: remains, rescue/death combinations and all-casualty fallback                                         |
| Noticeboard needs inn, ledger and established fate; two explicit decisions                                    | Ending eligibility and aliases; generic ambiguity/negation checks                         | `resolution.test.mjs`: noticeboard, ambiguous/mismatched choices; both ending goldens                                       |
| Public inquiry versus private repair request; future restitution only if Oren alive; truthful casualties/fate | Ordered ending variants and consequence IDs, quest/session completion                     | `resolution.test.mjs`, `casualties.test.mjs`; chapel-oren-casualty golden                                                   |
| Resolution freezes mutation, preserves final reads/reflection and removes stale leads                         | Session conditions and post-completion presentation                                       | `resolution.test.mjs`: terminal mutations and reflection                                                                    |
| Local controls, one mutation attempt, bounded reads/replies, provider failure after commit                    | Generic orchestration policy (engine-owned, not data callbacks)                           | `dm-turn.test.mjs`, `cli.test.mjs`; chapel-ai-failure-after and signet AI goldens                                           |
| Hidden/absent/remote targets, malformed tools, unsupported or compound commands                               | Shared authoritative availability and generic strict argument grammar                     | `game-tools.test.mjs`, `chapel-dialogue.test.mjs`, `resolution.test.mjs`                                                    |

All public projections must use the same availability decisions as execution,
then dispatch must recheck them. The DM receives only public scene, discovered
journal, offered tools and addressed-speaker approved facts/history. Never send
private canon, the document snapshot, unreleased facts or ending predicates.

## Semantic parity fields for the future generic runtime

Historical replay stays exact. For new format/state shapes, compare after every
input/call: accepted/rejected disposition and reason; normalized action/target;
ordered draws (sides,value); ordered mechanical events (actor, target, hit,
damage/healing, HP, initiative, turn); player location/HP/equipment/inventory;
door state; all actor locations/HP/death locations and active combat; unique item
placements/consumption; discoveries in acquisition order with classification,
source and summary; milestone acquisition order; challenge attempted/result and
roll; scoped conversation history, approved facts and reply; quest/session status;
ending ID, fate, casualties and ordered consequences; completion reason/outcome.
Compare public scene/inspection, visibility, tool enums, journal leads, status,
inventory, suggestions, authoritative narration and terminal text separately.
Ignore only export path lines, documented schema field renames and diagnostic
provider metadata. Do not sort events/draws/discoveries to conceal ordering changes.
Live model wording is not a deterministic oracle; synthetic scripted narration is.
Any intentional public text correction needs a separately recorded decision.

## Bounded positive prerequisite analysis

Analyze only positive discovery/milestone predicates combined with all/any.
Construct producers from explicit interaction branches, seed the reachable set
with initial discoveries/milestones, and iterate in stable document order. A
producer can add its outputs when its positive prerequisite tree evaluates true.
Do not flatten `any` into `all`. Stop at a fixed point or 512 additions / 65536
node evaluations (whichever first). No recursion into runtime operations.

Required progression with no reachable producer is an error only when all of its
producer prerequisites are in this supported subset. Example: A requires B and
B requires A, neither seeded, is `unreachable-required-progress` (error). Seed A
and both become reachable. If A requires `any(B,C)` and C has an unconditional
producer, both A and B become reachable. Optional unreachable progress is a
warning. Missing producers for required unseeded IDs are errors. Separately check
directed structural location reachability; ordinary reciprocal map edges are not
quest dependency cycles.

Negative predicates, combat, consumable competition, actor death, location gates
or unsupported effects in a relevant dependency closure produce
`analysis-incomplete` (warning), never a claim of impossibility or solvability.
Budget exhaustion produces `analysis-limit` (warning), discarding any negative
conclusions from the incomplete pass. Diagnostics are ordered by validation
phase, document path, then code and contain severity/code/path/entity/message.
Warnings do not make author validation fail; the built-in handoff gate requires
zero unresolved warnings. A built-in can isolate its positive evidence analysis
from mechanical route tests, but cannot silently suppress unsupported analysis.
Scenario tests demonstrate supported combat/casualty routes; static analysis
does not prove universal solvability.

## Format 4 snapshot and digest contract

New data-runtime exports will use format 4 only. The envelope requires mode,
engineVersion, rulesVersion, random.algorithm/initialSeed, content identity
`{schemaVersion,id,contentVersion,digest}`, complete `adventureSnapshot`, and the
existing command/action or AI/call evidence. AI additionally requires prompt and
tool schema versions. Provider/model/narration metadata keeps existing sanitization.

Canonicalize the complete validated snapshot before building runtime indexes or
adding defaults: UTF-8 without BOM, no insignificant whitespace, JSON object keys
sorted by ascending UTF-16 code-unit sequence at every depth, arrays in authored
order, booleans/null as JSON literals, strings escaped by ECMAScript JSON.stringify
(reject lone surrogates; no Unicode normalization), safe integer numbers in base
10 with minus sign only when negative, zero rendered `0` including input `-0`.
Reject fractions, nonfinite/unsafe numbers and duplicate keys. Digest is
`sha256:` plus 64 lowercase hexadecimal characters of SHA-256 over those bytes.
For a canonicalization unit vector, `{ "b": 2, "a": 1 }` yields
`{"a":1,"b":2}`; changing array order must change the digest.

Replay bounds and validates the embedded snapshot using the same loader, verifies
its digest and equality of all header identities with snapshot metadata, and
selects an explicitly supported engine/rules/schema/prompt/tool/RNG tuple. It
creates fresh state and re-executes inputs/calls, comparing draws, events,
rejections and states. It never consults the original file, startup default,
provider, executable content or recorded initial state to initialize execution.
Apply the same 1 MiB snapshot limit before allocation of runtime indexes; future
trace readers also need a separately bounded envelope/turn count.

Reject stale digest, header mismatch, unsupported identity, changed calls/draws or
state divergence with specific diagnostics. The digest binds content to its
header; it is not authentication. A coherently rewritten snapshot and trace can
pass. Source files may move, change or disappear without affecting replay.
