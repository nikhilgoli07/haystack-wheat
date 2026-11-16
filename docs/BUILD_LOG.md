# Build log: how this project was made (2026-11-16)

A chronological record of every step, decision and finding, for your own records.

---

### Step 0: Review the starting material (`Grain Stocks.zip`)
| File | What it was | Takeaway |
|---|---|---|
| `OPL - Power BI - US Wheat Stocks.pdf` | 2020 "One Point Lesson": download the quarterly Grain Stocks report, retype the wheat-by-state table into Excel, refresh Power BI | The manual process to automate |
| `Grain Stocks .xlsx` | Sheet **Table**: wide layout, states × (year, quarter, On/Off/Total), Mar 2000 → Dec 2020. Sheet **Wheat Stocks**: same data in long format (7,216 rows) feeding Power BI | Defines the target data: quarterly on/off-farm stocks by state |
| `US Wheat Stocks*.pbix`, `USDA API.pbix` | Power BI reports built on the workbook | Replaced by the web dashboard; Power BI can still read the new CSV/XLSX |
| `Links.docx` | ESMIS Grain Stocks page, FAS Open Data + Swagger, NRCS AWDB, api.data.gov, notes on Swagger "Authorize" | Researched in `01_USDA_DATA_SOURCES.md` |

### Step 1: Decisions confirmed with you
| Question | Answer |
|---|---|
| Install Python? | Yes. Python 3.12.10 installed with `winget install Python.Python.3.12` (user scope), plus `pandas numpy requests openpyxl` |
| NASS API key? | Will get one later. The pipeline auto-switches: uses the key if present, otherwise the keyless website export |
| Website platform? | Not sure. Built a static folder that works on any host and embeds with an iframe |
| Scope? | Stocks **plus** production, yield and acres |

### Step 2: Research the USDA sources
- Confirmed the Quick Stats API returns `401 unauthorized` without a key.
- Inspected the Quick Stats web page and found that its "Spreadsheet" export works by POSTing the form to `/uuid/encode` and then downloading `/data/spreadsheet/<uuid>.csv`. Tested it: 36,184 rows for all years of wheat stocks.
- Tested multi-value queries (several years and geography levels in one request). They work.
- Chose **Quick Stats** over parsing ESMIS PDFs/CSVs: same numbers, one consistent format back to 2000, and it includes USDA's revisions.

### Step 3: Fetch (`pipeline/fetch.py`)
- Two methods (API / website export) that both output the same columns.
- First run: **13,496 stocks rows** and **20,120 production rows**, 2000–2026.
- Raw data and dated snapshots are saved in `data/raw/`.

### Step 4: Clean (`pipeline/clean.py`)
- Parse values; keep (D)/(NA) codes as a status instead of turning them into 0.
- Split "Data Item" text into class / position / measure.
- Title-case states, add abbreviations, quarter labels and real dates.
- First validation run flagged 123 "On+Off ≠ Total" rows, all of them **"Other States"**. That row lumps different withheld states together for on-farm and off-farm, so it can't add up by design, and it is now excluded from that check. After the fix all checks **PASS** (see `data/clean/data_quality_report.md`).
- Cosmetic fix: bushels are written as whole numbers (`1625000`, not `1625000.0`).

### Step 5: Reconcile with the old workbook (`tools/reconcile_with_excel.py`)
- 7,216 hand-entered rows compared: **95.7% match**. All differences are explained:
  - **1,363** rows: workbook has 0 where USDA shows (D) withheld.
  - **1,409** rows: workbook rows for states/areas USDA didn't publish that quarter, plus "Unallocated" / "New England".
  - **53** rows: **Dec 2008 column in the workbook holds Jun 2009 data** (data-entry error in the manual process).
  - The rest, mostly **2019–2020**: the workbook kept first-published numbers; USDA later revised them.

### Step 6: Forecast (`pipeline/forecast.py`)
- Five simple models per series, chosen by a 6-year back-test (details in `03_FORECASTING.md`).
- First version: the "last value" model won most stocks series, an honest result for a noisy series.
- Improvement: added a **seasonal-ratio nowcast** for the next unpublished quarter. US Dec 1 back-test error fell from ~10% to **3.4%**. Current estimate: **Dec 1, 2026 ≈ 1.45 billion bu (80% range 1.37–1.53 billion)**.
- Fixes: yield keeps 1 decimal; bushels and acres are rounded to the nearest 1,000 (USDA's own precision); CSVs are written without scientific notation.
- Result: 489 series forecast, 1,467 forecast rows.

### Step 7: Publish (`pipeline/publish.py`)
- `site/data/wheat.json` (~240 KB) for the website.
- `data/clean/wheat_data.xlsx` for Excel / Power BI users.
- Fix: newer pandas requires `sheet_name=` as a keyword argument.

### Step 8: Dashboard (`site/`)
- Plain HTML/CSS/JS with hand-drawn SVG charts. No libraries or CDNs, so nothing can break or be blocked on the host.
- Features: measure / quarter / year-range filters; compare up to 6 states, with each state keeping its colour; KPI tiles (latest, change vs prior year, vs 5-year average, next forecast with typical error); trend chart with dashed forecast and 80% band; tile-grid US map (click to add a state); top-12 ranking; data table with CSV download; shareable URLs; light/dark themes; works on phones; `?embed=1` mode.
- Colour palette checked with a colour-blind-safety validator (passes in light and dark mode).
- Tested in a browser: desktop and phone (375 px) widths, dark mode, hover tooltips, map click → comparison, shareable-link reload, no console errors, no horizontal scroll on phones.
- Fix during testing: pasting a shared link into an open tab now updates the view without a reload.

### Step 9: Automation
- `run_pipeline.bat`: one double-click refresh, with a log file.
- `preview_site.bat`: view the site locally.
- `.github/workflows/update-wheat-data.yml`: scheduled refresh around every USDA release, commits only when the numbers change, deploys to GitHub Pages.
- Windows Task Scheduler instructions in `05_QUARTERLY_UPDATE.md`.

### Step 10: Documentation
`README.md` plus `docs/01`–`05` and this log.

### Step 11: Switch to the official NASS API (same day, after the key arrived)
- Saved the key in `.env` in the project folder. `.gitignore` keeps it out of GitHub.
- Reran the full pipeline. `fetch.py` detected the key and used the API (10 calls: one per measure × geography level).
- **Verified:** the API data is **identical** to the website-export data. All 13,496 stocks rows and 20,120 production rows match, with 0 value differences. All validation checks PASS.
- Note: the API route takes about 4–5 minutes, compared with seconds for the export, because USDA's API answers each call slowly. That doesn't matter for a quarterly refresh.

---

## Open items / next steps
1. **Add the API key as a GitHub secret** named `NASS_API_KEY` when you set up hosting (it's already in `.env` for local runs).
2. **Decide where to host** (Option A, GitHub Pages, is recommended) and add the iframe to the Haystack site.
3. Optional: repoint the old Power BI report to `data/clean/wheat_stocks.csv`.
4. Optional extensions: other crops (`COMMODITY` in `config.py`), WASDE comparison, weather inputs.
