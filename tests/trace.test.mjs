import assert from "node:assert/strict";
import test from "node:test";

import { createSession, handleAction } from "../dist/session.js";
import {
  completeSessionTrace,
  createSessionTrace,
  recordTraceAction,
  serializeSessionTrace,
} from "../dist/trace.js";

test("trace serialization reports serialization failures clearly", () => {
  const state = createSession();
  const result = handleAction(state, { type: "look" });
  const trace = createSessionTrace(7, state);
  recordTraceAction(trace, "look", { type: "look" }, [], result);
  completeSessionTrace(trace, "eof", result.state);
  trace.actions[0].stateAfter.loop = trace;

  assert.throws(
    () => serializeSessionTrace(trace),
    /Unable to serialize session trace/i,
  );
});
