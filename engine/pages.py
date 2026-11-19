"""Every page in site/ is one self-contained HTML file that carries its data in a
<script type="application/json" id="..."> block. These helpers read and replace that block; nothing else in a page is touched."""
import json
import re


def _block(block_id):
    return re.compile(r'(<script type="application/json" id="%s">)(.*?)(</script>)' % re.escape(block_id), re.S)


def read_block(html, block_id):
    m = _block(block_id).search(html)
    if not m:
        raise SystemExit('No <script id="%s"> data block found' % block_id)
    return json.loads(m.group(2))


def with_block(html, block_id, data):
    """Return html with the data block replaced by data."""
    if not _block(block_id).search(html):
        raise SystemExit('No <script id="%s"> data block found' % block_id)
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    return _block(block_id).sub(lambda m: m.group(1) + body + m.group(3), html, count=1)


def artifact_body(html):
    """The parts between the <!--page--> markers: what the Claude Artifact tool expects (it adds its own document shell).

    A page's own script mentions the markers too (its "Download HTML" writes them), so the body part runs from the
    first marker after </head> to the LAST closing marker. Cutting at the first closing marker truncates the script
    and publishes a blank page.
    """
    head, body = html.split("</head>", 1)
    top = re.search(r"<!--page-->\n(.*?)<!--/page-->", head, re.S).group(1)
    start = body.index("<!--page-->\n") + len("<!--page-->\n")
    out = top + body[start:body.rindex("<!--/page-->")]
    if not out.rstrip().endswith("</script>"):
        raise SystemExit("artifact copy does not end with the page's script: check the <!--page--> markers")
    return out
