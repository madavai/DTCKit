---
name: add-section
description: Add a new section, sub-page or data source to the portal (for example Operational KPIs, project status, or a connector to a tool). Use when the user provides a new kind of data or asks for a page that does not exist yet.
---

# Add a section or a data source

Read `docs/architecture.md` and `docs/data-contract.md` first. The order below matters: contract, adapter, page.

1. **Contract.** Look at a real sample of the source. Decide the data file (`data/<section>.json`):
   what is aggregated, what is dropped, and the `source` block. Write it into `docs/data-contract.md`
   (move the entry from Planned to Exists today). Never invent figures to fill a gap.
2. **Adapter.** Add `engine/ingest/<section>.py` with a `run(source)` that reads the source, checks the
   columns it needs (fail with a message naming the missing column), aggregates, and writes the data file.
   Register it in `engine/__main__.py`. For a connector, the adapter fetches instead of reading a file;
   the connection goes in `.mcp.json` with secrets as `${ENV_VAR}`. Everything after the fetch is the same.
   Person-level rows do not go into `data/` unless the user has said who may see them.
3. **View.** The portal is one page; a section is a view inside it, never a separate HTML file and never a
   link that opens a new tab. Follow "One page, many views" in `CLAUDE.md`:
   add `templates/views/<name>.js` (copy the shape of `chargeback.js`), reuse `styles/portal.css` or add a
   stylesheet, list the parts and a `<script type="application/json" id="<name>-data" data-part>` block in
   `templates/shell.html`, add the route and trail to `ROUTES` and the view to `VIEWS` in `templates/shell.js`,
   and add `engine/build/<name>.py` with `BLOCK`, `NEEDS` and `data()`, listed in `SECTIONS` in `engine/build/portal.py`.
4. **Front page.** In `templates/views/home.js`, update that section's door: its headline figure, its status
   (Needs data -> Data ready -> Live), and `href: "#<name>"` for the door or the item in its `inside` list.
5. **Check.** `python3 -m engine build`, then look at the new view and the front page in light and dark,
   at desktop and phone width, and click through with Back and Forward. Charts follow the same rules as the existing ones: thin bars, rounded data
   ends, values in text colour, a tooltip on every mark, a legend when there are two series.
6. Update the table in `README.md`.

Everything a refresh needs must end up in the adapter and builder. If a step still needs someone to decide
something each time (which rows to keep, how to name a group), write that decision as a rule in the script.
