import assert from "node:assert/strict";
import test from "node:test";

import { permitsDevAuditException } from "../scripts/dev-audit-exception.mjs";

const now = Date.UTC(2026, 10, 17);
const packages = {
  "node_modules/picomatch": { dev: true },
  "node_modules/tinyglobby": { dev: true },
};
function report() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      tinyglobby: {
        severity: "high",
        nodes: ["node_modules/tinyglobby"],
        via: ["picomatch"],
      },
      picomatch: {
        severity: "high",
        nodes: ["node_modules/picomatch"],
        via: [
          {
            severity: "high",
            url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
          },
        ],
      },
    },
  };
}
test("the temporary lint advisory covers its development-only dependants until review", () => {
  assert.equal(permitsDevAuditException(report(), packages, now), true);
  assert.equal(
    permitsDevAuditException(report(), packages, Date.UTC(2026, 11, 17)),
    false,
  );
  assert.equal(
    permitsDevAuditException(
      report(),
      { ...packages, "node_modules/picomatch": {} },
      now,
    ),
    false,
  );
});
test("other causes, critical findings, incomplete reports and audit failures still block", () => {
  for (const change of [
    (r) =>
      r.vulnerabilities.picomatch.via.push({
        severity: "high",
        url: "another advisory",
      }),
    (r) => {
      r.vulnerabilities.tinyglobby.severity = "critical";
    },
    (r) => r.vulnerabilities.tinyglobby.via.push("missing"),
    (r) => r.vulnerabilities.tinyglobby.via.push("tinyglobby"),
    (r) => {
      r.error = { code: "registry failure" };
    },
  ]) {
    const r = report();
    change(r);
    assert.equal(permitsDevAuditException(r, packages, now), false);
  }
});
