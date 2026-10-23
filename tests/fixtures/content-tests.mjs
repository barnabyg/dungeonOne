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
    "tests/fixtures/gate-workers.mjs",
    "gates shipped modules on worker threads for shipped-modules.test.mjs (#469); each worker loads its module by id",
  ],
  [
    "tests/shipped-modules.test.mjs",
    "loads and validates every shipped module, its budget and tiers, the gate's verdict on each, the browser's adventure list, the career through them (#290), each one's map (#456) and its Leave warning (#475)",
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
    "tests/issue-507-content.test.mjs",
    "plays every shipped module with every item Scarce items found may take missing (#507)",
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
    "tests/issue-540-browser.test.mjs",
    "the caster items Coldwater Weirgate and Thornwood Lodge hide, and a Wizard finding Thornwood's through the browser (#540)",
  ],
  [
    "tests/coldwater-weirgate.test.mjs",
    "the Coldwater Weirgate's content, routes, flags, alarm, bargain, lure, journeys and generated release run",
  ],
  [
    "tests/issue-414-browser.test.mjs",
    "the increment 17 handoff runs of the Coldwater Weirgate through the browser",
  ],
  [
    "tests/issue-448-browser.test.mjs",
    "the four-module handoff runs, one per shipped module, through the browser",
  ],
  [
    "tests/issue-413.test.mjs",
    "the Coldwater Weirgate's AI DM evaluation cases (#413)",
  ],
  [
    "tests/bramblecote-cider-house.test.mjs",
    "the Bramblecote Cider House's content, routes, surrender, journeys and generated release run",
  ],
  [
    "tests/issue-409-live.test.mjs",
    "the live release script's generated route (#409) through the Coldwater Weirgate",
  ],
]);
