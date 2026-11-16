"""
STEP 2 - CLEAN + VALIDATE
Turn the raw NASS downloads into tidy, analysis-ready tables.

Basic data manipulation performed (each is a numbered block below):
  2.1  Parse numbers  - "1,302,973,000" -> 1302973000 ; "(D)" -> blank + status flag
  2.2  Split the long NASS "Data Item" text into columns (class, position, measure)
  2.3  Standardise names - title-case states, add 2-letter abbreviations, quarter labels
  2.4  Keep only the series we need, drop duplicates, sort
  2.5  Validation checks -> data/clean/data_quality_report.md

Outputs (data/clean/):
  wheat_stocks.csv       one row per year x quarter x state x class x position
  wheat_production.csv   one row per year x state x class x measure

Run:  python pipeline/clean.py
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

import config


# ---------------------------------------------------------------------------
# 2.1  Parse the NASS "Value" column
# ---------------------------------------------------------------------------
def parse_value(raw: pd.Series) -> tuple[pd.Series, pd.Series]:
    """Return (numeric value, status).  status = 'reported' or a special-code name."""
    txt = raw.astype(str).str.strip()
    status = txt.map(config.SPECIAL_CODES).fillna("reported")
    num = pd.to_numeric(txt.str.replace(",", "", regex=False), errors="coerce")
    num[status == "less_than_half_unit"] = 0.0           # (Z) means "rounds to zero"
    bad = num.isna() & (status == "reported")
    if bad.any():                                        # unknown code -> flag, don't crash
        status[bad] = "unparsed:" + txt[bad]
    return num, status


# ---------------------------------------------------------------------------
# 2.3  Shared state clean-up
# ---------------------------------------------------------------------------
def standardise_geo(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.loc[df.geo_level == "NATIONAL", "state"] = "US TOTAL"
    df["state_abbr"] = df.state.map(config.STATE_ABBR)
    missing = df.state_abbr.isna()
    if missing.any():
        print("   !! unknown state names:", sorted(df.state[missing].unique()))
    df["state"] = df.state.str.title().replace({"Us Total": "United States"})
    df["year"] = df.year.astype(int)
    return df


# ---------------------------------------------------------------------------
# Stocks
# ---------------------------------------------------------------------------
def clean_stocks(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw[raw.period.isin(config.QUARTERS)].copy()

    # 2.2  "WHEAT, SPRING, DURUM, OFF FARM - STOCKS, MEASURED IN BU"
    #       left side of " - " holds class + position
    left = df.data_item.str.split(" - ", n=1).str[0]
    df["position"] = np.select(
        [left.str.contains("ON FARM"), left.str.contains("OFF FARM")],
        ["On Farm", "Off Farm"], default="Total")
    df["wheat_class"] = np.where(left.str.contains("DURUM"), "Durum", "All Wheat")

    df = standardise_geo(df)
    df["quarter"] = df.period.map(lambda p: config.QUARTERS[p][0])
    df["month"] = df.period.map(lambda p: config.QUARTERS[p][1])
    df["date"] = pd.to_datetime(dict(year=df.year, month=df.month, day=1)).dt.strftime("%Y-%m-%d")
    df["bushels"], df["status"] = parse_value(df.value_raw)

    # 2.4  keep, order, de-duplicate
    keys = ["year", "month", "state", "wheat_class", "position"]
    df = (df.sort_values(keys)
            .drop_duplicates(keys, keep="last")
            [["date", "year", "quarter", "month", "state", "state_abbr", "geo_level",
              "wheat_class", "position", "bushels", "status"]])
    df["geo_level"] = df.geo_level.str.title()
    return df.reset_index(drop=True)


# ---------------------------------------------------------------------------
# Production / yield / acreage
# ---------------------------------------------------------------------------
PROD_MEASURES = {   # right side of " - "  ->  (measure name, unit)
    "PRODUCTION, MEASURED IN BU": ("production", "bushels"),
    "YIELD, MEASURED IN BU / ACRE": ("yield", "bu/acre"),
    "ACRES PLANTED": ("area_planted", "acres"),
    "ACRES HARVESTED": ("area_harvested", "acres"),
}
PROD_CLASSES = {    # left side of " - "  ->  class label
    "WHEAT": "All Wheat",
    "WHEAT, WINTER": "Winter",
    "WHEAT, SPRING, (EXCL DURUM)": "Other Spring",
    "WHEAT, SPRING, DURUM": "Durum",
}


def clean_production(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw[raw.period == "YEAR"].copy()
    parts = df.data_item.str.split(" - ", n=1)
    df["wheat_class"] = parts.str[0].map(PROD_CLASSES)
    m = parts.str[1].map(PROD_MEASURES)
    df = df[df.wheat_class.notna() & m.notna()].copy()   # drops irrigated splits, % by type, $
    df["measure"] = m[df.index].str[0]
    df["unit"] = m[df.index].str[1]

    df = standardise_geo(df)
    df["value"], df["status"] = parse_value(df.value_raw)
    keys = ["year", "state", "wheat_class", "measure"]
    df = (df.sort_values(keys).drop_duplicates(keys, keep="last")
            [["year", "state", "state_abbr", "geo_level", "wheat_class",
              "measure", "unit", "value", "status"]])
    df["geo_level"] = df.geo_level.str.title()
    return df.reset_index(drop=True)


# ---------------------------------------------------------------------------
# 2.5  Validation
# ---------------------------------------------------------------------------
def validate(stocks: pd.DataFrame, prod: pd.DataFrame) -> list[str]:
    out = ["# Data quality report", ""]
    errors = 0

    # (a) coverage
    us = stocks[(stocks.state == "United States") & (stocks.wheat_class == "All Wheat")
                & (stocks.position == "Total")]
    out += ["## Coverage",
            f"- Stocks: {us.date.min()} to {us.date.max()} "
            f"({us.date.nunique()} quarterly releases, {stocks.state.nunique() - 1} states/areas)",
            f"- Production: {prod.year.min()} to {prod.year.max()} "
            f"({prod[prod.geo_level == 'State'].state.nunique()} states/areas)"]
    expected = {(y, m) for y in range(config.START_YEAR, config.END_YEAR + 1) for m in (3, 6, 9, 12)}
    have = set(zip(us.year, us.month))
    gaps = sorted(expected - have)
    out.append(f"- Quarters not (yet) published: {', '.join(f'{y}-{m:02d}' for y, m in gaps) or 'none'}")

    # (b) status codes
    out += ["", "## Suppressed / missing values",
            "NASS withholds a value as (D) when publishing it could reveal an individual "
            "farm or elevator. These are kept as blanks (not zeros) so averages are not biased.", ""]
    for name, d in (("Stocks", stocks), ("Production", prod)):
        counts = d.status.value_counts()
        out.append(f"- {name}: " + ", ".join(f"{k} = {v:,}" for k, v in counts.items()))
        unparsed = [s for s in counts.index if s.startswith("unparsed")]
        if unparsed:
            errors += 1
            out.append(f"  - ERROR unparsed codes: {unparsed}")

    # (c) on-farm + off-farm = total
    #     "Other States" is skipped: NASS lumps a *different* set of withheld states
    #     into it for on-farm vs off-farm, so its parts never add up by design.
    real = stocks[stocks.state != "Other States"]
    w = real.pivot_table(index=["date", "state", "wheat_class"], columns="position",
                         values="bushels", aggfunc="first").dropna()
    diff = (w["On Farm"] + w["Off Farm"] - w["Total"]).abs()
    bad = diff[diff > 1_000]          # NASS rounds to 1,000 bu
    out += ["", "## Check: On Farm + Off Farm = Total",
            f"- {len(w):,} complete rows checked (excluding 'Other States'), "
            f"{len(bad)} differ by more than 1,000 bu"]
    errors += int(len(bad) > 0)
    if len(bad):
        out.append("  - examples: " + "; ".join(f"{i}: {v:,.0f}" for i, v in bad.head(5).items()))

    # (d) states add up to US total (difference = withheld states)
    tot = stocks[(stocks.wheat_class == "All Wheat") & (stocks.position == "Total")]
    st_sum = tot[tot.geo_level == "State"].groupby("date").bushels.sum()
    us_tot = tot[tot.geo_level == "National"].set_index("date").bushels
    share = ((us_tot - st_sum) / us_tot * 100).dropna()
    out += ["", "## Check: sum of states (+ 'Other States') vs. US total",
            "Withheld (D) states are rolled into the 'Other States' row, so the rows "
            "should add up to the US total.",
            f"- {len(share)} quarters checked, largest gap {share.abs().max():.2f}% of US total"]
    if (share < -0.5).any():
        errors += 1
        out.append(f"  - ERROR states exceed US total on: {list(share[share < -0.5].index)}")

    # (e) production ~= yield x harvested area
    p = prod[prod.wheat_class == "All Wheat"].pivot_table(
        index=["year", "state"], columns="measure", values="value", aggfunc="first").dropna()
    if {"production", "yield", "area_harvested"} <= set(p.columns):
        rel = (p["yield"] * p["area_harvested"] / p["production"] - 1).abs()
        out += ["", "## Check: Production = Yield x Harvested acres",
                f"- {len(p):,} state-years checked, {(rel > 0.03).sum()} off by more than 3% "
                f"(small gaps are normal: yield is rounded to 0.1 bu)"]

    # (f) duplicates
    d1 = stocks.duplicated(["date", "state", "wheat_class", "position"]).sum()
    d2 = prod.duplicated(["year", "state", "wheat_class", "measure"]).sum()
    out += ["", "## Check: duplicate keys", f"- stocks: {d1}, production: {d2}"]
    errors += int(d1 > 0) + int(d2 > 0)

    out += ["", f"**Result: {'PASS' if errors == 0 else f'{errors} ERROR(S)'}**"]
    return out, errors


def main() -> int:
    print("[clean]")
    raw_s = pd.read_csv(config.RAW_DIR / "stocks.csv", dtype=str, keep_default_na=False)
    raw_p = pd.read_csv(config.RAW_DIR / "production.csv", dtype=str, keep_default_na=False)

    stocks = clean_stocks(raw_s)
    prod = clean_production(raw_p)
    stocks["bushels"] = stocks.bushels.round().astype("Int64")
    stocks.to_csv(config.CLEAN_DIR / "wheat_stocks.csv", index=False)
    prod.to_csv(config.CLEAN_DIR / "wheat_production.csv", index=False, float_format="%.12g")
    print(f"   wheat_stocks.csv      {len(stocks):,} rows")
    print(f"   wheat_production.csv  {len(prod):,} rows")

    report, errors = validate(stocks, prod)
    (config.CLEAN_DIR / "data_quality_report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print("   " + report[-1].strip("*"))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
