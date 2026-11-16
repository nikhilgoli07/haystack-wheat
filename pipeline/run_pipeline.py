"""
Run every step in order:  fetch -> clean -> forecast -> publish

  python pipeline/run_pipeline.py              # full refresh from USDA
  python pipeline/run_pipeline.py --offline    # skip download, rebuild from data/raw

Exits non-zero if any step fails, so schedulers / GitHub Actions can alert you.
"""
import sys
import time

import clean
import fetch
import forecast
import publish

steps = [("fetch", fetch.main), ("clean", clean.main),
         ("forecast", forecast.main), ("publish", publish.main)]
if "--offline" in sys.argv:
    steps = steps[1:]

t0 = time.time()
for name, fn in steps:
    rc = fn()
    if rc:
        print(f"\nFAILED at step '{name}' (exit {rc}). Nothing after it was updated.")
        sys.exit(rc)
print(f"\nDone in {time.time() - t0:.0f}s. Website data: site/data/wheat.json")
