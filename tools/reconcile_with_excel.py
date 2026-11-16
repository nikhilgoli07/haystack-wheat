"""
One-off check: compare the automated NASS data with the old hand-entered
"Grain Stocks .xlsx" workbook (sheet "Wheat Stocks", 2000-2020).

Usage:
  python tools/reconcile_with_excel.py "path/to/Grain Stocks .xlsx"

Writes data/clean/reconciliation_vs_excel.csv and prints a summary.
"""
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent

xlsx = sys.argv[1]
old = pd.read_excel(xlsx, sheet_name="Wheat Stocks", header=2)
old = old.rename(columns={"MOn-farmth": "month", "Year": "year", "State": "state",
                          "Stocks (Bu)": "excel_bushels"})
old["position"] = old["On/Off"].map({"On": "On Farm", "Off": "Off Farm"})
old = old[["year", "month", "state", "position", "excel_bushels"]]

new = pd.read_csv(ROOT / "data" / "clean" / "wheat_stocks.csv")
new = new[(new.wheat_class == "All Wheat") & new.position.isin(["On Farm", "Off Farm"])]
new = new[["year", "month", "state", "position", "bushels", "status"]]

m = old.merge(new, on=["year", "month", "state", "position"], how="left")
m["bushels_filled"] = m.bushels.fillna(0)          # the workbook typed (D) as 0
m["diff"] = m.excel_bushels - m.bushels_filled
m["match"] = m["diff"].abs() <= 1000

print(f"rows compared        : {len(m):,}")
print(f"exact/rounding match : {m.match.sum():,}  ({m.match.mean():.1%})")
print(f"Excel 0 where NASS shows (D) withheld      : "
      f"{(m.status.eq('withheld') & m.excel_bushels.eq(0)).sum():,}")
print(f"Excel rows with no NASS row (state not published that quarter, "
      f"'Unallocated', 'New England'): {m.status.isna().sum():,}")
mism = m[~m.match & m.status.eq("reported")]
print(f"real mismatches where NASS has a number   : {len(mism):,}")
if len(mism):
    print("\nmismatches by quarter (Dec-2008 = workbook data-entry error; "
          "2019-2020 = USDA revisions after first release):")
    print(mism.groupby(["year", "month"]).size().sort_values(ascending=False)
              .head(8).to_string())
m.to_csv(ROOT / "data" / "clean" / "reconciliation_vs_excel.csv", index=False)
