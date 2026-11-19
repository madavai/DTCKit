"""Source adapter: a leadership page edited in the browser and downloaded -> data/leadership.json + assets/people/.

    python3 -m engine ingest leadership <downloaded.html>

Use it after someone has changed the chart with the page's Edit button and pressed Download HTML.
"""
import base64
import json
import re
from pathlib import Path

from ..pages import read_block
from ..paths import ASSETS, DATA


def run(src):
    d = read_block(Path(src).read_text(encoding="utf-8"), "lt-data")
    photos = ASSETS / "people"
    photos.mkdir(parents=True, exist_ok=True)
    for pid, p in d["people"].items():
        m = re.match(r"data:image/(\w+);base64,(.*)", p.get("photo") or "", re.S)
        if m:
            name = (re.sub(r"[^a-z0-9]+", "-", p["name"].lower()).strip("-") or pid) + (".png" if m.group(1) == "png" else ".jpg")
            (photos / name).write_bytes(base64.b64decode(m.group(2)))
            p["photo"] = name
    (DATA / "leadership.json").write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Wrote data/leadership.json and %d photos" % sum(1 for p in d["people"].values() if p.get("photo")))
