(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { sites: [], activeSite: null, analysis: null, saved: [] };
  const today = new Date().toISOString().slice(0, 10);
  const plusDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  $('startDate').value = today;
  $('endDate').value = plusDays(today, 29);

  function setStatus(kind, text) {
    $('connectionStatus').dataset.state = kind;
    $('connectionStatus').textContent = text;
  }

  function showMessage(text, kind = '') {
    $('formMessage').textContent = text;
    $('formMessage').dataset.state = kind;
  }

  function selectSite(site) {
    state.activeSite = site || null;
    if (!site) return;
    $('siteName').value = site.name || '';
    $('latitude').value = Number(site.lat).toFixed(6);
    $('longitude').value = Number(site.lon).toFixed(6);
  }

  async function loadSites() {
    const response = await fetch('/api/explorer/workspace');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Не вдалося завантажити ділянки Explorer.');
    state.sites = Array.isArray(payload.sites) ? payload.sites : [];
    const select = $('siteSelect');
    state.sites.forEach(site => {
      const option = document.createElement('option');
      option.value = site.id;
      option.textContent = `${site.name} · ${Number(site.lat).toFixed(3)}°, ${Number(site.lon).toFixed(3)}°`;
      select.append(option);
    });
    select.addEventListener('change', () => selectSite(state.sites.find(site => site.id === select.value)));
    const params = new URLSearchParams(location.search);
    const requested = params.get('site');
    const initial = state.sites.find(site => site.id === requested) || (params.has('lat') ? null : state.sites[0]);
    if (initial) { select.value = initial.id; selectSite(initial); }
    if (!initial && Number.isFinite(Number(params.get('lat'))) && Number.isFinite(Number(params.get('lon')))) {
      const latitude = Number(params.get('lat')), longitude = Number(params.get('lon'));
      if (latitude >= -90 && latitude <= -60 && longitude >= -180 && longitude <= 180) {
        $('latitude').value = latitude.toFixed(6); $('longitude').value = longitude.toFixed(6);
        $('siteName').value = params.get('name') || 'Ділянка з карти';
        state.activeSite = { name: $('siteName').value, lat: latitude, lon: longitude, elevationM: null };
      }
    }
    const mapQuery = new URLSearchParams({ lat: $('latitude').value, lon: $('longitude').value, name: $('siteName').value || 'Власні координати', time: `${$('startDate').value}T00:00` });
    if (initial?.id) mapQuery.set('site', initial.id);
    $('explorerLink').href = `/explorer/?${mapQuery}`;
  }

  ['latitude', 'longitude'].forEach(id => $(id).addEventListener('input', () => {
    state.activeSite = null;
    $('siteSelect').value = '';
  }));

  function formatDuration(minutes) {
    const total = Math.max(0, Math.round(minutes));
    const days = Math.floor(total / 1440);
    const hours = Math.floor((total % 1440) / 60);
    const mins = total % 60;
    return [days ? `${days} д` : '', hours ? `${hours} год` : '', `${mins} хв`].filter(Boolean).join(' ');
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat('uk-UA', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value)) + ' UTC';
  }

  function drawChart(canvas, tooltip, key, label, range, zeroLine = false) {
    const data = state.analysis?.data || [];
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, rect.width);
    const height = Math.max(180, rect.height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const pad = { left: 46, right: 12, top: 12, bottom: 28 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const minY = range[0];
    const maxY = range[1];
    const x = i => pad.left + i / Math.max(data.length - 1, 1) * plotW;
    const y = value => pad.top + (maxY - value) / (maxY - minY) * plotH;
    context.font = '9px monospace';
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    for (let tick = 0; tick <= 4; tick++) {
      const value = maxY - tick * (maxY - minY) / 4;
      const yy = y(value);
      context.strokeStyle = '#203448'; context.lineWidth = 1; context.beginPath(); context.moveTo(pad.left, yy); context.lineTo(width - pad.right, yy); context.stroke();
      context.fillStyle = '#8197a8'; context.fillText(`${value.toFixed(0)}°`, pad.left - 7, yy);
    }
    if (zeroLine && minY < 0 && maxY > 0) {
      context.strokeStyle = '#d99070'; context.setLineDash([5, 4]); context.beginPath(); context.moveTo(pad.left, y(0)); context.lineTo(width - pad.right, y(0)); context.stroke(); context.setLineDash([]);
    }
    if (!data.length) return;
    context.beginPath();
    data.forEach((row, i) => { const px = x(i), py = y(row[key]); if (!i || (key === 'azimuthDeg' && Math.abs(row[key] - data[i - 1][key]) > 180)) context.moveTo(px, py); else context.lineTo(px, py); });
    context.strokeStyle = key === 'elevationDeg' ? '#c7ec7c' : '#73d8e8'; context.lineWidth = 1.8; context.stroke();
    context.fillStyle = '#8197a8'; context.textAlign = 'left'; context.textBaseline = 'top';
    context.fillText(new Date(data[0].time).toISOString().slice(0, 10), pad.left, height - pad.bottom + 8);
    context.textAlign = 'right'; context.fillText(new Date(data[data.length - 1].time).toISOString().slice(0, 10), width - pad.right, height - pad.bottom + 8);
    const hover = canvas._hoverIndex;
    if (Number.isInteger(hover) && data[hover]) {
      const row = data[hover];
      context.strokeStyle = '#90b3c3'; context.setLineDash([3, 3]); context.beginPath(); context.moveTo(x(hover), pad.top); context.lineTo(x(hover), height - pad.bottom); context.stroke(); context.setLineDash([]);
      context.fillStyle = '#f4fbff'; context.beginPath(); context.arc(x(hover), y(row[key]), 3.5, 0, Math.PI * 2); context.fill();
      tooltip.textContent = `${formatTime(row.time)} · ${label}: ${row[key].toFixed(3)}°`;
    }
  }

  function drawAll() {
    if (!state.analysis) return;
    const elevations = state.analysis.data.map(row => row.elevationDeg);
    const low = Math.min(0, Math.floor(Math.min(...elevations) - 1));
    const high = Math.max(1, Math.ceil(Math.max(...elevations) + 1));
    drawChart($('elevationChart'), $('elevationTooltip'), 'elevationDeg', 'Висота', [low, high], true);
    drawChart($('azimuthChart'), $('azimuthTooltip'), 'azimuthDeg', 'Азимут', [0, 360]);
  }

  function renderAnalysis(analysis) {
    state.analysis = analysis;
    $('results').hidden = false;
    $('resultTitle').textContent = analysis.site.name;
    $('resultMeta').textContent = `${analysis.site.lat.toFixed(6)}° широти, ${analysis.site.lon.toFixed(6)}° східної довготи · ${analysis.parameters.startDate} — ${analysis.parameters.endDate} · UTC`;
    $('metricPercent').textContent = `${analysis.summary.illuminatedPercent.toFixed(1)}%`;
    $('metricLight').textContent = `${formatDuration(analysis.summary.illuminatedMinutes)} потенційного освітлення`;
    $('metricDark').textContent = formatDuration(analysis.summary.darkMinutes);
    $('metricElevation').textContent = `${analysis.summary.minElevationDeg.toFixed(2)}° / ${analysis.summary.maxElevationDeg.toFixed(2)}°`;
    $('metricSamples').textContent = String(analysis.data.length);
    $('metricStep').textContent = `Крок ${analysis.parameters.stepMinutes} хв · UTC`;
    const radiusNote = analysis.radiusAssumptionKm ? `Висота LOLA недоступна; для позиції спостерігача взято референсний радіус ${analysis.radiusAssumptionKm.toFixed(1)} км.` : `Висоту точки враховано за доступним виміром LOLA: ${Number(analysis.site.elevationM || 0).toFixed(0)} м відносно середнього радіуса.`;
    $('modelInfo').textContent = `${analysis.model}${analysis.lunarFrame ? ` · система орієнтації ${analysis.lunarFrame}` : ''}. Азимут відлічується від півночі за годинниковою стрілкою; elevation — висота центру диска Сонця відносно локальної площини горизонту. ${radiusNote} Джерело ефемериди — JPL Horizons observer table, без атмосферної рефракції для Місяця.`;
    $('terrainInfo').textContent = `${analysis.terrain.limitation} Отже, це геометричне освітлення точки, не затінення навколишніми схилами.`;
    const maxBracket = Math.max(0, ...analysis.summary.events.map(event => event.bracketMinutes));
    $('precisionInfo').textContent = `Момент кожного перетину уточнено лінійною інтерполяцією між сусідніми вимірюваннями. Перетин обмежений часовим інтервалом до ${maxBracket.toFixed(1)} хв; похибка моделі Horizon тут окремо не оцінена.`;
    const events = $('eventsList'); events.replaceChildren();
    if (!analysis.summary.events.length) events.innerHTML = '<div class="empty-note">У вибраному інтервалі переходів через горизонт не виявлено.</div>';
    analysis.summary.events.forEach(event => {
      const row = document.createElement('div'); row.className = `event-row ${event.type}`;
      const text = event.type === 'rise' ? 'Сходи Сонця' : 'Захід Сонця';
      row.innerHTML = `<span>${text}</span><small>${formatTime(event.time)}<br>інтервал пошуку ≤ ${event.bracketMinutes.toFixed(1)} хв</small>`;
      events.append(row);
    });
    const periods = $('periodsList'); periods.replaceChildren();
    analysis.summary.periods.forEach(period => {
      const row = document.createElement('div'); row.className = `period-row ${period.illuminated ? '' : 'dark'}`;
      const status = period.illuminated ? 'НАД ГОРИЗОНТОМ' : 'ГЕОМЕТРИЧНА ТЕМРЯВА';
      row.innerHTML = `<span>${status}<br><small>${formatDuration(period.durationMinutes)}</small></span><small>${formatTime(period.start)}<br>— ${formatTime(period.end)}</small>`;
      periods.append(row);
    });
    drawAll();
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('runAnalysis').addEventListener('click', async () => {
    const site = { ...(state.activeSite || {}), name: $('siteName').value.trim() || 'Власні координати', lat: Number($('latitude').value), lon: Number($('longitude').value), elevationM: state.activeSite?.surfaceData?.elevation ?? null };
    const payload = { site, startDate: $('startDate').value, endDate: $('endDate').value, stepMinutes: Number($('stepMinutes').value) };
    $('runAnalysis').disabled = true; showMessage('Запитуємо JPL Horizons…'); setStatus('loading', 'Розрахунок JPL Horizons…');
    try {
      const response = await fetch('/api/illumination/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      selectSite(site); renderAnalysis(result); showMessage(`Отримано ${result.data.length} вимірювань.`); setStatus('saved', 'Ефемерида отримана');
    } catch (error) { console.error(error); showMessage(error.message, 'error'); setStatus('error', 'Помилка розрахунку'); }
    finally { $('runAnalysis').disabled = false; }
  });

  function downloadFile(filename, content, type) {
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  $('exportCsv').addEventListener('click', () => {
    if (!state.analysis) return;
    const quote = value => `"${String(value).replaceAll('"', '""')}"`;
    const rows = [['time_utc', 'azimuth_deg_from_north_clockwise', 'elevation_deg_airless'], ...state.analysis.data.map(row => [row.time, row.azimuthDeg, row.elevationDeg])];
    downloadFile('lunavex-illumination.csv', rows.map(row => row.map(quote).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
  });
  $('exportJson').addEventListener('click', () => { if (state.analysis) downloadFile('lunavex-illumination.json', JSON.stringify(state.analysis, null, 2), 'application/json'); });

  async function loadSaved() {
    const response = await fetch('/api/illumination/researches');
    const records = await response.json();
    if (!response.ok) throw new Error(records.error || 'Не вдалося прочитати дослідження.');
    state.saved = records;
    const select = $('savedSelect'); select.replaceChildren(new Option('Оберіть збережений результат…', ''));
    records.forEach(record => select.add(new Option(`${record.name} · ${new Date(record.created_at).toLocaleString('uk-UA')}`, String(record.id))));
    select.onchange = async () => {
      const record = state.saved.find(item => String(item.id) === select.value);
      if (!record) return;
      try {
        const response = await fetch(`/api/illumination/researches/${encodeURIComponent(record.id)}`);
        const fullRecord = await response.json();
        if (!response.ok) throw new Error(fullRecord.error || 'Не вдалося відкрити збережений результат.');
        selectSite(fullRecord.site);
        $('startDate').value = fullRecord.parameters.startDate;
        $('endDate').value = fullRecord.parameters.endDate;
        $('stepMinutes').value = String(fullRecord.parameters.stepMinutes);
        renderAnalysis(fullRecord.result);
      } catch (error) { showMessage(error.message, 'error'); }
    };
  }
  $('saveResearch').addEventListener('click', async () => {
    if (!state.analysis) return;
    const name = prompt('Назва дослідження', `${state.analysis.site.name} · ${state.analysis.parameters.startDate}`);
    if (name === null) return;
    try {
      const response = await fetch('/api/illumination/researches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, site: state.analysis.site, parameters: state.analysis.parameters, result: state.analysis }) });
      const saved = await response.json(); if (!response.ok) throw new Error(saved.error || 'Помилка збереження.');
      showMessage('Дослідження збережено у PostgreSQL.'); setStatus('saved', 'Збережено в базі даних'); await loadSaved(); $('savedSelect').value = String(saved.id);
    } catch (error) { showMessage(error.message, 'error'); setStatus('error', 'Не збережено'); }
  });
  $('refreshSaved').addEventListener('click', () => loadSaved().catch(error => showMessage(error.message, 'error')));

  for (const [id, key, label, range] of [['elevationChart', 'elevationDeg', 'Висота', true], ['azimuthChart', 'azimuthDeg', 'Азимут', false]]) {
    const canvas = $(id);
    canvas.addEventListener('pointermove', event => {
      if (!state.analysis) return;
      const bounds = canvas.getBoundingClientRect();
      const data = state.analysis.data;
      const plotFraction = Math.max(0, Math.min(1, (event.clientX - bounds.left - 46) / (bounds.width - 58)));
      canvas._hoverIndex = Math.round(plotFraction * (data.length - 1));
      drawChart(canvas, $(`${id === 'elevationChart' ? 'elevation' : 'azimuth'}Tooltip`), key, label, range ? [Math.min(0, Math.floor(Math.min(...data.map(r => r[key])) - 1)), Math.max(1, Math.ceil(Math.max(...data.map(r => r[key])) + 1))] : [0, 360], range);
    });
    canvas.addEventListener('pointerleave', () => { canvas._hoverIndex = null; drawAll(); });
  }
  window.addEventListener('resize', drawAll);

  Promise.all([loadSites(), loadSaved()]).then(() => setStatus('saved', 'База даних підключена')).catch(error => { console.error(error); setStatus('error', error.message || 'Немає з’єднання з базою даних'); });
})();
