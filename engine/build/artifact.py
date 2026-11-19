"""Prepare the portal for publishing as a Claude artifact.

    python3 -m engine artifact

Writes .artifacts/<artifactFile> for the page in portal.config.json. The copy holds only the parts between the
<!--page--> markers (the Artifact tool adds its own document shell), and leaves out links to files that are not
part of the artifact.
"""
import json

from ..pages import artifact_body
from ..paths import CONFIG, OUT
from . import portal


def run():
    page = json.loads(CONFIG.read_text(encoding="utf-8"))["pages"]["index"]
    OUT.mkdir(exist_ok=True)
    target = OUT / page["artifactFile"]
    target.write_text(artifact_body(portal.render(artifact=True)), encoding="utf-8")
    print("Wrote .artifacts/%s  ->  publish to %s" % (target.name, page.get("artifact") or "a new artifact"))
