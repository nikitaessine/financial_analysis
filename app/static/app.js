// ===== Formatting helpers =====
const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });
const n2  = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const pct2 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

// ===== Banner helpers =====
function showBanner(msg) { document.getElementById('banner').innerHTML = `<div class="error">${msg}</div>`; }
function showDetailBanner(msg) { document.getElementById('detailBanner').innerHTML = `<div class="error">${msg}</div>`; }

// ===== Canvas utils, axes, tooltips/zoom =====
function clearCanvas(cv){const c=cv.getContext('2d');const w=cv.clientWidth,h=cv.clientHeight;cv.width=w;cv.height=h;c.clearRect(0,0,w,h);}
function niceTicks(min,max,count=5){if(min===max){const e=Math.abs(min)||1;min-=e;max+=e}const span=max-min;const step=Math.pow(10,Math.floor(Math.log10(span/Math.max(1,count))));const err=(span/(count*step));const mult=err>=7.5?10:err>=3?5:err>=1.5?2:1;const niceStep=step*mult;const niceMin=Math.floor(min/niceStep)*niceStep;const niceMax=Math.ceil(max/niceStep)*niceStep;const ticks=[];for(let v=niceMin;v<=niceMax+1e-9;v+=niceStep)ticks.push(v);return{ticks,min:niceMin,max:niceMax};}

function drawAxes(ctx,box,xLabels,yMin,yMax,opts={}){
  const {left,right,top,bottom,w,h}=box;
  ctx.strokeStyle='#ccc';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,top);ctx.lineTo(left,h-bottom);ctx.moveTo(left,h-bottom);ctx.lineTo(w-right,h-bottom);ctx.stroke();
  const {ticks,min,max}=niceTicks(yMin,yMax,opts.yTickCount||5);
  ctx.fillStyle='#666';ctx.textAlign='right';ctx.textBaseline='middle';ctx.font='12px system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  const yScale=v=>{const t=(v-min)/Math.max(1e-9,(max-min));return(h-bottom)-t*(h-top-bottom);};
  ticks.forEach(t=>{const y=yScale(t);ctx.strokeStyle='#eee';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.fillStyle='#666';const label=opts.yFormatter?opts.yFormatter(t):n2.format(t);ctx.fillText(label,left-6,y);});
  const N=xLabels.length;if(N>0){const target=opts.xTickCount||6;const step=Math.max(1,Math.floor(N/target));ctx.textAlign='center';ctx.textBaseline='top';
    for(let i=0;i<N;i+=step){const x=left+(i/Math.max(1,N-1))*(w-left-right);ctx.strokeStyle='#ccc';ctx.beginPath();ctx.moveTo(x,h-bottom);ctx.lineTo(x,h-bottom+4);ctx.stroke();ctx.fillStyle='#666';ctx.fillText(xLabels[i],x,h-bottom+6);}
    if((N-1)%step!==0){const x=left+((N-1)/Math.max(1,N-1))*(w-left-right);ctx.strokeStyle='#ccc';ctx.beginPath();ctx.moveTo(x,h-bottom);ctx.lineTo(x,h-bottom+4);ctx.stroke();ctx.fillStyle='#666';ctx.fillText(xLabels[N-1],x,h-bottom+6);}
  }
  return { yScale, yMin:min, yMax:max };
}

function drawLineWithAxes(canvas, values, xLabels, opts={}){
  const ctx=canvas.getContext('2d');const w=canvas.clientWidth,h=canvas.clientHeight;canvas.width=w;canvas.height=h;ctx.clearRect(0,0,w,h);
  if(!values||!values.length)return;const left=50,right=10,top=10,bottom=28;const box={left,right,top,bottom,w,h};
  const valid=values.filter(v=>v!=null);const vMin=Math.min(...valid),vMax=Math.max(...valid);const {yScale}=drawAxes(ctx,box,xLabels,vMin,vMax,opts);
  ctx.beginPath();for(let i=0;i<values.length;i++){if(values[i]==null)continue;const x=left+(i/Math.max(1,values.length-1))*(w-left-right);const y=yScale(values[i]);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.lineWidth=opts.lineWidth||2;ctx.strokeStyle=opts.lineColor||'#0a7';ctx.stroke();
}

function drawLineMultiWithAxes(canvas, seriesList, xLabels, opts={}){
  const ctx=canvas.getContext('2d');const w=canvas.clientWidth,h=canvas.clientHeight;canvas.width=w;canvas.height=h;ctx.clearRect(0,0,w,h);
  if(!seriesList||!seriesList.length)return;const left=50,right=10,top=10,bottom=28;const box={left,right,top,bottom,w,h};
  const all=[];seriesList.forEach(s=>s.values.forEach(v=>v!=null&&all.push(v)));if(!all.length)return;const vMin=Math.min(...all),vMax=Math.max(...all);const {yScale}=drawAxes(ctx,box,xLabels,vMin,vMax,opts);
  seriesList.forEach((s,idx)=>{ctx.beginPath();for(let i=0;i<s.values.length;i++){if(s.values[i]==null)continue;const x=left+(i/Math.max(1,s.values.length-1))*(w-left-right);const y=yScale(s.values[i]);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.lineWidth=s.width||2;ctx.strokeStyle=s.color||(idx===0?'#0a7':'#555');ctx.stroke();});
}

// --- interaction state ---
const charts = new Map(); // canvasId -> {labels, values|seriesList, mode, opts, zoom:{a,b}}
function attachLineInteractions(canvas, values, labels, opts={}, tooltipEl){
  charts.set(canvas.id,{mode:'line',values,labels,opts,zoom:{a:0,b:values.length-1}});
  canvas.onwheel=(e)=>{e.preventDefault();const st=charts.get(canvas.id);const {a,b}=st.zoom;const span=b-a;const delta=Math.sign(e.deltaY);const factor=delta>0?1.15:0.87;let newSpan=Math.max(10, Math.round(span*factor));const mx=Math.round(a+(b-a)*( (e.offsetX/canvas.clientWidth) ));let na=Math.max(0, mx-Math.round((mx-a)/span*newSpan));let nb=Math.min(values.length-1, na+newSpan);if(nb-na<10) nb=Math.min(values.length-1, na+10); st.zoom={a:na,b:nb}; redraw(canvas.id, tooltipEl);};
  canvas.ondblclick=()=>{const st=charts.get(canvas.id);st.zoom={a:0,b:values.length-1};redraw(canvas.id, tooltipEl);};
  canvas.onmousemove=(e)=>{const st=charts.get(canvas.id);const {a,b}=st.zoom;const idx=a+Math.round((e.offsetX/canvas.clientWidth)*(b-a)); if(idx< a|| idx> b) {tooltipEl.style.display='none'; return;} const val=values[idx]; const lbl=labels[idx]; if(val==null){tooltipEl.style.display='none';return;} tooltipEl.style.display='block'; tooltipEl.style.left=`${e.offsetX}px`; tooltipEl.style.top=`${e.offsetY}px`; tooltipEl.textContent=`${lbl} • ${fmt.format(val)}`;};
  canvas.onmouseleave=()=>{tooltipEl.style.display='none';};
  redraw(canvas.id, tooltipEl);
}
function attachLineMultiInteractions(canvas, seriesList, labels, opts={}, tooltipEl){
  charts.set(canvas.id,{mode:'multi',seriesList,labels,opts,zoom:{a:0,b:labels.length-1}});
  canvas.onwheel=(e)=>{e.preventDefault();const st=charts.get(canvas.id);const {a,b}=st.zoom;const span=b-a;const delta=Math.sign(e.deltaY);const factor=delta>0?1.15:0.87;let newSpan=Math.max(10, Math.round(span*factor));const mx=Math.round(a+(b-a)*((e.offsetX/canvas.clientWidth)));let na=Math.max(0, mx-Math.round((mx-a)/span*newSpan));let nb=Math.min(labels.length-1, na+newSpan);if(nb-na<10) nb=Math.min(labels.length-1, na+10); st.zoom={a:na,b:nb}; redraw(canvas.id, tooltipEl);};
  canvas.ondblclick=()=>{const st=charts.get(canvas.id);st.zoom={a:0,b:labels.length-1};redraw(canvas.id, tooltipEl);};
  canvas.onmousemove=(e)=>{const st=charts.get(canvas.id);const {a,b}=st.zoom;const idx=a+Math.round((e.offsetX/canvas.clientWidth)*(b-a)); if(idx< a|| idx> b) {tooltipEl.style.display='none'; return;} const vals=st.seriesList.map(s=>s.values[idx]).filter(v=>v!=null); const lbl=labels[idx]; if(!vals.length){tooltipEl.style.display='none';return;} tooltipEl.style.display='block'; tooltipEl.style.left=`${e.offsetX}px`; tooltipEl.style.top=`${e.offsetY}px`; tooltipEl.textContent=`${lbl} • ${vals.map(v=>fmt.format(v)).join(' / ')}`;};
  canvas.onmouseleave=()=>{tooltipEl.style.display='none';};
  redraw(canvas.id, tooltipEl);
}
function redraw(canvasId, tooltipEl){
  const st=charts.get(canvasId); if(!st) return;
  const cv=document.getElementById(canvasId); const a=st.zoom.a, b=st.zoom.b;
  const labels=st.labels.slice(a,b+1);
  if(st.mode==='line'){
    const vals=st.values.slice(a,b+1);
    drawLineWithAxes(cv, vals, labels, st.opts);
  } else if (st.mode==='multi'){
    const series = st.seriesList.map(s=>({ ...s, values: s.values.slice(a,b+1) }));
    drawLineMultiWithAxes(cv, series, labels, st.opts);
  }
  if(tooltipEl) tooltipEl.style.display='none';
}

// ===== Utilities & transforms =====
function tsToDate(t){ return new Date(t); }
function last(arr){ return arr[arr.length-1]; }
function pct(a,b){ return (b-a)/a*100; }
function monthlyFromDaily(rows){const out=[];let cur=null,lastClose=null;rows.forEach(r=>{const d=tsToDate(r.t);const key=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;if(key!==cur){if(cur!==null&&lastClose!=null)out.push({month:cur,c:lastClose});cur=key;lastClose=r.c;}else{lastClose=r.c;}});if(cur!==null&&lastClose!=null)out.push({month:cur,c:lastClose});return out;}
function quarterlyFromDaily(rows){const out=[];let cur=null,lastClose=null;rows.forEach(r=>{const d=tsToDate(r.t);const q=Math.floor(d.getUTCMonth()/3)+1;const key=`${d.getUTCFullYear()}-Q${q}`;if(key!==cur){if(cur!==null&&lastClose!=null)out.push({quarter:cur,c:lastClose});cur=key;lastClose=r.c;}else{lastClose=r.c;}});if(cur!==null&&lastClose!=null)out.push({quarter:cur,c:lastClose});return out;}
function sma(values, w){const out=[];let s=0;const q=[];for(let v of values){q.push(v);s+=v;if(q.length>w){s-=q.shift()}out.push(q.length>=w?s/q.length:null)}return out;}
function returnsPct(values){const out=[];for(let i=1;i<values.length;i++){const a=values[i-1],b=values[i];if(a!=null&&b!=null&&a!==0)out.push((b-a)/a);}return out;}
function covVar(x,y){const n=Math.min(x.length,y.length);if(n<2)return{cov:0,varx:0,mx:0,my:0};const mx=x.reduce((a,b)=>a+b,0)/n;const my=y.reduce((a,b)=>a+b,0)/n;let cov=0,varx=0;for(let i=0;i<n;i++){cov+=(x[i]-mx)*(y[i]-my);varx+=(x[i]-mx)*(x[i]-mx)}return{cov:cov/(n-1),varx:varx/(n-1),mx,my};}
function rSquared(x,y,beta,alpha){const n=Math.min(x.length,y.length);if(n<2)return 0;let ssTot=0,ssRes=0;const my=y.reduce((a,b)=>a+b,0)/n;for(let i=0;i<n;i++){const pred=alpha+beta*x[i];ssRes+=(y[i]-pred)*(y[i]-pred);ssTot+=(y[i]-my)*(y[i]-my);}return ssTot===0?0:1-ssRes/ssTot;}

// ===== Watchlist UI =====
async function loadWatchlist(){
  const r=await fetch('/api/watchlist'); const data=await r.json(); const root=document.getElementById('watchlist'); root.innerHTML='';
  (data.items||[]).forEach(it=>{
    const card=document.createElement('div'); card.className='card';
    card.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <div><div><strong>${it.ticker}</strong> <span class="badge">${it.market}</span></div><div class="muted">${it.name||''}</div></div>
      <div class="star" title="Remove">★</div></div>`;
    card.querySelector('.star').addEventListener('click', (e)=>{e.stopPropagation(); removeFromWatchlist(it.ticker,it.market).then(loadWatchlist);});
    card.addEventListener('click', ()=>openDetail(it.ticker,it.market,it.name||'')); root.appendChild(card);
  });
}
async function addToWatchlist(t,m,n){ await fetch('/api/watchlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticker:t,market:m,name:n})}); }
async function removeFromWatchlist(t,m){ await fetch('/api/watchlist',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticker:t,market:m})}); }

// ===== Search (no API calls per result) =====
async function search(){
  const q=document.getElementById('q').value.trim(); const market=document.getElementById('market').value; if(!q)return;
  const resEl=document.getElementById('results'); document.getElementById('banner').innerHTML=''; resEl.innerHTML='Searching…';
  try{
    const r=await fetch(`/api/search?q=${encodeURIComponent(q)}&market=${market}`); const text=await r.text(); let data; try{data=JSON.parse(text);}catch{showBanner('Server returned a non-JSON error.');resEl.innerHTML='';return;}
    if(!r.ok){const body=data&&(data.body||data.error||'Unknown error');showBanner(`Search failed: ${body}`);resEl.innerHTML='';return;}
    const items=(data.results||[]).slice(0,20); if(!items.length){resEl.innerHTML='<div class="muted">No matches.</div>';return;}
    resEl.innerHTML='';
    items.forEach(it=>{
      const card=document.createElement('div'); card.className='card';
      card.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div><div><strong>${it.ticker}</strong> <span class="badge">${it.market}</span></div><div class="muted">${it.name||''}</div></div>
        <div class="star" title="Add">☆</div></div>`;
      card.querySelector('.star').addEventListener('click',(e)=>{e.stopPropagation();addToWatchlist(it.ticker,it.market,it.name||'').then(loadWatchlist);});
      card.addEventListener('click',()=>openDetail(it.ticker,it.market,it.name||'')); resEl.appendChild(card);
    });
  }catch(e){console.error(e);showBanner('Search error.');resEl.innerHTML='';}
}

// ===== Detail modal and analysis =====
const modal={
  root:document.getElementById('detailModal'),
  title:document.getElementById('detailTicker'),
  name:document.getElementById('detailName'),
  price:document.getElementById('detailPrice'),
  change:document.getElementById('detailChange'),
  chart:document.getElementById('detailChart'),
  tip_overview:document.getElementById('tip-detail'),
  tip_trend:document.getElementById('tip-trend'),
  tip_comparative:document.getElementById('tip-comparative'),
  tip_ratios:document.getElementById('tip-ratios'),
  tip_variance:document.getElementById('tip-variance'),
  tip_regression:document.getElementById('tip-regression'),
  tip_ma:document.getElementById('tip-ma'),
  closeBtn:document.getElementById('detailClose'),
  banner:document.getElementById('detailBanner'),
  loading:document.getElementById('detailLoading'),
  tabs:Array.from(document.querySelectorAll('.tab')),
  panels:{
    overview:document.getElementById('panel-overview'),
    trend:document.getElementById('panel-trend'),
    comparative:document.getElementById('panel-comparative'),
    ratios:document.getElementById('panel-ratios'),
    variance:document.getElementById('panel-variance'),
    regression:document.getElementById('panel-regression'),
    movingavg:document.getElementById('panel-movingavg'),
  },
  canvases:{
    overview:document.getElementById('detailChart'),
    trend:document.getElementById('trendChart'),
    comparative:document.getElementById('comparativeChart'),
    ratios:document.getElementById('ratiosChart'),
    variance:document.getElementById('varianceChart'),
    regression:document.getElementById('regressionChart'),
    movingavg:document.getElementById('maChart'),
  },
  texts:{
    trend:document.getElementById('trendText'),
    comparative:document.getElementById('comparativeText'),
    ratios:document.getElementById('ratiosText'),
    variance:document.getElementById('varianceText'),
    regression:document.getElementById('regressionText'),
    movingavg:document.getElementById('maText'),
  },
  current:{ticker:null,market:null,name:''},
  data:{series1y:[],seriesLong:[],benchmark:[],benchmarkTicker:null},
  watchBtn:document.getElementById('btnWatch'),
  alertsBtn:document.getElementById('btnAlerts'),
  alertsPanel:document.getElementById('alertsPanel'),
  inputs:{
    ma200:document.getElementById('alert_ma200'),
    h52:document.getElementById('alert_52h'),
    l52:document.getElementById('alert_52l'),
    drop:document.getElementById('alert_drop'),
    save:document.getElementById('alertsSave'),
    benchmark:document.getElementById('benchmark'),
  }
};

modal.closeBtn.addEventListener('click',()=>closeDetail());
modal.root.addEventListener('click',(e)=>{if(e.target===modal.root)closeDetail();});
document.addEventListener('keydown',(e)=>{if(e.key==='Escape')closeDetail();});
document.getElementById('btnLoadWL').addEventListener('click',loadWatchlist);

modal.tabs.forEach(tab=>{
  tab.addEventListener('click',()=>{
    modal.tabs.forEach(t=>t.classList.remove('active')); tab.classList.add('active');
    const target=tab.dataset.tab;
    for(const [k,p] of Object.entries(modal.panels)) p.classList.toggle('hidden',k!==target);
    renderTab(target);
  });
});

modal.watchBtn.addEventListener('click', async ()=>{
  const t=modal.current.ticker, m=modal.current.market, n=modal.current.name;
  await addToWatchlist(t,m,n); await loadWatchlist();
});

modal.alertsBtn.addEventListener('click', async ()=>{
  modal.alertsPanel.classList.toggle('hidden');
  if(!modal.alertsPanel.classList.contains('hidden')){
    const r=await fetch(`/api/alerts?ticker=${encodeURIComponent(modal.current.ticker)}`); const data=await r.json();
    const rules=data.rules||[];
    modal.inputs.ma200.checked = !!rules.find(x=>x.rule_type==='cross_ma200' && x.active);
    modal.inputs.h52.checked   = !!rules.find(x=>x.rule_type==='new_52w_high' && x.active);
    modal.inputs.l52.checked   = !!rules.find(x=>x.rule_type==='new_52w_low' && x.active);
    const drop = rules.find(x=>x.rule_type==='pct_drop_day');
    modal.inputs.drop.value = drop && drop.params && drop.params.percent != null ? drop.params.percent : 3;
  }
});

modal.inputs.save.addEventListener('click', async ()=>{
  const t=modal.current.ticker, m=modal.current.market;
  const rules=[];
  if(modal.inputs.ma200.checked) rules.push({rule_type:'cross_ma200', params:{}, active:true});
  if(modal.inputs.h52.checked)   rules.push({rule_type:'new_52w_high', params:{}, active:true});
  if(modal.inputs.l52.checked)   rules.push({rule_type:'new_52w_low', params:{}, active:true});
  const p=parseFloat(modal.inputs.drop.value||'0'); if(p>0) rules.push({rule_type:'pct_drop_day', params:{percent:p}, active:true});
  await fetch('/api/alerts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticker:t,market:m,rules})});
  modal.alertsPanel.classList.add('hidden');
  alert('Alerts saved. Emails will be sent when conditions trigger.');
});

modal.inputs.benchmark.addEventListener('change', ()=> {
  // re-fetch analysis with chosen benchmark
  loadAnalysis(modal.current.ticker, modal.current.market, modal.inputs.benchmark.value);
});

function openDetail(ticker, market, name){
  modal.current={ticker,market,name};
  modal.title.textContent=ticker; modal.name.textContent=name||'';
  modal.price.textContent='—'; modal.change.textContent='—'; modal.banner.innerHTML=''; modal.loading.style.display='block';
  modal.tabs.forEach(t=>t.classList.remove('active')); modal.tabs[0].classList.add('active');
  for(const [k,p] of Object.entries(modal.panels)) p.classList.toggle('hidden',k!=='overview');
  Object.values(modal.canvases).forEach(clearCanvas);
  modal.alertsPanel.classList.add('hidden');
  modal.root.classList.add('open'); modal.root.setAttribute('aria-hidden','false');
  loadDetail(ticker, market).then(()=>loadAnalysis(ticker, market));
}

function closeDetail(){ modal.root.classList.remove('open'); modal.root.setAttribute('aria-hidden','true'); }

async function loadDetail(ticker, market){
  const d=await fetch(`/api/detail?ticker=${encodeURIComponent(ticker)}&market=${market}`); const detail=await d.json();
  if(detail.price!=null) modal.price.textContent=fmt.format(detail.price);
  if(typeof detail.pct_change_1y==='number'){const p=detail.pct_change_1y; modal.change.textContent=(p>=0?'+':'')+pct2.format(p)+'%'; modal.change.classList.remove('pos','neg'); modal.change.classList.add(p>=0?'pos':'neg');}
  modal.data.series1y = detail.history || [];
  const labels1y = modal.data.series1y.map(r=>{const d=new Date(r.t);return `${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCFullYear()).slice(2)}`;});
  attachLineInteractions(modal.canvases.overview, modal.data.series1y.map(r=>r.c), labels1y, {yFormatter:v=>fmt.format(v)}, modal.tip_overview);
  modal.loading.style.display='none';
}

async function loadAnalysis(ticker, market, benchmark=null){
  const url = `/api/analysis?ticker=${encodeURIComponent(ticker)}&market=${market}&days=730` + (benchmark?`&benchmark=${encodeURIComponent(benchmark)}`:'');
  const a=await fetch(url); const analysis=await a.json();
  modal.data.seriesLong = analysis.series || [];
  modal.data.benchmark = analysis.benchmark || [];
  modal.data.benchmarkTicker = analysis.benchmark_ticker || benchmark;

  // Pre-render / attach interactions
  renderTab('trend'); renderTab('comparative'); renderTab('ratios'); renderTab('variance'); renderTab('regression'); renderTab('movingavg');
}

function renderTab(tab){
  const long = modal.data.seriesLong; if(!long||!long.length) return;

  if(tab==='overview'){ /* already attached in loadDetail */ }

  if(tab==='trend'){
    const months = monthlyFromDaily(long); const vals = months.map(m=>m.c); const labels = months.map(m=>m.month);
    attachLineInteractions(modal.canvases.trend, vals, labels, {yFormatter:v=>fmt.format(v)}, modal.tip_trend);
    const bullets=[]; for(let i=months.length-1;i>=Math.max(1,months.length-6);i--){const ch=pct(months[i-1].c,months[i].c); bullets.push(`MoM ${months[i-1].month} → ${months[i].month}: ${ch>=0?'+':''}${pct2.format(ch)}%`);}
    if(months.length>=13){const chYoY=pct(months[months.length-13].c, months[months.length-1].c); bullets.push(`YoY change (latest month): ${chYoY>=0?'+':''}${pct2.format(chYoY)}%`);}
    document.getElementById('trendText').innerHTML = bullets.map(b=>`<div>• ${b}</div>`).join('');
  }

  if(tab==='comparative'){
    const months = monthlyFromDaily(long); const last12 = months.slice(-12);
    attachLineInteractions(modal.canvases.comparative, last12.map(m=>m.c), last12.map(m=>m.month), {yFormatter:v=>fmt.format(v)}, modal.tip_comparative);
    let yoy='Not enough data', qoq='Not enough data';
    if(months.length>=13){const ch=pct(months[months.length-13].c, months[months.length-1].c); yoy=`${ch>=0?'+':''}${pct2.format(ch)}%`;}
    const quarters = quarterlyFromDaily(long); if(quarters.length>=2){const ch=pct(quarters[quarters.length-2].c, quarters[quarters.length-1].c); qoq=`${ch>=0?'+':''}${pct2.format(ch)}%`;}
    document.getElementById('comparativeText').innerHTML = `<div>• YoY (latest month): <strong>${yoy}</strong></div><div>• QoQ (latest quarter): <strong>${qoq}</strong></div>`;
  }

  if(tab==='ratios'){
    const last365Rows = long.slice(-365); const values = last365Rows.map(r=>r.c).filter(v=>v!=null);
    const labels = last365Rows.map(r=>{const d=new Date(r.t);return `${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCDate()).padStart(2,'0')}`;});
    attachLineInteractions(modal.canvases.ratios, values, labels, {yFormatter:v=>fmt.format(v)}, modal.tip_ratios);

    const cur=last(long).c, high=Math.max(...values), low=Math.min(...values); const closes=long.map(r=>r.c);
    const ma50=last(sma(closes,50)), ma200=last(sma(closes,200));
    const bullets=[`52-week high: ${fmt.format(high)} (price / high = ${fmt.format(cur/high)})`,
                   `52-week low: ${fmt.format(low)} (price / low = ${fmt.format(cur/low)})`,
                   (ma50?`Price / MA50: ${fmt.format(cur/ma50)} (${cur>=ma50?'above':'below'})`:'MA50: not enough data'),
                   (ma200?`Price / MA200: ${fmt.format(cur/ma200)} (${cur>=ma200?'above':'below'})`:'MA200: not enough data')];
    document.getElementById('ratiosText').innerHTML = bullets.map(b=>`<div>• ${b}</div>`).join('');
  }

  if(tab==='variance'){
    const months = monthlyFromDaily(long); if(months.length<6) return;
    const mVals=months.map(m=>m.c); const mRets=returnsPct(mVals); const labels=months.slice(1).map(m=>m.month);
    attachLineInteractions(modal.canvases.variance, mRets.map(x=>x*100), labels, {yFormatter:v=>`${pct2.format(v)}%`}, modal.tip_variance);
    const mean=mRets.reduce((a,b)=>a+b,0)/mRets.length; const sd=Math.sqrt(mRets.reduce((s,x)=>s+(x-mean)*(x-mean),0)/Math.max(1,mRets.length-1)); const latest=last(mRets); const z=sd?(latest-mean)/sd:0;
    document.getElementById('varianceText').innerHTML = `<div>• Avg monthly return: <strong>${pct2.format(mean*100)}%</strong></div>
      <div>• Monthly return stdev: <strong>${pct2.format(sd*100)}%</strong></div>
      <div>• Latest month return: <strong>${pct2.format(latest*100)}%</strong></div>
      <div>• Z-score of latest month: <strong>${pct2.format(z)}</strong> ${Math.abs(z)>=2?'(unusual)':''}</div>`;
  }

  if(tab==='regression'){
    const b = modal.data.benchmark, bTick = modal.data.benchmarkTicker;
    const textEl=document.getElementById('regressionText');
    if(!b||!b.length){ textEl.innerHTML=`• Benchmark unavailable (try another)`.replaceAll('  ',' '); clearCanvas(modal.canvases.regression); return; }
    const ySeries = returnsPct(long.map(r=>r.c)), xSeries = returnsPct(b.map(r=>r.c)); const n=Math.min(xSeries.length,ySeries.length);
    if(n<30){ textEl.innerHTML=`• Not enough overlapping points for regression (need ~30+, have ${n}).`; clearCanvas(modal.canvases.regression); return; }
    const X=xSeries.slice(-n), Y=ySeries.slice(-n); const {cov,varx,mx,my}=covVar(X,Y); const beta=varx?cov/varx:0; const alpha=my-beta*mx; const r2=rSquared(X,Y,beta,alpha);
    // For regression chart, we only add tooltip text in the stat panel; (scatter hover omitted for brevity)
    const Xp=X.map(v=>v*100), Yp=Y.map(v=>v*100);
    // quick scatter draw with axes (no zoom for scatter to keep simple)
    const cv=modal.canvases.regression; clearCanvas(cv);
    const ctx=cv.getContext('2d'); const w=cv.clientWidth, h=cv.clientHeight; cv.width=w; cv.height=h;
    // reuse axes helper for y; custom x ticks
    const left=50,right=10,top=10,bottom=28; const box={left,right,top,bottom,w,h};
    const xmin=Math.min(...Xp), xmax=Math.max(...Xp), ymin=Math.min(...Yp), ymax=Math.max(...Yp);
    const {yScale}=drawAxes(ctx, box, Array.from({length:Xp.length},()=>''), ymin, ymax, {yFormatter:v=>`${pct2.format(v)}%`});
    const xTicks=niceTicks(xmin,xmax,6).ticks; const xScale=v=>{const t=(v-xTicks[0])/Math.max(1e-9,(xTicks[xTicks.length-1]-xTicks[0]));return left+t*(w-left-right);};
    ctx.fillStyle='#666'; ctx.textAlign='center'; ctx.textBaseline='top';
    xTicks.forEach(t=>{const x=xScale(t); ctx.strokeStyle='#eee'; ctx.beginPath(); ctx.moveTo(x,h-bottom); ctx.lineTo(x,top); ctx.stroke(); ctx.fillText(`${pct2.format(t)}%`, x, h-bottom+6);});
    // points
    ctx.fillStyle='#999'; for(let i=0;i<Xp.length;i++){const x=xScale(Xp[i]); const y=yScale(Yp[i]); ctx.fillRect(x-1,y-1,2,2);}
    // regression line
    const x1=xTicks[0], x2=xTicks[xTicks.length-1]; const y1=(alpha*100)+beta*x1; const y2=(alpha*100)+beta*x2; ctx.beginPath(); ctx.moveTo(xScale(x1), yScale(y1)); ctx.lineTo(xScale(x2), yScale(y2)); ctx.lineWidth=2; ctx.strokeStyle='#0a7'; ctx.stroke();
    textEl.innerHTML = `<div>• Benchmark used: <strong>${bTick||'custom'}</strong></div><div>• Beta: <strong>${n2.format(beta)}</strong></div><div>• Alpha (daily): <strong>${pct2.format(alpha*100)}%</strong></div><div>• R²: <strong>${pct2.format(r2*100)}%</strong></div>`;
  }

  if(tab==='movingavg'){
    const closes=long.map(r=>r.c); const ma50=sma(closes,50), ma200=sma(closes,200);
    const labels = long.map(r=>{const d=new Date(r.t);return `${String(d.getUTCMonth()+1).padStart(2,'0')}/${String(d.getUTCFullYear()).slice(2)}`;});
    attachLineMultiInteractions(modal.canvases.movingavg, [
      {values:closes,width:2,color:'#0a7'},
      {values:ma50.map(v=>v??null),width:1.5,color:'#999'},
      {values:ma200.map(v=>v??null),width:1.5,color:'#555'},
    ], labels, {yFormatter:v=>fmt.format(v)}, modal.tip_ma);
    const cur=last(closes), m50=last(ma50), m200=last(ma200);
    const bullets=[(m50?`Price vs MA50: ${cur>=m50?'above':'below'} (${pct2.format(((cur-m50)/m50)*100)}%)`:'MA50: not enough data'),
                   (m200?`Price vs MA200: ${cur>=m200?'above':'below'} (${pct2.format(((cur-m200)/m200)*100)}%)`:'MA200: not enough data'),
                   `Golden/death cross: look for MA50 crossing MA200`];
    document.getElementById('maText').innerHTML = bullets.map(b=>`<div>• ${b}</div>`).join('');
  }
}

// ===== Events =====
document.getElementById('btnSearch').addEventListener('click', search);
document.getElementById('q').addEventListener('keydown', (e)=>{ if(e.key==='Enter') search(); });
window.addEventListener('load', loadWatchlist);
