"""Builder: data/chargeback.json + the emblem -> site/chargeback.html (the chargeback overview). Totals only."""
import json

from ..pages import with_block
from ..paths import DATA, SITE, TEMPLATES
from .frontpage import mark

TEMPLATE = TEMPLATES / "chargeback.html"
PAGE = SITE / "chargeback.html"
DETAIL = SITE / "chargeback-detail.html"
BLOCK = "cb-data"


def data(links=None):
    links = links or {}
    d = json.loads((DATA / "chargeback.json").read_text(encoding="utf-8"))
    d["mark"] = mark()
    d["links"] = {
        "index": links.get("index", "index.html"),
        # The line-detail page names people, so it is linked only where it is deliberately published.
        "detail": links["chargeback-detail"] if "chargeback-detail" in links else (DETAIL.name if DETAIL.exists() and not links else ""),
    }
    return d


def render(links=None):
    return with_block(TEMPLATE.read_text(encoding="utf-8"), BLOCK, data(links))


def run():
    SITE.mkdir(exist_ok=True)
    PAGE.write_text(render(), encoding="utf-8")
    print("Built site/%s (%d KB)" % (PAGE.name, PAGE.stat().st_size // 1024))
