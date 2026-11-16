"""
STEP 1 - FETCH
Download raw wheat data from USDA NASS Quick Stats.

Two ways to download, chosen automatically:
  1. Official Quick Stats API   (used when NASS_API_KEY is set - preferred)
  2. Quick Stats website export (no key; the same CSV the "Spreadsheet" link
                                 on quickstats.nass.usda.gov gives you)

Output: data/raw/<query>.csv  (+ a dated snapshot copy for audit history)

Run:  python pipeline/fetch.py
"""
from __future__ import annotations

import datetime as dt
import io
import itertools
import sys
import time

import pandas as pd
import requests

import config

API_URL = "https://quickstats.nass.usda.gov/api/api_GET/"
WEB_ENCODE_URL = "https://quickstats.nass.usda.gov/uuid/encode"
WEB_CSV_URL = "https://quickstats.nass.usda.gov/data/spreadsheet/{uuid}.csv"
HEADERS = {"User-Agent": "wheat-data-pipeline/1.0 (python-requests)"}

# Common column names we use for raw files no matter which method downloaded them.
RAW_COLUMNS = ["year", "period", "geo_level", "state", "state_ansi",
               "data_item", "domain", "value_raw", "cv_pct"]

# Website CSV header  ->  our name
WEB_RENAME = {"Year": "year", "Period": "period", "Geo Level": "geo_level", "State": "state",
              "State ANSI": "state_ansi", "Data Item": "data_item", "Domain": "domain",
              "Value": "value_raw", "CV (%)": "cv_pct"}
# API JSON field    ->  our name
API_RENAME = {"year": "year", "reference_period_desc": "period", "agg_level_desc": "geo_level",
              "state_name": "state", "state_ansi": "state_ansi", "short_desc": "data_item",
              "domain_desc": "domain", "Value": "value_raw", "CV (%)": "cv_pct"}


def _get(url, **kw):
    """HTTP GET/POST with 3 retries - USDA servers occasionally time out."""
    method = kw.pop("method", "GET")
    for attempt in range(1, 4):
        try:
            r = requests.request(method, url, headers=HEADERS, timeout=180, **kw)
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            if attempt == 3:
                raise
            print(f"   ...retry {attempt} after error: {e}")
            time.sleep(5 * attempt)


def fetch_via_api(params: dict, key: str) -> pd.DataFrame:
    """Official API. One request per combination of list-valued parameters."""
    list_keys = [k for k, v in params.items() if isinstance(v, list)]
    combos = itertools.product(*[params[k] for k in list_keys]) if list_keys else [()]
    frames = []
    for combo in combos:
        q = {k: v for k, v in params.items() if not isinstance(v, list)}
        q.update(dict(zip(list_keys, combo)))
        q.update({"key": key, "format": "JSON",
                  "year__GE": config.START_YEAR, "year__LE": config.END_YEAR})
        r = _get(API_URL, params=q)
        rows = r.json().get("data", [])
        print(f"   API {dict(zip(list_keys, combo))}: {len(rows):,} rows")
        if rows:
            frames.append(pd.DataFrame(rows))
    df = pd.concat(frames, ignore_index=True)
    return df.rename(columns=API_RENAME)[RAW_COLUMNS]


def fetch_via_website(params: dict) -> pd.DataFrame:
    """Keyless: ask the Quick Stats website to build the query, then download its CSV."""
    form = []
    for k, v in params.items():
        for item in (v if isinstance(v, list) else [v]):
            form.append((k, item))
    for y in range(config.START_YEAR, config.END_YEAR + 1):
        form.append(("year", str(y)))
    uuid = _get(WEB_ENCODE_URL, method="POST", data=form).text.strip().strip('"')
    csv_text = _get(WEB_CSV_URL.format(uuid=uuid)).text
    df = pd.read_csv(io.StringIO(csv_text), dtype=str, keep_default_na=False)
    print(f"   website export {uuid}: {len(df):,} rows")
    return df.rename(columns=WEB_RENAME)[RAW_COLUMNS]


def main() -> int:
    key = config.nass_api_key()
    method = "API" if key else "website export (no API key found)"
    print(f"[fetch] {config.COMMODITY} {config.START_YEAR}-{config.END_YEAR} via {method}")
    stamp = dt.date.today().strftime("%Y%m%d")
    for name, params in config.QUERIES.items():
        print(f" - {name}")
        df = fetch_via_api(params, key) if key else fetch_via_website(params)
        if df.empty:
            print(f"   !! no rows returned for {name}")
            return 1
        out = config.RAW_DIR / f"{name}.csv"
        df.to_csv(out, index=False)
        (config.RAW_DIR / "snapshots").mkdir(exist_ok=True)
        df.to_csv(config.RAW_DIR / "snapshots" / f"{name}_{stamp}.csv", index=False)
        print(f"   saved {out.relative_to(config.ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
