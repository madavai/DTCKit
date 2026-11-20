# DTCKit

A kit for building an organization portal as plain, self-contained HTML pages: organization,
chargeback, operational KPIs, projects and people.

Pages are produced by scripts from source files. There is no server, no database, no packages to
install and no AI in the loop: the same source file always gives the same pages.

## What is in this repository

Everything: the scripts, the page code, the sample data and the built pages. Clone it and open
`site/index.html`.

```
CLAUDE.md             how the project works, for Claude Code (and a good read for people too)
.claude/              Claude Code settings and skills
portal.config.json    the pages, and where each is published
sources/              raw exports go here
engine/
  ingest/             source -> data        (one adapter per kind of source)
  build/              template + data -> site (one builder per page)
data/                 one normalized JSON file per section
assets/people/        portrait photos
assets/brand/         the emblem
templates/            page code: shell (bar, router), views/ and styles/
site/                 the built portal: open index.html
tools/                a script that walks through a built or published copy
docs/                 architecture and the data contract
```

## One page

The whole portal is one file, `site/index.html`. Clicking never opens a new tab: every view is part
of the same page, with Back and Forward buttons and a trail of where you are in the bar on top.

| View | Address | Code | State |
|---|---|---|---|
| Front page | `#home` | `templates/views/home.js` | Five sections, each with a headline figure and a second level |
| Leadership team | `#leadership` | `templates/views/leadership.js` | Editable chart; PowerPoint download |
| Chargeback | `#chargeback` | `templates/views/chargeback.js` | From the total down to single lines: filters on every dimension, month comparison, break-down table, every line |
| Chargeback line detail | separate file | the source page itself | Kept as `site/chargeback-detail.html` when the source is an HTML export |
| Operational KPIs, Projects, People | on the front page | not built yet | Outlined on the front page |

Download HTML in the bar saves the whole portal as one file, with any saved edits inside.

## Use it

Open `site/index.html` in a browser. Nothing to install, and it works offline.

To rebuild from your own source files you need Python 3.8 or newer. No packages.

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
- **Page design or behaviour:** edit the view or stylesheet in `templates/`, then build. Never edit `site/`.
- **A new section or source:** see `docs/architecture.md` and `docs/data-contract.md`.

## Working with Claude Code

Open this folder in Claude Code. `CLAUDE.md` loads automatically. Claude Code changes the scripts and
templates; it is not needed to produce pages.

## What is committed

Everything is committed unless the owner has marked it "do not push". Those items are listed in the
DO NOT PUSH block at the top of `.gitignore`. The chargeback view and the leadership chart name people.
