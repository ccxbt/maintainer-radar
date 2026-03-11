# maintainer-radar

Actionable GitHub maintainer report CLI for open-source projects.

`maintainer-radar` analyzes open issues and pull requests, then outputs a practical triage report with priority actions for maintainers.

## Why this is useful

Open-source maintainers often lose time on repetitive triage.

This tool helps you quickly answer:

- Which issues are stale and risky?
- Which PRs are waiting too long for review?
- How many issues still have no maintainer response?
- What should I do first today?

## Features

- Scans open issues + open PRs via GitHub API
- Stale backlog detection
- First-response SLA tracking for issues
- Review-latency tracking for PRs
- Prioritized issue list (scored)
- Output formats: `table`, `markdown`, `json`
- CI-friendly execution

## Installation

### Run with npx

```bash
npx maintainer-radar repo owner/repo
```

### Local development

```bash
git clone https://github.com/ccxbt/maintainer-radar.git
cd maintainer-radar
npm link
maintainer-radar repo owner/repo
```

## Usage

```bash
maintainer-radar repo <owner/name> [options]
```

### Options

- `--format <table|markdown|json>` (default: `table`)
- `--stale-days <n>` (default: `30`)
- `--issue-sla-days <n>` (default: `3`)
- `--pr-sla-days <n>` (default: `5`)
- `--per-page <n>` (default: `100`)
- `--max-pages <n>` (default: `5`)
- `--token <value>` (or use `GH_TOKEN` / `GITHUB_TOKEN`)
- `--out <path>` write report to file

## Examples

Basic report:

```bash
maintainer-radar repo openclaw/openclaw
```

Markdown report file:

```bash
maintainer-radar repo owner/repo --format markdown --out maintainer-report.md
```

Strict triage thresholds:

```bash
maintainer-radar repo owner/repo --stale-days 14 --issue-sla-days 2 --pr-sla-days 3
```

## CI integration example

```yaml
name: maintainer-radar

on:
  workflow_dispatch:
  schedule:
    - cron: "0 8 * * 1"

jobs:
  triage-report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Generate report
        run: npx maintainer-radar repo ${{ github.repository }} --format markdown --out maintainer-radar.md
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Upload report artifact
        uses: actions/upload-artifact@v4
        with:
          name: maintainer-radar-report
          path: maintainer-radar.md
```

## Notes

- Public repositories work without token, but authenticated requests are recommended for rate limits.
- This tool reads repository metadata only; it does not modify issues/PRs.

## License

MIT
