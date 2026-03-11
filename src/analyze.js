function daysSince(dateString) {
  const ts = new Date(dateString).getTime();
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, (Date.now() - ts) / (1000 * 60 * 60 * 24));
}

function labelsOf(item) {
  return new Set((item.labels || []).map((l) => String(l.name || "").toLowerCase()));
}

function summarizeAge(items, field = "created_at") {
  if (items.length === 0) {
    return {
      averageDays: 0,
      medianDays: 0,
      p90Days: 0,
      maxDays: 0,
    };
  }

  const values = items
    .map((item) => daysSince(item[field]))
    .sort((a, b) => a - b);

  const avg = values.reduce((sum, n) => sum + n, 0) / values.length;
  const median = values[Math.floor(values.length / 2)] || 0;
  const p90 = values[Math.floor(values.length * 0.9)] || 0;
  const max = values[values.length - 1] || 0;

  return {
    averageDays: Number(avg.toFixed(1)),
    medianDays: Number(median.toFixed(1)),
    p90Days: Number(p90.toFixed(1)),
    maxDays: Number(max.toFixed(1)),
  };
}

function isIssueWithoutPrMarker(issue) {
  return !issue.pull_request;
}

function labelHistogram(items) {
  const counts = new Map();

  for (const item of items) {
    for (const label of item.labels || []) {
      const name = String(label.name || "").trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

function issuePriorityScore(issue) {
  const labels = labelsOf(issue);
  let score = 0;

  const weightedLabels = [
    ["security", 120],
    ["vulnerability", 120],
    ["critical", 90],
    ["bug", 65],
    ["regression", 50],
    ["data-loss", 65],
    ["performance", 35],
    ["needs triage", 20],
    ["help wanted", 14],
  ];

  for (const [label, value] of weightedLabels) {
    if (labels.has(label)) score += value;
  }

  if ((issue.labels || []).length === 0) score += 10;

  const age = daysSince(issue.created_at);
  score += Math.min(100, age * 0.9);
  score += Math.min(45, Number(issue.comments || 0) * 2.5);

  return Number(score.toFixed(1));
}

function buildMaintainerLoadScore(metrics) {
  const score =
    metrics.unansweredIssuesBeyondSla * 12 +
    metrics.waitingReviewPrs * 10 +
    metrics.staleIssues * 8 +
    metrics.stalePrs * 7 +
    metrics.unlabeledIssues * 2 +
    metrics.issueAge.p90Days * 0.8 +
    metrics.prAge.p90Days * 0.8;

  return Number(score.toFixed(1));
}

function loadBand(score) {
  if (score >= 220) return "critical";
  if (score >= 120) return "high";
  if (score >= 55) return "moderate";
  return "low";
}

function action(priority, title, detail) {
  return { priority, title, detail };
}

export function analyzeRepository({
  repo,
  openIssuesRaw,
  openPrs,
  staleDays,
  issueResponseSlaDays,
  prReviewSlaDays,
}) {
  const openIssues = openIssuesRaw.filter(isIssueWithoutPrMarker);

  const staleIssues = openIssues.filter((issue) => daysSince(issue.updated_at) >= staleDays);
  const stalePrs = openPrs.filter((pr) => daysSince(pr.updated_at) >= staleDays);

  const unlabeledIssues = openIssues.filter((issue) => (issue.labels || []).length === 0);
  const noDescriptionIssues = openIssues.filter((issue) => !(issue.body || "").trim());

  const issueNoResponse = openIssues.filter(
    (issue) => Number(issue.comments || 0) === 0 && daysSince(issue.created_at) >= issueResponseSlaDays,
  );

  const waitingReviewPrs = openPrs.filter((pr) => !pr.draft && daysSince(pr.created_at) >= prReviewSlaDays);
  const draftPrs = openPrs.filter((pr) => pr.draft);

  const firstTimePrs = openPrs.filter((pr) =>
    ["FIRST_TIMER", "FIRST_TIME_CONTRIBUTOR"].includes(String(pr.author_association || "").toUpperCase()),
  );

  const noDescriptionPrs = openPrs.filter((pr) => !(pr.body || "").trim());

  const issueAge = summarizeAge(openIssues);
  const prAge = summarizeAge(openPrs);

  const highPriorityIssues = openIssues
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
      score: issuePriorityScore(issue),
      ageDays: Number(daysSince(issue.created_at).toFixed(1)),
      comments: issue.comments || 0,
      labels: (issue.labels || []).map((l) => l.name),
      author: issue.user?.login || "unknown",
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  const metrics = {
    openIssues: openIssues.length,
    openPrs: openPrs.length,
    staleIssues: staleIssues.length,
    stalePrs: stalePrs.length,
    unlabeledIssues: unlabeledIssues.length,
    noDescriptionIssues: noDescriptionIssues.length,
    noDescriptionPrs: noDescriptionPrs.length,
    unansweredIssuesBeyondSla: issueNoResponse.length,
    waitingReviewPrs: waitingReviewPrs.length,
    draftPrs: draftPrs.length,
    firstTimeContributorPrs: firstTimePrs.length,
    issueAge,
    prAge,
    issueLabelTop: labelHistogram(openIssues),
    prLabelTop: labelHistogram(openPrs),
  };

  const maintainerLoadScore = buildMaintainerLoadScore(metrics);
  const maintainerLoadBand = loadBand(maintainerLoadScore);

  const actions = [];

  if (issueNoResponse.length > 0) {
    actions.push(
      action(
        "high",
        "Respond to unanswered issues",
        `${issueNoResponse.length} issue(s) have no maintainer response beyond SLA (${issueResponseSlaDays} days).`,
      ),
    );
  }

  if (waitingReviewPrs.length > 0) {
    actions.push(
      action(
        "high",
        "Review open pull requests",
        `${waitingReviewPrs.length} PR(s) are waiting longer than ${prReviewSlaDays} days.`,
      ),
    );
  }

  if (staleIssues.length > 0 || stalePrs.length > 0) {
    actions.push(
      action(
        "medium",
        "Run stale triage",
        `${staleIssues.length} stale issues and ${stalePrs.length} stale PRs (>${staleDays} days since update).`,
      ),
    );
  }

  if (unlabeledIssues.length > 0) {
    actions.push(
      action("medium", "Label unlabeled issues", `${unlabeledIssues.length} issue(s) currently have no labels.`),
    );
  }

  if (firstTimePrs.length > 0) {
    actions.push(
      action(
        "medium",
        "Support first-time contributors",
        `${firstTimePrs.length} open PR(s) from first-time contributors need mentoring/review.`,
      ),
    );
  }

  if (noDescriptionIssues.length + noDescriptionPrs.length > 0) {
    actions.push(
      action(
        "low",
        "Improve issue/PR templates",
        `${noDescriptionIssues.length} issue(s) and ${noDescriptionPrs.length} PR(s) are missing descriptions.`,
      ),
    );
  }

  return {
    kind: "repo",
    repository: {
      name: repo.full_name,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      watchers: repo.subscribers_count,
      openIssuesCountFromRepo: repo.open_issues_count,
      defaultBranch: repo.default_branch,
      url: repo.html_url,
      language: repo.language,
    },
    generatedAt: new Date().toISOString(),
    thresholds: {
      staleDays,
      issueResponseSlaDays,
      prReviewSlaDays,
    },
    metrics,
    maintainerLoadScore,
    maintainerLoadBand,
    highPriorityIssues,
    actions,
  };
}

export function analyzePortfolio({ orgName, repoReports }) {
  const reports = [...repoReports]
    .filter((r) => r?.kind === "repo")
    .sort((a, b) => b.maintainerLoadScore - a.maintainerLoadScore);

  const total = reports.reduce(
    (acc, report) => {
      acc.openIssues += report.metrics.openIssues;
      acc.openPrs += report.metrics.openPrs;
      acc.waitingReviewPrs += report.metrics.waitingReviewPrs;
      acc.unansweredIssuesBeyondSla += report.metrics.unansweredIssuesBeyondSla;
      acc.staleIssues += report.metrics.staleIssues;
      acc.stalePrs += report.metrics.stalePrs;
      return acc;
    },
    {
      openIssues: 0,
      openPrs: 0,
      waitingReviewPrs: 0,
      unansweredIssuesBeyondSla: 0,
      staleIssues: 0,
      stalePrs: 0,
    },
  );

  const averageLoad = reports.length
    ? Number((reports.reduce((sum, r) => sum + r.maintainerLoadScore, 0) / reports.length).toFixed(1))
    : 0;

  return {
    kind: "org",
    organization: orgName,
    generatedAt: new Date().toISOString(),
    repositoryCount: reports.length,
    totals: total,
    averageLoadScore: averageLoad,
    topRiskRepositories: reports.slice(0, 12).map((r) => ({
      name: r.repository.name,
      url: r.repository.url,
      loadScore: r.maintainerLoadScore,
      loadBand: r.maintainerLoadBand,
      waitingReviewPrs: r.metrics.waitingReviewPrs,
      unansweredIssues: r.metrics.unansweredIssuesBeyondSla,
      staleIssues: r.metrics.staleIssues,
      stalePrs: r.metrics.stalePrs,
    })),
    reports,
  };
}
