"""Data for the chargeback view: data/chargeback.json + the emblem. Totals only."""
import json

from ..paths import DATA, SITE
from .frontpage import mark

DETAIL = SITE / "chargeback-detail.html"
BLOCK = "cb-data"
NEEDS = ("chargeback.json",)


def data(artifact=False):
    d = json.loads((DATA / "chargeback.json").read_text(encoding="utf-8"))
    d["mark"] = mark()
    d["links"] = {
        "index": "#home",
        # The line-detail page is a separate file beside the portal. It is not part of the published artifact.
        "detail": DETAIL.name if DETAIL.exists() and not artifact else "",
    }
    return d
