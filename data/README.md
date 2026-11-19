# data

One normalized JSON file per section, written by the adapters in `engine/ingest/` or kept by hand.
The shapes are described in `docs/data-contract.md`.

These files hold the organization's own figures and names, so they are **not committed** while this
repository is public. After cloning, load your own:

```bash
python3 -m engine ingest chargeback sources/<your-export>
```

and place a `leadership.json` here (or ingest an edited leadership page). Then run `python3 -m engine build`.
