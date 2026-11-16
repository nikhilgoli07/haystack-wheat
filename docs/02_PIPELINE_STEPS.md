# 02 — The data pipeline, step by step

```
USDA Quick Stats ──► 1 FETCH ──► data/raw/*.csv
                                   │
                     2 CLEAN ◄─────┘  (parse, split, standardise, validate)
                       │
                       ├──► data/clean/wheat_stocks.csv
                       ├──► data/clean/wheat_production.csv
                       └──► data/clean/data_quality_report.md
                       │
                     3 FORECAST ──► data/clean/wheat_forecasts.csv, forecast_accuracy.csv
                       │
                     4 PUBLISH ──► site/data/wheat.json   (the website reads this)
                                └► data/clean/wheat_data.xlsx (for Excel / Power BI users)
```

Run everything: **double-click `run_pipeline.bat`**, or:

```bash
python pipeline/run_pipeline.py
```

Rebuild without downloading (for example after editing the cleaning code):

```bash
python pipeline/run_pipeline.py --offline
```

Each step is its own file and can be run alone, for example `python pipeline/clean.py`.

---

## Setup (once per computer)

1. Install Python 3.12 from python.org, or run `winget install Python.Python.3.12`.
2. In the project folder, install the libraries:
   ```bash
   python -m pip install -r requirements.txt
   ```
3. Optional: add your NASS key (see `01_USDA_DATA_SOURCES.md §4`).

---

## Step 1: Fetch (`pipeline/fetch.py`)

**Goal:** get every wheat stocks and production row for 2000 to the current year, untouched.

What the code does:
1. Reads the query definitions in `config.py`.
2. If `NASS_API_KEY` exists, calls the **official API** once per combination (for example `STOCKS × STATE`) with `year__GE=2000`.
   Otherwise it asks the Quick Stats website to build the same query (`/uuid/encode`) and downloads its CSV export (`/data/spreadsheet/<id>.csv`).
3. Renames the columns to one common set (`year, period, geo_level, state, state_ansi, data_item, domain, value_raw, cv_pct`) so both download methods produce identical files.
4. Saves `data/raw/stocks.csv` and `data/raw/production.csv`, plus a **dated snapshot** in `data/raw/snapshots/` so you can see what USDA said on any given day (useful when they revise numbers).
5. Retries up to 3 times if USDA's server times out.

Typical size: about 13,500 stocks rows and 20,000 production rows.

## Step 2: Clean and validate (`pipeline/clean.py`)

This is the **basic data manipulation** stage. Each block in the code is numbered to match:

| # | Manipulation | Example |
|---|---|---|
| 2.1 | **Parse numbers** and keep USDA's codes as a separate status column | `"1,302,973,000"` → `1302973000`; `"(D)"` → blank + `withheld` |
| 2.2 | **Split the text label** into columns | `WHEAT, SPRING, DURUM, OFF FARM - STOCKS, MEASURED IN BU` → class `Durum`, position `Off Farm` |
| 2.3 | **Standardise names** | `KANSAS` → `Kansas` + `KS`; `FIRST OF SEP` → `Sep 1`, month `9`, date `2026-09-01`; national → `United States` |
| 2.4 | **Filter, de-duplicate, sort** | Production keeps 4 measures × 4 classes (All, Winter, Other Spring, Durum) and drops irrigated splits, % by type and $ values |
| 2.5 | **Validation checks** written to `data_quality_report.md` | see below |

### Validation checks (run automatically every time)
| Check | Why | Last result |
|---|---|---|
| Coverage: which quarters exist | Spot a missed release | 107 quarters, Mar 2000 – Sep 2026; Dec 2026 not yet published |
| Status-code counts | Catch new or unknown USDA codes | 3,849 withheld, 26 not available, 0 unparsed |
| On-farm + Off-farm = Total (±1,000 bu) | Internal consistency | 2,432 rows checked, 0 mismatches |
| States + "Other States" = US total | Nothing lost or double-counted | 107 quarters, 0.00% gap |
| Production ≈ Yield × Harvested acres (±3%) | Units and row alignment | 1,118 state-years, 0 off |
| Duplicate keys | Join safety | 0 |

If a check that indicates broken data fails, the step **exits with an error**, nothing downstream is overwritten, and the website keeps showing the last good data.

### Output columns
**`wheat_stocks.csv`**: `date, year, quarter, month, state, state_abbr, geo_level, wheat_class (All Wheat|Durum), position (Total|On Farm|Off Farm), bushels, status`

**`wheat_production.csv`**: `year, state, state_abbr, geo_level, wheat_class (All Wheat|Winter|Other Spring|Durum), measure (production|yield|area_planted|area_harvested), unit, value, status`

This "long" (tidy) layout, with one number per row, is what Power BI, Excel pivot tables and pandas handle best. The Excel export also includes a **wide** sheet that looks like the old "Table" tab.

## Step 3: Forecast (`pipeline/forecast.py`)
See `03_FORECASTING.md`.

## Step 4: Publish (`pipeline/publish.py`)
1. Builds `site/data/wheat.json` (about 240 KB). Values are stored as arrays aligned to a shared `years` list, which keeps the file small and fast to load.
2. Builds `data/clean/wheat_data.xlsx` with sheets README, Stocks (long), Stocks (wide), Production (long), Forecasts, Forecast accuracy.
   - **Power BI users:** point the existing report at this workbook's *Stocks (long)* sheet, or at `wheat_stocks.csv`. No more manual typing.

## One-off tool: reconcile with the old workbook
```bash
python tools/reconcile_with_excel.py "path\to\Grain Stocks .xlsx"
```
This compares the 7,216 hand-entered rows (2000–2020) with the automated data. The 2026-11-16 result was a 95.7% match. Every difference is explained by:
- (D) values typed as 0 (1,363 rows)
- states USDA didn't publish that quarter (1,409 rows)
- a **Dec 2008 data-entry error** in the workbook (53 rows)
- **USDA revisions** after first release, concentrated in 2019–2020

The full row-by-row comparison is saved to `data/clean/reconciliation_vs_excel.csv`.

## Changing what's collected
- **Different years:** `START_YEAR` in `config.py`.
- **Another crop:** `COMMODITY = "CORN"` in `config.py`, then rerun. Production class names in `clean.py → PROD_CLASSES` are wheat-specific, so add the new crop's classes there.
- **More forecast years:** `FORECAST_HORIZON` in `config.py`.
