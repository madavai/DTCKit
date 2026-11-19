"""Prepare copies of the pages for publishing as Claude artifacts.

    python3 -m engine artifact

Writes .artifacts/<name>.html for every page in portal.config.json. A copy differs from the page in site/ in two ways:
it holds only the parts between the <!--page--> markers (the Artifact tool adds its own document shell), and links
between pages point at the other pages' artifact addresses instead of at files.
"""
import json

from ..pages import artifact_body
from ..paths import CONFIG, OUT
from . import chargeback, frontpage, leadership

BUILDERS = {"index": frontpage, "leadership": leadership, "chargeback": chargeback}


def run():
    pages = json.loads(CONFIG.read_text(encoding="utf-8"))["pages"]
    links = {name: p["artifact"] for name, p in pages.items() if p.get("artifact")}
    OUT.mkdir(exist_ok=True)
    for name, p in pages.items():
        target = OUT / p["artifactFile"]
        target.write_text(artifact_body(BUILDERS[name].render(links)), encoding="utf-8")
        print("Wrote .artifacts/%s  ->  publish to %s" % (target.name, p.get("artifact") or "a new artifact"))
