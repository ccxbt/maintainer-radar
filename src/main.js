import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzePortfolio, analyzeRepository } from "./analyze.js";
import { GitHubClient } from "./github.js";
import { toHtml, toMarkdown, toTable } from "./report.js";
import {
  compareSnapshots,
  comparisonToTable,
  loadSnapshot,
  saveSnapshot,
} from "./snapshot.js";

function printHelp() {
  console.log(`maintainer-radar - actionable OSS maintainer triage reports

Usage:
  maintainer-radar repo <owner/name> [options]
  maintainer-radar org <org-name> [options]

Global options:
  --format <table|markdown|json|html>   Output format (default: table)
  --token <value>                       GitHub token (or GH_TOKEN / GITHUB_TOKEN)
  --out <path>                          Write output to file
  --config <path>                       JSON config file
  --save-snapshot <path>                Save structured report snapshot (.json)
  --compare-snapshot <path>             Compare current run with previous snapshot
  --help                                Show this help

Triage options:
  --stale-days <n>                      Stale threshold in days (default: 30)
  --issue-sla-days <n>                  Issue first-response SLA days (default: 3)
  --pr-sla-days <n>                     PR review SLA days (default: 5)

GitHub fetch options:
  --per-page <n>                        Items per GitHub page (default: 100)
  --max-pages <n>                       Max pages to fetch (default: 5)

Organization-only options:
  --repo-limit <n>                      Number of repos to analyze in org mode (default: 12)
  --include-archived                    Include archived repositories

Examples:
  maintainer-radar repo openclaw/openclaw
  maintainer-radar repo owner/repo --format markdown --out report.md
  maintainer-radar org openclaw --repo-limit 20 --format table
  maintainer-radar repo owner/repo --save-snapshot snap.json --compare-snapshot prev.json
`);
}

function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Invalid numeric option: ${value}`);
  }
  return Math.floor(num);
}

function defaultOptions() {
  return {
    format: "table",
    staleDays: 30,
    issueSlaDays: 3,
    prSlaDays: 5,
    perPage: 100,
    maxPages: 5,
    repoLimit: 12,
    includeArchived: false,
    token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "",
    out: "",
    saveSnapshotPath: "",
    compareSnapshotPath: "",
    configPath: "",
  };
}

function mergeOptions(base, patch) {
  return {
    ...base,
    ...patch,
  };
}

function loadConfig(path) {
  const fullPath = resolve(path);
  const text = readFileSync(fullPath, "utf8");
  const parsed = JSON.parse(text);
  if (typeof parsed !== "object" || !parsed) {
    throw new Error(`Invalid config file: ${fullPath}`);
  }
  return parsed;
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }

  const [command, target] = argv;
  if (!command || !target) {
    throw new Error("Usage: maintainer-radar <repo|org> <target> [options]");
  }

  if (!["repo", "org"].includes(command)) {
    throw new Error(`Unknown command '${command}'. Use 'repo' or 'org'.`);
  }

  let options = defaultOptions();

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === "--format" && next) {
      options.format = next;
      i += 1;
    } else if (token === "--stale-days" && next) {
      options.staleDays = parseInteger(next, options.staleDays);
      i += 1;
    } else if (token === "--issue-sla-days" && next) {
      options.issueSlaDays = parseInteger(next, options.issueSlaDays);
      i += 1;
    } else if (token === "--pr-sla-days" && next) {
      options.prSlaDays = parseInteger(next, options.prSlaDays);
      i += 1;
    } else if (token === "--per-page" && next) {
      options.perPage = parseInteger(next, options.perPage);
      i += 1;
    } else if (token === "--max-pages" && next) {
      options.maxPages = parseInteger(next, options.maxPages);
      i += 1;
    } else if (token === "--repo-limit" && next) {
      options.repoLimit = parseInteger(next, options.repoLimit);
      i += 1;
    } else if (token === "--token" && next) {
      options.token = next;
      i += 1;
    } else if (token === "--out" && next) {
      options.out = next;
      i += 1;
    } else if (token === "--save-snapshot" && next) {
      options.saveSnapshotPath = next;
      i += 1;
    } else if (token === "--compare-snapshot" && next) {
      options.compareSnapshotPath = next;
      i += 1;
    } else if (token === "--config" && next) {
      options.configPath = next;
      i += 1;
    } else if (token === "--include-archived") {
      options.includeArchived = true;
    }
  }

  if (options.configPath) {
    options = mergeOptions(options, loadConfig(options.configPath));
  }

  if (!["table", "markdown", "json", "html"].includes(options.format)) {
    throw new Error(`Invalid format: ${options.format}`);
  }

  if (command === "repo" && !/^[^/]+\/[\w.-]+$/.test(target)) {
    throw new Error(`Invalid repository format '${target}'. Use owner/name.`);
  }

  if (command === "org" && !/^[A-Za-z0-9_.-]+$/.test(target)) {
    throw new Error(`Invalid organization name '${target}'.`);
  }

  return {
    help: false,
    command,
    target,
    options,
  };
}

async function generateRepoReport({ client, repoName, options }) {
  const [owner, repo] = repoName.split("/");

  const [repoInfo, openIssuesRaw, openPrs] = await Promise.all([
    client.request(`/repos/${owner}/${repo}`),
    client.paginate(`/repos/${owner}/${repo}/issues`, {
      state: "open",
      sort: "updated",
      direction: "desc",
      perPage: options.perPage,
      maxPages: options.maxPages,
    }),
    client.paginate(`/repos/${owner}/${repo}/pulls`, {
      state: "open",
      sort: "updated",
      direction: "desc",
      perPage: options.perPage,
      maxPages: options.maxPages,
    }),
  ]);

  return analyzeRepository({
    repo: repoInfo,
    openIssuesRaw,
    openPrs,
    staleDays: options.staleDays,
    issueResponseSlaDays: options.issueSlaDays,
    prReviewSlaDays: options.prSlaDays,
  });
}

async function generateOrgReport({ client, org, options }) {
  const repos = await client.paginate(`/orgs/${org}/repos`, {
    type: "public",
    sort: "updated",
    direction: "desc",
    perPage: options.perPage,
    maxPages: options.maxPages,
  });

  const selectedRepos = repos
    .filter((repo) => (options.includeArchived ? true : !repo.archived))
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, options.repoLimit);

  const reports = [];

  for (const repo of selectedRepos) {
    const repoName = repo.full_name;
    try {
      // sequential for predictable API usage
      const report = await generateRepoReport({
        client,
        repoName,
        options,
      });
      reports.push(report);
    } catch (error) {
      reports.push({
        kind: "repo",
        repository: {
          name: repoName,
          url: repo.html_url,
          stars: repo.stargazers_count,
        },
        generatedAt: new Date().toISOString(),
        metrics: {
          openIssues: 0,
          openPrs: 0,
          staleIssues: 0,
          stalePrs: 0,
          unansweredIssuesBeyondSla: 0,
          waitingReviewPrs: 0,
          unlabeledIssues: 0,
          firstTimeContributorPrs: 0,
          issueAge: { averageDays: 0, medianDays: 0, p90Days: 0, maxDays: 0 },
          prAge: { averageDays: 0, medianDays: 0, p90Days: 0, maxDays: 0 },
          issueLabelTop: [],
          prLabelTop: [],
        },
        maintainerLoadScore: 0,
        maintainerLoadBand: "low",
        actions: [
          {
            priority: "high",
            title: "Scan failed",
            detail: `Could not analyze ${repoName}: ${error.message}`,
          },
        ],
        highPriorityIssues: [],
      });
    }
  }

  return analyzePortfolio({ orgName: org, repoReports: reports });
}

function renderReport(report, format) {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }
  if (format === "markdown") {
    return toMarkdown(report);
  }
  if (format === "html") {
    return toHtml(report);
  }
  return toTable(report);
}

function buildCombinedOutput({ reportOutput, comparison, format }) {
  if (!comparison) return reportOutput;

  if (format === "json") {
    return JSON.stringify(
      {
        report: JSON.parse(reportOutput),
        comparison,
      },
      null,
      2,
    );
  }

  if (format === "html") {
    const summary = comparisonToTable(comparison)
      .split("\n")
      .map((line) => `<div>${line}</div>`)
      .join("");

    return `${reportOutput}\n<!-- Snapshot Comparison -->\n<section style="margin:24px;font-family:Inter,Arial,sans-serif">${summary}</section>`;
  }

  return `${reportOutput}\n\n${comparisonToTable(comparison)}\n`;
}

export async function runCli(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }

  const client = new GitHubClient({ token: args.options.token });

  const report =
    args.command === "repo"
      ? await generateRepoReport({
          client,
          repoName: args.target,
          options: args.options,
        })
      : await generateOrgReport({
          client,
          org: args.target,
          options: args.options,
        });

  let comparison = null;
  if (args.options.compareSnapshotPath) {
    const previous = loadSnapshot(args.options.compareSnapshotPath).data;
    comparison = compareSnapshots(report, previous);
  }

  const reportOutput = renderReport(report, args.options.format);
  const finalOutput = buildCombinedOutput({
    reportOutput,
    comparison,
    format: args.options.format,
  });

  if (args.options.saveSnapshotPath) {
    const path = saveSnapshot(args.options.saveSnapshotPath, report);
    console.log(`Snapshot written to ${path}`);
  }

  if (args.options.out) {
    const outPath = resolve(args.options.out);
    writeFileSync(outPath, finalOutput.endsWith("\n") ? finalOutput : `${finalOutput}\n`);
    console.log(`Report written to ${outPath}`);
  }

  console.log(finalOutput);
}
