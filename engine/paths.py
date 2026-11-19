"""Where things live. Everything else imports these, so the layout is defined once."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"          # normalized data: the contract between ingest and build
TEMPLATES = ROOT / "templates" # page code: one HTML file per page with an empty data block (edited by hand)
SITE = ROOT / "site"          # built pages people open: template + data (generated, not committed)
ASSETS = ROOT / "assets"      # photos and the emblem
SOURCES = ROOT / "sources"    # raw exports dropped here (not committed)
OUT = ROOT / ".artifacts"     # copies prepared for publishing as Claude artifacts (not committed)
CONFIG = ROOT / "portal.config.json"
