"""Data for the leadership view: data/leadership.json with the photos from assets/people/ embedded."""
import base64
import json

from ..paths import ASSETS, DATA

BLOCK = "lt-data"
NEEDS = ("leadership.json",)


def data(artifact=False):
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
