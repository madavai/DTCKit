# Data contract

One JSON file per section in `data/`. Adapters write these; builders read them. A source may change
(a file today, a connector tomorrow) as long as it produces the same file.

Every file carries a `source` block:

| Field | Meaning |
|---|---|
| `kind` | `file`, `connector` or `manual` |
| `name` | What the source calls itself, e.g. "Chargeback, North America" |
| `range` | Period covered, e.g. "2026-01 to 2026-10" |
| `generated` | When the source was produced |

## Exists today

### `chargeback.json` (written by `engine/ingest/chargeback.py`)

Totals only. No person is named.

| Field | Meaning |
|---|---|
| `months` | Months covered, `YYYY-MM`, in order |
| `dims` | Lookup lists: `coe`, `type` (Internal, External, Other), `place`, `project`, `fn` (function), `cc` (cost centre charged), `vendor` |
| `cols`, `rows` | One row per month x CoE x type x place x project x function x cost centre x vendor: indexes into `dims`, then `amount`, `hours`, `people` (count). Read columns by name through `cols`; the list may grow |
| `headcount` | Per month: `[internal, external]` people who charged time |
| `peopleTotal` | Different people over the whole range |
| `peopleByPlace` | Latest month: `[place, people]`, largest first |
| `vendors` | External spend: `[vendor, amount]`, largest twelve |
| `costCenters` | `[cost centre, amount]`, all |

Accepted sources: the stand-alone chargeback HTML page, a JSON file of the same shape, or a CSV with
columns `period, chargeback, resource_ref_pid, competence_center, resource_type, employee_type,
location, country, management_scope_3, project_name, charged_cost_center, vendor, total_hours, amount_base`.

Feeds: `site/chargeback.html` (the whole page, filters included) and the front page (Chargeback,
Projects and People doors and their previews).

When the source is the stand-alone chargeback HTML page, the adapter also keeps that page as
`site/chargeback-detail.html`. It is not part of the contract: it is the source itself, shown as the line-detail level.

### `leadership.json` (kept by hand, or written by `engine/ingest/leadership.py`)

| Field | Meaning |
|---|---|
| `people` | `id -> {name, photo (file in assets/people/), country}` |
| `head`, `staff` | The SVP and their staff: `{person, role}` |
| `hubLeaders` | `{hub, person}` |
| `cioRelationship` | `{region, person}` |
| `domainLeaders`, `digitalLeaders` | One entry per box, left to right: `{person, span}`. Spans in a row add up to 11 |
| `coes` | The Digital CoEs: `{name, span, leader}` |
| `erpCoes` | Teams inside ERP CoE: `{name, leader}` |
| `platformCoes` | `{names: [...], leader}`: one leader may cover several CoEs |
| `labels`, `title`, `footer`, `pairLabel`, `platformLabel` | Text shown on the chart |
| `updated` | ISO time of the last change |

Feeds: `site/leadership.html`, and the Organization door on the front page.

## Planned

Proposed shapes, to be settled when a real source is in hand. Nothing below exists yet, and no page
shows figures for it.

| File | Section | Proposed content | Likely source |
|---|---|---|---|
| `incidents.json` | Operational KPIs | Per month and application: opened and closed by priority, share within SLA, mean time to restore | ITSM export or connector |
| `availability.json` | Operational KPIs | Per month and application: uptime against target | Monitoring tool |
| `changes.json` | Operational KPIs | Per month: changes delivered, failed, rolled back | ITSM export or connector |
| `projects.json` | Projects | Per project: owner, CoE, phase, RAG with reason, next milestone, due date, percent complete | Portfolio tool |
| `people.json` | People | Per month: headcount by CoE, location, role family; joiners, leavers, open roles | HR system |
| `applications.json` | Organization | Per application: owning CoE, users, criticality, lifecycle, health | Application inventory |
| `evolution.json` | Organization | Dated milestones and headcount per year | Kept by hand |

## Changing the contract

Add fields freely. Renaming or removing a field means updating every builder and page that reads it
in the same change, and noting it here.
