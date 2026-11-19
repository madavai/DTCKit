# data

One normalized JSON file per section, written by the adapters in `engine/ingest/` or kept by hand.
The shapes are described in `docs/data-contract.md`.

To replace the sample data with your own:

```bash
python3 -m engine ingest chargeback sources/<your-export>
```

```bash
python3 -m engine build
```
