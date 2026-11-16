# 03 — How the forecasts work

**In one sentence:** for every state and measure, we test five simple models on the last 6 years of history, keep whichever would have been most accurate, and project 3 years ahead with an 80% range.

## What gets forecast
| Dataset | Series | Count (Nov 2026) |
|---|---|---|
| Stocks | each state × quarter (Mar/Jun/Sep/Dec) × position (Total/On/Off) | ~290 |
| Production | each state × production / yield / planted / harvested acres | ~200 |

A series needs **at least 10 reported years**; states with mostly (D) values are skipped.

## The five candidate models
| Code | Name on the site | How it works | Good when… |
|---|---|---|---|
| `naive` | Last value | next year = this year | the series wanders without a clear pattern (common for stocks) |
| `avg5` | 5-year average | mean of the last 5 years | values bounce around a stable level (e.g. yield) |
| `trend10` | 10-year trend | straight line through the last 10 years | steady long-term growth or decline (e.g. shrinking acreage) |
| `holt` | Damped trend (Holt) | exponential smoothing; recent years count more and the trend flattens out | gradual shifts |
| `ensemble` | Ensemble average | average of the four above | nothing clearly wins; usually the most robust |

## How the winner is chosen: back-testing
For each series we pretend it is 2020 and forecast 2021 with data up to 2020, then do the same for 2022, and so on through the latest year (6 tests). The model with the **lowest mean absolute error (MAE)** wins. The site shows that model's **typical error** as MAPE (mean absolute percentage error) next to every forecast.

## Next-quarter estimate: seasonal ratio
Grain stocks follow a strong seasonal pattern (for example, Dec 1 stocks are a fairly stable fraction of Sep 1 stocks). When the **previous quarter is already published**, the pipeline also tests:

> estimate = previous quarter's actual × median ratio of the last 5 years

If that back-tests better, it replaces the first forecast step. Right now Sep 1, 2026 is out and Dec 1, 2026 is not, so the Dec 1, 2026 estimates use this method:

| US Dec 1 total stocks | Back-test error |
|---|---|
| Annual model only | ~10% |
| **Seasonal ratio** | **3.4%** |

**Current US estimate for Dec 1, 2026: 1.45 billion bu (80% range 1.37–1.53 billion).** USDA releases the actual number in mid-January 2027.

After each release the "next quarter" moves forward automatically (Jan release → Mar 1 estimate, and so on).

## The 80% range
It comes from the back-test errors: ±1.28 × RMSE, widened by √(years ahead). If the model is as accurate as it was over the last 6 years, about 8 out of 10 outcomes should fall inside the band. Lower bounds are clipped at 0.

## Accuracy today (back-test, last 6 years)
| Series (United States) | Model chosen | Typical error |
|---|---|---|
| Dec 1 total stocks | Seasonal ratio | 3.4% |
| Sep 1 total stocks | Last value | 9.3% |
| Mar 1 total stocks | Last value | 12.5% |
| Jun 1 total stocks | Last value | 18.2% |
| Production | Last value | 9.7% |
| Yield | 5-year average | 5.6% |
| Planted acres | 5-year average | 3.4% |
| Harvested acres | Ensemble | 5.4% |

Single states are noisier: the median typical error is about 19% for state total stocks and 23% for state production, because one drought or one big crop moves a state far more than the nation.

The full table for every series is in `data/clean/forecast_accuracy.csv`.

## Honest limitations (please keep these on the site)
- The models use **only each series' own history**. They know nothing about weather, prices, exports, the farm bill or USDA's WASDE outlook.
- "Last value" often wins because year-to-year changes in stocks are close to random. That is a real finding, not a bug, and it is why the ranges are wide.
- Treat the numbers as a **baseline to compare against**, not a prediction to trade on.

## Ideas to improve later
1. **Production = forecast acres × forecast yield**, with yield trend-adjusted.
2. Add weather drivers (NRCS AWDB soil moisture/snowpack, NOAA drought index) as regression inputs.
3. Compare against **WASDE** projections each month and show both on the chart.
4. Use NASS's in-season forecasts (May–Aug "YEAR - xxx FORECAST" rows) as the current-year estimate.
