"""Source adapter: a chargeback export (a file) -> data/chargeback.json.

    python3 -m engine ingest chargeback <export>

<export> can be:
  * the stand-alone "Chargeback data" HTML page (it embeds its rows as JSON), or
  * a .json file with the same shape ({"cols": [...], "rows": [[...], ...], ...}), or
  * a .csv file whose header uses the column keys below
    (period, chargeback, resource_ref_pid, competence_center, resource_type,
     employee_type, location, country, management_scope_3, project_name,
     charged_cost_center, vendor, total_hours, amount_base).

Only totals leave this script: amounts and hours are summed per
month x COE x type x location x project x function, and people are counted,
never named. Standard library only, so it runs anywhere Python 3.8+ runs.
"""
import collections
import csv
import json
import re
import sys
from pathlib import Path

from ..paths import DATA, SITE


def load(path):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if p.suffix.lower() in (".html", ".htm"):
        m = re.search(r'<script type="application/json" id="sed-data">(.*?)</script>', text, re.S)
        if not m:
            sys.exit("No embedded chargeback data found in %s" % path)
        d = json.loads(m.group(1))
    elif p.suffix.lower() == ".json":
        d = json.loads(text)
    elif p.suffix.lower() == ".csv":
        reader = csv.DictReader(text.splitlines())
        rows = list(reader)
        def num(v):
            try:
                return float(v) if v not in (None, "") else None
            except ValueError:
                return None
        for r in rows:
            r["amount_base"] = num(r.get("amount_base"))
            r["total_hours"] = num(r.get("total_hours"))
            r["chargeback"] = str(r.get("chargeback", "true")).strip().lower() not in ("false", "0", "no")
        months = sorted({r["period"] for r in rows})
        return {"view": p.stem, "generated": "", "currency": "EUR",
                "range": "%s to %s" % (months[0], months[-1]) if months else ""}, rows
    else:
        sys.exit("Unsupported file type: %s" % p.suffix)
    cols = d["cols"]
    rows = [dict(zip(cols, r)) for r in d["rows"]]
    meta = {k: d.get(k) for k in ("view", "generated", "range", "currency")}
    meta["org"] = (d.get("brand") or {}).get("title")
    return meta, rows


def place(loc, country):
    c = (country or "").split("-")[-1] if country else ""
    if not loc:
        return c or "Location not given"
    city = loc.split("_", 1)[1] if "_" in loc else loc
    return "%s, %s" % (city, c) if c and c != city else city


def vendor_name(v):
    if not v or not re.search(r"[A-Za-z]", v):
        return None
    v = re.sub(r"\s+", " ", v).strip()
    v = re.sub(r"(?i)\b(pvt\.?|private|ltd\.?|limited|inc\.?|llc|corp\.?|\(india\))\b", "", v)
    v = re.sub(r"(?i)\b(llp|india)\b", "", re.sub(r"[.,]+", " ", v))
    v = re.sub(r"\(\s*\)", "", v)
    words = re.sub(r"\s+", " ", v).strip().split(" ")
    return " ".join(w if w.isupper() and len(w) <= 4 else w.capitalize() for w in words)   # short all-caps words are acronyms


def build(meta, rows):
    dims = {k: [] for k in ("coe", "type", "place", "project", "fn", "cc", "vendor")}
    index = {k: {} for k in dims}

    def ix(dim, value):
        value = value or "Unassigned"
        if value not in index[dim]:
            index[dim][value] = len(dims[dim])
            dims[dim].append(value)
        return index[dim][value]

    groups = collections.defaultdict(lambda: [0.0, 0.0, set()])
    month_people = collections.defaultdict(lambda: {"Internal": set(), "External": set()})
    month_place = collections.defaultdict(lambda: collections.defaultdict(set))
    everyone = set()
    vendors = collections.Counter()
    cost_centers = collections.Counter()
    for r in rows:
        if not r.get("chargeback"):
            continue
        typ = r.get("resource_type") or "Other"
        if typ not in ("Internal", "External"):
            typ = "Other"
        key = (r["period"], ix("coe", r.get("competence_center")), ix("type", typ),
               ix("place", place(r.get("location"), r.get("country"))),
               ix("project", r.get("project_name")),
               ix("fn", (r.get("management_scope_3") or "").split(" - ")[-1].strip() or None),   # "A - B - Name" -> "Name"
               ix("cc", r.get("charged_cost_center")),
               ix("vendor", (vendor_name(r.get("vendor")) or "Vendor not named") if typ == "External" else "Not external"))
        g = groups[key]
        g[0] += r.get("amount_base") or 0
        g[1] += r.get("total_hours") or 0
        pid = r.get("resource_ref_pid")
        if pid:
            g[2].add(pid)
            et = r.get("employee_type")
            if et in ("Internal", "External"):
                month_people[r["period"]][et].add(pid)
            everyone.add(pid)
            month_place[r["period"]][place(r.get("location"), r.get("country"))].add(pid)
        if typ == "External":
            vn = vendor_name(r.get("vendor"))
            if vn:
                vendors[vn] += r.get("amount_base") or 0
        if r.get("charged_cost_center"):
            cost_centers[r["charged_cost_center"]] += r.get("amount_base") or 0

    out_rows = [list(k) + [round(v[0], 2), round(v[1], 1), len(v[2])]
                for k, v in sorted(groups.items())]
    months = sorted({k[0] for k in groups})
    people = {m: [len(month_people[m]["Internal"]), len(month_people[m]["External"])] for m in months}
    return {
        "source": {
            "kind": "file",
            "name": meta.get("view") or "Chargeback export",
            "org": meta.get("org"),
            "generated": meta.get("generated"),
            "range": meta.get("range"),
            "currency": meta.get("currency") or "EUR",
            "rowsRead": len(rows),
        },
        "months": months,
        "dims": dims,
        "cols": ["month", "coe", "type", "place", "project", "fn", "cc", "vendor", "amount", "hours", "people"],
        "rows": out_rows,
        "headcount": people,
        "peopleTotal": len(everyone),
        "peopleByPlace": sorted(([k, len(v)] for k, v in month_place[months[-1]].items()), key=lambda x: -x[1]) if months else [],
        "vendors": [[n, round(a, 2)] for n, a in vendors.most_common(12)],
        "costCenters": [[n, round(a, 2)] for n, a in cost_centers.most_common()],
    }


BACK_LINK = ('<a href="chargeback.html" style="position:fixed;left:12px;bottom:12px;z-index:80;padding:6px 12px;border-radius:999px;'
             'border:1px solid var(--line);background:var(--panel);color:var(--tx1);font-size:12px;text-decoration:none;'
             'box-shadow:0 8px 20px -12px rgba(0,0,0,.6)">&larr; Chargeback overview</a>')


def keep_detail(export):
    """When the source is the stand-alone chargeback page, keep it as the portal's line-detail page.
    It is copied as it is, with one link back to the overview added. It names people: see README, Privacy."""
    p = Path(export)
    if p.suffix.lower() not in (".html", ".htm"):
        return
    html = p.read_text(encoding="utf-8")
    if "<body>" not in html:
        return
    SITE.mkdir(exist_ok=True)
    (SITE / "chargeback-detail.html").write_text(html.replace("<body>", "<body>\n" + BACK_LINK, 1), encoding="utf-8")
    print("Kept the source page as site/chargeback-detail.html (line detail: names people)")


def run(export, out=None):
    out = Path(out) if out else DATA / "chargeback.json"
    meta, rows = load(export)
    data = build(meta, rows)
    out.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    keep_detail(export)
    total = sum(r[data["cols"].index("amount")] for r in data["rows"])
    print("Wrote %s: %d rows read, %d groups, %s %.0f across %d months"
          % (out.relative_to(out.parent.parent), len(rows), len(data["rows"]), data["source"]["currency"], total, len(data["months"])))
