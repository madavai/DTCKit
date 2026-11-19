"""Builder: data/leadership.json + assets/people/ -> site/leadership.html (photos are embedded so the page is one file)."""
import base64
import json

from ..pages import with_block
from ..paths import ASSETS, DATA, SITE, TEMPLATES

TEMPLATE = TEMPLATES / "leadership.html"
PAGE = SITE / "leadership.html"
BLOCK = "lt-data"


def data():
    d = json.loads((DATA / "leadership.json").read_text(encoding="utf-8"))
    for p in d["people"].values():
        ph = p.get("photo")
        if ph and not ph.startswith("data:"):
            f = ASSETS / "people" / ph
            if f.exists():
                mime = "image/png" if f.suffix.lower() == ".png" else "image/jpeg"
                p["photo"] = "data:%s;base64,%s" % (mime, base64.b64encode(f.read_bytes()).decode())
            else:
                print("missing photo:", ph)
                p["photo"] = ""
    return d


def render(links=None):
    return with_block(TEMPLATE.read_text(encoding="utf-8"), BLOCK, data())


def run():
    SITE.mkdir(exist_ok=True)
    PAGE.write_text(render(), encoding="utf-8")
    print("Built site/%s (%d KB)" % (PAGE.name, PAGE.stat().st_size // 1024))
