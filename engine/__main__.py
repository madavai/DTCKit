"""Command line for the portal engine.

    python3 -m engine ingest chargeback <export>      a chargeback export (HTML page, JSON or CSV) -> data/chargeback.json
    python3 -m engine ingest leadership <page.html>   a leadership page edited in the browser      -> data/leadership.json
    python3 -m engine build                           templates/ + data/ -> site/ (every page)
    python3 -m engine artifact                        site/ -> .artifacts/ (copies for publishing as Claude artifacts)
    python3 -m engine status                          what each data file holds and where it came from
"""
import json
import sys

from .paths import DATA


def status():
    for f in sorted(DATA.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        src = d.get("source") or {}
        print("%-18s %-10s %s" % (f.name, src.get("kind", "manual"),
              " · ".join(str(x) for x in (src.get("name"), src.get("range"), src.get("generated") or d.get("updated")) if x)))


def main(argv):
    if len(argv) >= 3 and argv[0] == "ingest":
        if argv[1] == "chargeback":
            from .ingest import chargeback
            return chargeback.run(argv[2])
        if argv[1] == "leadership":
            from .ingest import leadership
            return leadership.run(argv[2])
    elif argv[:1] == ["build"]:
        from .build import chargeback, frontpage, leadership
        from .paths import SITE
        SITE.mkdir(exist_ok=True)
        for b in (leadership, chargeback, frontpage):
            try:
                b.run()
            except FileNotFoundError as e:       # no data for this page yet: publish its empty state
                b.PAGE.write_text(b.TEMPLATE.read_text(encoding="utf-8"), encoding="utf-8")
                print("Built site/%s without data (%s is missing)" % (b.PAGE.name, getattr(e, "filename", e)))
        return
    elif argv[:1] == ["artifact"]:
        from .build import artifact
        return artifact.run()
    elif argv[:1] == ["status"]:
        return status()
    print(__doc__)
    sys.exit(2)


if __name__ == "__main__":
    main(sys.argv[1:])
