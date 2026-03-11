# maintainer-radar

Actionable GitHub maintainer intelligence CLI for open-source projects.

`maintainer-radar` generates maintainership-focused reports from issues and pull requests so maintainers can triage quickly, enforce response SLAs, and keep contributor throughput healthy.

## Why this is useful

Open-source maintainers spend significant time on triage and review hygiene. This tool turns raw GitHub data into clear answers:

- Which repositories are highest risk right now?
- Which issues have no response beyond SLA?
- Which PRs are waiting too long for review?
- Where is maintainership load concentrated?

## Features

- **Repository report mode** (`repo owner/name`)
- **Organization portfolio mode** (`org <org-name>`) with top-risk repository ranking
- Maintainer load scoring + severity band (`low/moderate/high/critical`)
- Stale backlog detection (issues + PRs)
- First-response SLA checks for issues
- Review-latency checks for PRs
- Label hotspot analysis
- Top priority issue queue
- Output formats: `table`, `markdown`, `json`, `html`
- Snapshot save + compare for trend tracking
- Config file support (`--config`)

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
maintainer-radar org <org-name> [options]
```

### Global options

- `--format <table|markdown|json|html>` (default: `table`)
- `--token <value>` (or use `GH_TOKEN` / `GITHUB_TOKEN`)
- `--out <path>` write output to file
- `--config <path>` load JSON options
- `--save-snapshot <path>` save report snapshot
- `--compare-snapshot <path>` compare with previous snapshot

### Triage options

- `--stale-days <n>` (default: `30`)
- `--issue-sla-days <n>` (default: `3`)
- `--pr-sla-days <n>` (default: `5`)

### GitHub fetch options

- `--per-page <n>` (default: `100`)
- `--max-pages <n>` (default: `5`)

### Organization options

- `--repo-limit <n>` (default: `12`)
- `--include-archived`

## Examples

Repository report (table):

```bash
maintainer-radar repo openclaw/openclaw
```

Repository report (markdown file):

```bash
maintainer-radar repo owner/repo --format markdown --out report.md
```

Organization portfolio report:

```bash
maintainer-radar org openclaw --repo-limit 20 --format table
```

Save snapshot + compare run-to-run:

```bash
maintainer-radar repo owner/repo --save-snapshot snapshots/current.json
maintainer-radar repo owner/repo --compare-snapshot snapshots/current.json
```

Using a config file:

```bash
maintainer-radar repo owner/repo --config ./config.example.json
```

## CI integration example

```yaml
name: maintainer-radar

on:
  schedule:
    - cron: "0 8 * * 1"
  workflow_dispatch:

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Generate markdown report
        run: npx maintainer-radar repo ${{ github.repository }} --format markdown --out maintainer-radar.md
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: maintainer-radar
          path: maintainer-radar.md
```

## Notes

- Works with public repos without token, but authenticated requests are recommended for higher API limits.
- Read-only analytics tool: it does not modify issues, pull requests, labels, or repository settings.

## License

MIT
