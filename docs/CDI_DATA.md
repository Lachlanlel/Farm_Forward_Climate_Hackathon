# Included CDI data and optional re-import

## Runtime: complete, no extra download required

`src/backend/data/cdi-repository.json` includes 7,377 official parish records and the geometry needed for local lookup. Snapshot: **2026-08-31**, downloaded **2026-10-04**. Source provider: NSW DPIRD, EDIS II/SCIP. It includes RI, SWI, PGI, DDI, official phase, parish/county, geometry and provenance. LGA/LLS are not supplied and remain null.

The original parish CSV, CDI phase table, licence and public attribution page are also included. No live CDI API, credentials or separately installed GIS service is required. The application cannot provide snapshots before the included date or promise new observations after it. Near-boundary points return unavailable; there is no fabricated fallback.

## Original GIS export: optional, excluded duplicate

Only needed to reproduce or change the import, not to run the handoff. The full raw geometry export is about 77 MiB and is intentionally excluded because its processed rings are already bundled.

- Required filename for re-import: `20260831_GISlayers.zip`
- Expected relative directory: `src/backend/data/raw/`
- Exact recorded source: https://edis.spaceport.intersect.org.au/%2FMonthlySnapshot%2FParish%2FGIS%2F20260831_GISlayers.zip?download
- SHA-256: `c46830ca6ff6dd12a8bec8d6f53302cf8090a49c4ff13fa7c656141400a1dc11`
- Official portal: https://edis.spaceport.intersect.org.au/
- CSV source: https://edis.spaceport.intersect.org.au/%2FMonthlySnapshot%2FParish%2Fcsv%2F20260831_edisbyParish?download

To recreate the bundled date, download that GIS file to the expected directory, verify the checksum, then optionally use Python 3 in an isolated environment:

```sh
python3 -m venv .data-venv
.data-venv/bin/python -m pip install pyshp shapely
.data-venv/bin/python scripts/import-cdi.py
npm run build
npm test
```

Python dependencies are **optional import tools**, not application dependencies. Their versions are not pinned/tested as part of the clean-room npm workflow; do not assume a regenerated JSON will be byte-identical across geospatial library versions. The authoritative runtime dataset in this archive is already generated and hash-verified.

`scripts/import-cdi.py` is portable relative to its own directory but explicitly targets the August 2026 filenames and provenance. For a newer snapshot, deliberately update filenames, internal shapefile names, date/download metadata and checksums. Preserve previous snapshots if date history is required; the current importer writes one snapshot and otherwise replaces the repository. Validate geometry and regressions before publishing new data.

Processing: EPSG:4283 (GDA94 geographic); rings simplified by at most 0.0001 degrees; lookup rejects points within 0.0002 degrees of generalized boundaries. Stored indices are taken from the matched parish CSV; display rounds them independently.

## Terms and attribution

The supplied `src/backend/data/raw/TERMS-AND-CONDITIONS.txt` states **CC BY-NC 4.0** and requires NSW DPIRD and relevant third-party acknowledgement. It directs commercial-use enquiries to seasonal.conditions@dpi.nsw.gov.au. Retain the original terms and `/data-attribution/` page. This archive does not grant a different data licence.

Data provided by Climate Branch, NSW Department of Primary Industries and Regional Development on 4 October 2026. EDIS II incorporates third-party data, including ANUClimate. See the portal for full acknowledgements.

## Separately required network service

The farm-location autocomplete UI uses `https://photon.komoot.io/api/` (Photon/OSM). Internet access is required for new searches; no key is configured. A service outage produces the existing location-search unavailable message. Once a location is saved, local CDI and projection do not depend on that external service.
