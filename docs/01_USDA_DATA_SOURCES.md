# 01 — USDA data sources (orientation)

Read this to understand **where the wheat numbers come from** and why the pipeline uses the sources it does.

## 1. The agency: USDA NASS

The **National Agricultural Statistics Service (NASS)** surveys farmers and grain facilities and publishes the official US crop numbers. Two NASS reports feed this project.

| Report | What it gives us | When it comes out |
|---|---|---|
| **Grain Stocks** | Wheat in storage on **Mar 1, Jun 1, Sep 1, Dec 1**, by state, split into **on-farm** and **off-farm** (elevators, mills, terminals, processors) | End of **March**, end of **June**, end of **September**, and about **Jan 10–12** (for Dec 1) |
| **Crop Production / Small Grains Annual Summary** | Annual **production** (bushels), **yield** (bu/acre), **planted** and **harvested acres**, by state and wheat class | Small Grains Summary at the **end of September**; Crop Production Annual Summary in **January** |

Wheat context worth knowing when reading the charts:
- The wheat **marketing year runs Jun 1 – May 31**, so **Jun 1 stocks = last season's carry-out** (usually the year's low point).
- **Sep 1** is usually the high point, just after harvest.
- NASS **revises** the previous quarter's stocks in the next report and once a year in the annual summaries. Quick Stats always holds the **latest revised** numbers.

## 2. Where the reports live

| Place | URL | Use |
|---|---|---|
| ESMIS (report archive) | https://esmis.nal.usda.gov/publication/grain-stocks | The PDF/TXT/CSV release files. This is the successor to the Cornell link `usda.library.cornell.edu/concern/publications/xg94hp534` in the old Power BI lesson. The wheat table used to be `grst_p10_t004` ("All Wheat Stocks by Position – States and United States"). |
| **Quick Stats** (database) | https://quickstats.nass.usda.gov/ | **The same numbers in a queryable database.** This is what the pipeline uses: no copy/paste from PDFs, all years in one download. |
| Quick Stats API | https://quickstats.nass.usda.gov/api | Programmatic access. Needs a **free key** (instant, by email). Max 50,000 rows per call. |

### Why Quick Stats instead of the report PDFs
The old process meant opening each quarterly PDF, retyping or pasting the state table into Excel, then refreshing Power BI. While reconciling the automated data against the old workbook we found that this manual entry caused real errors:
- The workbook's **Dec 2008** column actually contains **Jun 2009** numbers (for example, Kansas off-farm 76,541,000).
- 2019–2020 values were the **first-published** figures; USDA later revised them.
- USDA's **(D)** "withheld" marks were typed as **0**, which drags down averages.

Quick Stats removes all three problems.

## 3. How a Quick Stats query is built

Every number in Quick Stats is described by these fields. The pipeline's queries are in `pipeline/config.py → QUERIES`.

| Field | Our value | Meaning |
|---|---|---|
| `source_desc` | `SURVEY` | Annual/quarterly surveys (not the 5-year Census) |
| `commodity_desc` | `WHEAT` | Change this one word to do corn, soybeans, etc. later |
| `statisticcat_desc` | `STOCKS` or `PRODUCTION`, `YIELD`, `AREA PLANTED`, `AREA HARVESTED` | What is measured |
| `agg_level_desc` | `STATE`, `NATIONAL` | Geography level |
| `reference_period_desc` | `FIRST OF MAR` / `JUN` / `SEP` / `DEC` (stocks); `YEAR` (production) | `YEAR` excludes the in-season forecasts (e.g. "YEAR - AUG FORECAST") |
| `year` | 2000 → current | |
| `short_desc` ("Data Item") | e.g. `WHEAT, ON FARM - STOCKS, MEASURED IN BU` | Full text label. We split it into *class*, *position* and *measure* |

### Special codes in the Value column
| Code | Meaning | How we store it |
|---|---|---|
| `(D)` | Withheld to avoid disclosing individual operations | blank value, `status = withheld` |
| `(NA)` | Not available | blank, `not_available` |
| `(Z)` | Less than half the unit shown | `0`, `less_than_half_unit` |
| `(X)`, `(S)`, `(H)` | Not applicable / insufficient reports / CV over 99% | blank + status |

Withheld states are added into the **"Other States"** row, so the state rows plus Other States equal the US total. The pipeline checks this every run.

## 4. Getting your API key (5 minutes, free)
1. Go to https://quickstats.nass.usda.gov/api and click **Request API Key**.
2. Enter your work email. The key arrives by email immediately.
3. Copy `.env.example` to `.env` in the project folder and paste the key after `NASS_API_KEY=`.
4. For the automatic GitHub updates, also add it as a repository secret named `NASS_API_KEY` (see `04_HOSTING.md`).

Without a key the pipeline still works. It uses the Quick Stats website's own **"Spreadsheet" CSV export**, which returns the same data the API does. The API is the officially supported route, though, so use the key once you have it.

## 5. The other links in `Links.docx`
| Link | What it is | Relevance |
|---|---|---|
| apps.fas.usda.gov/opendatawebV2 and the FAS Swagger | **Foreign Agricultural Service** Open Data: PSD (world supply & demand by *country*), export sales, trade (GATS). Needs an **api.data.gov** key. | Future add-on: US wheat exports and world balance sheets. Not state-level. |
| wcc.sc.egov.usda.gov/awdbRestApi | **NRCS Air & Water Database**: snowpack, precipitation, soil moisture stations | Future add-on: weather inputs could improve yield forecasts |
| api.data.gov | The key service for FAS and many federal APIs | Not needed for NASS (NASS issues its own key) |
| WASDE (in the old Power BI folder) | USDA's official monthly supply/demand **projections** | Good benchmark to compare our forecasts against |
