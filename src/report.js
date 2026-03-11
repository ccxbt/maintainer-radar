function pad(text, width) {
  const value = String(text);
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}

function formatPriority(priority) {
  if (priority === "high") return "🔥 HIGH";
  if (priority === "medium") return "⚠️ MED";
  return "ℹ️ LOW";
}

function buildMetricRows(report) {
  const m = report.metrics;
  return [
    ["Open issues", m.openIssues],
    ["Open PRs", m.openPrs],
    ["Stale issues", m.staleIssues],
    ["Stale PRs", m.stalePrs],
    ["Unanswered issues (SLA)", m.unansweredIssuesBeyondSla],
    ["Waiting review PRs", m.waitingReviewPrs],
    ["Unlabeled issues", m.unlabeledIssues],
    ["First-time contributor PRs", m.firstTimeContributorPrs],
  ];
}

export function toTable(report) {
  const lines = [];

  lines.push("Maintainer Radar Report");
  lines.push("=======================");
  lines.push(`Repository: ${report.repository.name}`);
  lines.push(`URL: ${report.repository.url}`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(
    `Thresholds: stale>${report.thresholds.staleDays}d | issue-response>${report.thresholds.issueResponseSlaDays}d | pr-review>${report.thresholds.prReviewSlaDays}d`,
  );
  lines.push("");

  lines.push("Core Metrics");
  lines.push("------------");
  for (const [label, value] of buildMetricRows(report)) {
    lines.push(`${pad(label, 28)} : ${value}`);
  }
  lines.push("");

  lines.push("Age Distribution");
  lines.push("---------------");
  lines.push(
    `Issue age (days) avg=${report.metrics.issueAge.averageDays} median=${report.metrics.issueAge.medianDays} p90=${report.metrics.issueAge.p90Days}`,
  );
  lines.push(
    `PR age (days)    avg=${report.metrics.prAge.averageDays} median=${report.metrics.prAge.medianDays} p90=${report.metrics.prAge.p90Days}`,
  );
  lines.push("");

  lines.push("Recommended Actions");
  lines.push("-------------------");
  if (report.actions.length === 0) {
    lines.push("- No urgent maintainer actions detected.");
  } else {
    for (const action of report.actions) {
      lines.push(`- ${formatPriority(action.priority)} ${action.title}: ${action.detail}`);
    }
  }
  lines.push("");

  lines.push("Top Priority Issues");
  lines.push("-------------------");
  if (report.highPriorityIssues.length === 0) {
    lines.push("- No issues found.");
  } else {
    for (const issue of report.highPriorityIssues.slice(0, 10)) {
      lines.push(
        `- #${issue.number} (score=${issue.score}, age=${issue.ageDays}d, comments=${issue.comments}) ${issue.title}`,
      );
      lines.push(`  ${issue.html_url}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function toMarkdown(report) {
  const metricRows = buildMetricRows(report)
    .map(([label, value]) => `| ${label} | ${value} |`)
    .join("\n");

  const actions =
    report.actions.length === 0
      ? "- No urgent maintainer actions detected."
      : report.actions
          .map((action) => `- **${formatPriority(action.priority)}** ${action.title} — ${action.detail}`)
          .join("\n");

  const issues =
    report.highPriorityIssues.length === 0
      ? "- No issues found."
      : report.highPriorityIssues
          .slice(0, 12)
          .map(
            (issue) =>
              `- [#${issue.number}](${issue.html_url}) · score=${issue.score} · age=${issue.ageDays}d · comments=${issue.comments}\n  - ${issue.title}`,
          )
          .join("\n");

  return `# Maintainer Radar Report

- **Repository:** [${report.repository.name}](${report.repository.url})
- **Generated:** ${report.generatedAt}
- **Thresholds:** stale>${report.thresholds.staleDays}d · issue-response>${report.thresholds.issueResponseSlaDays}d · pr-review>${report.thresholds.prReviewSlaDays}d

## Core Metrics

| Metric | Value |
|---|---:|
${metricRows}

## Age Distribution

- **Issue age (days):** avg=${report.metrics.issueAge.averageDays}, median=${report.metrics.issueAge.medianDays}, p90=${report.metrics.issueAge.p90Days}
- **PR age (days):** avg=${report.metrics.prAge.averageDays}, median=${report.metrics.prAge.medianDays}, p90=${report.metrics.prAge.p90Days}

## Recommended Actions

${actions}

## Top Priority Issues

${issues}
`;
}
