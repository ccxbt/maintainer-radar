function pad(text, width) {
  const value = String(text);
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}

function formatPriority(priority) {
  if (priority === "high") return "🔥 HIGH";
  if (priority === "medium") return "⚠️ MED";
  return "ℹ️ LOW";
}

function loadBandBadge(loadBand) {
  if (loadBand === "critical") return "🔴 critical";
  if (loadBand === "high") return "🟠 high";
  if (loadBand === "moderate") return "🟡 moderate";
  return "🟢 low";
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

function topLabelLine(items) {
  if (!items || items.length === 0) return "none";
  return items
    .slice(0, 6)
    .map((i) => `${i.label}(${i.count})`)
    .join(", ");
}

function repoToTable(report) {
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

  lines.push("Maintainer Load");
  lines.push("--------------");
  lines.push(`Score: ${report.maintainerLoadScore} (${loadBandBadge(report.maintainerLoadBand)})`);
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
    `Issue age (days) avg=${report.metrics.issueAge.averageDays} median=${report.metrics.issueAge.medianDays} p90=${report.metrics.issueAge.p90Days} max=${report.metrics.issueAge.maxDays}`,
  );
  lines.push(
    `PR age (days)    avg=${report.metrics.prAge.averageDays} median=${report.metrics.prAge.medianDays} p90=${report.metrics.prAge.p90Days} max=${report.metrics.prAge.maxDays}`,
  );
  lines.push("");

  lines.push("Label Hotspots");
  lines.push("--------------");
  lines.push(`Issue labels: ${topLabelLine(report.metrics.issueLabelTop)}`);
  lines.push(`PR labels:    ${topLabelLine(report.metrics.prLabelTop)}`);
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
    for (const issue of report.highPriorityIssues.slice(0, 12)) {
      lines.push(
        `- #${issue.number} (score=${issue.score}, age=${issue.ageDays}d, comments=${issue.comments}) ${issue.title}`,
      );
      lines.push(`  ${issue.html_url}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function orgToTable(report) {
  const lines = [];

  lines.push("Maintainer Radar Portfolio Report");
  lines.push("================================");
  lines.push(`Organization: ${report.organization}`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Repositories analyzed: ${report.repositoryCount}`);
  lines.push(`Average load score: ${report.averageLoadScore}`);
  lines.push("");

  lines.push("Portfolio Totals");
  lines.push("---------------");
  lines.push(`Open issues: ${report.totals.openIssues}`);
  lines.push(`Open PRs: ${report.totals.openPrs}`);
  lines.push(`Unanswered issues beyond SLA: ${report.totals.unansweredIssuesBeyondSla}`);
  lines.push(`PRs waiting review: ${report.totals.waitingReviewPrs}`);
  lines.push(`Stale issues: ${report.totals.staleIssues}`);
  lines.push(`Stale PRs: ${report.totals.stalePrs}`);
  lines.push("");

  lines.push("Top Risk Repositories");
  lines.push("---------------------");
  if (report.topRiskRepositories.length === 0) {
    lines.push("- No repositories analyzed.");
  } else {
    for (const repo of report.topRiskRepositories) {
      lines.push(
        `- ${repo.name} | score=${repo.loadScore} (${repo.loadBand}) | waiting-review=${repo.waitingReviewPrs} | unanswered=${repo.unansweredIssues} | stale issues/prs=${repo.staleIssues}/${repo.stalePrs}`,
      );
      lines.push(`  ${repo.url}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function repoToMarkdown(report) {
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
- **Maintainer load:** ${report.maintainerLoadScore} (${report.maintainerLoadBand})
- **Thresholds:** stale>${report.thresholds.staleDays}d · issue-response>${report.thresholds.issueResponseSlaDays}d · pr-review>${report.thresholds.prReviewSlaDays}d

## Core Metrics

| Metric | Value |
|---|---:|
${metricRows}

## Age Distribution

- **Issue age (days):** avg=${report.metrics.issueAge.averageDays}, median=${report.metrics.issueAge.medianDays}, p90=${report.metrics.issueAge.p90Days}, max=${report.metrics.issueAge.maxDays}
- **PR age (days):** avg=${report.metrics.prAge.averageDays}, median=${report.metrics.prAge.medianDays}, p90=${report.metrics.prAge.p90Days}, max=${report.metrics.prAge.maxDays}

## Label Hotspots

- **Issue labels:** ${topLabelLine(report.metrics.issueLabelTop)}
- **PR labels:** ${topLabelLine(report.metrics.prLabelTop)}

## Recommended Actions

${actions}

## Top Priority Issues

${issues}
`;
}

function orgToMarkdown(report) {
  const topRepos =
    report.topRiskRepositories.length === 0
      ? "- No repositories analyzed."
      : report.topRiskRepositories
          .map(
            (repo) =>
              `- [${repo.name}](${repo.url}) · score=${repo.loadScore} (${repo.loadBand}) · waiting-review=${repo.waitingReviewPrs} · unanswered=${repo.unansweredIssues} · stale=${repo.staleIssues}/${repo.stalePrs}`,
          )
          .join("\n");

  return `# Maintainer Radar Portfolio Report

- **Organization:** ${report.organization}
- **Generated:** ${report.generatedAt}
- **Repositories analyzed:** ${report.repositoryCount}
- **Average load score:** ${report.averageLoadScore}

## Portfolio Totals

| Metric | Value |
|---|---:|
| Open issues | ${report.totals.openIssues} |
| Open PRs | ${report.totals.openPrs} |
| Unanswered issues beyond SLA | ${report.totals.unansweredIssuesBeyondSla} |
| PRs waiting review | ${report.totals.waitingReviewPrs} |
| Stale issues | ${report.totals.staleIssues} |
| Stale PRs | ${report.totals.stalePrs} |

## Top Risk Repositories

${topRepos}
`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function repoToHtml(report) {
  const issueRows = report.highPriorityIssues
    .slice(0, 12)
    .map(
      (i) => `<tr><td><a href="${escapeHtml(i.html_url)}">#${i.number}</a></td><td>${escapeHtml(i.title)}</td><td>${i.score}</td><td>${i.ageDays}</td><td>${i.comments}</td></tr>`,
    )
    .join("\n");

  const actionRows = report.actions
    .map((a) => `<li><strong>${escapeHtml(formatPriority(a.priority))}</strong> ${escapeHtml(a.title)} — ${escapeHtml(a.detail)}</li>`)
    .join("\n");

  const metricRows = buildMetricRows(report)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Maintainer Radar - ${escapeHtml(report.repository.name)}</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 24px; color: #12202f; }
    h1, h2 { margin: 0 0 10px; }
    .meta { color: #4b5f74; margin-bottom: 18px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
    th, td { border: 1px solid #d6e1ec; padding: 8px; text-align: left; }
    th { background: #f2f6fb; }
    .pill { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #eef4fb; border: 1px solid #d0deed; }
  </style>
</head>
<body>
  <h1>Maintainer Radar Report</h1>
  <div class="meta">${escapeHtml(report.repository.name)} · generated ${escapeHtml(report.generatedAt)} · load score ${report.maintainerLoadScore} (${escapeHtml(report.maintainerLoadBand)})</div>

  <h2>Core Metrics</h2>
  <table>
    <tbody>${metricRows}</tbody>
  </table>

  <h2>Recommended Actions</h2>
  <ul>${actionRows || "<li>No urgent actions detected.</li>"}</ul>

  <h2>Top Priority Issues</h2>
  <table>
    <thead><tr><th>Issue</th><th>Title</th><th>Score</th><th>Age (days)</th><th>Comments</th></tr></thead>
    <tbody>${issueRows}</tbody>
  </table>
</body>
</html>`;
}

function orgToHtml(report) {
  const rows = report.topRiskRepositories
    .map(
      (repo) =>
        `<tr><td><a href="${escapeHtml(repo.url)}">${escapeHtml(repo.name)}</a></td><td>${repo.loadScore}</td><td>${escapeHtml(repo.loadBand)}</td><td>${repo.waitingReviewPrs}</td><td>${repo.unansweredIssues}</td><td>${repo.staleIssues}/${repo.stalePrs}</td></tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Maintainer Radar Portfolio - ${escapeHtml(report.organization)}</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 24px; color: #12202f; }
    h1, h2 { margin: 0 0 10px; }
    .meta { color: #4b5f74; margin-bottom: 18px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
    th, td { border: 1px solid #d6e1ec; padding: 8px; text-align: left; }
    th { background: #f2f6fb; }
  </style>
</head>
<body>
  <h1>Maintainer Radar Portfolio Report</h1>
  <div class="meta">Org ${escapeHtml(report.organization)} · generated ${escapeHtml(report.generatedAt)} · repos ${report.repositoryCount}</div>

  <h2>Portfolio Totals</h2>
  <ul>
    <li>Open issues: ${report.totals.openIssues}</li>
    <li>Open PRs: ${report.totals.openPrs}</li>
    <li>Unanswered issues beyond SLA: ${report.totals.unansweredIssuesBeyondSla}</li>
    <li>PRs waiting review: ${report.totals.waitingReviewPrs}</li>
    <li>Stale issues/prs: ${report.totals.staleIssues}/${report.totals.stalePrs}</li>
  </ul>

  <h2>Top Risk Repositories</h2>
  <table>
    <thead><tr><th>Repository</th><th>Load Score</th><th>Band</th><th>Waiting PR Review</th><th>Unanswered Issues</th><th>Stale (issue/pr)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

export function toTable(report) {
  if (report.kind === "org") return orgToTable(report);
  return repoToTable(report);
}

export function toMarkdown(report) {
  if (report.kind === "org") return orgToMarkdown(report);
  return repoToMarkdown(report);
}

export function toHtml(report) {
  if (report.kind === "org") return orgToHtml(report);
  return repoToHtml(report);
}
