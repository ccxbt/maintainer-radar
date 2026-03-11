function daysSince(dateString) {
  const ts = new Date(dateString).getTime();
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, (Date.now() - ts) / (1000 * 60 * 60 * 24));
}

function labelsOf(item) {
  return new Set((item.labels || []).map((l) => String(l.name || "").toLowerCase()));
}

function isIssueWithoutPrMarker(issue) {
  return !issue.pull_request;
}

function issuePriorityScore(issue) {
  const labels = labelsOf(issue);
  let score = 0;

  if (labels.has("security")) score += 120;
  if (labels.has("bug")) score += 65;
  if (labels.has("critical")) score += 80;
  if (labels.has("regression")) score += 40;
  if (labels.has("help wanted")) score += 12;

  if ((issue.labels || []).length === 0) score += 8;

  score += Math.min(90, daysSince(issue.created_at));
  score += Math.min(40, Number(issue.comments || 0) * 2);

  return score;
}

function summarizeAge(items, field = "created_at") {
  if (items.length === 0) {
    return {
      averageDays: 0,
      medianDays: 0,
      p90Days: 0,
    };
  }

  const values = items
    .map((item) => daysSince(item[field]))
    .sort((a, b) => a - b);

  const avg = values.reduce((sum, n) => sum + n, 0) / values.length;
  const median = values[Math.floor(values.length / 2)] || 0;
  const p90 = values[Math.floor(values.length * 0.9)] || 0;

  return {
    averageDays: Number(avg.toFixed(1)),
    medianDays: Number(median.toFixed(1)),
    p90Days: Number(p90.toFixed(1)),
  };
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

  const waitingReviewPrs = openPrs.filter(
    (pr) => !pr.draft && daysSince(pr.created_at) >= prReviewSlaDays,
  );

  const draftPrs = openPrs.filter((pr) => pr.draft);
  const firstTimePrs = openPrs.filter((pr) =>
    ["FIRST_TIMER", "FIRST_TIME_CONTRIBUTOR"].includes(String(pr.author_association || "").toUpperCase()),
  );

  const noDescriptionPrs = openPrs.filter((pr) => !(pr.body || "").trim());

  const highPriorityIssues = openIssues
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
      score: Number(issuePriorityScore(issue).toFixed(1)),
      ageDays: Number(daysSince(issue.created_at).toFixed(1)),
      comments: issue.comments || 0,
      labels: (issue.labels || []).map((l) => l.name),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const actions = [];

  if (issueNoResponse.length > 0) {
    actions.push({
      priority: "high",
      title: "Respond to unanswered issues",
      detail: `${issueNoResponse.length} issue(s) have no maintainer response beyond SLA (${issueResponseSlaDays} days).`,
    });
  }

  if (waitingReviewPrs.length > 0) {
    actions.push({
      priority: "high",
      title: "Review open pull requests",
      detail: `${waitingReviewPrs.length} PR(s) are waiting longer than ${prReviewSlaDays} days.`,
    });
  }

  if (staleIssues.length > 0 || stalePrs.length > 0) {
    actions.push({
      priority: "medium",
      title: "Run stale triage",
      detail: `${staleIssues.length} stale issues and ${stalePrs.length} stale PRs (>${staleDays} days since update).`,
    });
  }

  if (unlabeledIssues.length > 0) {
    actions.push({
      priority: "medium",
      title: "Label unlabeled issues",
      detail: `${unlabeledIssues.length} issue(s) currently have no labels.`,
    });
  }

  if (firstTimePrs.length > 0) {
    actions.push({
      priority: "medium",
      title: "Support first-time contributors",
      detail: `${firstTimePrs.length} open PR(s) from first-time contributors need mentoring/review.`,
    });
  }

  return {
    repository: {
      name: repo.full_name,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssuesCountFromRepo: repo.open_issues_count,
      defaultBranch: repo.default_branch,
      url: repo.html_url,
    },
    generatedAt: new Date().toISOString(),
    thresholds: {
      staleDays,
      issueResponseSlaDays,
      prReviewSlaDays,
    },
    metrics: {
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
      issueAge: summarizeAge(openIssues),
      prAge: summarizeAge(openPrs),
    },
    highPriorityIssues,
    actions,
  };
}
