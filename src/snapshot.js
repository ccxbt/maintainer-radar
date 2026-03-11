import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export function saveSnapshot(path, report) {
  const fullPath = resolve(path);
  writeFileSync(fullPath, JSON.stringify(report, null, 2));
  return fullPath;
}

export function loadSnapshot(path) {
  const fullPath = resolve(path);
  if (!existsSync(fullPath)) {
    throw new Error(`Snapshot file not found: ${fullPath}`);
  }

  const text = readFileSync(fullPath, "utf8");
  const parsed = JSON.parse(text);
  return { fullPath, data: parsed };
}

function delta(current, previous) {
  return Number((current - previous).toFixed(1));
}

function sign(n) {
  if (n > 0) return `+${n}`;
  return `${n}`;
}

export function compareSnapshots(current, previous) {
  if (current.kind !== previous.kind) {
    return {
      comparable: false,
      reason: `Snapshot kind mismatch: current=${current.kind}, previous=${previous.kind}`,
    };
  }

  if (current.kind === "repo") {
    if (current.repository?.name !== previous.repository?.name) {
      return {
        comparable: false,
        reason: `Repository mismatch: current=${current.repository?.name}, previous=${previous.repository?.name}`,
      };
    }

    const metrics = [
      "openIssues",
      "openPrs",
      "staleIssues",
      "stalePrs",
      "unansweredIssuesBeyondSla",
      "waitingReviewPrs",
      "unlabeledIssues",
    ];

    const metricDeltas = metrics.map((metric) => ({
      metric,
      current: current.metrics?.[metric] ?? 0,
      previous: previous.metrics?.[metric] ?? 0,
      delta: delta(current.metrics?.[metric] ?? 0, previous.metrics?.[metric] ?? 0),
    }));

    return {
      comparable: true,
      kind: "repo",
      summary: {
        currentGeneratedAt: current.generatedAt,
        previousGeneratedAt: previous.generatedAt,
        loadScoreDelta: delta(current.maintainerLoadScore ?? 0, previous.maintainerLoadScore ?? 0),
      },
      metricDeltas,
    };
  }

  const orgMetrics = [
    "openIssues",
    "openPrs",
    "unansweredIssuesBeyondSla",
    "waitingReviewPrs",
    "staleIssues",
    "stalePrs",
  ];

  const metricDeltas = orgMetrics.map((metric) => ({
    metric,
    current: current.totals?.[metric] ?? 0,
    previous: previous.totals?.[metric] ?? 0,
    delta: delta(current.totals?.[metric] ?? 0, previous.totals?.[metric] ?? 0),
  }));

  return {
    comparable: true,
    kind: "org",
    summary: {
      currentGeneratedAt: current.generatedAt,
      previousGeneratedAt: previous.generatedAt,
      averageLoadScoreDelta: delta(current.averageLoadScore ?? 0, previous.averageLoadScore ?? 0),
    },
    metricDeltas,
  };
}

export function comparisonToTable(comparison) {
  if (!comparison?.comparable) {
    return `Comparison unavailable: ${comparison?.reason || "unknown reason"}`;
  }

  const lines = [];
  lines.push("Snapshot Comparison");
  lines.push("===================");
  lines.push(`Current:  ${comparison.summary.currentGeneratedAt}`);
  lines.push(`Previous: ${comparison.summary.previousGeneratedAt}`);

  if (comparison.kind === "repo") {
    lines.push(`Load score delta: ${sign(comparison.summary.loadScoreDelta)}`);
  } else {
    lines.push(`Average load score delta: ${sign(comparison.summary.averageLoadScoreDelta)}`);
  }

  lines.push("");
  lines.push("Metric deltas");
  lines.push("-------------");

  for (const row of comparison.metricDeltas) {
    lines.push(`- ${row.metric}: ${row.current} (prev ${row.previous}) => ${sign(row.delta)}`);
  }

  return lines.join("\n");
}
