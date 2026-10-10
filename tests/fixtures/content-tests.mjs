// The tests about shipped content (#251). tests/fixture-separation.test.mjs
// lets only these read a shipped module, and scripts/run-tests.mjs runs them
// as the content tier.

/**
 * The tests about shipped content, and why each may read a shipped module.
 * Everything else under tests/ must use fixtures.
 */
export const CONTENT_TESTS = new Map([
  [
    "tests/fixtures/content-tests.mjs",
    "this list: it names the content tests and what each reads",
  ],
  [
    "tests/test-tiers.test.mjs",
    "names shipped module paths and the launcher to check which tests a change to them runs; it reads none",
  ],
  [
    "tests/fixture-separation.test.mjs",
    "this check: it names the shipped modules to look for them",
  ],
  [
    "tests/shipped-modules.test.mjs",
    "loads and validates every shipped module, its budget and tiers, the gate's verdict on each, the browser's adventure list and the career through them (#290)",
  ],
  [
    "tests/abandoned-delve.test.mjs",
    "the Abandoned Delve's content, gate verdict, scripted runs, DM evaluation cases and live qualification",
  ],
  [
    "tests/abandoned-delve-browser.test.mjs",
    "the Abandoned Delve's handoff run through the browser",
  ],
  [
    "tests/issue-137-browser.test.mjs",
    "the default launch's handoff run of the Abandoned Delve, which only the shipped modules reach",
  ],
  ["tests/issue-140.test.mjs", "the #140 release run of the Abandoned Delve"],
  [
    "tests/issue-211.test.mjs",
    "the Tinker's Toll's content, gate verdict and #211 release run",
  ],
  [
    "tests/issue-211-browser.test.mjs",
    "the Tinker's Toll's handoff run through the browser",
  ],
  [
    "tests/issue-241.test.mjs",
    "the Silvervein Mine's content, scripted-DM journeys and #241 release run",
  ],
  [
    "tests/issue-241-browser.test.mjs",
    "the Silvervein Mine's handoff run through the browser",
  ],
  [
    "tests/shepherds-bothy.test.mjs",
    "the Shepherd's Bothy's content, gate verdict and journeys",
  ],
  [
    "tests/drowned-chapel.test.mjs",
    "the Drowned Chapel's content, gate verdict and journeys",
  ],
  [
    "tests/gravediggers-lodge.test.mjs",
    "the Gravedigger's Lodge's content, gate verdict and journeys",
  ],
  [
    "tests/ravagers-tower.test.mjs",
    "the Ravager's Tower's content, gate verdict and journeys",
  ],
  [
    "tests/issue-275-browser.test.mjs",
    "the #275 modules' handoff runs through the browser",
  ],
  [
    "tests/wolfstone-hillfort.test.mjs",
    "the Wolfstone Hillfort's content, gate verdict, checks and journeys",
  ],
  [
    "tests/issue-289-browser.test.mjs",
    "the Wolfstone Hillfort's handoff runs through the browser",
  ],
  [
    "tests/thornwood-lodge.test.mjs",
    "the Thornwood Lodge's content, gate verdict, checks and journeys",
  ],
  [
    "tests/issue-291-browser.test.mjs",
    "the increment 14 handoff runs through the browser",
  ],
  [
    "tests/mallow-counting-house.test.mjs",
    "the Counting-House on Mallow Quay's content, gate verdict, reactions, locks, trap, journeys and release run",
  ],
  [
    "tests/issue-311-browser.test.mjs",
    "the increment 15 handoff runs through the browser",
  ],
]);
