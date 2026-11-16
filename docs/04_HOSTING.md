# 04 — Putting the dashboard on the Haystack Data Solutions website

The dashboard is a **static folder** (`site/`): one HTML page, one CSS file, one JS file and one JSON data file. It needs no database, no server code and no external libraries, so it runs on **any** web host.

> ⚠️ It must be served over `http(s)://`. Double-clicking `site/index.html` opens it as `file://`, and the browser blocks loading the data. To look at it on your own computer, double-click **`preview_site.bat`** instead.

## Option A (recommended): GitHub Pages + embed. Free and fully automatic.
After setup, USDA releases flow to the website with **no manual steps**.

1. Create a GitHub repository (e.g. `haystack-wheat`) and upload this whole project folder. The `.gitignore` already keeps `.env` (your key) out.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → New repository secret**: name `NASS_API_KEY`, value = your Quick Stats key.
4. **Actions → Update wheat data → Run workflow** once. After about 2 minutes the site is live at
   `https://<your-github-name>.github.io/haystack-wheat/`
5. From then on, `.github/workflows/update-wheat-data.yml` runs automatically:
   - daily during USDA release windows (Mar 28–Apr 2, Jun 28–Jul 2, Sep 28–Oct 2, Jan 9–16)
   - every Monday otherwise, to pick up revisions
   - it only commits when USDA's numbers actually changed, and it redeploys the site.
6. **Embed it on the Haystack site.** Every site builder has an "Embed / HTML / iframe" block. Paste:
   ```html
   <iframe src="https://<your-github-name>.github.io/haystack-wheat/?embed=1"
           title="US Wheat Dashboard" loading="lazy"
           style="width:100%; height:2600px; border:0;"></iframe>
   ```
   `?embed=1` hides the logo mark and footer so it blends into your page. Add `&theme=light` or `&theme=dark` to force a theme.

   | Platform | Where to paste |
   |---|---|
   | WordPress | Block editor → **Custom HTML** block |
   | Wix | Add → Embed Code → **Embed HTML** (set the height in the editor) |
   | Squarespace | Add block → **Code** |
   | Webflow | Add → **Embed** element |
   | Shopify | Online Store → Pages → **Show HTML** (`<>`) |

   You can also use a custom domain (e.g. `wheat.haystackdatasolutions.com`): GitHub **Settings → Pages → Custom domain**, plus a CNAME record at your DNS provider.

## Option B: Upload to your existing web host
If the website is on regular hosting (cPanel, FTP, an IT-managed server):
1. Run `run_pipeline.bat`.
2. Upload the **contents** of `site/` to a folder such as `/public_html/wheat/`.
3. The dashboard is at `https://<your-domain>/wheat/`. Link to it, or embed it with the iframe above.
4. To automate, schedule `run_pipeline.bat` (see `05_QUARTERLY_UPDATE.md`) and add an upload step, or switch to Option A.

## Option C: The website is custom code (React / Next.js / etc.)
Copy `site/` into the app's static folder (`public/wheat/`) and link to `/wheat/index.html`, or have the app's own charts read `site/data/wheat.json` directly. Its structure:

```json
{
  "meta":   { "generated": "...", "latest_stocks_date": "2026-09-01", ... },
  "years":  [2000, 2001, ..., 2026],
  "states": [{ "abbr": "KS", "name": "Kansas" }, ...],
  "stocks": { "KS": { "Total": { "9": [v2000, v2001, ...] }, "On Farm": {...}, "Off Farm": {...} } },
  "stocks_withheld": { "KS": { "On Farm": { "3": [0,1,0,...] } } },
  "production": { "KS": { "production": [...], "yield": [...], "area_planted": [...], "area_harvested": [...] } },
  "forecasts": { "KS|stocks|Total|12": { "model": "...", "mape": 4.1, "points": [[2026, value, lo80, hi80], ...] },
                 "KS|yield": { ... } }
}
```
(`null` = not published or withheld.)

## Shareable links
The page address updates as you change filters, e.g.
`…/#m=yield&s=KS,ND,US&from=2010&to=2026&fc=1`. Copy and send it, and the recipient sees the same view.
