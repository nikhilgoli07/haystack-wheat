/* Haystack Data Solutions - US Wheat Dashboard
 * Plain JavaScript + SVG, no libraries. Reads data/wheat.json produced by
 * pipeline/publish.py. Every chart re-renders from `state` on any change.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------- config
  const MEASURES = [
    { id: "stocks|Total",    label: "Stocks: total",    kind: "stocks", pos: "Total",    unit: "bu" },
    { id: "stocks|On Farm",  label: "Stocks: on farm",  kind: "stocks", pos: "On Farm",  unit: "bu" },
    { id: "stocks|Off Farm", label: "Stocks: off farm", kind: "stocks", pos: "Off Farm", unit: "bu" },
    { id: "production",      label: "Production",       kind: "prod",   unit: "bu" },
    { id: "yield",           label: "Yield",            kind: "prod",   unit: "bu/ac" },
    { id: "area_planted",    label: "Planted acres",    kind: "prod",   unit: "ac" },
    { id: "area_harvested",  label: "Harvested acres",  kind: "prod",   unit: "ac" },
  ];
  const Q_LABEL = { 3: "Mar 1", 6: "Jun 1", 9: "Sep 1", 12: "Dec 1" };
  const MAX_STATES = 6;
  const DEFAULT_STATES = ["KS", "ND", "MT", "WA"];
  // Tile-grid map: [col, row]
  const TILES = {
    AK: [0, 0], ME: [11, 0], VT: [10, 1], NH: [11, 1],
    WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], WI: [7, 2], MI: [8, 2], NY: [9, 2], RI: [10, 2], MA: [11, 2],
    OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3],
    CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4],
    AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5],
    OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6],
    HI: [0, 7], TX: [4, 7], FL: [9, 7],
  };

  // ---------------------------------------------------------------- state
  let D = null;                       // the wheat.json payload
  const state = { measure: "stocks|Total", q: 9, from: 2000, to: 2026, fc: true, states: [], snap: null };
  const slotOf = {};                  // abbr -> colour slot (1..6); colour follows the state

  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function htmlEl(tag, cls, text, parent) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    if (parent) parent.appendChild(el);
    return el;
  }

  // ---------------------------------------------------------------- data access
  const M = () => MEASURES.find((m) => m.id === state.measure);
  const stateName = (abbr) => (D.states.find((s) => s.abbr === abbr) || { name: abbr }).name;

  function series(abbr) {
    const m = M();
    if (m.kind === "stocks") {
      const vals = (((D.stocks[abbr] || {})[m.pos] || {})[state.q]) || null;
      const wh = (((D.stocks_withheld[abbr] || {})[m.pos] || {})[state.q]) || null;
      const fc = D.forecasts[`${abbr}|stocks|${m.pos}|${state.q}`] || null;
      return { vals, wh, fc };
    }
    return { vals: (D.production[abbr] || {})[m.id] || null, wh: null, fc: D.forecasts[`${abbr}|${m.id}`] || null };
  }
  function lastActual(vals) {
    if (!vals) return null;
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return { i, year: D.years[i], v: vals[i] };
    return null;
  }
  const periodLabel = (year) => (M().kind === "stocks" ? `${Q_LABEL[state.q]}, ${year}` : `${year}`);

  // ---------------------------------------------------------------- formatting
  function fmt(v, opts = {}) {
    if (v == null || Number.isNaN(v)) return "n/a";
    const u = M().unit;
    if (u === "bu/ac") return `${v.toFixed(1)}${opts.bare ? "" : " bu/ac"}`;
    const suffix = opts.bare ? "" : ` ${u}`;
    if (opts.full) return Math.round(v).toLocaleString("en-US") + suffix;
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(2) + "B" + suffix;
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M" + suffix;
    if (a >= 1e3) return (v / 1e3).toFixed(0) + "K" + suffix;
    return Math.round(v) + suffix;
  }
  function axisFmt(v) {
    if (M().unit === "bu/ac") return String(Math.round(v));
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(a % 1e9 === 0 ? 0 : 1) + "B";
    if (a >= 1e6) return (v / 1e6).toFixed(0) + "M";
    if (a >= 1e3) return (v / 1e3).toFixed(0) + "K";
    return String(v);
  }
  function niceTicks(max, count = 5) {
    if (max <= 0) return [0, 1];
    const raw = max / count;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw);
    const out = [];
    for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
    if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
    return out;
  }

  // ---------------------------------------------------------------- tooltip
  const tip = $("tooltip");
  function showTip(evt, head, rows, foot) {
    tip.replaceChildren();
    htmlEl("div", "t-head", head, tip);
    rows.forEach((r) => {
      const row = htmlEl("div", "t-row", null, tip);
      const key = htmlEl("i", null, null, row);
      key.style.background = r.color || "transparent";
      htmlEl("b", null, r.value, row);
      htmlEl("span", null, r.label, row);
    });
    if (foot) htmlEl("div", "t-foot", foot, tip);
    tip.hidden = false;
    const pad = 14;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => { tip.hidden = true; };

  // ---------------------------------------------------------------- controls
  function initControls() {
    const ms = $("measure");
    MEASURES.forEach((m) => ms.add(new Option(m.label, m.id)));
    D.years.forEach((y) => { $("from").add(new Option(y, y)); $("to").add(new Option(y, y)); });

    ms.onchange = () => { state.measure = ms.value; state.snap = null; render(); };
    $("quarter").onchange = (e) => { state.q = +e.target.value; state.snap = null; render(); };
    $("from").onchange = (e) => { state.from = Math.min(+e.target.value, state.to - 1); render(); };
    $("to").onchange = (e) => { state.to = Math.max(+e.target.value, state.from + 1); render(); };
    $("show-fc").onchange = (e) => { state.fc = e.target.checked; render(); };
    $("snap-year").onchange = (e) => { state.snap = +e.target.value; renderMap(); renderRanking(); };
    $("add-state").onchange = (e) => { if (e.target.value) addState(e.target.value); };
    $("download").onclick = downloadCsv;

    let t;
    window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(renderCharts, 120); });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderCharts);
  }

  function addState(abbr) {
    if (state.states.includes(abbr) || state.states.length >= MAX_STATES) return render();
    const used = new Set(state.states.map((a) => slotOf[a]));
    slotOf[abbr] = [1, 2, 3, 4, 5, 6].find((s) => !used.has(s));
    state.states.push(abbr);
    render();
  }
  function removeState(abbr) {
    state.states = state.states.filter((a) => a !== abbr);
    delete slotOf[abbr];
    render();
  }
  const toggleState = (abbr) => (state.states.includes(abbr) ? removeState(abbr) : addState(abbr));
  const colorOf = (abbr) => `var(--s${slotOf[abbr]})`;

  function syncControls() {
    const m = M();
    $("measure").value = state.measure;
    $("quarter").value = state.q;
    $("quarter").disabled = m.kind !== "stocks";
    $("quarter-field").classList.toggle("is-disabled", m.kind !== "stocks");
    $("from").value = state.from;
    $("to").value = state.to;
    $("show-fc").checked = state.fc;

    // chips
    const chips = $("chips");
    chips.replaceChildren();
    state.states.forEach((abbr) => {
      const c = htmlEl("span", "chip", null, chips);
      htmlEl("i", "key", null, c).style.background = colorOf(abbr);
      htmlEl("span", null, stateName(abbr), c);
      const b = htmlEl("button", null, "×", c);
      b.type = "button";
      b.setAttribute("aria-label", `Remove ${stateName(abbr)}`);
      b.onclick = () => removeState(abbr);
    });

    // add-state dropdown: only states with data for this measure
    const add = $("add-state");
    add.replaceChildren(new Option(state.states.length >= MAX_STATES ? "Max 6 states" : "+ Add state", ""));
    D.states.forEach((s) => {
      if (state.states.includes(s.abbr)) return;
      const v = series(s.abbr).vals;
      if (v && v.some((x) => x != null)) add.add(new Option(s.name, s.abbr));
    });
    add.disabled = state.states.length >= MAX_STATES;
  }

  // ---------------------------------------------------------------- KPIs
  function renderKpis() {
    const box = $("kpis");
    box.replaceChildren();
    const abbr = state.states[0];
    const tile = (label, value, note, deltaCls) => {
      const k = htmlEl("div", "kpi", null, box);
      htmlEl("div", "label", label, k);
      const v = htmlEl("div", "value" + (deltaCls ? " delta " + deltaCls : ""), value, k);
      v.title = value;
      htmlEl("div", "note", note, k);
    };
    if (!abbr) { tile("No state selected", "n/a", "Add a state to see its numbers"); return; }

    const { vals, fc } = series(abbr);
    const last = lastActual(vals);
    const name = stateName(abbr);
    if (!last) { tile(name, "n/a", "No published data for this measure"); return; }

    tile(`${name}: latest`, fmt(last.v), periodLabel(last.year));

    const prev = vals[last.i - 1];
    if (prev != null && prev !== 0) {
      const pct = (last.v / prev - 1) * 100;
      tile("Change vs prior year", `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`,
        `${periodLabel(last.year - 1)}: ${fmt(prev)}`, pct >= 0 ? "up" : "down");
    } else tile("Change vs prior year", "n/a", "Prior year not published");

    const five = vals.slice(Math.max(0, last.i - 5), last.i).filter((x) => x != null);
    if (five.length >= 3) {
      const avg = five.reduce((a, b) => a + b, 0) / five.length;
      const pct = (last.v / avg - 1) * 100;
      tile("vs 5-year average", `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`,
        `5-yr avg: ${fmt(avg)}`, pct >= 0 ? "up" : "down");
    } else tile("vs 5-year average", "n/a", "Not enough history");

    if (fc && fc.points.length) {
      const [y, v, lo, hi] = fc.points[0];
      const err = fc.mape != null ? ` · typical error ±${fc.mape.toFixed(0)}%` : "";
      tile(`Forecast ${periodLabel(y)}`, fmt(v), `80% range ${fmt(lo, { bare: true })}–${fmt(hi)}${err}`);
    } else tile("Forecast", "n/a", "Too little history to forecast");
  }

  // ---------------------------------------------------------------- line chart
  function renderLine() {
    const host = $("line-chart");
    host.replaceChildren();
    const m = M();
    $("chart-title").textContent = `${m.label}${m.kind === "stocks" ? ` on ${Q_LABEL[state.q]}` : ""}`;
    $("chart-sub").textContent = `${state.from}–${state.to}` +
      (state.fc ? " with forecast (dashed)" : "") + ` · ${m.unit === "bu/ac" ? "bushels per acre" : m.unit === "bu" ? "bushels" : "acres"}`;

    const W = Math.max(host.clientWidth, 280);
    const H = W < 600 ? 260 : 340;
    const showLabels = state.states.length <= 4 && W >= 560;
    const mg = { l: 52, r: showLabels ? 120 : 14, t: 14, b: 28 };

    // Collect data
    const lines = state.states.map((abbr) => {
      const s = series(abbr);
      const last = lastActual(s.vals);
      const pts = [];
      D.years.forEach((y, i) => { if (y >= state.from && y <= state.to) pts.push([y, s.vals ? s.vals[i] : null, s.wh ? s.wh[i] : 0]); });
      let fpts = [];
      if (state.fc && s.fc && last && last.year <= state.to && last.year >= state.from)
        fpts = s.fc.points.filter((p) => p[0] > last.year);
      return { abbr, pts, last, fpts, fc: s.fc };
    });

    let xMax = state.to;
    lines.forEach((l) => l.fpts.forEach((p) => { xMax = Math.max(xMax, p[0]); }));
    const xMin = state.from;
    const bands = state.states.length <= 2;
    let yMax = 0;
    lines.forEach((l) => {
      l.pts.forEach((p) => { if (p[1] != null) yMax = Math.max(yMax, p[1]); });
      l.fpts.forEach((p) => { yMax = Math.max(yMax, bands ? p[3] : p[1]); });
    });
    const ticks = niceTicks(yMax || 1);
    const yTop = ticks[ticks.length - 1];

    const x = (yr) => mg.l + ((yr - xMin) / Math.max(1, xMax - xMin)) * (W - mg.l - mg.r);
    const y = (v) => mg.t + (1 - v / yTop) * (H - mg.t - mg.b);

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img",
      "aria-label": `${m.label} by year for ${state.states.map(stateName).join(", ")}` }, host);

    // forecast wash
    const lastYr = Math.max(...lines.map((l) => (l.fpts.length ? l.last.year : -Infinity)));
    if (isFinite(lastYr) && xMax > lastYr) {
      svgEl("rect", { x: x(lastYr), y: mg.t, width: x(xMax) - x(lastYr), height: H - mg.t - mg.b, fill: "var(--fc-wash)" }, svg);
      const t = svgEl("text", { x: x(xMax) - 4, y: mg.t + 12, "text-anchor": "end", "font-size": 11, fill: "var(--muted)" }, svg);
      t.textContent = "Forecast";
    }

    // grid + y axis
    ticks.forEach((tv) => {
      svgEl("line", { x1: mg.l, x2: W - mg.r, y1: y(tv), y2: y(tv), stroke: tv === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }, svg);
      const t = svgEl("text", { x: mg.l - 8, y: y(tv) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--muted)" }, svg);
      t.textContent = axisFmt(tv);
    });
    // x axis
    const span = xMax - xMin;
    const step = W < 480 ? (span > 16 ? 5 : 2) : span > 20 ? 5 : span > 10 ? 2 : 1;
    for (let yr = xMin; yr <= xMax; yr++) {
      if ((yr - xMin) % step !== 0 && yr !== xMax) continue;
      if (yr !== xMax && xMax - yr < step / 2) continue;
      const t = svgEl("text", { x: x(yr), y: H - 8, "text-anchor": "middle", "font-size": 11, fill: "var(--muted)" }, svg);
      t.textContent = yr;
    }

    // bands (<=2 states)
    if (bands) lines.forEach((l) => {
      if (!l.fpts.length) return;
      const top = [[l.last.year, l.last.v], ...l.fpts.map((p) => [p[0], p[3]])];
      const bot = [[l.last.year, l.last.v], ...l.fpts.map((p) => [p[0], p[2]])].reverse();
      const d = [...top, ...bot].map((p, i) => `${i ? "L" : "M"}${x(p[0])},${y(p[1])}`).join("") + "Z";
      svgEl("path", { d, fill: colorOf(l.abbr), "fill-opacity": 0.13, stroke: "none" }, svg);
    });

    // lines (break at gaps)
    lines.forEach((l) => {
      let d = "", pen = false;
      l.pts.forEach(([yr, v]) => {
        if (v == null) { pen = false; return; }
        d += `${pen ? "L" : "M"}${x(yr)},${y(v)}`;
        pen = true;
      });
      svgEl("path", { d, fill: "none", stroke: colorOf(l.abbr), "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      // isolated points (no neighbour) get a dot so they stay visible
      l.pts.forEach(([yr, v], i) => {
        if (v == null) return;
        const prev = l.pts[i - 1], next = l.pts[i + 1];
        if ((!prev || prev[1] == null) && (!next || next[1] == null))
          svgEl("circle", { cx: x(yr), cy: y(v), r: 3, fill: colorOf(l.abbr) }, svg);
      });
      if (l.fpts.length) {
        const fd = [[l.last.year, l.last.v], ...l.fpts].map((p, i) => `${i ? "L" : "M"}${x(p[0])},${y(p[1])}`).join("");
        svgEl("path", { d: fd, fill: "none", stroke: colorOf(l.abbr), "stroke-width": 2, "stroke-dasharray": "5 4", "stroke-linecap": "round" }, svg);
      }
    });

    // direct labels at line ends, nudged apart
    if (showLabels) {
      const labs = lines.map((l) => {
        const end = l.fpts.length ? l.fpts[l.fpts.length - 1] : l.pts.filter((p) => p[1] != null).pop();
        return end ? { abbr: l.abbr, yr: end[0], v: end[1], ty: y(end[1]) } : null;
      }).filter(Boolean).sort((a, b) => a.ty - b.ty);
      for (let i = 1; i < labs.length; i++) if (labs[i].ty - labs[i - 1].ty < 15) labs[i].ty = labs[i - 1].ty + 15;
      labs.forEach((lb) => {
        const t = svgEl("text", { x: x(lb.yr) + 8, y: lb.ty + 4, "font-size": 12, fill: "var(--ink-2)" }, svg);
        t.textContent = `${stateName(lb.abbr)} ${fmt(lb.v, { bare: true })}`;
      });
    }

    // legend (always for >= 2 series)
    const leg = $("legend");
    leg.replaceChildren();
    if (state.states.length >= 2 || state.fc) {
      state.states.forEach((abbr) => {
        const s = htmlEl("span", null, null, leg);
        htmlEl("i", null, null, s).style.background = colorOf(abbr);
        s.appendChild(document.createTextNode(stateName(abbr)));
      });
      if (state.fc) {
        const s = htmlEl("span", null, null, leg);
        htmlEl("i", "dash", null, s);
        s.appendChild(document.createTextNode("Forecast"));
        if (bands) {
          const b = htmlEl("span", null, null, leg);
          htmlEl("i", "band", null, b);
          b.appendChild(document.createTextNode("80% range"));
        }
      }
    }

    // crosshair + tooltip (pointer and keyboard)
    const cross = svgEl("g", { "pointer-events": "none", visibility: "hidden" }, svg);
    const vline = svgEl("line", { y1: mg.t, y2: H - mg.b, stroke: "var(--muted)", "stroke-width": 1 }, cross);
    const dots = lines.map((l) => svgEl("circle", { r: 4, fill: colorOf(l.abbr), stroke: "var(--surface)", "stroke-width": 2 }, cross));
    const hit = svgEl("rect", { x: mg.l, y: mg.t, width: W - mg.l - mg.r, height: H - mg.t - mg.b, fill: "transparent", tabindex: 0,
      "aria-label": "Chart values. Use left and right arrow keys to move between years." }, svg);
    let curYr = null;
    const showAt = (yr, evt) => {
      curYr = yr;
      cross.setAttribute("visibility", "visible");
      vline.setAttribute("x1", x(yr)); vline.setAttribute("x2", x(yr));
      const rows = [];
      let isFc = false;
      lines.forEach((l, i) => {
        let v = null, label = stateName(l.abbr);
        const p = l.pts.find((q) => q[0] === yr);
        if (p && p[1] != null) v = p[1];
        else {
          const f = l.fpts.find((q) => q[0] === yr);
          if (f) { v = f[1]; label += " (forecast)"; isFc = true; }
          else if (p && p[2]) label += " (withheld by USDA)";
        }
        if (v != null) { dots[i].setAttribute("cx", x(yr)); dots[i].setAttribute("cy", y(v)); dots[i].setAttribute("visibility", "visible"); }
        else dots[i].setAttribute("visibility", "hidden");
        rows.push({ value: v == null ? "n/a" : fmt(v), label, color: colorOf(l.abbr), sort: v == null ? -1 : v });
      });
      rows.sort((a, b) => b.sort - a.sort);
      const r = hit.getBoundingClientRect();
      const e = evt || { clientX: r.left + ((x(yr) - mg.l) / (W - mg.l - mg.r)) * r.width, clientY: r.top + 20 };
      showTip(e, periodLabel(yr), rows, isFc ? "Forecast values are estimates (see notes)" : null);
    };
    const yrAt = (evt) => {
      const r = svg.getBoundingClientRect();
      const px = ((evt.clientX - r.left) / r.width) * W;
      return Math.round(xMin + ((px - mg.l) / (W - mg.l - mg.r)) * (xMax - xMin));
    };
    hit.addEventListener("pointermove", (e) => showAt(Math.min(xMax, Math.max(xMin, yrAt(e))), e));
    hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
    hit.addEventListener("blur", () => { cross.setAttribute("visibility", "hidden"); hideTip(); });
    hit.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const n = (curYr ?? xMax) + (e.key === "ArrowRight" ? 1 : -1);
      showAt(Math.min(xMax, Math.max(xMin, n)));
    });
    if (!state.states.length) {
      const t = svgEl("text", { x: W / 2, y: H / 2, "text-anchor": "middle", fill: "var(--muted)", "font-size": 14 }, svg);
      t.textContent = "Add a state above to see its history";
    }
  }

  // ---------------------------------------------------------------- snapshot helpers
  function snapYears() {
    const out = [];
    D.years.forEach((yr, i) => {
      if (D.states.some((s) => s.abbr !== "US" && s.abbr in TILES && (series(s.abbr).vals || [])[i] != null)) out.push(yr);
    });
    return out;
  }
  function snapValues(yr) {
    const i = D.years.indexOf(yr);
    const rows = [];
    D.states.forEach((s) => {
      if (!(s.abbr in TILES)) return;
      const sr = series(s.abbr);
      rows.push({ abbr: s.abbr, name: s.name, v: sr.vals ? sr.vals[i] : null, wh: sr.wh ? sr.wh[i] : 0 });
    });
    return rows;
  }

  function luminance(color) {
    const m = color.match(/^#([0-9a-f]{6})$/i);
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  // ---------------------------------------------------------------- tile map
  function renderMap() {
    const host = $("map");
    host.replaceChildren();
    const yrs = snapYears();
    const sel = $("snap-year");
    sel.replaceChildren();
    yrs.slice().reverse().forEach((yr) => sel.add(new Option(yr, yr)));
    if (!yrs.includes(state.snap)) state.snap = yrs[yrs.length - 1];
    sel.value = state.snap;
    $("map-sub").textContent = `${M().label}, ${periodLabel(state.snap)}. Click a state to compare it.`;

    const rows = snapValues(state.snap);
    const max = Math.max(1, ...rows.map((r) => r.v || 0));
    // sqrt scale spreads the many small states across the ramp
    const bin = (v) => (v == null ? 0 : v <= 0 ? 1 : Math.min(7, 1 + Math.floor(Math.sqrt(v / max) * 7)));

    const W = Math.max(host.clientWidth, 280);
    const s = Math.min(W / 12, 54);
    const gap = 2;
    const svg = svgEl("svg", { viewBox: `0 0 ${12 * s} ${8 * s}`, role: "group", "aria-label": "Map of states" }, host);
    rows.forEach((r) => {
      const [c, rw] = TILES[r.abbr];
      const b = bin(r.v);
      const fill = css(`--q${b}`);
      const g = svgEl("g", { class: "tile" + (state.states.includes(r.abbr) ? " selected" : ""), tabindex: 0, role: "button",
        "aria-label": `${r.name}: ${r.v == null ? (r.wh ? "withheld" : "no data") : fmt(r.v)}` }, svg);
      svgEl("rect", { x: c * s + gap / 2, y: rw * s + gap / 2, width: s - gap, height: s - gap, rx: 4, fill }, g);
      const ink = b === 0 ? "var(--muted)" : luminance(fill) < 0.28 ? "#ffffff" : "#0b0b0b";
      const t1 = svgEl("text", { x: c * s + s / 2, y: rw * s + s / 2 - (s > 40 ? 2 : -4), "text-anchor": "middle", "font-size": Math.max(9, s * 0.24), "font-weight": 650, fill: ink }, g);
      t1.textContent = r.abbr;
      if (s > 40) {
        const t2 = svgEl("text", { x: c * s + s / 2, y: rw * s + s / 2 + 12, "text-anchor": "middle", "font-size": 9.5, fill: ink }, g);
        t2.textContent = r.v == null ? (r.wh ? "(D)" : "") : fmt(r.v, { bare: true });
      }
      const tipFor = (e) => showTip(e, r.name, [{ value: r.v == null ? (r.wh ? "Withheld (D)" : "No data") : fmt(r.v), label: periodLabel(state.snap) }],
        state.states.includes(r.abbr) ? "Click to remove from comparison" : "Click to add to comparison");
      g.addEventListener("pointermove", tipFor);
      g.addEventListener("pointerleave", hideTip);
      g.addEventListener("click", () => { hideTip(); toggleState(r.abbr); });
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleState(r.abbr); } });
    });

    const ramp = $("ramp");
    ramp.replaceChildren();
    htmlEl("span", null, "0", ramp);
    const bar = htmlEl("span", "bar", null, ramp);
    for (let i = 1; i <= 7; i++) htmlEl("span", null, null, bar).style.background = `var(--q${i})`;
    htmlEl("span", null, fmt(max), ramp);
    const nd = htmlEl("span", null, null, ramp);
    nd.style.marginLeft = "12px";
    const sw = htmlEl("span", null, null, nd);
    sw.style.cssText = "display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--q0);margin-right:4px;vertical-align:-1px";
    nd.appendChild(document.createTextNode("No data / withheld"));
  }

  // ---------------------------------------------------------------- ranking bars
  function renderRanking() {
    const host = $("ranking");
    host.replaceChildren();
    const rows = snapValues(state.snap).filter((r) => r.v != null && r.v > 0).sort((a, b) => b.v - a.v).slice(0, 12);
    $("rank-sub").textContent = `Top ${rows.length} states, ${periodLabel(state.snap)}. Selected states in colour.`;
    const W = Math.max(host.clientWidth, 280);
    const rowH = 26, labW = Math.min(118, W * 0.32), valW = 64;
    const H = rows.length * rowH + 4;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Top states ranking" }, host);
    const max = rows.length ? rows[0].v : 1;
    rows.forEach((r, i) => {
      const y0 = i * rowH + 3;
      const bw = Math.max(2, ((W - labW - valW) * r.v) / max);
      const g = svgEl("g", { tabindex: 0, "aria-label": `${r.name}: ${fmt(r.v)}` }, svg);
      const lt = svgEl("text", { x: labW - 8, y: y0 + 14, "text-anchor": "end", "font-size": 12, fill: "var(--ink-2)" }, g);
      lt.textContent = r.name;
      const sel = state.states.includes(r.abbr);
      const h = rowH - 10, rr = Math.min(4, bw / 2);
      // flat at the baseline, 4px rounded at the data end
      const d = `M${labW},${y0}H${labW + bw - rr}Q${labW + bw},${y0} ${labW + bw},${y0 + rr}V${y0 + h - rr}Q${labW + bw},${y0 + h} ${labW + bw - rr},${y0 + h}H${labW}Z`;
      svgEl("path", { d, fill: sel ? colorOf(r.abbr) : "var(--axis)" }, g);
      const vt = svgEl("text", { x: labW + bw + 6, y: y0 + 13, "font-size": 12, fill: "var(--ink)" }, g);
      vt.textContent = fmt(r.v, { bare: true });
      svgEl("rect", { x: 0, y: y0 - 3, width: W, height: rowH, fill: "transparent" }, g)
        .addEventListener("pointermove", (e) => showTip(e, r.name, [{ value: fmt(r.v), label: `#${i + 1} · ${periodLabel(state.snap)}` }], "Click to toggle comparison"));
      g.addEventListener("pointerleave", hideTip);
      g.addEventListener("click", () => { hideTip(); toggleState(r.abbr); });
      g.style.cursor = "pointer";
    });
  }

  // ---------------------------------------------------------------- table + CSV
  function tableRows() {
    const header = ["Period", ...state.states.map(stateName)];
    const rows = [];
    D.years.forEach((yr, i) => {
      if (yr < state.from || yr > state.to) return;
      rows.push({ fc: false, cells: [periodLabel(yr), ...state.states.map((a) => {
        const s = series(a);
        const v = s.vals ? s.vals[i] : null;
        return v != null ? v : s.wh && s.wh[i] ? "(D)" : null;
      })] });
    });
    if (state.fc) {
      const fyrs = new Set();
      state.states.forEach((a) => { const f = series(a).fc; const l = lastActual(series(a).vals); if (f && l) f.points.forEach((p) => { if (p[0] > l.year) fyrs.add(p[0]); }); });
      [...fyrs].sort().forEach((yr) => {
        rows.push({ fc: true, cells: [`${periodLabel(yr)} (forecast)`, ...state.states.map((a) => {
          const s = series(a), l = lastActual(s.vals);
          const p = s.fc && l && yr > l.year ? s.fc.points.find((q) => q[0] === yr) : null;
          return p ? p[1] : null;
        })] });
      });
    }
    return { header, rows };
  }
  function renderTable() {
    const { header, rows } = tableRows();
    const t = $("table");
    t.replaceChildren();
    const tr = htmlEl("tr", null, null, htmlEl("thead", null, null, t));
    header.forEach((h) => htmlEl("th", null, h, tr));
    const tb = htmlEl("tbody", null, null, t);
    rows.slice().reverse().forEach((r) => {
      const row = htmlEl("tr", r.fc ? "fc" : null, null, tb);
      r.cells.forEach((c, j) => {
        const isNum = typeof c === "number";
        htmlEl("td", j && !isNum ? "na" : null, j ? (isNum ? fmt(c, { full: true, bare: true }) : c || "n/a") : c, row);
      });
    });
  }
  function downloadCsv() {
    const { header, rows } = tableRows();
    const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = [header.map(esc).join(",")].concat(rows.map((r) => r.cells.map(esc).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `wheat_${state.measure.replace(/\W+/g, "_").toLowerCase()}${M().kind === "stocks" ? "_" + Q_LABEL[state.q].replace(" ", "") : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------------------------------------------------------------- URL hash (shareable views)
  function writeHash() {
    const p = new URLSearchParams({ m: state.measure, q: state.q, s: state.states.join(","), from: state.from, to: state.to, fc: state.fc ? 1 : 0 });
    history.replaceState(null, "", "#" + p.toString());
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (MEASURES.some((m) => m.id === p.get("m"))) state.measure = p.get("m");
    if (Q_LABEL[p.get("q")]) state.q = +p.get("q");
    const f = +p.get("from"), t = +p.get("to");
    if (D.years.includes(f)) state.from = f;
    if (D.years.includes(t)) state.to = t;
    if (p.get("fc") === "0") state.fc = false;
    const list = (p.get("s") || "").split(",").filter((a) => D.states.some((s) => s.abbr === a));
    return list.length ? list.slice(0, MAX_STATES) : null;
  }

  // ---------------------------------------------------------------- render
  function renderCharts() { renderLine(); renderMap(); renderRanking(); }
  function render() {
    syncControls();
    renderKpis();
    renderCharts();
    renderTable();
    writeHash();
  }

  // ---------------------------------------------------------------- boot
  const params = new URLSearchParams(location.search);
  if (params.get("embed") === "1") document.body.classList.add("embed");
  if (["light", "dark"].includes(params.get("theme"))) document.documentElement.dataset.theme = params.get("theme");

  fetch("data/wheat.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((data) => {
      D = data;
      const latest = D.meta.latest_stocks_date;           // e.g. 2026-09-01
      state.q = +latest.slice(5, 7);
      state.to = D.years[D.years.length - 1];
      state.from = D.years[0];
      const applyStates = (list) => {
        state.states = [];
        Object.keys(slotOf).forEach((k) => delete slotOf[k]);
        list.forEach((a) => {
          const used = new Set(state.states.map((x) => slotOf[x]));
          slotOf[a] = [1, 2, 3, 4, 5, 6].find((s) => !used.has(s));
          state.states.push(a);
        });
      };
      applyStates(readHash() || DEFAULT_STATES);
      $("updated").textContent = `Latest Grain Stocks: ${Q_LABEL[+latest.slice(5, 7)]}, ${latest.slice(0, 4)} · production through ${D.meta.latest_production_year} · refreshed ${D.meta.generated}`;
      initControls();
      render();
      // a pasted/shared link (#m=...&s=...) re-applies without a reload
      window.addEventListener("hashchange", () => { const l = readHash(); if (l) applyStates(l); state.snap = null; render(); });
    })
    .catch((err) => {
      $("updated").textContent = "Could not load data/wheat.json. If you opened index.html straight from disk, serve the folder over http instead (see docs/04_HOSTING.md). " + err;
    });
})();
