# 05 — Quarterly update routine (replaces the old Power BI "One Point Lesson")

| | Old process (2020 OPL) | New process |
|---|---|---|
| Find the report | Open the Cornell/ESMIS page, find table `grst_p10_t004` | automatic |
| Get the numbers | Copy the state table into the Excel "Table" sheet by hand | automatic (Quick Stats) |
| Check | Eyeball the "Wheat Stocks" sheet | 6 automated checks + `data_quality_report.md` |
| Publish | Refresh Power BI Desktop, then "Refresh now" in the Power BI service | automatic (GitHub Actions) or one double-click |
| Errors found in old data | Dec 2008 wrong quarter; (D) typed as 0; unrevised numbers | n/a |

## If you use GitHub Pages (Option A in `04_HOSTING.md`)
Nothing to do. After each release:
1. Optional: check **GitHub → Actions** for a green tick on "Update wheat data".
2. Optional: open the dashboard and confirm the header shows the new "Latest Grain Stocks" date.

If a run fails (red ✗), GitHub emails the repo owner. Open the run and read the log. The most common causes:
- USDA site down → just click **Re-run jobs** later.
- A validation check failed → read `data_quality_report.md` in the log output. The site keeps showing the last good data.

## If you run it on a Windows PC
**Manually:** double-click `run_pipeline.bat`, check that it ends with `Done`, then upload `site/` (Option B) if your host needs it.

**Automatically with Windows Task Scheduler:**
1. Start menu → **Task Scheduler** → **Create Basic Task…**
2. Name: `Wheat data refresh`. Trigger: **Weekly**, Monday, 9:00 AM. (Or add four **Monthly** triggers on the last day of Mar/Jun/Sep and Jan 15.)
3. Action: **Start a program**
   - Program: `C:\path\to\haystack-wheat\run_pipeline.bat`
   - Add arguments: `auto` (this skips the "press any key" pause)
   - Start in: `C:\path\to\haystack-wheat`
4. Finish. Each run writes `pipeline_last_run.log` in the project folder.

## USDA release calendar
Exact dates are in the NASS calendar: https://www.nass.usda.gov/Publications/Calendar/
| Release | Stocks as of | Also updates |
|---|---|---|
| Late March | Mar 1 | |
| Late June | Jun 1 | (Acreage report same day: planted acres) |
| Late September | Sep 1 | Small Grains Annual Summary: production, yield, acres |
| ~Jan 10–12 | Dec 1 | Crop Production Annual Summary |

## Quick sanity check after an update (2 minutes)
1. `data/clean/data_quality_report.md` ends with **Result: PASS**.
2. The dashboard header date moved to the new quarter.
3. Spot-check one number against the USDA release PDF (e.g. the US total on the first page of the Grain Stocks report).
