(() => {
  'use strict';
  const R = 1737400;
  const WKID = 30120;
  const LAYER = 'LRO_WAC_Mosaic_SPole60_100m_v02';
  const IMAGE_ENDPOINT = `https://trek.nasa.gov/moon/trekarcgis/rest/services/${LAYER}/ImageServer/exportImage`;
  const DEM_LAYER = 'LRO_LOLA_DEM_SPole75_30mp_v04';
  const DEM_ENDPOINT = `https://trek.nasa.gov/moon/trekarcgis/rest/services/${DEM_LAYER}/ImageServer`;
  const DEM_SOURCE = 'NASA LRO LOLA DEM South Pole 75°S v04 (30 m/pixel)';
  const STORAGE_KEY = 'lunavex.lunar-site-explorer.sites.v1';
  const canvas = document.getElementById('lunarMap');
  const ctx = canvas.getContext('2d');
  const shell = document.querySelector('.map-shell');
  const message = document.getElementById('mapMessage');
  const status = document.getElementById('sourceStatus');
  const statusText = status.querySelector('span');
  const siteName = document.getElementById('siteName');
  const timeInput = document.getElementById('observationTime');
  const latValue = document.getElementById('latitudeValue');
  const lonValue = document.getElementById('longitudeValue');
  const saveButton = document.getElementById('saveSite');
  const deleteButton = document.getElementById('deleteSite');
  const list = document.getElementById('siteList');
  let sites = readSites();
  let activeSavedId = null;
  let selected = null;
  let center = { x: 0, y: 0 };
  let resolution = 1700;
  let image = null;
  let imageBounds = null;
  let requestTimer;
  let requestSerial = 0;
  let dragState = null;
  let didLoad = false;
  let showingTerrain = false;
  let selectedElevation = null;
  let elevationRequest = 0;
  let compareIds = readCompareIds();

  function readSites() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(data) ? data.filter(item => item && Number.isFinite(item.lat) && Number.isFinite(item.lon)) : [];
    } catch { return []; }
  }

  function readCompareIds() {
    try { const value = JSON.parse(localStorage.getItem(`${STORAGE_KEY}.compare`) || '[]'); return Array.isArray(value) ? value : []; }
    catch { return []; }
  }

  function writeSites() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));
      return true;
    } catch {
      setStatus('error', 'Не вдалося зберегти локальні дані');
      return false;
    }
  }

  function utcFieldValue(date = new Date()) {
    return date.toISOString().slice(0, 16);
  }

  function setStatus(kind, text) {
    status.className = `source-status ${kind || ''}`.trim();
    statusText.textContent = text;
  }

  function geoToPolar(lat, lon) {
    const phi = lat * Math.PI / 180;
    const lambda = lon * Math.PI / 180;
    const rho = 2 * R * Math.tan(Math.PI / 4 + phi / 2);
    return { x: rho * Math.sin(lambda), y: -rho * Math.cos(lambda) };
  }

  function polarToGeo(x, y) {
    const rho = Math.hypot(x, y);
    const lat = (-Math.PI / 2 + 2 * Math.atan(rho / (2 * R))) * 180 / Math.PI;
    let lon = Math.atan2(x, -y) * 180 / Math.PI;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    return { lat, lon };
  }

  function resize() {
    const rect = shell.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
    requestImage();
  }

  function viewBounds() {
    const w = shell.clientWidth;
    const h = shell.clientHeight;
    return [center.x - w * resolution / 2, center.y - h * resolution / 2, center.x + w * resolution / 2, center.y + h * resolution / 2];
  }

  function requestImage() {
    clearTimeout(requestTimer);
    requestTimer = setTimeout(loadImage, 180);
  }

  function loadImage() {
    const w = shell.clientWidth;
    const h = shell.clientHeight;
    if (!w || !h) return;
    const [xmin, ymin, xmax, ymax] = viewBounds();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = `${Math.min(2400, Math.round(w * dpr))},${Math.min(1800, Math.round(h * dpr))}`;
    const params = new URLSearchParams({ bbox: [xmin, ymin, xmax, ymax].join(','), bboxSR: String(WKID), imageSR: String(WKID), size, format: 'jpg', f: 'image' });
    const serial = ++requestSerial;
    const nextImage = new Image();
    nextImage.onload = () => {
      if (serial !== requestSerial) return;
      image = nextImage;
      imageBounds = [xmin, ymin, xmax, ymax];
      didLoad = true;
      message.classList.add('hidden');
      setStatus('online', showingTerrain ? 'Рельєф NASA LOLA доступний' : 'Карта NASA LRO доступна');
      render();
    };
    nextImage.onerror = () => {
      if (serial !== requestSerial) return;
      image = null;
      imageBounds = null;
      message.classList.remove('hidden');
      message.classList.add('failed');
      message.querySelector('strong').textContent = 'Карта тимчасово недоступна';
      message.querySelector('small').textContent = 'Спробуйте оновити карту; вибір координат вручну залишається доступним.';
      document.getElementById('retryMap').hidden = false;
      setStatus('error', 'NASA ImageServer не відповідає');
      render();
    };
    if (!didLoad) setStatus('', 'Завантаження карти NASA…');
    message.classList.remove('hidden', 'failed');
    document.getElementById('retryMap').hidden = true;
    message.querySelector('strong').textContent = 'Запит карти';
    message.querySelector('small').textContent = 'Отримуємо зображення з NASA Moon Trek';
    nextImage.src = `${showingTerrain ? DEM_ENDPOINT + '/exportImage' : IMAGE_ENDPOINT}?${params.toString()}`;
  }

  function screenPoint(projected) {
    return { x: shell.clientWidth / 2 + (projected.x - center.x) / resolution, y: shell.clientHeight / 2 - (projected.y - center.y) / resolution };
  }

  function drawMarker(lat, lon, active, label) {
    const p = screenPoint(geoToPolar(lat, lon));
    if (p.x < -30 || p.y < -30 || p.x > shell.clientWidth + 30 || p.y > shell.clientHeight + 30) return;
    ctx.save();
    ctx.strokeStyle = active ? '#c7ec7c' : '#73d8e8';
    ctx.fillStyle = active ? '#c7ec7c' : '#73d8e8';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = active ? 16 : 8;
    ctx.lineWidth = active ? 2 : 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, active ? 7 : 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x + 14, p.y); ctx.moveTo(p.x, p.y - 14); ctx.lineTo(p.x, p.y + 14); ctx.stroke();
    if (label) {
      ctx.shadowBlur = 0;
      ctx.font = '10px DM Mono, monospace';
      const width = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(5,14,22,.82)'; ctx.fillRect(p.x + 14, p.y - 17, width + 11, 20);
      ctx.fillStyle = '#e7f0f7'; ctx.fillText(label, p.x + 19, p.y - 4);
    }
    ctx.restore();
  }

  function render() {
    const w = shell.clientWidth;
    const h = shell.clientHeight;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    if (image && imageBounds) {
      const [xmin, ymin, xmax, ymax] = imageBounds;
      const left = w / 2 + (xmin - center.x) / resolution;
      const top = h / 2 - (ymax - center.y) / resolution;
      ctx.drawImage(image, left, top, (xmax - xmin) / resolution, (ymax - ymin) / resolution);
    }
    for (const site of sites) drawMarker(site.lat, site.lon, site.id === activeSavedId, site.name);
    if (selected) drawMarker(selected.lat, selected.lon, true, activeSavedId ? '' : 'ВИБРАНА ТОЧКА');
    const distanceKm = Math.round(resolution * 100 / 1000) * 10;
    document.getElementById('mapScale').textContent = distanceKm >= 1000 ? `${(distanceKm / 1000).toFixed(1)} тис. км` : `${distanceKm} км`;
  }

  function setPoint(lat, lon, savedId = null) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > -60 || lon < -180 || lon > 180) return;
    selected = { lat, lon };
    activeSavedId = savedId;
    selectedElevation = savedId ? (sites.find(site => site.id === savedId)?.surfaceData?.elevation ?? null) : null;
    renderElevation(selectedElevation ? 'cached' : 'loading');
    fetchElevation(lat, lon);
    latValue.textContent = `${lat.toFixed(6)}°`;
    lonValue.textContent = `${lon.toFixed(6)}°`;
    if (!savedId) {
      siteName.value = '';
      timeInput.value = utcFieldValue();
    }
    saveButton.disabled = false;
    saveButton.textContent = savedId ? 'Зберегти зміни' : '＋ Зберегти ділянку';
    deleteButton.disabled = !savedId;
    render();
  }

  function renderElevation(state, meters = null) {
    const value = document.getElementById('elevationValue');
    const badge = document.getElementById('elevationStatus');
    const explanation = document.getElementById('surfaceExplain');
    if (state === 'loading') { badge.textContent = 'ЗАВАНТАЖЕННЯ'; value.textContent = '…'; explanation.textContent = 'Запитуємо числове значення з NASA LOLA DEM (30 м/піксель).'; }
    else if (state === 'available' || state === 'cached') {
      value.textContent = `${meters >= 0 ? '+' : ''}${Number(meters).toFixed(0)} м`;
      badge.textContent = state === 'cached' ? 'З КЕШУ · ПЕРЕВІРКА' : 'ОТРИМАНО';
      explanation.textContent = `${DEM_SOURCE}. Висота відрахована від середнього радіуса Місяця 1 737 400 м; це не висота над локальним ґрунтом.`;
    } else if (state === 'no-data') { badge.textContent = 'НЕМАЄ ПІКСЕЛЯ'; value.textContent = 'Недоступна'; explanation.textContent = `NASA LOLA DEM не повернула числового значення для точки. Джерело: ${DEM_SOURCE}.`; }
    else if (state === 'error') { badge.textContent = 'ПОМИЛКА ДЖЕРЕЛА'; value.textContent = 'Недоступна'; explanation.textContent = 'Не вдалося отримати вимір із NASA ImageServer. Повторіть запит або перевірте доступність сервісу.'; }
    else { badge.textContent = 'ОЧІКУЄ ТОЧКУ'; value.textContent = '—'; explanation.textContent = 'Висота буде зчитана з DEM NASA LOLA для вибраної точки. Шар покриває широти 75–90° пд. ш., роздільна здатність — 30 м/піксель. Вибрана дата не змінює статичну модель рельєфу.'; }
  }

  async function fetchElevation(lat, lon) {
    const serial = ++elevationRequest;
    const point = geoToPolar(lat, lon);
    const geometry = JSON.stringify({ x: point.x, y: point.y, spatialReference: { wkid: WKID } });
    const params = new URLSearchParams({ geometry, geometryType: 'esriGeometryPoint', sr: String(WKID), returnGeometry: 'false', f: 'json' });
    try {
      const response = await fetch(`${DEM_ENDPOINT}/identify?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (serial !== elevationRequest) return;
      if (data.error) throw new Error(data.error.message || 'ArcGIS identify error');
      const elevation = Number(data.value);
      if (!Number.isFinite(elevation) || data.value === 'NoData' || data.value === null) {
        selectedElevation = null; renderElevation('no-data');
      } else {
        selectedElevation = elevation; renderElevation('available', elevation);
        if (activeSavedId) {
          sites = sites.map(site => site.id === activeSavedId ? { ...site, surfaceData: { ...site.surfaceData, elevation, unit: 'm relative to lunar mean radius 1737400 m', source: DEM_SOURCE, resolution: '30 m/pixel', availability: 'available' } } : site);
          writeSites(); renderSites();
        }
      }
    } catch (error) {
      if (serial !== elevationRequest) return;
      selectedElevation = null; renderElevation('error');
      console.warn('NASA LOLA elevation request failed:', error);
    }
  }

  function setMapLayer(terrain) {
    showingTerrain = terrain;
    document.getElementById('imageryLayer').classList.toggle('active', !terrain);
    document.getElementById('terrainLayer').classList.toggle('active', terrain);
    document.getElementById('imageryLayer').setAttribute('aria-pressed', String(!terrain));
    document.getElementById('terrainLayer').setAttribute('aria-pressed', String(terrain));
    document.getElementById('mapLayerLabel').textContent = terrain ? 'NASA MOON TREK · LRO LOLA DEM' : 'NASA MOON TREK · LRO WAC';
    document.getElementById('mapSourceInfo').textContent = terrain ? 'Джерело: LRO LOLA DEM South Pole 75°S v04 · 30 м/піксель' : 'Джерело: LRO LROC WAC Image Mosaic, S Pole v2 · 100 м/піксель';
    requestImage();
  }

  function setViewForPoint(lat, lon) {
    center = geoToPolar(lat, lon);
    resolution = Math.max(450, Math.min(resolution, 1700));
    render(); requestImage();
  }

  function formatDate(value) {
    if (!value) return 'Час не задано';
    return `${value.replace('T', ' ')} UTC`;
  }

  function renderSites() {
    document.getElementById('savedCount').textContent = `${sites.length} / 3+`;
    document.getElementById('siteCount').textContent = selected ? String(sites.length + (activeSavedId ? 0 : 1)).padStart(2, '0') : '—';
    if (!sites.length) {
      list.innerHTML = '<div class="empty-list">Виберіть точку на карті або введіть координати, щоб додати першу ділянку.</div>';
      renderComparisonControls(); render(); return;
    }
    list.innerHTML = sites.map(site => `<article class="site-card ${site.id === activeSavedId ? 'active' : ''}" data-id="${escapeHtml(site.id)}" tabindex="0" role="button" aria-label="Вибрати ділянку ${escapeHtml(site.name)}"><strong>${escapeHtml(site.name)}</strong><small>${site.lat.toFixed(5)}°, ${site.lon.toFixed(5)}°</small><small class="site-time">${escapeHtml(formatDate(site.time))}</small><small class="site-elevation">Висота: ${Number.isFinite(site.surfaceData?.elevation) ? `${site.surfaceData.elevation.toFixed(0)} м` : 'н/д'}</small><label class="compare-check" title="Додати до порівняння"><input type="checkbox" data-compare="${escapeHtml(site.id)}" ${compareIds.includes(site.id) ? 'checked' : ''} aria-label="Порівнювати ${escapeHtml(site.name)}"></label><button class="rename-site" aria-label="Перейменувати ${escapeHtml(site.name)}" title="Перейменувати">✎</button></article>`).join('');
    list.querySelectorAll('.site-card').forEach(card => {
      const choose = () => {
        const site = sites.find(item => item.id === card.dataset.id);
        if (!site) return;
        setPoint(site.lat, site.lon, site.id);
        siteName.value = site.name;
        timeInput.value = site.time || '';
        setViewForPoint(site.lat, site.lon);
        renderSites();
      };
      card.addEventListener('click', event => { if (!event.target.closest('.rename-site')) choose(); });
      card.addEventListener('keydown', event => { if (event.target === card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); choose(); } });
      card.querySelector('.rename-site').addEventListener('click', event => {
        event.stopPropagation();
        const site = sites.find(item => item.id === card.dataset.id);
        if (!site) return;
        setPoint(site.lat, site.lon, site.id);
        siteName.value = site.name;
        timeInput.value = site.time || '';
        setViewForPoint(site.lat, site.lon);
        renderSites();
        siteName.focus();
        siteName.select();
      });
      card.querySelector('[data-compare]').addEventListener('click', event => event.stopPropagation());
      card.querySelector('[data-compare]').addEventListener('change', event => {
        if (event.target.checked) { if (!compareIds.includes(card.dataset.id)) compareIds.push(card.dataset.id); }
        else compareIds = compareIds.filter(id => id !== card.dataset.id);
        compareIds = compareIds.filter(id => sites.some(site => site.id === id));
        localStorage.setItem(`${STORAGE_KEY}.compare`, JSON.stringify(compareIds));
        renderComparisonControls();
      });
    });
    renderComparisonControls(); render();
  }

  function renderComparisonControls() {
    compareIds = compareIds.filter(id => sites.some(site => site.id === id));
    document.getElementById('compareSelectionCount').textContent = String(compareIds.length);
    document.getElementById('compareSites').disabled = compareIds.length < 2;
    localStorage.setItem(`${STORAGE_KEY}.compare`, JSON.stringify(compareIds));
    const panel = document.getElementById('comparison');
    if (!panel.hidden) {
      if (compareIds.length >= 2) showComparison();
      else panel.hidden = true;
    }
  }

  function showComparison() {
    const rows = sites.filter(site => compareIds.includes(site.id));
    const panel = document.getElementById('comparison');
    if (rows.length < 2) return;
    panel.hidden = false;
    panel.innerHTML = `<h3>Порівняння · ${rows.length} ділянки</h3><div class="comparison-scroll"><table><thead><tr><th>Параметр</th>${rows.map(site => `<th>${escapeHtml(site.name)}</th>`).join('')}</tr></thead><tbody><tr><th>Координати</th>${rows.map(site => `<td>${site.lat.toFixed(5)}°, ${site.lon.toFixed(5)}°</td>`).join('')}</tr><tr><th>Момент дослідження</th>${rows.map(site => `<td>${escapeHtml(formatDate(site.time))}</td>`).join('')}</tr><tr><th>Висота LOLA</th>${rows.map(site => `<td>${Number.isFinite(site.surfaceData?.elevation) ? `${site.surfaceData.elevation.toFixed(0)} м` : 'Недоступна'}</td>`).join('')}</tr><tr><th>Джерела даних</th>${rows.map(site => { const sources = site.sources?.length ? site.sources : [{ name: 'NASA LRO WAC Mosaic South Pole v02', resolution: '100 m/pixel', url: `https://trek.nasa.gov/moon/trekarcgis/rest/services/${LAYER}/ImageServer` }, { name: site.surfaceData?.source || DEM_SOURCE, resolution: site.surfaceData?.resolution || '30 m/pixel', url: DEM_ENDPOINT }]; return `<td>${sources.map(source => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.name)} · ${escapeHtml(source.resolution)}</a>`).join('<br>')}</td>`; }).join('')}</tr></tbody></table></div>`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  document.getElementById('coordinateForm').addEventListener('submit', event => {
    event.preventDefault();
    const lat = Number(document.getElementById('manualLat').value);
    const lon = Number(document.getElementById('manualLon').value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat > -60 || lat < -90 || lon < -180 || lon > 180) return;
    setViewForPoint(lat, lon); setPoint(lat, lon);
  });

  document.getElementById('copyCoordinates').addEventListener('click', async () => {
    if (!selected) return;
    const button = document.getElementById('copyCoordinates');
    const text = `${selected.lat.toFixed(6)}, ${selected.lon.toFixed(6)} (planetocentric, deg; IAU 30120 source map)`;
    try { await navigator.clipboard.writeText(text); button.textContent = '✓'; setTimeout(() => { button.textContent = '⧉'; }, 1200); }
    catch { button.title = 'Буфер обміну недоступний'; }
  });

  saveButton.addEventListener('click', () => {
    if (!selected) return;
    const name = siteName.value.trim() || `Ділянка ${String(sites.length + 1).padStart(2, '0')}`;
    const previous = activeSavedId ? sites.find(item => item.id === activeSavedId) : null;
    const site = { id: activeSavedId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`), name: name.slice(0, 60), lat: selected.lat, lon: selected.lon, time: timeInput.value, coordinateType: 'user-geographic-planetocentric-degrees', sources: [{ name: 'NASA LRO WAC Mosaic South Pole v02', resolution: '100 m/pixel', url: `https://trek.nasa.gov/moon/trekarcgis/rest/services/${LAYER}/ImageServer` }, { name: DEM_SOURCE, resolution: '30 m/pixel', url: DEM_ENDPOINT }], surfaceData: { elevation: selectedElevation ?? previous?.surfaceData?.elevation ?? null, unit: 'm relative to lunar mean radius 1737400 m', source: DEM_SOURCE, resolution: '30 m/pixel', availability: selectedElevation !== null ? 'available' : 'unavailable' }, analysis: { illumination: null, earthPosition: null, sunPosition: null } };
    if (activeSavedId) sites = sites.map(item => item.id === activeSavedId ? site : item); else sites.push(site);
    activeSavedId = site.id; writeSites(); saveButton.textContent = 'Зберегти зміни'; deleteButton.disabled = false; renderSites();
  });

  function deleteActive() {
    if (!activeSavedId) return;
    sites = sites.filter(site => site.id !== activeSavedId);
    compareIds = compareIds.filter(id => id !== activeSavedId);
    selected = null; activeSavedId = null; latValue.textContent = '—'; lonValue.textContent = '—'; siteName.value = ''; saveButton.disabled = true; saveButton.textContent = '＋ Зберегти ділянку'; deleteButton.disabled = true;
    selectedElevation = null; elevationRequest++; renderElevation('none');
    writeSites(); renderSites();
  }
  deleteButton.addEventListener('click', deleteActive);
  document.getElementById('imageryLayer').addEventListener('click', () => setMapLayer(false));
  document.getElementById('terrainLayer').addEventListener('click', () => setMapLayer(true));
  document.getElementById('compareSites').addEventListener('click', showComparison);
  document.getElementById('clearCompare').addEventListener('click', () => { compareIds = []; list.querySelectorAll('[data-compare]').forEach(input => { input.checked = false; }); document.getElementById('comparison').hidden = true; renderComparisonControls(); });

  function zoom(factor, x = shell.clientWidth / 2, y = shell.clientHeight / 2) {
    const before = { x: center.x + (x - shell.clientWidth / 2) * resolution, y: center.y - (y - shell.clientHeight / 2) * resolution };
    resolution = Math.max(90, Math.min(9000, resolution * factor));
    center.x = before.x - (x - shell.clientWidth / 2) * resolution;
    center.y = before.y + (y - shell.clientHeight / 2) * resolution;
    render(); requestImage();
  }
  document.getElementById('zoomIn').addEventListener('click', () => zoom(.65));
  document.getElementById('zoomOut').addEventListener('click', () => zoom(1.55));
  document.getElementById('resetView').addEventListener('click', () => { center = { x: 0, y: 0 }; resolution = 1700; render(); requestImage(); });
  document.getElementById('retryMap').addEventListener('click', () => { message.querySelector('strong').textContent = 'Повторний запит карти'; requestImage(); });
  shell.addEventListener('wheel', event => { event.preventDefault(); const rect = shell.getBoundingClientRect(); zoom(event.deltaY < 0 ? .82 : 1.22, event.clientX - rect.left, event.clientY - rect.top); }, { passive: false });
  shell.addEventListener('pointerdown', event => {
    if (event.target.closest('.map-tools')) return;
    dragState = { x: event.clientX, y: event.clientY, centerX: center.x, centerY: center.y, moved: false, pointerId: event.pointerId };
    shell.setPointerCapture(event.pointerId);
  });
  shell.addEventListener('pointermove', event => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const dx = event.clientX - dragState.x; const dy = event.clientY - dragState.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) dragState.moved = true;
    if (dragState.moved) {
      center.x = dragState.centerX - dx * resolution;
      center.y = dragState.centerY + dy * resolution;
      render();
    }
  });
  shell.addEventListener('pointerup', event => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const moved = dragState.moved; dragState = null;
    shell.classList.remove('dragging');
    if (moved) { requestImage(); return; }
    if (!image) return;
    const rect = shell.getBoundingClientRect();
    const x = center.x + (event.clientX - rect.left - shell.clientWidth / 2) * resolution;
    const y = center.y - (event.clientY - rect.top - shell.clientHeight / 2) * resolution;
    const point = polarToGeo(x, y);
    if (point.lat < -90 || point.lat > -60) return;
    setPoint(point.lat, point.lon);
  });
  shell.addEventListener('pointercancel', () => { dragState = null; shell.classList.remove('dragging'); });
  shell.addEventListener('pointermove', () => { if (dragState?.moved) shell.classList.add('dragging'); });
  siteName.addEventListener('input', () => { saveButton.disabled = !selected; });
  window.addEventListener('resize', resize);
  timeInput.value = utcFieldValue();
  renderSites();
  renderComparisonControls();
  resize();
})();
