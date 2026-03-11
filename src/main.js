import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeRepository } from "./analyze.js";
import { GitHubClient } from "./github.js";
import { toMarkdown, toTable } from "./report.js";

function printHelp() {
  console.log(`maintainer-radar - actionable OSS maintainer report for a GitHub repository

Usage:
  maintainer-radar repo <owner/name> [options]

Options:
  --format <table|markdown|json>   Output format (default: table)
  --stale-days <n>                 Stale threshold in days (default: 30)
  --issue-sla-days <n>             Issue first-response SLA days (default: 3)
  --pr-sla-days <n>                PR review SLA days (default: 5)
  --per-page <n>                   Items per GitHub page (default: 100)
  --max-pages <n>                  Max pages to fetch per endpoint (default: 5)
  --token <value>                  GitHub token (or use GH_TOKEN / GITHUB_TOKEN)
  --out <path>                     Write report output to file
  --help                           Show this help

Examples:
  maintainer-radar repo openclaw/openclaw
  maintainer-radar repo owner/repo --format markdown --out report.md
  maintainer-radar repo owner/repo --stale-days 21 --issue-sla-days 2 --pr-sla-days 4
`);
}

function parseInteger(value, fallback) {
  if (value === undefined) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Invalid numeric option: ${value}`);
  }
  return Math.floor(num);
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }

  const [command, repo] = argv;
  if (command !== "repo" || !repo) {
    throw new Error("Usage: maintainer-radar repo <owner/name> [options]");
  }

  const options = {
    format: "table",
    staleDays: 30,
    issueSlaDays: 3,
    prSlaDays: 5,
    perPage: 100,
    maxPages: 5,
    token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "",
    out: "",
  };

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
    } else if (token === "--token" && next) {
      options.token = next;
      i += 1;
    } else if (token === "--out" && next) {
      options.out = next;
      i += 1;
    }
  }

  if (!["table", "markdown", "json"].includes(options.format)) {
    throw new Error(`Invalid format: ${options.format}`);
  }

  if (!/^[^/]+\/[\w.-]+$/.test(repo)) {
    throw new Error(`Invalid repository format '${repo}'. Use owner/name.`);
  }

  return {
    help: false,
    command,
    repo,
    options,
  };
}

async function generateReport({ repoName, options }) {
  const [owner, repo] = repoName.split("/");
  const client = new GitHubClient({ token: options.token });

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

function render(report, format) {
  if (format === "json") {
    return JSON.stringify(report, null, 2);
  }
  if (format === "markdown") {
    return toMarkdown(report);
  }
  return toTable(report);
}

export async function runCli(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }

  const report = await generateReport({
    repoName: args.repo,
    options: args.options,
  });

  const output = render(report, args.options.format);

  if (args.options.out) {
    const outPath = resolve(args.options.out);
    writeFileSync(outPath, output.endsWith("\n") ? output : `${output}\n`);
    console.log(`Report written to ${outPath}`);
  }

  console.log(output);
}
