"""Builder: the whole portal as one page.

templates/shell.html lists the parts (styles, data blocks, view scripts) with /*@include path*/ markers.
This puts the parts in, fills each data block from data/, and writes site/index.html. The same input always
gives the same file.
"""
import re

from ..pages import with_block
from ..paths import DATA, SITE, TEMPLATES
from . import chargeback, frontpage, leadership

PAGE = SITE / "index.html"
SECTIONS = (frontpage, chargeback, leadership)


def compose():
    """shell.html with every /*@include ...*/ marker replaced by that file's text."""
    def include(m):
        return (TEMPLATES / m.group(1)).read_text(encoding="utf-8").strip()
    return re.sub(r"/\*@include ([\w./-]+)\*/", include, (TEMPLATES / "shell.html").read_text(encoding="utf-8"))


def render(artifact=False):
    html = compose()
    for s in SECTIONS:
        missing = [n for n in s.NEEDS if not (DATA / n).exists()]
        if missing:                       # no data for this view yet: its block stays empty and the view says so
            print("  %s: empty (%s missing)" % (s.BLOCK, ", ".join("data/" + n for n in missing)))
            continue
        html = with_block(html, s.BLOCK, s.data(artifact))
    return html


def run():
    SITE.mkdir(exist_ok=True)
    PAGE.write_text(render(), encoding="utf-8")
    print("Built site/%s (%d KB)" % (PAGE.name, PAGE.stat().st_size // 1024))
