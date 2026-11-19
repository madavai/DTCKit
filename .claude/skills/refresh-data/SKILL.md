---
name: refresh-data
description: Load a new data export into the portal and rebuild the pages. Use when the user provides a new chargeback export, an edited leadership page, or asks to refresh, update or reload the portal's figures.
---

# Refresh the portal's data

1. Find the source. If the user attached a file, copy it into `sources/` (that folder is not committed).
   Do not paste its contents into the conversation: exports can hold personal and cost data.
2. Run the matching adapter:
   - Chargeback export (HTML page, JSON or CSV): `python3 -m engine ingest chargeback sources/<file>`
   - Leadership page downloaded after editing: `python3 -m engine ingest leadership <file>`
   - No adapter for this kind of file: stop and use the `add-section` skill, or ask what the file is.
3. Check the adapter's summary line against what the user expects (months covered, total amount).
   A total that moved a lot, a missing month, or a new "Unassigned" group is worth telling the user.
4. `python3 -m engine build` (deterministic: it only moves figures from `data/` into the templates)
5. Open `site/index.html` (screenshot it with Playwright if no browser is to hand) and confirm the
   headline figures changed and nothing overflows. Check light and dark.
6. Commit the source, the data file and the rebuilt `site/` together, unless the owner has marked any of
   them "do not push" (see the DO NOT PUSH block in `.gitignore`).
   If the pages are published as artifacts: `python3 -m engine artifact`, then publish each file in
   `.artifacts/` to the address in `portal.config.json`, passing it as `url`.
7. Report: the period now covered, the headline figures before and after, and anything odd from step 3.

For the leadership chart: edits made with the Edit button on the published page are stored in that
artifact's database and override the embedded data when newer. If the repository should win, set a
newer `updated` value in `data/leadership.json` before building.
