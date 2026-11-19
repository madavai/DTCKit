"""Data for the front page view: data/chargeback.json + data/leadership.json + the emblem.

Only totals go in: nobody who charged time is named. Standard library only
(portraits are made smaller when Pillow happens to be installed).
"""
import base64
import io
import json
import re

from ..paths import ASSETS, DATA

BLOCK = "fp-data"
NEEDS = ("chargeback.json", "leadership.json")
ROOT = ASSETS.parent


def face(path):
    raw = path.read_bytes()
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(raw)).convert("RGB").resize((96, 96), Image.LANCZOS)
        buf = io.BytesIO(); im.save(buf, "JPEG", quality=86); raw = buf.getvalue()
    except ImportError:
        pass
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode()


def mark():
    f = ROOT / "assets" / "brand" / "dtc-mark.svg"
    if not f.exists():
        return ""                                                     # no emblem supplied: the header shows the name only
    svg = f.read_text(encoding="utf-8")
    svg = re.sub(r"<style>.*?</style>", "", svg, flags=re.S)          # the page's own stylesheet animates it
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
    svg = re.sub(r'<svg ([^>]*?)width="\d+" height="\d+"', r'<svg class="dtc-mark" \1', svg, count=1)
    return re.sub(r">\s+<", "><", svg).strip()


def data(artifact=False):
    cb = json.loads((DATA / "chargeback.json").read_text(encoding="utf-8"))
    lt = json.loads((DATA / "leadership.json").read_text(encoding="utf-8"))
    dims, months = cb["dims"], cb["months"]
    col = {name: i for i, name in enumerate(cb["cols"])}      # read columns by name: the contract may grow

    def total(by):
        out = {}
        for r in cb["rows"]:
            k = by(r); out[k] = out.get(k, 0) + r[col["amount"]]
        return sorted(out.items(), key=lambda x: -x[1])

    monthly = dict(total(lambda r: r[col["month"]]))
    faces = []
    for pid in list(lt["people"])[:7]:
        ph = lt["people"][pid].get("photo")
        f = ROOT / "assets" / "people" / ph if ph and not ph.startswith("data:") else None
        if f and f.exists():
            faces.append(face(f))
    out = {
        "source": cb["source"],
        "links": {"leadership": "#leadership", "chargeback": "#chargeback"},   # other views of the same page
        "mark": mark(),
        "org": {
            "leaders": len(lt["people"]),
            "digitalCoes": len(lt["coes"]),
            "erpTeams": len(lt["erpCoes"]),
            "platformCoes": sum(len(g["names"]) for g in lt["platformCoes"]),
            "regions": len(lt["cioRelationship"]),
            "head": {"name": lt["people"][lt["head"]["person"]]["name"], "role": lt["head"]["role"]},
            "faces": faces,
        },
        "chargeback": {
            "months": months,
            "monthly": [round(monthly.get(m, 0)) for m in months],
            "total": round(sum(monthly.values())),
            "byType": [[k, round(v)] for k, v in total(lambda r: dims["type"][r[col["type"]]])],
            "byCoe": [[k, round(v)] for k, v in total(lambda r: dims["coe"][r[col["coe"]]])],
            "byFunction": [[k, round(v)] for k, v in total(lambda r: dims["fn"][r[col["fn"]]])],
            "costCenters": len(cb["costCenters"]),
            "vendors": len(cb["vendors"]),
        },
        "projects": {
            "count": len(dims["project"]),
            "top": [[k, round(v)] for k, v in total(lambda r: dims["project"][r[col["project"]]])[:10]],
        },
        "people": {
            "months": months,
            "headcount": [cb["headcount"][m] for m in months],
            "total": cb["peopleTotal"],
            "byPlace": cb["peopleByPlace"],
        },
    }
    return out
