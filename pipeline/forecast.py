"""
STEP 3 - FORECAST
Predict the next few years for every state from its own history.

For each series (e.g. "Kansas, Sep 1 stocks, total" or "Kansas, yield") we:
  3.1  try 5 simple, explainable models
  3.2  back-test each one: pretend it is 6 earlier years, predict one year ahead,
       compare with what actually happened
  3.3  keep the model with the lowest average error (MAE)
  3.4  forecast FORECAST_HORIZON years ahead with an 80% range built from the
       back-test errors (wider the further out we go)

Models
  naive      next year = this year
  avg5       next year = average of last 5 years
  trend10    straight line fitted to the last 10 years
  holt       damped-trend exponential smoothing (recent years weigh more)
  ensemble   average of the four above (often the most robust)

Output: data/clean/wheat_forecasts.csv, data/clean/forecast_accuracy.csv
Run:    python pipeline/forecast.py
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

import config

Z80 = 1.2816          # 80% two-sided normal interval
BACKTEST_YEARS = 6
MIN_POINTS = 10       # need at least this many reported years to forecast


# ---------------------------------------------------------------------------
# 3.1  Models.  Each takes a 1-D array of history and returns h future values.
# ---------------------------------------------------------------------------
def m_naive(y, h):
    return np.repeat(y[-1], h)


def m_avg5(y, h):
    return np.repeat(y[-5:].mean(), h)


def m_trend10(y, h):
    t = y[-10:]
    x = np.arange(len(t))
    slope, intercept = np.polyfit(x, t, 1)
    return intercept + slope * (len(t) + np.arange(h))


def m_holt(y, h, phi=0.9):
    """Damped Holt.  alpha/beta picked by grid search on in-sample one-step error."""
    best = None
    for a in (0.2, 0.35, 0.5, 0.65, 0.8):
        for b in (0.05, 0.15, 0.3):
            lvl, tr, sse = y[0], y[1] - y[0], 0.0
            for v in y[1:]:
                pred = lvl + phi * tr
                sse += (v - pred) ** 2
                new_lvl = a * v + (1 - a) * pred
                tr = b * (new_lvl - lvl) + (1 - b) * phi * tr
                lvl = new_lvl
            if best is None or sse < best[0]:
                best = (sse, lvl, tr)
    _, lvl, tr = best
    damp = np.cumsum(phi ** np.arange(1, h + 1))
    return lvl + damp * tr


def m_ensemble(y, h):
    return np.mean([m_naive(y, h), m_avg5(y, h), m_trend10(y, h), m_holt(y, h)], axis=0)


MODELS = {"naive": m_naive, "avg5": m_avg5, "trend10": m_trend10,
          "holt": m_holt, "ensemble": m_ensemble}
MODEL_LABELS = {"naive": "Last value", "avg5": "5-year average", "trend10": "10-year trend",
                "holt": "Damped trend (Holt)", "ensemble": "Ensemble average"}


# ---------------------------------------------------------------------------
# 3.2 - 3.4
# ---------------------------------------------------------------------------
def forecast_series(years: np.ndarray, y: np.ndarray, h: int):
    """Return (best model, MAE, MAPE, list of (year, forecast, lo, hi)) or None."""
    if len(y) < MIN_POINTS or y[-BACKTEST_YEARS:].sum() == 0:
        return None
    scores = {}
    for name, fn in MODELS.items():
        errs, apes = [], []
        for cut in range(len(y) - BACKTEST_YEARS, len(y)):
            pred = max(fn(y[:cut], 1)[0], 0)
            errs.append(y[cut] - pred)
            if y[cut] > 0:
                apes.append(abs(y[cut] - pred) / y[cut])
        errs = np.array(errs)
        scores[name] = (np.abs(errs).mean(), np.sqrt((errs ** 2).mean()),
                        np.mean(apes) if apes else np.nan)
    best = min(scores, key=lambda k: scores[k][0])
    mae, rmse, mape = scores[best]
    fc = np.maximum(MODELS[best](y, h), 0)
    out = []
    for i, v in enumerate(fc, start=1):
        spread = Z80 * rmse * np.sqrt(i)
        out.append((int(years[-1] + i), float(v), float(max(v - spread, 0)), float(v + spread)))
    return best, mae, mape, out


# ---------------------------------------------------------------------------
# 3.5  Seasonal-ratio nowcast for the NEXT unpublished quarter (stocks only)
#      e.g. Dec 1 estimate = Sep 1 actual x median(Dec/Sep ratio, prior 5 yrs)
# ---------------------------------------------------------------------------
PREV_QUARTER = {3: (12, -1), 6: (3, 0), 9: (6, 0), 12: (9, 0)}   # month -> (prev month, year shift)


def seasonal_ratio(target: pd.Series, prev: pd.Series):
    """target/prev: bushels indexed by year (prev already aligned to the target year).
    Returns (mae, mape, rmse, next_year, estimate) or None."""
    both = pd.concat([target, prev], axis=1, keys=["t", "p"]).dropna()
    both = both[both.p > 0]
    ratio = both.t / both.p
    if len(both) < MIN_POINTS:
        return None
    errs, apes = [], []
    for yr in both.index[-BACKTEST_YEARS:]:
        hist = ratio[ratio.index < yr].tail(5)
        pred = both.p[yr] * hist.median()
        errs.append(both.t[yr] - pred)
        if both.t[yr] > 0:
            apes.append(abs(both.t[yr] - pred) / both.t[yr])
    nxt = int(target.dropna().index.max()) + 1
    if nxt not in prev.dropna().index:
        return None
    est = prev[nxt] * ratio.tail(5).median()
    errs = np.array(errs)
    return (np.abs(errs).mean(), np.mean(apes) if apes else np.nan,
            np.sqrt((errs ** 2).mean()), nxt, est)


def main() -> int:
    print("[forecast]")
    h = config.FORECAST_HORIZON
    stocks = pd.read_csv(config.CLEAN_DIR / "wheat_stocks.csv")
    prod = pd.read_csv(config.CLEAN_DIR / "wheat_production.csv")
    rows, acc = [], []

    def run(kind, keys, d, value_col, decimals=-3, nowcast=None):   # -3 = nearest 1,000 (USDA precision)
        d = d.dropna(subset=[value_col]).sort_values("year")
        res = forecast_series(d.year.to_numpy(), d[value_col].to_numpy(float), h)
        if res is None:
            return
        best, mae, mape, pts = res
        label = MODEL_LABELS[best]
        # Swap in the seasonal-ratio estimate for step 1 when it back-tests better
        if nowcast is not None and nowcast[0] < mae and nowcast[3] == pts[0][0]:
            r_mae, r_mape, r_rmse, yr, est = nowcast
            spread = Z80 * r_rmse
            pts[0] = (yr, float(est), float(max(est - spread, 0)), float(est + spread))
            best, mae, mape = "ratio+" + best, r_mae, r_mape
            label = f"Seasonal ratio (next quarter), then {label}"
        acc.append({**keys, "dataset": kind, "model": best, "model_label": label,
                    "backtest_mae": round(mae, decimals),
                    "backtest_mape_pct": None if np.isnan(mape) else round(mape * 100, 1),
                    "last_actual_year": int(d.year.max())})
        for i, (yr, v, lo, hi) in enumerate(pts):
            rows.append({**keys, "dataset": kind, "year": yr, "forecast": round(v, decimals),
                         "lo80": round(lo, decimals), "hi80": round(hi, decimals),
                         "model": best.split("+")[-1] if i else best.split("+")[0]})

    s = stocks[(stocks.wheat_class == "All Wheat") & (stocks.state != "Other States")]
    by = s.set_index(["state", "position", "month", "year"]).bushels.sort_index()
    for (state, abbr, q, month, pos), d in s.groupby(
            ["state", "state_abbr", "quarter", "month", "position"]):
        pm, shift = PREV_QUARTER[month]
        try:
            prev = by.loc[(state, pos, pm)]
            prev.index = prev.index - shift          # align Dec(Y-1) to Mar(Y)
            nowcast = seasonal_ratio(d.set_index("year").bushels, prev)
        except KeyError:
            nowcast = None
        run("stocks", {"state": state, "state_abbr": abbr, "quarter": q, "month": month,
                       "position": pos, "measure": "stocks"}, d, "bushels", nowcast=nowcast)

    p = prod[prod.wheat_class == "All Wheat"]
    for (state, abbr, measure), d in p.groupby(["state", "state_abbr", "measure"]):
        run("production", {"state": state, "state_abbr": abbr, "quarter": None, "month": None,
                           "position": None, "measure": measure}, d, "value",
            decimals=1 if measure == "yield" else -3)

    fc = pd.DataFrame(rows)
    ac = pd.DataFrame(acc)
    fc.to_csv(config.CLEAN_DIR / "wheat_forecasts.csv", index=False, float_format="%.12g")
    ac.to_csv(config.CLEAN_DIR / "forecast_accuracy.csv", index=False, float_format="%.12g")
    print(f"   {len(ac):,} series forecast, {len(fc):,} forecast rows")
    print("   models chosen:", ac.model.value_counts().to_dict())
    us = ac[(ac.state == "United States")]
    print("   US back-test MAPE (median): "
          f"stocks {us[us.dataset == 'stocks'].backtest_mape_pct.median()}%, "
          f"production-type {us[us.dataset == 'production'].backtest_mape_pct.median()}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
