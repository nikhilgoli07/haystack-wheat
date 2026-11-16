# Haystack Data Solutions: US Wheat Data (2000 → today)

This project automatically downloads, cleans, checks and forecasts USDA wheat data. It then publishes the results as an interactive dashboard that can be hosted on any website.

- **Stocks:** quarterly (Mar 1 / Jun 1 / Sep 1 / Dec 1), by state, on-farm vs off-farm (USDA *Grain Stocks*)
- **Production, yield, planted and harvested acres:** annual, by state (USDA *Crop Production / Small Grains Summary*)
- **Forecasts:** next 3 years for every state, plus a next-quarter stocks estimate, each with an 80% range and its measured accuracy
- **Source:** USDA NASS Quick Stats, so there is no manual copy/paste

## Quick start (Windows)
1. Install Python 3.12 (already done on this PC) and run:
   ```bash
   python -m pip install -r requirements.txt
   ```
2. Your NASS API key is already saved in `.env` (git-ignored). On a new computer, copy `.env.example` to `.env` and paste the key.
3. **Double-click `run_pipeline.bat`** to refresh everything from USDA (about 5 minutes with the API key).
4. **Double-click `preview_site.bat`** to view the dashboard at http://localhost:8765.

## What's in the folder
```
haystack-wheat/
├─ run_pipeline.bat          ← refresh data (double-click)
├─ preview_site.bat          ← view the dashboard locally
├─ pipeline/
│   ├─ config.py             ← years, crop, queries, API key loading
│   ├─ fetch.py              ← STEP 1  download from USDA
│   ├─ clean.py              ← STEP 2  clean + validate
│   ├─ forecast.py           ← STEP 3  forecasts
│   ├─ publish.py            ← STEP 4  website JSON + Excel workbook
│   └─ run_pipeline.py       ← runs 1→4
├─ data/
│   ├─ raw/                  ← untouched USDA downloads (+ dated snapshots)
│   └─ clean/                ← wheat_stocks.csv, wheat_production.csv, wheat_forecasts.csv,
│                              forecast_accuracy.csv, wheat_data.xlsx, data_quality_report.md
├─ site/                     ← THE WEBSITE (upload or deploy this folder)
│   ├─ index.html
│   ├─ assets/app.js, styles.css
│   └─ data/wheat.json
├─ tools/reconcile_with_excel.py   ← compares against the old hand-made workbook
├─ .github/workflows/update-wheat-data.yml  ← automatic refresh + deploy on GitHub
└─ docs/
    ├─ 01_USDA_DATA_SOURCES.md   ← USDA orientation: reports, Quick Stats, codes, API key
    ├─ 02_PIPELINE_STEPS.md      ← every data-manipulation step explained
    ├─ 03_FORECASTING.md         ← models, back-testing, accuracy, limitations
    ├─ 04_HOSTING.md             ← putting it on the Haystack website
    ├─ 05_QUARTERLY_UPDATE.md    ← routine after each USDA release (replaces the old OPL)
    └─ BUILD_LOG.md              ← chronological record of how this was built
```

## Data at a glance (as of the 2026-11-16 build)
- 107 quarterly stock releases (Mar 2000 – Sep 2026), 43 states plus "Other States" and the US total.
- Production 2000–2026 for 42 states plus the US.
- All validation checks pass. The data matches the old hand-entered workbook except where that workbook had errors (see `docs/BUILD_LOG.md`, step 5).
- **US wheat stocks, Sep 1, 2026: 1.846 billion bu.** Estimate for Dec 1, 2026: **≈1.45 billion bu** (80% range 1.37–1.53 billion).
