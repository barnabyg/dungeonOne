const advisory = "https://github.com/advisories/GHSA-fc5q-39xc-vjpf";

// typescript-eslint uses tinyglobby for repository-controlled lint patterns.
// Remove when the toolchain drops affected picomatch, or review by 17 Dec 2026.
export function permitsDevAuditException(report, packages, now = Date.now()) {
  if (
    now >= Date.UTC(2026, 11, 17) ||
    report?.auditReportVersion !== 2 ||
    report.error ||
    !report.vulnerabilities
  ) {
    return false;
  }
  const findings = report.vulnerabilities;
  function isExcepted(name, ancestors) {
    const finding = findings[name];
    if (
      !finding ||
      ancestors.includes(name) ||
      finding.severity !== "high" ||
      !finding.nodes?.length ||
      !finding.nodes.every((node) => packages[node]?.dev === true) ||
      !finding.via?.length
    ) {
      return false;
    }
    return finding.via.every((cause) =>
      typeof cause === "string"
        ? isExcepted(cause, [...ancestors, name])
        : name === "picomatch" &&
          cause?.url === advisory &&
          cause.severity === "high",
    );
  }
  const blocking = Object.keys(findings).filter((name) =>
    ["high", "critical"].includes(findings[name].severity),
  );
  return blocking.length > 0 && blocking.every((name) => isExcepted(name, []));
}
