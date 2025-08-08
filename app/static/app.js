// ===== Formatting helpers =====
const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });
const n2  = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const pct2 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

// ===== Banner helpers =====
function showBanner(msg) {
  const b = document.getElementById('banner');
  b.innerHTML = `<div class="error">${msg}</div>`;
}
function showDetailBanner(msg) {
  document.getElementById('detailBanner').innerHTML = `<div class="error">${msg}</div>`;
}

// ===== Canvas utils & axes =====
function clearCanvas(cv) {
  const ctx = cv.getContext('2d');
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w; cv.height = h; ctx.clearRect(0,0,w,h);
}

function niceTicks(min, max, count = 5) {
  if (min === max) {
    const eps = Math.abs(min) || 1;
    min -= eps; max += eps;
  }
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / Math.max(1, count))));
  const err = (span / (count * step));
  const mult = err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1;
  const niceStep = step * mult;
  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + 1e-9; v += niceStep) ticks.push(v);
  return { ticks, min: niceMin, max: niceMax };
}

function drawAxes(ctx, box, xLabels, yMin, yMax, opts = {}) {
  const { left, right, top, bottom, w, h } = box;

  // axes
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, h - bottom);
  ctx.moveTo(left, h - bottom);
  ctx.lineTo(w - right, h - bottom);
  ctx.stroke();

  // y ticks/grid
  const { ticks, min, max } = niceTicks(yMin, yMax, opts.yTickCount || 5);
  ctx.fillStyle = '#666';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

  const yScale = (v) => {
    const t = (v - min) / Math.max(1e-9, (max - min));
    return (h - bottom) - t * (h - top - bottom);
  };

  ticks.forEach(t => {
    const y = yScale(t);
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(w - right, y);
    ctx.stroke();
    ctx.fillStyle = '#666';
    const label = opts.yFormatter ? opts.yFormatter(t) : n2.format(t);
    ctx.fillText(label, left - 6, y);
  });

  // x ticks
  const N = xLabels.length;
  if (N > 0) {
    const target = opts.xTickCount || 6;
    const step = Math.max(1, Math.floor(N / target));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = 0; i < N; i += step) {
      const x = left + (i / Math.max(1, N - 1)) * (w - left - right);
      ctx.strokeStyle = '#ccc';
      ctx.beginPath();
      ctx.moveTo(x, h - bottom);
      ctx.lineTo(x, h - bottom + 4);
      ctx.stroke();
      const lbl = xLabels[i];
      ctx.fillStyle = '#666';
      ctx.fillText(lbl, x, h - bottom + 6);
    }
    if ((N - 1) % step !== 0) {
      const x = left + ((N - 1) / Math.max(1, N - 1)) * (w - left - right);
      ctx.strokeStyle = '#ccc';
      ctx.beginPath();
      ctx.moveTo(x, h - bottom);
      ctx.lineTo(x, h - bottom + 4);
      ctx.stroke();
      ctx.fillStyle = '#666';
      ctx.fillText(xLabels[N - 1], x, h - bottom + 6);
    }
  }
  return { yScale, yMin: min, yMax: max };
}

function drawLineWithAxes(canvas, values, xLabels, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0,0,w,h);
  if (!values || !values.length) return;
  const left = 50, right = 10, top = 10, bottom = 28;
  const box = { left, right, top, bottom, w, h };

  const valid = values.filter(v => v != null);
  const vMin = Math.min(...valid);
  const vMax = Math.max(...valid);
  const { yScale } = drawAxes(ctx, box, xLabels, vMin, vMax, opts);

  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    const x = left + (i / Math.max(1, values.length - 1)) * (w - left - right);
    const y = yScale(values[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineWidth = opts.lineWidth || 2;
  ctx.strokeStyle = opts.lineColor || '#0a7';
  ctx.stroke();
}

function drawLineMultiWithAxes(canvas, seriesList, xLabels, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0,0,w,h);
  if (!seriesList || !seriesList.length) return;
  const left = 50, right = 10, top = 10, bottom = 28;
  const box = { left, right, top, bottom, w, h };

  const all = [];
  seriesList.forEach(s => s.values.forEach(v => v != null && all.push(v)));
  if (!all.length) return;
  const vMin = Math.min(...all), vMax = Math.max(...all);
  const { yScale } = drawAxes(ctx, box, xLabels, vMin, vMax, opts);

  seriesList.forEach((s, idx) => {
    ctx.beginPath();
    for (let i = 0; i < s.values.length; i++) {
      if (s.values[i] == null) continue;
      const x = left + (i / Math.max(1, s.values.length - 1)) * (w - left - right);
      const y = yScale(s.values[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = s.width || 2;
    ctx.strokeStyle = s.color || (idx === 0 ? '#0a7' : '#555');
    ctx.stroke();
  });
}

function drawScatterWithAxes(canvas, xs, ys, opts = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0,0,w,h);
  if (!xs.length || !ys.length) return;
  const left = 50, right = 10, top = 10, bottom = 28;
  const box = { left, right, top, bottom, w, h };

  let xmin = Math.min(...xs), xmax = Math.max(...xs);
  let ymin = Math.min(...ys), ymax = Math.max(...ys);
  if (opts.symmetricZero) {
    const xAbs = Math.max(Math.abs(xmin), Math.abs(xmax));
    xmin = -xAbs; xmax = xAbs;
    const yAbs = Math.max(Math.abs(ymin), Math.abs(ymax));
    ymin = -yAbs; ymax = yAbs;
  }

  // Draw axes (with placeholder xLabels)
  const { yScale } = drawAxes(
    ctx, box,
    Array.from({length: xs.length}, () => ''), // placeholders
    ymin, ymax,
    { yFormatter: opts.yFormatter, yTickCount: opts.yTickCount || 5, xTickCount: opts.xTickCount || 6 }
  );

  // x ticks using nice ticks
  const xTicks = niceTicks(xmin, xmax, opts.xTickCount || 6).ticks;
  ctx.fillStyle = '#666';
  ctx.strokeStyle = '#eee';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xScale = (v) => {
    const t = (v - xTicks[0]) / Math.max(1e-9, (xTicks[xTicks.length - 1] - xTicks[0]));
    return box.left + t * (w - box.left - box.right);
  };
  xTicks.forEach(t => {
    const x = xScale(t);
    ctx.beginPath();
    ctx.moveTo(x, h - box.bottom);
    ctx.lineTo(x, box.top);
    ctx.stroke();
    const label = opts.xFormatter ? opts.xFormatter(t) : n2.format(t);
    ctx.fillText(label, x, h - box.bottom + 6);
  });

  // points
  ctx.fillStyle = '#999';
  for (let i = 0; i < xs.length; i++) {
    const x = xScale(xs[i]);
    const y = yScale(ys[i]);
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  // regression line
  if (typeof opts.beta === 'number' && typeof opts.alpha === 'number') {
    const x1 = xTicks[0], x2 = xTicks[xTicks.length - 1];
    const y1 = opts.alpha + opts.beta * x1;
    const y2 = opts.alpha + opts.beta * x2;
    ctx.beginPath();
    ctx.moveTo(xScale(x1), yScale(y1));
    ctx.lineTo(xScale(x2), yScale(y2));
    ctx.lineWidth = 2; ctx.strokeStyle = '#0a7'; ctx.stroke();
  }
}

// ===== Utilities & transforms =====
function tsToDate(t) { return new Date(t); }
function last(arr) { return arr[arr.length-1]; }
function pct(a,b) { return (b - a) / a * 100; }

function monthlyFromDaily(rows) {
  const out = [];
  let curKey = null, lastClose = null;
  rows.forEach(r => {
    const d = tsToDate(r.t);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
    if (key !== curKey) {
      if (curKey !== null && lastClose != null) out.push({ month: curKey, c: lastClose });
      curKey = key; lastClose = r.c;
    } else {
      lastClose = r.c;
    }
  });
  if (curKey !== null && lastClose != null) out.push({ month: curKey, c: lastClose });
  return out;
}
function quarterlyFromDaily(rows) {
  const out = [];
  let curKey = null, lastClose = null;
  rows.forEach(r => {
    const d = tsToDate(r.t);
    const q = Math.floor(d.getUTCMonth()/3) + 1;
    const key = `${d.getUTCFullYear()}-Q${q}`;
    if (key !== curKey) {
      if (curKey !== null && lastClose != null) out.push({ quarter: curKey, c: lastClose });
      curKey = key; lastClose = r.c;
    } else {
      lastClose = r.c;
    }
  });
  if (curKey !== null && lastClose != null) out.push({ quarter: curKey, c: lastClose });
  return out;
}
function sma(values, window) {
  const out = []; let sum = 0;
  for (let i=0;i<values.length;i++) {
    const v = values[i];
    if (v == null) { out.push(null); continue; }
    sum += v;
    if (i >= window) {
      const old = values[i-window];
      if (old != null) sum -= old;
    }
    out.push(i >= window-1 ? sum / window : null);
  }
  return out;
}
function returnsPct(values) {
  const out = [];
  for (let i=1;i<values.length;i++) {
    const a = values[i-1], b = values[i];
    if (a != null && b != null && a !== 0) out.push((b - a) / a);
  }
  return out;
}
function covVar(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { cov: 0, varx: 0, mx: 0, my: 0 };
  const mx = x.reduce((a,b)=>a+b,0)/n;
  const my = y.reduce((a,b)=>a+b,0)/n;
  let cov = 0, varx = 0;
  for (let i=0;i<n;i++) {
    cov += (x[i]-mx)*(y[i]-my);
    varx += (x[i]-mx)*(x[i]-mx);
  }
  return { cov: cov/(n-1), varx: varx/(n-1), mx, my };
}
function rSquared(x, y, beta, alpha) {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  let ssTot = 0, ssRes = 0;
  const my = y.reduce((a,b)=>a+b,0)/n;
  for (let i=0;i<n;i++) {
    const pred = alpha + beta * x[i];
    ssRes += (y[i] - pred)*(y[i] - pred);
    ssTot += (y[i] - my)*(y[i] - my);
  }
  return ssTot === 0 ? 0 : 1 - ssRes/ssTot;
}

// ===== Search (no API calls per result) =====
async function search() {
  const q = document.getElementById('q').value.trim();
  const market = document.getElementById('market').value;
  if (!q) return;
  const resEl = document.getElementById('results');
  const banner = document.getElementById('banner');
  banner.innerHTML = '';
  resEl.innerHTML = 'Searching…';
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&market=${market}`);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (_e) {
      showBanner('Server returned a non-JSON error. Check the Flask console.');
      resEl.innerHTML = '';
      return;
    }
    if (!r.ok) {
      const body = data && (data.body || data.error || 'Unknown error');
      showBanner(`Search failed: ${body}`);
      resEl.innerHTML = '';
      return;
    }
    const items = (data.results || []).slice(0, 20);
    if (!items.length) { resEl.innerHTML = '<div class="muted">No matches.</div>'; return; }
    resEl.innerHTML = '';
    for (const it of items) {
      const card = document.createElement('div');
      card.className = 'card';
      card.setAttribute('tabindex', '0');
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div>
            <div><strong>${it.ticker}</strong> <span class="badge">${it.market}</span></div>
            <div class="muted">${it.name || ''}</div>
          </div>
          <div class="muted">Click to open</div>
        </div>
      `;
      card.addEventListener('click', () => openDetail(it.ticker, it.market, it.name || ''));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openDetail(it.ticker, it.market, it.name || ''); });
      resEl.appendChild(card);
    }
  } catch (e) {
    console.error(e);
    showBanner('Search encountered an error. See console for details.');
    resEl.innerHTML = '';
  }
}

// ===== Detail modal (fetch /api/detail + /api/analysis) =====
const modal = {
  root: document.getElementById('detailModal'),
  title: document.getElementById('detailTicker'),
  name: document.getElementById('detailName'),
  price: document.getElementById('detailPrice'),
  change: document.getElementById('detailChange'),
  chart: document.getElementById('detailChart'),
  closeBtn: document.getElementById('detailClose'),
  banner: document.getElementById('detailBanner'),
  loading: document.getElementById('detailLoading'),
  tabs: Array.from(document.querySelectorAll('.tab')),
  panels: {
    overview: document.getElementById('panel-overview'),
    trend: document.getElementById('panel-trend'),
    comparative: document.getElementById('panel-comparative'),
    ratios: document.getElementById('panel-ratios'),
    variance: document.getElementById('panel-variance'),
    regression: document.getElementById('panel-regression'),
    movingavg: document.getElementById('panel-movingavg'),
  },
  canvases: {
    overview: document.getElementById('detailChart'),
    trend: document.getElementById('trendChart'),
    comparative: document.getElementById('comparativeChart'),
    ratios: document.getElementById('ratiosChart'),
    variance: document.getElementById('varianceChart'),
    regression: document.getElementById('regressionChart'),
    movingavg: document.getElementById('maChart'),
  },
  texts: {
    trend: document.getElementById('trendText'),
    comparative: document.getElementById('comparativeText'),
    ratios: document.getElementById('ratiosText'),
    variance: document.getElementById('varianceText'),
    regression: document.getElementById('regressionText'),
    movingavg: document.getElementById('maText'),
  },
  current: { ticker: null, market: null, name: '' },
  data: { series1y: [], seriesLong: [], benchmark: [], benchmarkTicker: null },
};

modal.closeBtn.addEventListener('click', () => closeDetail());
modal.root.addEventListener('click', (e) => { if (e.target === modal.root) closeDetail(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDetail(); });

modal.tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    modal.tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    for (const [k, panel] of Object.entries(modal.panels)) {
      panel.classList.toggle('hidden', k !== target);
    }
    renderTab(target);
  });
});

function openDetail(ticker, market, name) {
  modal.current = { ticker, market, name };
  modal.title.textContent = ticker;
  modal.name.textContent = name || '';
  modal.price.textContent = '—';
  modal.change.textContent = '—';
  modal.change.classList.remove('pos','neg');
  modal.banner.innerHTML = '';
  modal.loading.style.display = 'block';

  // default tab
  modal.tabs.forEach(t => t.classList.remove('active'));
  modal.tabs[0].classList.add('active');
  for (const [k, panel] of Object.entries(modal.panels)) panel.classList.toggle('hidden', k !== 'overview');

  Object.values(modal.canvases).forEach(clearCanvas);

  modal.root.classList.add('open');
  modal.root.setAttribute('aria-hidden', 'false');
  loadDetailAndAnalysis(ticker, market);
}

function closeDetail() {
  modal.root.classList.remove('open');
  modal.root.setAttribute('aria-hidden', 'true');
}

async function loadDetailAndAnalysis(ticker, market) {
  try {
    // 1) quick detail (1Y + price)
    const d = await fetch(`/api/detail?ticker=${encodeURIComponent(ticker)}&market=${market}`);
    const detail = await d.json();
    if (detail.price != null) modal.price.textContent = fmt.format(detail.price);
    if (typeof detail.pct_change_1y === 'number') {
      const p = detail.pct_change_1y;
      modal.change.textContent = (p >= 0 ? '+' : '') + pct2.format(p) + '%';
      modal.change.classList.remove('pos','neg');
      modal.change.classList.add(p >= 0 ? 'pos' : 'neg');
    }
    modal.data.series1y = detail.history || [];
    const labels1y = modal.data.series1y.map(r => {
      const d = new Date(r.t);
      return `${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCFullYear()).slice(2)}`;
    });
    drawLineWithAxes(modal.canvases.overview, modal.data.series1y.map(r => r.c), labels1y, {
      yFormatter: (v) => fmt.format(v), xTickCount: 6, yTickCount: 5
    });
    modal.loading.style.display = 'none';

    // 2) analysis (2Y + benchmark with fallback)
    const a = await fetch(`/api/analysis?ticker=${encodeURIComponent(ticker)}&market=${market}&days=730`);
    const analysis = await a.json();
    modal.data.seriesLong = analysis.series || [];
    modal.data.benchmark = analysis.benchmark || [];
    modal.data.benchmarkTicker = analysis.benchmark_ticker || null;

    // Pre-render heavy tabs
    renderTab('trend');
    renderTab('comparative');
    renderTab('ratios');
    renderTab('variance');
    renderTab('regression');
    renderTab('movingavg');

    renderTab('overview');

  } catch (e) {
    console.error('loadDetailAndAnalysis error', e);
    showDetailBanner('Error loading details. Try again in a minute.');
    modal.loading.style.display = 'none';
  }
}

// ===== Tab renderers =====
function renderTab(tab) {
  const long = modal.data.seriesLong;
  if (!long || !long.length) return;

  if (tab === 'overview') {
    const labels = modal.data.series1y.map(r => {
      const d = new Date(r.t);
      return `${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCFullYear()).slice(2)}`;
    });
    drawLineWithAxes(modal.canvases.overview, modal.data.series1y.map(r => r.c), labels, {
      yFormatter: (v) => fmt.format(v), xTickCount: 6, yTickCount: 5
    });
  }

  if (tab === 'trend') {
    const months = monthlyFromDaily(long);
    const vals = months.map(m => m.c);
    const labels = months.map(m => m.month);
    drawLineWithAxes(modal.canvases.trend, vals, labels, {
      yFormatter: (v) => fmt.format(v), xTickCount: 8, yTickCount: 5
    });

    const bullets = [];
    for (let i = months.length - 1; i >= Math.max(1, months.length - 6); i--) {
      const ch = pct(months[i-1].c, months[i].c);
      bullets.push(`MoM ${months[i-1].month} → ${months[i].month}: ${ch>=0?'+':''}${pct2.format(ch)}%`);
    }
    if (months.length >= 13) {
      const chYoY = pct(months[months.length-13].c, months[months.length-1].c);
      bullets.push(`YoY change (latest month): ${chYoY>=0?'+':''}${pct2.format(chYoY)}%`);
    }
    document.getElementById('trendText').innerHTML = bullets.map(b => `<div>• ${b}</div>`).join('');
  }

  if (tab === 'comparative') {
    const months = monthlyFromDaily(long);
    const quarters = quarterlyFromDaily(long);
    let yoyText = 'Not enough data';
    if (months.length >= 13) {
      const chYoY = pct(months[months.length-13].c, months[months.length-1].c);
      yoyText = `${chYoY>=0?'+':''}${pct2.format(chYoY)}%`;
    }
    let qoqText = 'Not enough data';
    if (quarters.length >= 2) {
      const chQoQ = pct(quarters[quarters.length-2].c, quarters[quarters.length-1].c);
      qoqText = `${chQoQ>=0?'+':''}${pct2.format(chQoQ)}%`;
    }
    const last12 = months.slice(-12);
    drawLineWithAxes(modal.canvases.comparative, last12.map(m => m.c), last12.map(m => m.month), {
      yFormatter: (v) => fmt.format(v), xTickCount: 12, yTickCount: 5
    });
    document.getElementById('comparativeText').innerHTML = `
      <div>• YoY (latest month): <strong>${yoyText}</strong></div>
      <div>• QoQ (latest quarter): <strong>${qoqText}</strong></div>
    `;
  }

  if (tab === 'ratios') {
    const last365Rows = long.slice(-365);
    const values = last365Rows.map(r => r.c).filter(v => v != null);
    if (!values.length) return;
    const labels = last365Rows.map(r => {
      const d = new Date(r.t);
      return `${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}`;
    });

    drawLineWithAxes(modal.canvases.ratios, values, labels, {
      yFormatter: (v) => fmt.format(v), xTickCount: 6, yTickCount: 5
    });

    const cur = last(long).c;
    const high = Math.max(...values);
    const low = Math.min(...values);
    const rHi = cur / high;
    const rLo = cur / low;
    const closes = long.map(r => r.c);
    const ma50 = last(sma(closes, 50));
    const ma200 = last(sma(closes, 200));
    const rMA50 = ma50 ? cur / ma50 : null;
    const rMA200 = ma200 ? cur / ma200 : null;

    const bullets = [
      `52-week high: ${fmt.format(high)} (price / high = ${fmt.format(rHi)})`,
      `52-week low: ${fmt.format(low)} (price / low = ${fmt.format(rLo)})`,
      (ma50 ? `Price / MA50: ${fmt.format(rMA50)} (${cur >= ma50 ? 'above' : 'below'})` : 'MA50: not enough data'),
      (ma200 ? `Price / MA200: ${fmt.format(rMA200)} (${cur >= ma200 ? 'above' : 'below'})` : 'MA200: not enough data'),
    ];
    document.getElementById('ratiosText').innerHTML = bullets.map(b => `<div>• ${b}</div>`).join('');
  }

  if (tab === 'variance') {
    const months = monthlyFromDaily(long);
    if (months.length < 6) return;
    const mVals = months.map(m => m.c);
    const mRets = returnsPct(mVals);
    if (!mRets.length) return;

    const labels = months.slice(1).map(m => m.month);
    const retsPct = mRets.map(x => x * 100);
    drawLineWithAxes(modal.canvases.variance, retsPct, labels, {
      yFormatter: (v) => `${pct2.format(v)}%`, xTickCount: 8, yTickCount: 5
    });

    const mean = mRets.reduce((a,b)=>a+b,0) / mRets.length;
    const sd = Math.sqrt(mRets.reduce((s,x)=>s+(x-mean)*(x-mean),0) / Math.max(1,mRets.length-1));
    const latest = last(mRets);
    const z = sd ? (latest - mean)/sd : 0;
    document.getElementById('varianceText').innerHTML = `
      <div>• Avg monthly return: <strong>${pct2.format(mean*100)}%</strong></div>
      <div>• Monthly return stdev: <strong>${pct2.format(sd*100)}%</strong></div>
      <div>• Latest month return: <strong>${pct2.format(latest*100)}%</strong></div>
      <div>• Z-score of latest month: <strong>${pct2.format(z)}</strong> ${Math.abs(z) >= 2 ? '(unusual)' : ''}</div>
    `;
  }

  if (tab === 'regression') {
    const ySeries = returnsPct(long.map(r => r.c)); // asset daily returns (dec)
    const bmk = modal.data.benchmark;
    const bmkTicker = modal.data.benchmarkTicker;

    const textEl = document.getElementById('regressionText');
    if (!bmk || !bmk.length) {
      textEl.innerHTML = `• Benchmark unavailable (tried I:SPX and SPY).`;
      clearCanvas(modal.canvases.regression);
      return;
    }

    const xSeries = returnsPct(bmk.map(r => r.c));
    const n = Math.min(xSeries.length, ySeries.length);
    if (n < 30) {
      textEl.innerHTML = `• Not enough overlapping daily observations for regression (need ~30+, have ${n}).`;
      clearCanvas(modal.canvases.regression);
      return;
    }

    const X = xSeries.slice(-n), Y = ySeries.slice(-n);
    const { cov, varx, mx, my } = covVar(X, Y);
    const beta = varx ? cov / varx : 0;
    const alpha = my - beta * mx;
    const r2 = rSquared(X, Y, beta, alpha);

    // Convert to % for axes readability
    const Xp = X.map(v => v * 100);
    const Yp = Y.map(v => v * 100);
    drawScatterWithAxes(modal.canvases.regression, Xp, Yp, {
      symmetricZero: true,
      xFormatter: (v) => `${pct2.format(v)}%`,
      yFormatter: (v) => `${pct2.format(v)}%`,
      xTickCount: 6, yTickCount: 5,
      beta, alpha: alpha*100 // alpha in %/day now
    });

    textEl.innerHTML = `
      <div>• Benchmark used: <strong>${bmkTicker}</strong></div>
      <div>• Beta: <strong>${n2.format(beta)}</strong></div>
      <div>• Alpha (daily): <strong>${pct2.format(alpha*100)}%</strong></div>
      <div>• R²: <strong>${pct2.format(r2*100)}%</strong></div>
    `;
  }

  if (tab === 'movingavg') {
    const closes = long.map(r => r.c);
    const ma50 = sma(closes, 50);
    const ma200 = sma(closes, 200);
    const labels = long.map(r => {
      const d = new Date(r.t);
      return `${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCFullYear()).slice(2)}`;
    });
    drawLineMultiWithAxes(modal.canvases.movingavg, [
      { values: closes, width: 2, color: '#0a7' },
      { values: ma50.map(v => v ?? null), width: 1.5, color: '#999' },
      { values: ma200.map(v => v ?? null), width: 1.5, color: '#555' },
    ], labels, { yFormatter: (v) => fmt.format(v), xTickCount: 8, yTickCount: 5 });

    const cur = last(closes), m50 = last(ma50), m200 = last(ma200);
    const bullets = [
      (m50 ? `Price vs MA50: ${cur >= m50 ? 'above' : 'below'} (${pct2.format(((cur-m50)/m50)*100)}%)` : 'MA50: not enough data'),
      (m200 ? `Price vs MA200: ${cur >= m200 ? 'above' : 'below'} (${pct2.format(((cur-m200)/m200)*100)}%)` : 'MA200: not enough data'),
      `Golden/death cross (last 200d): look for MA50 crossing MA200`,
    ];
    document.getElementById('maText').innerHTML = bullets.map(b => `<div>• ${b}</div>`).join('');
  }
}

// ===== Events =====
document.getElementById('btnSearch').addEventListener('click', search);
document.getElementById('q').addEventListener('keydown', (e) => { if (e.key==='Enter') search(); });
