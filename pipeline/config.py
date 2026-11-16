"""
Central configuration for the Haystack wheat pipeline.

Everything that you might want to change later (years, commodity, folders)
lives here so the other scripts never need editing.
"""
from __future__ import annotations

import datetime as _dt
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
CLEAN_DIR = ROOT / "data" / "clean"
SITE_DATA_DIR = ROOT / "site" / "data"

for _d in (RAW_DIR, CLEAN_DIR, SITE_DATA_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# What to download
# ---------------------------------------------------------------------------
COMMODITY = "WHEAT"            # change to "CORN", "SOYBEANS", ... later
START_YEAR = 2000
END_YEAR = _dt.date.today().year   # always "through the current year"

FORECAST_HORIZON = 3           # how many future years to predict

# NASS Quick Stats query definitions.  Each entry is downloaded separately.
# Keys are NASS Quick Stats parameter names (see docs/01_USDA_DATA_SOURCES.md).
QUERIES = {
    # Quarterly Grain Stocks report: Mar 1, Jun 1, Sep 1, Dec 1 stocks
    "stocks": {
        "source_desc": "SURVEY",
        "commodity_desc": COMMODITY,
        "statisticcat_desc": "STOCKS",
        "agg_level_desc": ["STATE", "NATIONAL"],
    },
    # Annual production, yield and acreage (Crop Production / Small Grains Summary)
    "production": {
        "source_desc": "SURVEY",
        "commodity_desc": COMMODITY,
        "statisticcat_desc": ["PRODUCTION", "YIELD", "AREA PLANTED", "AREA HARVESTED"],
        "agg_level_desc": ["STATE", "NATIONAL"],
        "reference_period_desc": "YEAR",
    },
}

# ---------------------------------------------------------------------------
# API key (optional).  Free key: https://quickstats.nass.usda.gov/api
# Put it in a file called .env in the project root:   NASS_API_KEY=xxxxxxxx
# or set it as an environment variable.  Never commit the real key.
# ---------------------------------------------------------------------------
def nass_api_key() -> str | None:
    key = os.environ.get("NASS_API_KEY")
    env_file = ROOT / ".env"
    if not key and env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("NASS_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    return key or None


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------
STATE_ABBR = {
    "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR", "CALIFORNIA": "CA",
    "COLORADO": "CO", "CONNECTICUT": "CT", "DELAWARE": "DE", "FLORIDA": "FL", "GEORGIA": "GA",
    "HAWAII": "HI", "IDAHO": "ID", "ILLINOIS": "IL", "INDIANA": "IN", "IOWA": "IA",
    "KANSAS": "KS", "KENTUCKY": "KY", "LOUISIANA": "LA", "MAINE": "ME", "MARYLAND": "MD",
    "MASSACHUSETTS": "MA", "MICHIGAN": "MI", "MINNESOTA": "MN", "MISSISSIPPI": "MS",
    "MISSOURI": "MO", "MONTANA": "MT", "NEBRASKA": "NE", "NEVADA": "NV", "NEW HAMPSHIRE": "NH",
    "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC",
    "NORTH DAKOTA": "ND", "OHIO": "OH", "OKLAHOMA": "OK", "OREGON": "OR", "PENNSYLVANIA": "PA",
    "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD", "TENNESSEE": "TN",
    "TEXAS": "TX", "UTAH": "UT", "VERMONT": "VT", "VIRGINIA": "VA", "WASHINGTON": "WA",
    "WEST VIRGINIA": "WV", "WISCONSIN": "WI", "WYOMING": "WY",
    "OTHER STATES": "OTH", "US TOTAL": "US",
}

QUARTERS = {  # NASS "Period" text -> (label, month number)
    "FIRST OF MAR": ("Mar 1", 3),
    "FIRST OF JUN": ("Jun 1", 6),
    "FIRST OF SEP": ("Sep 1", 9),
    "FIRST OF DEC": ("Dec 1", 12),
}

# NASS special codes that appear in the Value column instead of a number.
# https://quickstats.nass.usda.gov/src/glossary.pdf
SPECIAL_CODES = {
    "(D)": "withheld",       # withheld to avoid disclosing individual operations
    "(NA)": "not_available",
    "(X)": "not_applicable",
    "(S)": "insufficient_reports",
    "(Z)": "less_than_half_unit",   # treated as 0
    "(L)": "less_than_half_unit",
    "(H)": "cv_over_99",
}
