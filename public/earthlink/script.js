(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { sites: [], activeSite: null, analysis: null, saved: [] };
  const today = new Date().toISOString().slice(0, 10);
  const addDays = (date, count) => new Date(Date.parse(`${date}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
  $('startDate').value = today; $('endDate').value = addDays(today, 6);
  const formatTime = value => new Intl.DateTimeFormat('uk-UA', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' UTC';
  const duration = minutes => { const m = Math.round(minutes), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), r = m % 60; return [d && `${d} д`, h && `${h} год`, `${r} хв`].filter(Boolean).join(' '); };
  function message(text, error = false) { $('formMessage').textContent = text; $('formMessage').dataset.state = error ? 'error' : ''; }
  function status(text, stateName = 'saved') { $('connectionStatus').textContent = text; $('connectionStatus').dataset.state = stateName; }
  async function loadSites() {
    try {
      const response = await fetch('/api/explorer/workspace'), payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Немає доступу до робочого набору Explorer.');
      state.sites = payload.sites || [];
      state.sites.forEach(site => { const opt = document.createElement('option'); opt.value = site.id; opt.textContent = `${site.name} · ${Number(site.lat).toFixed(3)}°, ${Number(site.lon).toFixed(3)}°`; $('siteSelect').append(opt); });
      const query = new URLSearchParams(location.search), wanted = state.sites.find(site => site.id === query.get('site'));
      const site = wanted || (query.has('lat') ? null : state.sites[0]);
      if (site) selectSite(site);
      else if (Number.isFinite(Number(query.get('lat'))) && Number.isFinite(Number(query.get('lon')))) { $('latitude').value = query.get('lat'); $('longitude').value = query.get('lon'); $('siteName').value = query.get('name') || 'Точка з карти'; }
      $('siteSelect').addEventListener('change', () => selectSite(state.sites.find(x => x.id === $('siteSelect').value)));
      refreshExplorerLink();
    } catch (error) { status('Explorer недоступний', 'error'); message(error.message, true); }
  }
  function selectSite(site) { state.activeSite = site || null; if (!site) return; $('siteSelect').value = site.id || ''; $('siteName').value = site.name || ''; $('latitude').value = site.lat; $('longitude').value = site.lon; refreshExplorerLink(); }
  function refreshExplorerLink() { const params = new URLSearchParams({ lat: $('latitude').value, lon: $('longitude').value, name: $('siteName').value || 'EarthLink', time: `${$('startDate').value}T00:00` }); if (state.activeSite?.id) params.set('site', state.activeSite.id); $('explorerLink').href = `/explorer/?${params}`; }
  ['latitude','longitude','siteName'].forEach(id => $(id).addEventListener('input', () => { if (id !== 'siteName') { state.activeSite = null; $('siteSelect').value = ''; } refreshExplorerLink(); }));
  function drawChart() {
    const canvas = $('elevationChart'), data = state.analysis?.data || [], bounds = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const width = Math.max(300, bounds.width), height = Math.max(190, bounds.height);
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,width,height);
    if (!data.length) return;
    const min = Math.min(0, Math.floor(Math.min(...data.map(x=>x.elevationDeg))-1)), max = Math.max(1, Math.ceil(Math.max(...data.map(x=>x.elevationDeg))+1));
    const p={l:48,r:14,t:12,b:30}, x=i=>p.l+i/Math.max(1,data.length-1)*(width-p.l-p.r), y=v=>p.t+(max-v)/(max-min)*(height-p.t-p.b);
    ctx.font='10px monospace'; ctx.textAlign='right'; ctx.textBaseline='middle';
    for(let i=0;i<=4;i++){const v=max-i*(max-min)/4, yy=y(v);ctx.strokeStyle='#203448';ctx.beginPath();ctx.moveTo(p.l,yy);ctx.lineTo(width-p.r,yy);ctx.stroke();ctx.fillStyle='#91a7b7';ctx.fillText(`${v.toFixed(0)}°`,p.l-7,yy);}
    ctx.fillStyle='rgba(199,236,124,.10)'; let start=null;
    data.forEach((row,i)=>{if(row.elevationDeg>=0&&start===null)start=i;if((row.elevationDeg<0||i===data.length-1)&&start!==null){const end=row.elevationDeg>=0&&i===data.length-1?i:i-1;ctx.fillRect(x(start),p.t,Math.max(1,x(end)-x(start)),height-p.t-p.b);start=null;}});
    ctx.strokeStyle='#e3a879';ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(p.l,y(0));ctx.lineTo(width-p.r,y(0));ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();data.forEach((row,i)=>i?ctx.lineTo(x(i),y(row.elevationDeg)):ctx.moveTo(x(i),y(row.elevationDeg)));ctx.strokeStyle='#73d8e8';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#91a7b7';ctx.textAlign='left';ctx.fillText(data[0].time.slice(0,10),p.l,height-11);ctx.textAlign='right';ctx.fillText(data.at(-1).time.slice(0,10),width-p.r,height-11);
    if(Number.isInteger(canvas._hoverIndex)&&data[canvas._hoverIndex]){const i=canvas._hoverIndex,row=data[i];ctx.strokeStyle='#dce7ef';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x(i),p.t);ctx.lineTo(x(i),height-p.b);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#dce7ef';ctx.beginPath();ctx.arc(x(i),y(row.elevationDeg),4,0,Math.PI*2);ctx.fill();$('chartTooltip').textContent=`${formatTime(row.time)} · висота ${row.elevationDeg.toFixed(3)}° · азимут ${row.azimuthDeg.toFixed(3)}° · відстань ${row.distanceKm==null?'н/д':`${Math.round(row.distanceKm).toLocaleString('uk-UA')} км`}`;}
  }
  function render(result) {
    state.analysis=result; $('results').hidden=false; $('resultTitle').textContent=result.site.name; $('resultMeta').textContent=`${result.site.lat.toFixed(6)}° планетоцентричної широти, ${result.site.lon.toFixed(6)}° східної довготи · ${result.parameters.startDate} — ${result.parameters.endDate} · UTC`;
    const s=result.summary; $('metricPercent').textContent=`${s.visiblePercent.toFixed(1)}%`; $('metricVisible').textContent=`${duration(s.visibleMinutes)} геометричної видимості`;
    const next=s.periods.find(p=>p.visible&&Date.parse(p.end)>Date.now()); $('metricNext').textContent=next?duration(next.durationMinutes):'Не визначено'; $('metricNextTime').textContent=next?`${formatTime(next.start)} — ${formatTime(next.end)}`:'Немає майбутнього вікна в інтервалі'; $('metricElevation').textContent=`${s.minElevationDeg.toFixed(2)}° / ${s.maxElevationDeg.toFixed(2)}°`;
    const ranges=result.data.map(x=>x.distanceKm).filter(Number.isFinite); $('metricDistance').textContent=ranges.length?`${Math.round(ranges.at(-1)).toLocaleString('uk-UA')} км`:'Недоступна';
    $('modelInfo').textContent=`${result.model}${result.lunarFrame?` · система орієнтації ${result.lunarFrame}`:''}. Спостерігач заданий планетоцентричною широтою, східною довготою та циліндричною координатою радіуса Місяця${result.radiusAssumptionKm?` ${result.radiusAssumptionKm} км`: ' з висотною поправкою LOLA'}. Висота/азимут — airless видиме положення центру Землі; 0° означає геометричну площину локального горизонту. Дистанція надходить із Horizons у кілометрах.`;
    $('terrainInfo').textContent=`Рельєф: ${result.terrain.limitation} ${result.linkBudget.limitation}`;
    const bracket=Math.max(0,...s.crossings.map(x=>x.bracketMinutes)); $('precisionInfo').textContent=`Перетини інтерпольовані між сусідніми відліками; максимальний інтервал обмеження тут ${bracket.toFixed(1)} хв. Це точність часової сітки, а не оцінка похибки ефемериди. Критерій: ${s.criterion}`;
    const events=$('eventsList');events.replaceChildren();if(!s.crossings.length){const p=document.createElement('p');p.className='empty-note';p.textContent='У цьому часовому інтервалі перетинів горизонту немає.';events.append(p);}s.crossings.forEach(event=>{const row=document.createElement('div');row.className=`event-row ${event.type}`;const name=document.createElement('span');name.textContent=event.type==='rise'?'Земля сходить над горизонтом':'Земля заходить за горизонт';const time=document.createElement('small');time.textContent=`${formatTime(event.time)} · межа пошуку ≤ ${event.bracketMinutes.toFixed(1)} хв`;row.append(name,time);events.append(row);});
    const list=$('periodsList');list.replaceChildren();s.periods.forEach(period=>{const row=document.createElement('div');row.className=`period-row ${period.visible?'':'dark'}`;const label=document.createElement('span');label.textContent=`${period.visible?'ГЕОМЕТРИЧНО ВИДИМА':'НИЖЧЕ ГОРИЗОНТУ'} · ${duration(period.durationMinutes)}`;const time=document.createElement('small');time.textContent=`${formatTime(period.start)} — ${formatTime(period.end)}`;row.append(label,time);list.append(row);});drawChart();$('results').scrollIntoView({behavior:'smooth',block:'start'});
  }
  $('elevationChart').addEventListener('mousemove',event=>{const canvas=event.currentTarget,rect=canvas.getBoundingClientRect(),n=state.analysis?.data.length||0;if(n){canvas._hoverIndex=Math.round((event.clientX-rect.left)/rect.width*(n-1));drawChart();}});$('elevationChart').addEventListener('mouseleave',event=>{event.currentTarget._hoverIndex=null;$('chartTooltip').textContent='Наведіть курсор на графік, щоб побачити час і значення.';drawChart();});window.addEventListener('resize',()=>state.analysis&&drawChart());
  $('runAnalysis').addEventListener('click',async()=>{const site={...(state.activeSite||{}),name:$('siteName').value.trim()||'Власні координати',lat:Number($('latitude').value),lon:Number($('longitude').value),elevationM:state.activeSite?.surfaceData?.elevation??null};$('runAnalysis').disabled=true;message('Отримуємо ефемериду JPL Horizons…');status('Розрахунок…','loading');try{const response=await fetch('/api/earthlink/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({site,startDate:$('startDate').value,endDate:$('endDate').value,stepMinutes:Number($('stepMinutes').value)})}),result=await response.json();if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);render(result);message(`Отримано ${result.data.length} вимірювань.`);status('Ефемерида отримана');}catch(error){message(error.message,true);status('Помилка розрахунку','error');}finally{$('runAnalysis').disabled=false;}});
  function download(name,content,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  $('exportJson').addEventListener('click',()=>state.analysis&&download('earthlink-analysis.json',JSON.stringify(state.analysis,null,2),'application/json'));
  $('exportCsv').addEventListener('click',()=>{if(!state.analysis)return;const rows=[['time_utc','azimuth_deg','elevation_deg','distance_km'],...state.analysis.data.map(x=>[x.time,x.azimuthDeg,x.elevationDeg,x.distanceKm??''])];download('earthlink-analysis.csv',rows.map(x=>x.join(',')).join('\n'),'text/csv');});
  $('saveResearch').addEventListener('click',async()=>{if(!state.analysis)return;try{const response=await fetch('/api/earthlink/researches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:state.analysis.site.name,site:state.analysis.site,parameters:state.analysis.parameters,result:state.analysis})}),data=await response.json();if(!response.ok)throw new Error(data.error);message(`Збережено в базі даних · запис ${data.id}`);await refreshSaved();}catch(error){message(error.message,true);}});
  async function refreshSaved(){try{const response=await fetch('/api/earthlink/researches'),rows=await response.json();if(!response.ok)throw new Error(rows.error);state.saved=rows;const select=$('savedSelect');select.replaceChildren(new Option('Виберіть дослідження…',''));rows.forEach(row=>select.append(new Option(`${row.name} · ${new Date(row.created_at).toLocaleString('uk-UA')}`,row.id)));status('База даних доступна');}catch(error){$('savedSelect').replaceChildren(new Option('Не вдалося завантажити список',''));status('База даних недоступна','error');}}
  $('refreshSaved').addEventListener('click',refreshSaved);$('savedSelect').addEventListener('change',async()=>{if(!$('savedSelect').value)return;try{const response=await fetch(`/api/earthlink/researches/${$('savedSelect').value}`),row=await response.json();if(!response.ok)throw new Error(row.error);render(row.result);message(`Завантажено збережене дослідження від ${new Date(row.created_at).toLocaleString('uk-UA')}.`);}catch(error){message(error.message,true);}});
  loadSites();refreshSaved();
})();
