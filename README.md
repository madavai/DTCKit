# DTCKit

A kit for building an organization portal as plain, self-contained HTML pages: organization,
chargeback, operational KPIs, projects and people.

Pages are produced by scripts from source files. There is no server, no database, no packages to
install and no AI in the loop: the same source file always gives the same pages.

## What is in this repository

Code only. The repository is public, so it holds no organization data, names, photos or figures.
You supply those locally; git ignores them.

```
CLAUDE.md             how the project works, for Claude Code (and a good read for people too)
.claude/              Claude Code settings and skills
portal.config.json    the pages, and where each is published
engine/
  ingest/             source -> data        (one adapter per kind of source)
  build/              template + data -> site (one builder per page)
templates/            page code: one HTML file per page, with an empty data block
docs/                 architecture and the data contract

supplied locally, not committed:
sources/              raw exports
data/                 one normalized JSON file per section
assets/people/        portrait photos
assets/brand/         the emblem
site/                 the built pages
```

## Pages

| Page | Template | State |
|---|---|---|
| Front page | `templates/index.html` | Five sections, each with a headline figure and a second level |
| Leadership team | `templates/leadership.html` | Editable chart; downloads as HTML and PowerPoint |
| Chargeback overview | `templates/chargeback.html` | KPIs, trend, what moved, heatmap, click-to-filter; totals only |
| Chargeback line detail | none: the source page itself | Kept as `site/chargeback-detail.html` when the source is an HTML export |
| Operational KPIs, Projects, People | not built yet | Outlined on the front page |

## Use it

You need Python 3.8 or newer. No packages.

1. Put your chargeback export in `sources/` and load it:

```bash
python3 -m engine ingest chargeback sources/<your-export>
```

2. Put a `leadership.json` in `data/` (shape in `docs/data-contract.md`) and photos in `assets/people/`.

3. Build:

```bash
python3 -m engine build
```

4. Open `site/index.html` in a browser.

A page whose data is missing is still built and says what it is waiting for.

To see what is loaded and where it came from:

```bash
python3 -m engine status
```

## Change it

- **New figures:** run `ingest` then `build` again. Nothing else.
- **Leadership changes:** use the Edit button on the page, press Save, then Download HTML and run
  `python3 -m engine ingest leadership <downloaded.html>`. Or edit `data/leadership.json` by hand.
- **Page design or behaviour:** edit the file in `templates/`, then build. Never edit `site/`.
- **A new section or source:** see `docs/architecture.md` and `docs/data-contract.md`.

## Working with Claude Code

Open this folder in Claude Code. `CLAUDE.md` loads automatically. Claude Code changes the scripts and
templates; it is not needed to produce pages.

## Privacy

Photos, names, chargeback lines and figures are personal or internal data. Keep them in the ignored
folders. The chargeback overview holds totals only and is the page to share widely; the line-detail
page names people. If you make the repository private and want the data versioned, see the notes at
the top of `.gitignore`.
