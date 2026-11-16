# Data quality report

## Coverage
- Stocks: 2000-03-01 to 2026-09-01 (107 quarterly releases, 44 states/areas)
- Production: 2000 to 2026 (43 states/areas)
- Quarters not (yet) published: 2026-12

## Suppressed / missing values
NASS withholds a value as (D) when publishing it could reveal an individual farm or elevator. These are kept as blanks (not zeros) so averages are not biased.

- Stocks: reported = 9,621, withheld = 3,849, not_available = 26
- Production: reported = 10,809

## Check: On Farm + Off Farm = Total
- 2,432 complete rows checked (excluding 'Other States'), 0 differ by more than 1,000 bu

## Check: sum of states (+ 'Other States') vs. US total
Withheld (D) states are rolled into the 'Other States' row, so the rows should add up to the US total.
- 107 quarters checked, largest gap 0.00% of US total

## Check: Production = Yield x Harvested acres
- 1,118 state-years checked, 0 off by more than 3% (small gaps are normal: yield is rounded to 0.1 bu)

## Check: duplicate keys
- stocks: 0, production: 0

**Result: PASS**
