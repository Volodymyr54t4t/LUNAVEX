require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Anonymous browser workspaces keep Explorer data private to a persistent cookie.
app.use('/api/explorer', (req, res, next) => {
  pool.ready.then(() => next()).catch(error => {
    console.error('Explorer database unavailable:', error);
    res.status(503).json({ error: 'База даних Explorer наразі недоступна.' });
  });
});

app.use('/api/illumination', (req, res, next) => {
  pool.ready.then(() => next()).catch(error => {
    console.error('Illumination database unavailable:', error);
    res.status(503).json({ error: 'База даних аналізу освітленості наразі недоступна.' });
  });
});

function getExplorerWorkspaceId(req, res) {
  const cookie = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('lunavex_explorer_workspace='));
  const candidate = cookie ? decodeURIComponent(cookie.slice('lunavex_explorer_workspace='.length)) : '';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) return candidate;

  const workspaceId = require('node:crypto').randomUUID();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `lunavex_explorer_workspace=${workspaceId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
  return workspaceId;
}

function normalizeExplorerPayload(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.sites) || !Array.isArray(body.compareIds)) {
    throw new Error('Очікуються масиви sites і compareIds.');
  }
  if (body.sites.length > 500) throw new Error('У робочому наборі може бути не більше 500 ділянок.');

  const ids = new Set();
  const sites = body.sites.map(site => {
    if (!site || typeof site !== 'object') throw new Error('Некоректний запис ділянки.');
    const id = String(site.id || '');
    const name = String(site.name || '').trim();
    const lat = Number(site.lat);
    const lon = Number(site.lon);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || ids.has(id)) throw new Error('Некоректний або повторний ідентифікатор ділянки.');
    if (!name || name.length > 60) throw new Error('Назва ділянки має містити від 1 до 60 символів.');
    if (!Number.isFinite(lat) || lat < -90 || lat > -60 || !Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error('Координати ділянки поза допустимим діапазоном.');
    ids.add(id);

    const time = typeof site.time === 'string' ? site.time : '';
    if (time && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)) throw new Error('Дата й час мають бути у форматі UTC YYYY-MM-DDTHH:mm.');
    const sources = (Array.isArray(site.sources) ? site.sources : []).slice(0, 10).map(source => {
      const url = new URL(String(source?.url || ''));
      if (url.protocol !== 'https:' || url.hostname !== 'trek.nasa.gov') throw new Error('Дозволені лише посилання на джерела NASA Moon Trek.');
      return { name: String(source?.name || '').slice(0, 160), resolution: String(source?.resolution || '').slice(0, 80), url: url.toString() };
    });
    if (!sources.length) {
      sources.push(
        { name: 'NASA LRO WAC Mosaic South Pole v02', resolution: '100 m/pixel', url: 'https://trek.nasa.gov/moon/trekarcgis/rest/services/LRO_WAC_Mosaic_SPole60_100m_v02/ImageServer' },
        { name: 'NASA LRO LOLA DEM South Pole 75°S v04', resolution: '30 m/pixel', url: 'https://trek.nasa.gov/moon/trekarcgis/rest/services/LRO_LOLA_DEM_SPole75_30mp_v04/ImageServer' }
      );
    }
    const rawElevation = site.surfaceData?.elevation;
    const elevation = Number.isFinite(Number(rawElevation)) && rawElevation !== null ? Number(rawElevation) : null;
    const analysis = site.analysis && typeof site.analysis === 'object' ? site.analysis : {};
    return {
      id, name, lat, lon, time,
      coordinateType: String(site.coordinateType || 'user-geographic-planetocentric-degrees'),
      sources,
      surfaceData: {
        elevation,
        unit: String(site.surfaceData?.unit || 'm relative to lunar mean radius 1737400 m'),
        source: String(site.surfaceData?.source || 'NASA LRO LOLA DEM South Pole 75°S v04 (30 m/pixel)'),
        resolution: String(site.surfaceData?.resolution || '30 m/pixel'),
        availability: elevation === null ? String(site.surfaceData?.availability || 'unavailable') : 'available'
      },
      analysis: {
        illumination: analysis.illumination ?? null,
        earthPosition: analysis.earthPosition ?? null,
        sunPosition: analysis.sunPosition ?? null
      }
    };
  });
  const compareIds = [...new Set(body.compareIds.map(String))].filter(id => ids.has(id));
  return { sites, compareIds };
}

app.get('/api/explorer/workspace', async (req, res) => {
  try {
    const workspaceId = getExplorerWorkspaceId(req, res);
    const result = await pool.query('SELECT payload, updated_at FROM lunar_site_explorer_workspaces WHERE workspace_id = $1', [workspaceId]);
    if (!result.rowCount) return res.json({ exists: false, sites: [], compareIds: [] });
    res.json({ exists: true, ...result.rows[0].payload, updatedAt: result.rows[0].updated_at });
  } catch (error) {
    console.error('Explorer workspace read failed:', error);
    res.status(500).json({ error: 'Не вдалося завантажити дані Explorer.' });
  }
});

app.put('/api/explorer/workspace', async (req, res) => {
  try {
    const workspaceId = getExplorerWorkspaceId(req, res);
    const payload = normalizeExplorerPayload(req.body);
    const result = await pool.query(
      `INSERT INTO lunar_site_explorer_workspaces (workspace_id, payload, updated_at)
       VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (workspace_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP
       RETURNING updated_at`,
      [workspaceId, JSON.stringify(payload)]
    );
    res.json({ success: true, ...payload, updatedAt: result.rows[0].updated_at });
  } catch (error) {
    if (error instanceof TypeError || error.message.startsWith('Очікуються') || error.message.startsWith('У робочому') || error.message.startsWith('Некоректний') || error.message.startsWith('Назва') || error.message.startsWith('Координати') || error.message.startsWith('Дата') || error.message.startsWith('Дозволені')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Explorer workspace save failed:', error);
    res.status(500).json({ error: 'Не вдалося зберегти дані Explorer.' });
  }
});

const ILLUMINATION_MODEL = 'JPL Horizons observer ephemeris; Moon topocentric cylindrical site; airless apparent AZ/EL; model v1';
const HORIZONS_API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const LUNAR_MEAN_RADIUS_KM = 1737.4;

function parseHorizonCsv(result) {
  const marker = result.indexOf('$$SOE');
  const end = result.indexOf('$$EOE', marker);
  if (marker < 0 || end < 0) throw new Error('JPL Horizons не повернув таблицю часових вимірювань.');
  const rows = result.slice(marker + 5, end).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const data = rows.map(line => {
    const columns = line.split(',');
    const time = Date.parse(`${columns[0].trim().replace(/\s+/g, ' ')} UTC`);
    const azimuth = Number(columns[3]);
    const elevation = Number(columns[4]);
    if (!Number.isFinite(time) || !Number.isFinite(azimuth) || !Number.isFinite(elevation)) return null;
    return { time: new Date(time).toISOString(), azimuthDeg: azimuth, elevationDeg: elevation };
  }).filter(Boolean);
  if (data.length < 2) throw new Error('JPL Horizons повернув недостатньо валідних вимірювань.');
  return data;
}

function summarizeIllumination(data) {
  const events = [];
  for (let i = 1; i < data.length; i++) {
    const before = data[i - 1];
    const after = data[i];
    if ((before.elevationDeg < 0 && after.elevationDeg >= 0) || (before.elevationDeg >= 0 && after.elevationDeg < 0)) {
      const fraction = -before.elevationDeg / (after.elevationDeg - before.elevationDeg);
      const time = Date.parse(before.time) + fraction * (Date.parse(after.time) - Date.parse(before.time));
      events.push({ time: new Date(time).toISOString(), type: after.elevationDeg >= 0 ? 'rise' : 'set', bracketMinutes: (Date.parse(after.time) - Date.parse(before.time)) / 60000 });
    }
  }
  const start = Date.parse(data[0].time);
  const end = Date.parse(data[data.length - 1].time);
  const periods = [];
  let cursor = start;
  let illuminated = data[0].elevationDeg >= 0;
  for (const event of events) {
    const eventTime = Date.parse(event.time);
    if (eventTime > cursor) periods.push({ start: new Date(cursor).toISOString(), end: new Date(eventTime).toISOString(), illuminated, durationMinutes: (eventTime - cursor) / 60000 });
    cursor = eventTime;
    illuminated = event.type === 'rise';
  }
  if (end > cursor) periods.push({ start: new Date(cursor).toISOString(), end: new Date(end).toISOString(), illuminated, durationMinutes: (end - cursor) / 60000 });
  const totalMinutes = (end - start) / 60000;
  const lightMinutes = periods.filter(period => period.illuminated).reduce((sum, period) => sum + period.durationMinutes, 0);
  const elevations = data.map(row => row.elevationDeg);
  return {
    events, periods, totalMinutes, illuminatedMinutes: lightMinutes,
    darkMinutes: totalMinutes - lightMinutes,
    illuminatedPercent: totalMinutes ? lightMinutes / totalMinutes * 100 : 0,
    minElevationDeg: Math.min(...elevations), maxElevationDeg: Math.max(...elevations),
    crossingMethod: 'Linear interpolation between adjacent Horizons samples; each event is bracketed by one selected sample interval.'
  };
}

app.post('/api/illumination/analyze', async (req, res) => {
  try {
    const { site, startDate, endDate, stepMinutes } = req.body || {};
    const lat = Number(site?.lat);
    const lon = Number(site?.lon);
    const step = Number(stepMinutes);
    if (!Number.isFinite(lat) || lat < -90 || lat > -60 || !Number.isFinite(lon) || lon < -180 || lon > 180) return res.status(400).json({ error: 'Для аналізу введіть широту від −90° до −60° і довготу від −180° до 180°.' });
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const validDate = value => datePattern.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    if (!validDate(startDate) || !validDate(endDate) || endDate < startDate) return res.status(400).json({ error: 'Вкажіть коректні дати початку й завершення.' });
    if (!Number.isInteger(step) || step < 1 || step > 360) return res.status(400).json({ error: 'Часовий крок має бути цілим числом від 1 до 360 хвилин.' });
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const stop = Date.parse(`${endDate}T00:00:00Z`) + 86400000;
    const spanDays = (stop - start) / 86400000;
    if (spanDays > 30) return res.status(400).json({ error: 'Період аналізу не може перевищувати 30 діб.' });
    const sampleCount = Math.floor((stop - start) / (step * 60000)) + 1;
    if (sampleCount > 3000) return res.status(400).json({ error: `Занадто багато вимірювань (${sampleCount}). Збільште крок щонайменше до ${Math.ceil((stop - start) / (2999 * 60000))} хв.` });

    // Explorer stores planetocentric coordinates and LOLA height relative to the 1737.4 km mean radius.
    // Horizons cylindrical coordinates preserve that same planetocentric latitude and east longitude.
    const hasLolaElevation = site?.elevationM !== null && site?.elevationM !== undefined && Number.isFinite(Number(site.elevationM));
    const elevationOffsetM = hasLolaElevation ? Number(site.elevationM) : 0;
    const radialKm = LUNAR_MEAN_RADIUS_KM + elevationOffsetM / 1000;
    const latitudeRadians = lat * Math.PI / 180;
    const siteCoordinate = `${lon},${(radialKm * Math.cos(latitudeRadians)).toFixed(6)},${(radialKm * Math.sin(latitudeRadians)).toFixed(6)}`;
    const parameters = new URLSearchParams({
      format: 'json', COMMAND: '10', EPHEM_TYPE: 'OBSERVER', CENTER: 'coord@301',
      COORD_TYPE: 'CYLINDRICAL', SITE_COORD: siteCoordinate,
      START_TIME: `${startDate} 00:00`, STOP_TIME: `${new Date(stop).toISOString().slice(0, 10)} 00:00`,
      STEP_SIZE: `${step} min`, QUANTITIES: '4', ANG_FORMAT: 'DEG',
      TIME_TYPE: 'UT', TIME_DIGITS: 'SECONDS', CSV_FORMAT: 'YES'
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    let horizons;
    try {
      const response = await fetch(`${HORIZONS_API}?${parameters}`, { signal: controller.signal });
      horizons = await response.json();
      if (!response.ok || horizons.error) throw new Error(horizons.error || `JPL Horizons HTTP ${response.status}`);
    } finally { clearTimeout(timeout); }
    const data = parseHorizonCsv(horizons.result || '');
    const summary = summarizeIllumination(data);
    const lunarFrame = (horizons.result.match(/Center pole\/equ\s*:\s*([^\n]+)/i) || [])[1]?.trim() || null;
    res.json({ success: true, site: { name: String(site?.name || 'Ділянка').slice(0, 60), lat, lon, elevationM: hasLolaElevation ? elevationOffsetM : null }, parameters: { startDate, endDate, stepMinutes: step, timeStandard: 'JPL Horizons UT; timestamps after 1962 are UTC' }, model: ILLUMINATION_MODEL, lunarFrame, radiusAssumptionKm: hasLolaElevation ? null : LUNAR_MEAN_RADIUS_KM, sources: [{ name: 'JPL Horizons API — observer ephemeris', url: HORIZONS_API }, { name: 'Horizons manual — topocentric lunar sites and AZ/EL', url: 'https://ssd.jpl.nasa.gov/horizons/manual.html' }], terrain: { mode: 'geometric-horizon', used: false, limitation: 'Локальне затінення рельєфом не розраховане: окремий DEM-горизонт навколо ділянки не завантажувався.' }, data, summary });
  } catch (error) {
    console.error('Illumination analysis failed:', error);
    res.status(error.name === 'AbortError' ? 504 : 502).json({ error: error.name === 'AbortError' ? 'JPL Horizons не відповів за 45 секунд. Спробуйте ще раз.' : (error.message || 'Не вдалося отримати ефемериду JPL Horizons.') });
  }
});

app.get('/api/illumination/researches', async (req, res) => {
  try {
    const workspaceId = getExplorerWorkspaceId(req, res);
    const result = await pool.query('SELECT id, name, site, parameters, model_version, created_at FROM illumination_researches WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 50', [workspaceId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Illumination research list failed:', error);
    res.status(500).json({ error: 'Не вдалося завантажити збережені дослідження.' });
  }
});

app.get('/api/illumination/researches/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Некоректний ідентифікатор дослідження.' });
    const workspaceId = getExplorerWorkspaceId(req, res);
    const result = await pool.query('SELECT id, name, site, parameters, result, model_version, created_at FROM illumination_researches WHERE workspace_id = $1 AND id = $2', [workspaceId, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Дослідження не знайдено.' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Illumination research read failed:', error);
    res.status(500).json({ error: 'Не вдалося відкрити це дослідження.' });
  }
});

app.post('/api/illumination/researches', async (req, res) => {
  try {
    const workspaceId = getExplorerWorkspaceId(req, res);
    const { name, site, parameters, result } = req.body || {};
    if (!site || !parameters || !result || !Array.isArray(result.data) || result.data.length < 2 || result.data.length > 3000) return res.status(400).json({ error: 'Некоректний результат аналізу для збереження.' });
    const researchName = String(name || site.name || 'Дослідження освітленості').trim().slice(0, 100) || 'Дослідження освітленості';
    const saved = await pool.query('INSERT INTO illumination_researches (workspace_id, name, site, parameters, result, model_version) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6) RETURNING id, created_at', [workspaceId, researchName, JSON.stringify(site), JSON.stringify(parameters), JSON.stringify(result), ILLUMINATION_MODEL]);
    res.json({ success: true, ...saved.rows[0] });
  } catch (error) {
    console.error('Illumination research save failed:', error);
    res.status(500).json({ error: 'Не вдалося зберегти дослідження.' });
  }
});

app.post('/api/contact/send', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !subject || !message) {
      return res.status(400).json({ error: 'Будь ласка, заповніть ім’я, тему та повідомлення.' });
    }

    // Замість Telegram просто підтверджуємо прийом повідомлення
    console.log('Contact form received:', {
      name,
      email: email || 'не вказано',
      subject,
      message
    });

    res.json({ success: true, message: 'Повідомлення успішно отримано.' });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ error: error.message || 'Не вдалося обробити повідомлення.' });
  }
});

// ==================== ЕНЕРГЕТИЧНИЙ МОДУЛЬ (LunaEnergy AI) ====================

// POST /api/energy/calculate - Розрахунок ефективності сонячних панелей
app.post('/api/energy/calculate', async (req, res) => {
  const { angle, sunlight, temperature, dust } = req.body;
  
  try {
    // Валідація
    if (angle === undefined || angle < 0 || angle > 90) {
      return res.status(400).json({ error: 'Невірний кут (0-90°)' });
    }
    if (sunlight === undefined || sunlight < 0 || sunlight > 1) {
      return res.status(400).json({ error: 'Невірна інтенсивність (0-1)' });
    }
    if (dust === undefined || dust < 0 || dust > 1) {
      return res.status(400).json({ error: 'Невірний пиловий фактор (0-1)' });
    }

    // Розрахунок ефективності
    const efficiency = Math.cos((angle * Math.PI) / 180) * sunlight * (1 - dust);

    // Збереження в БД
    const result = await pool.query(
      'INSERT INTO energy_experiments (angle, sunlight, temperature, dust, efficiency) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [angle, sunlight, temperature, dust, efficiency]
    );

    res.json({
      success: true,
      efficiency: efficiency * 100,
      experiment: result.rows[0]
    });
  } catch (err) {
    console.error('Помилка енергетичного модуля:', err);
    res.status(500).json({ error: 'Помилка обробки запиту' });
  }
});

// GET /api/energy/experiments - Отримання всіх енергетичних експериментів
app.get('/api/energy/experiments', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM energy_experiments ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Помилка отримання даних' });
  }
});

// GET /api/energy/stats - Статистика енергетичних експериментів
app.get('/api/energy/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*)::text AS total,
        COALESCE(ROUND((AVG(efficiency) * 100)::numeric, 2), 0) AS avg_efficiency,
        COALESCE(ROUND((MIN(efficiency) * 100)::numeric, 2), 0) AS min_efficiency,
        COALESCE(ROUND((MAX(efficiency) * 100)::numeric, 2), 0) AS max_efficiency,
        COALESCE(ROUND(AVG(angle)::numeric, 1), 0) AS avg_angle,
        COALESCE(ROUND(AVG(temperature)::numeric, 1), 0) AS avg_temperature
      FROM energy_experiments
    `);

    res.json(result.rows[0] || {
      total: '0',
      avg_efficiency: '0.00',
      min_efficiency: '0.00',
      max_efficiency: '0.00',
      avg_angle: '0.0',
      avg_temperature: '0.0'
    });
  } catch (err) {
    console.error('Помилка обробки статистики:', err);
    res.status(500).json({ error: 'Помилка обробки запиту' });
  }
});

// POST /api/energy/clear - Очистити енергетичні експерименти
app.post('/api/energy/clear', async (req, res) => {
  try {
    await pool.query('DELETE FROM energy_experiments');
    res.json({ success: true, message: 'Усі енергетичні експерименти видалено' });
  } catch (err) {
    res.status(500).json({ error: 'Помилка очищення' });
  }
});

// POST /api/energy/compare - Порівняння Земля vs Місяць
app.post('/api/energy/compare', async (req, res) => {
  try {
    const { panelType = 'silicon' } = req.body;
    
    // Дані для різних типів панелей
    const panelData = {
      silicon: { 
        efficiency_earth: 18, 
        max_irradiance_earth: 1000, 
        max_irradiance_moon: 1361 
      },
      advanced: { 
        efficiency_earth: 22, 
        max_irradiance_earth: 1000, 
        max_irradiance_moon: 1361 
      },
      thin_film: { 
        efficiency_earth: 12, 
        max_irradiance_earth: 1000, 
        max_irradiance_moon: 1361 
      }
    };

    const panel = panelData[panelType] || panelData.silicon;
    
    // Розрахунок вироблення енергії
    const energy_earth_base = panel.efficiency_earth * panel.max_irradiance_earth * 0.01;
    const energy_moon_base = panel.efficiency_earth * panel.max_irradiance_moon * 0.01;
    
    // На Місяці немає атмосфери - 14 днів без сонця
    const energy_moon_effective = energy_moon_base * (14/29) * 0.95;
    
    res.json({
      panel_type: panelType,
      earth_generation_per_m2_day: parseFloat(energy_earth_base.toFixed(2)),
      moon_generation_per_m2_day: parseFloat(energy_moon_base.toFixed(2)),
      moon_generation_effective: parseFloat(energy_moon_effective.toFixed(2)),
      advantage_factor: parseFloat((energy_moon_effective / energy_earth_base).toFixed(2)),
      lunar_night_days: 14,
      panel_efficiency_earth: panel.efficiency_earth,
      panel_efficiency_moon: panel.efficiency_earth
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// POST /api/energy/dust-impact - Вплив пилу на панелі
app.post('/api/energy/dust-impact', async (req, res) => {
  try {
    const { dust_percentage = 50 } = req.body;
    
    // Прогноз накопичення пилу залежно від операції
    const dust_factor = 1 - (dust_percentage / 100);
    const efficiency_loss = (dust_percentage / 100) * 100;
    
    // Час до бажаної чистки
    const dust_accumulation_rate = 0.5; // відсотків на місяць
    const cleanup_interval = (100 - dust_percentage) / dust_accumulation_rate;

    res.json({
      current_dust_percentage: dust_percentage,
      efficiency_factor: parseFloat(dust_factor.toFixed(3)),
      efficiency_loss_percent: parseFloat(efficiency_loss.toFixed(2)),
      recommended_cleanup_interval_months: Math.ceil(cleanup_interval),
      power_generation_reduction_percent: parseFloat((efficiency_loss * 0.95).toFixed(2)),
      recommendation: dust_percentage > 60 
        ? '⚠️ КРИТИЧНО! Потрібна невідкладна чистка панелей!' 
        : dust_percentage > 40 
        ? '⚡ Рекомендується планова чистка' 
        : '✅ Стан нормальний'
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// POST /api/energy/roi - ROI калькулятор для місячної станції
app.post('/api/energy/roi', async (req, res) => {
  try {
    const { 
      panel_cost_usd = 5000, 
      panel_power_w = 300, 
      installation_cost = 10000,
      lunar_power_price_usd = 100 // за кВт
    } = req.body;

    // Розрахунок вироблення енергії за місяць
    const avg_generation_per_day = 50; // kWh за день (сонячна)
    const generation_per_month = avg_generation_per_day * 14; // 14 днів на місяці
    const total_generation_per_month = generation_per_month / 1000; // kWh

    // Ціна та прибуток
    const monthly_revenue = total_generation_per_month * lunar_power_price_usd;
    const total_cost = panel_cost_usd + installation_cost;
    const roi_months = total_cost / monthly_revenue;
    const yearly_profit = (monthly_revenue * 12) - (total_cost / roi_months);

    res.json({
      total_investment_usd: total_cost,
      monthly_revenue_usd: parseFloat(monthly_revenue.toFixed(2)),
      roi_months: parseFloat(roi_months.toFixed(1)),
      roi_years: parseFloat((roi_months / 12).toFixed(2)),
      yearly_profit_usd: parseFloat(yearly_profit.toFixed(2)),
      breakeven_point: `За ${Math.ceil(roi_months)} місяців`,
      viability: roi_months < 36 ? '✅ Високо прибутково!' : '⚠️ Довга окупність'
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// ==================== РАДІАЦІЙНИЙ МОДУЛЬ (LunaRadiation AI) ====================

// Коефіцієнти для матеріалів
const radiationCoefficients = {
  'Алюміній': 0.6,
  'Вода': 0.3,
  'Реголіт': 0.1
};

// POST /api/radiation/calculate - Розрахунок радіаційного захисту
app.post('/api/radiation/calculate', async (req, res) => {
  try {
    const { material, thickness, radiationLevel } = req.body;

    // Валідація
    const k = radiationCoefficients[material];
    if (!k) {
      return res.status(400).json({ error: 'Невідомий матеріал' });
    }

    // Розрахунок проникнення радіації
    const penetration = radiationLevel * Math.exp(-k * thickness);

    // Збереження в БД
    const result = await pool.query(
      'INSERT INTO radiation_experiments (material, thickness, radiation_level, penetration) VALUES ($1, $2, $3, $4) RETURNING *',
      [material, thickness, radiationLevel, penetration]
    );

    res.json({
      success: true,
      ...result.rows[0],
      penetration: Number(penetration.toFixed(2))
    });
  } catch (err) {
    console.error('Помилка радіаційного модуля:', err);
    res.status(500).json({ error: 'Помилка обробки запиту' });
  }
});

// GET /api/radiation/experiments - Отримання радіаційних експериментів
app.get('/api/radiation/experiments', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM radiation_experiments ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Помилка отримання даних' });
  }
});

// POST /api/radiation/clear - Очистити радіаційні експерименти
app.post('/api/radiation/clear', async (req, res) => {
  try {
    await pool.query('DELETE FROM radiation_experiments');
    res.json({ success: true, message: 'Усі радіаційні експерименти видалено' });
  } catch (err) {
    res.status(500).json({ error: 'Помилка очищення' });
  }
});

// POST /api/radiation/multi-layer - Многошарова захист
app.post('/api/radiation/multi-layer', async (req, res) => {
  try {
    const { layers } = req.body; // [{material, thickness}, ...]
    
    if (!Array.isArray(layers) || layers.length === 0) {
      return res.status(400).json({ error: 'Потрібні дані про шари' });
    }

    let totalPenetration = 100;
    let totalThickness = 0;
    let description = [];

    for (const layer of layers) {
      const k = radiationCoefficients[layer.material] || 0.1;
      totalPenetration *= Math.exp(-k * layer.thickness);
      totalThickness += layer.thickness;
      description.push(`${layer.material}: ${layer.thickness}см`);
    }

    res.json({
      layers: layers,
      total_thickness_cm: totalThickness,
      total_penetration_percent: parseFloat(totalPenetration.toFixed(2)),
      shielding_effectiveness: parseFloat(((100 - totalPenetration) / 100 * 100).toFixed(2)),
      composition: description.join(' + '),
      safety_level: totalPenetration < 5 ? '✅ Надійний' : 
                   totalPenetration < 20 ? '⚡ Середній' : '⚠️ Слабкий'
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// POST /api/radiation/astronaut-dose - Дозова еквівалент для космонавтів
app.post('/api/radiation/astronaut-dose', async (req, res) => {
  try {
    const { 
      material, 
      thickness, 
      mission_days = 180, 
      radiation_level = 100 
    } = req.body;

    const k = radiationCoefficients[material] || 0.1;
    const daily_exposure = radiation_level * Math.exp(-k * thickness);
    const total_dose = daily_exposure * mission_days;
    
    // Розрахунок SV (зівертів) екпозиції
    const dose_sv = total_dose / 1000;
    const max_safe_dose_sv = 1.0;
    const safety_percentage = (max_safe_dose_sv / dose_sv) * 100;

    res.json({
      material,
      thickness,
      mission_days,
      daily_exposure: parseFloat(daily_exposure.toFixed(2)),
      total_dose_mrem: parseFloat(total_dose.toFixed(2)),
      total_dose_sv: parseFloat(dose_sv.toFixed(4)),
      max_safe_dose_sv: max_safe_dose_sv,
      exceeds_limit: dose_sv > max_safe_dose_sv,
      safety_margin_percent: parseFloat(safety_percentage.toFixed(1)),
      health_risk: dose_sv > 1.0 ? '🔴 ВИСОКИЙ РИЗИК' : 
                   dose_sv > 0.5 ? '🟡 ПОМІРНИЙ РИЗИК' : 
                   '🟢 ДОПУСТИМО'
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// POST /api/radiation/optimal-material - Рекомендація оптимального матеріалу
app.post('/api/radiation/optimal-material', async (req, res) => {
  try {
    const { target_penetration = 10, available_space_cm = 50 } = req.body;

    const recommendations = [];

    for (const [material, coeff] of Object.entries(radiationCoefficients)) {
      const required_thickness = -Math.log(target_penetration / 100) / coeff;
      
      if (required_thickness <= available_space_cm) {
        recommendations.push({
          material,
          required_thickness: parseFloat(required_thickness.toFixed(2)),
          efficiency: 100 - target_penetration,
          space_available: available_space_cm,
          space_used: parseFloat(required_thickness.toFixed(2)),
          space_remaining: parseFloat((available_space_cm - required_thickness).toFixed(2)),
          feasible: true
        });
      }
    }

    recommendations.sort((a, b) => a.required_thickness - b.required_thickness);

    res.json({
      target_penetration_percent: target_penetration,
      available_space_cm,
      recommendations,
      best_option: recommendations[0] || null
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// ==================== ТЕРМОРЕГУЛЯЦІЙНИЙ МОДУЛЬ (LunaThermo AI) ====================

// Коефіцієнти теплопровідності матеріалів
const materialCoefficients = {
  aluminum: 205,
  plastic: 0.2,
  glass: 0.8,
  insulation: 0.04
};

// Функція для розрахунку рекомендацій
function getRecommendation(heatLoss) {
  if (heatLoss > 1000) {
    return 'Високі втрати тепла, рекомендується покращена ізоляція';
  } else if (heatLoss >= 300 && heatLoss <= 1000) {
    return 'Середні втрати тепла, варто покращити ізоляцію';
  } else {
    return 'Матеріал достатньо ефективний';
  }
}

// POST /api/thermo/lunar-cycle - Розрахунок дня/ночі цикл на Місяці
app.post('/api/thermo/lunar-cycle', async (req, res) => {
  try {
    const { material, thickness, area } = req.body;
    
    // Температури на Місяці: день ~127°C, ніч ~-173°C
    const day_temp = 127;
    const night_temp = -173;
    const temp_difference = day_temp - night_temp;

    const coefficient = materialCoefficients[material];
    
    // Розрахунок теплопотерь
    const heat_loss_day = coefficient * area * (day_temp / thickness);
    const heat_loss_night = coefficient * area * (Math.abs(night_temp) / thickness);
    
    // Тепловий стрес (теплові цикли)
    const thermal_stress_factor = temp_difference / 100;

    res.json({
      material,
      thickness,
      area,
      lunar_day_temp_celsius: day_temp,
      lunar_night_temp_celsius: night_temp,
      temperature_range: temp_difference,
      heat_loss_day_side: parseFloat(heat_loss_day.toFixed(2)),
      heat_loss_night_side: parseFloat(heat_loss_night.toFixed(2)),
      thermal_stress_factor: parseFloat(thermal_stress_factor.toFixed(2)),
      cycle_duration_days: 29.5,
      material_recommendation: thermal_stress_factor > 2 ? 'Потрібен матеріал з високою теплостійкістю' : 'Матеріал допустимий'
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// POST /api/thermo/thermal-balance - Тепловий баланс конструкції
app.post('/api/thermo/thermal-balance', async (req, res) => {
  try {
    const { 
      external_heat_source_w = 1000,
      internal_heat_generation_w = 500,
      material,
      thickness,
      area,
      outside_temp = -173
    } = req.body;

    const coefficient = materialCoefficients[material];
    const heat_loss = coefficient * area * (20 - outside_temp) / thickness;
    
    const total_heat_input = external_heat_source_w + internal_heat_generation_w;
    const balance = total_heat_input - heat_loss;
    
    const equilibrium_inside_temp = outside_temp + (total_heat_input * thickness) / (coefficient * area);

    res.json({
      external_heat_source_w,
      internal_heat_generation_w,
      total_heat_input: total_heat_input,
      heat_loss_to_space: parseFloat(heat_loss.toFixed(2)),
      thermal_balance: parseFloat(balance.toFixed(2)),
      equilibrium_temperature: parseFloat(equilibrium_inside_temp.toFixed(2)),
      surface_temp: outside_temp,
      status: balance > 0 ? '🔥 Надлишок тепла - потрібне охолодження' : 
              balance < -100 ? '❄️ Дефіцит тепла - потрібне нагрівання' : 
              '⚖️ Баланс близький до нуля'
    });
  } catch (err) {
    res.status(500).json({ error: 'Помилка розрахунку' });
  }
});

// POST /api/thermo/calculate - Розрахунок теплопередачі
app.post('/api/thermo/calculate', async (req, res) => {
  try {
    const { material, thickness, area, insideTemp, outsideTemp } = req.body;

    // Валідація
    const errors = [];
    if (!material || !materialCoefficients[material]) {
      errors.push('Невалідний матеріал');
    }
    if (!thickness || thickness <= 0) {
      errors.push('Товщина мусить бути більше 0');
    }
    if (!area || area <= 0) {
      errors.push('Площа мусить бути більше 0');
    }
    if (insideTemp === undefined || insideTemp === null) {
      errors.push('Вкажіть внутрішню температуру');
    }
    if (outsideTemp === undefined || outsideTemp === null) {
      errors.push('Вкажіть зовнішню температуру');
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // Отримання коефіцієнту
    const coefficient = materialCoefficients[material];

    // Розрахунок за формулою: Q = k * area * ((insideTemp - outsideTemp) / thickness)
    const tempDifference = insideTemp - outsideTemp;
    const heatLoss = coefficient * area * (tempDifference / thickness);

    // Отримання рекомендації
    const recommendation = getRecommendation(heatLoss);

    // Збереження в БД
    const result = await pool.query(
      `INSERT INTO thermo_experiments (material, thickness, area, inside_temp, outside_temp, coefficient, heat_loss, recommendation) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [material, thickness, area, insideTemp, outsideTemp, coefficient, heatLoss, recommendation]
    );

    res.json({
      success: true,
      result: {
        material,
        thickness: parseFloat(thickness),
        area: parseFloat(area),
        insideTemp: parseFloat(insideTemp),
        outsideTemp: parseFloat(outsideTemp),
        coefficient,
        heatLoss: parseFloat(heatLoss.toFixed(2)),
        recommendation,
        createdAt: new Date().toLocaleString('uk-UA')
      }
    });
  } catch (error) {
    console.error('Помилка термо модуля:', error);
    res.status(500).json({
      success: false,
      error: 'Помилка при розрахунку. Спробуйте пізніше.'
    });
  }
});

// GET /api/thermo/experiments - Отримання термо експериментів
app.get('/api/thermo/experiments', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM thermo_experiments ORDER BY created_at DESC'
    );

    const formattedExperiments = result.rows.map(exp => ({
      ...exp,
      created_at: new Date(exp.created_at).toLocaleString('uk-UA')
    }));

    res.json({
      success: true,
      data: formattedExperiments
    });
  } catch (error) {
    console.error('Помилка при отриманні експериментів:', error);
    res.status(500).json({
      success: false,
      error: 'Помилка при отриманні даних'
    });
  }
});

// POST /api/thermo/clear - Очистити термо експерименти
app.post('/api/thermo/clear', async (req, res) => {
  try {
    await pool.query('DELETE FROM thermo_experiments');
    res.json({ success: true, message: 'Усі термо експерименти видалено' });
  } catch (err) {
    res.status(500).json({ error: 'Помилка очищення' });
  }
});

// ==================== ARTEMIS 2 МОДУЛЬ ====================

// POST /api/artemis/compute-dv - Розрахунок delta-v для Artemis 2
app.post('/api/artemis/compute-dv', async (req, res) => {
  try {
    const { payloadMassKg = 0, stageEfficiency = 0.94 } = req.body;

    const baseDeltaV = {
      leo_circularization: 9.0,
      translunar_injection: 3.2,
      lunar_flyby: 0.6,
      return_trans_Earth: 0.8
    };

    const massFactor = 1 + Math.min(0.35, payloadMassKg / 20000);
    const deltaV = Object.values(baseDeltaV).reduce((sum, v) => sum + v, 0) * massFactor / stageEfficiency;
    const missionSegments = Object.entries(baseDeltaV).map(([phase, v]) => ({ phase, delta_v_kms: parseFloat((v * massFactor / stageEfficiency).toFixed(2)) }));

    res.json({
      success: true,
      payloadMassKg,
      stageEfficiency,
      delta_v_total_kms: parseFloat(deltaV.toFixed(2)),
      mission_segments: missionSegments,
      note: 'Архітектура розрахунку заснована на типових delta-v бюджетах для Artemis II та підлаштовується під додаткове навантаження.'
    });
  } catch (err) {
    console.error('Помилка Artemis delta-v:', err);
    res.status(500).json({ error: 'Помилка розрахунку delta-v' });
  }
});

// POST /api/artemis/compute-exposure - Розрахунок дозового впливу в Deep Space
app.post('/api/artemis/compute-exposure', async (req, res) => {
  try {
    const { missionDays = 21, shieldingMassKg = 150, solarActivityIndex = 1.0 } = req.body;
    const baseDoseRate = 0.6; // mSv/день для Deep Space протягом місії
    const shieldingFactor = Math.max(0.25, 1 - Math.min(0.8, shieldingMassKg / 500));
    const totalDose = baseDoseRate * missionDays * shieldingFactor * solarActivityIndex;
    const exposureRisk = totalDose > 50 ? '🔴 Високий ризик' : totalDose > 20 ? '🟡 Середній ризик' : '🟢 Низький ризик';

    res.json({
      success: true,
      missionDays,
      shieldingMassKg,
      solarActivityIndex,
      total_radiation_msv: parseFloat(totalDose.toFixed(2)),
      risk_level: exposureRisk,
      guidance: exposureRisk === '🔴 Високий ризик'
        ? 'Потрібен додатковий шар захисту та оптимізація траєкторії.'
        : 'Стан експозиції знаходиться в межах допустимого для Artemis 2.'
    });
  } catch (err) {
    console.error('Помилка Artemis exposure:', err);
    res.status(500).json({ error: 'Помилка розрахунку експозиції' });
  }
});

// POST /api/artemis/log-mission - Збереження сценарію Artemis
app.post('/api/artemis/log-mission', async (req, res) => {
  try {
    const { missionName, crewSize, missionDurationDays, deltaVTotal, radiationExposure, safetyIndex, missionNotes } = req.body;
    const result = await pool.query(
      `INSERT INTO artemis_missions (mission_name, crew_size, mission_duration_days, delta_v_total, radiation_exposure_msv, safety_index, mission_notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [missionName, crewSize, missionDurationDays, deltaVTotal, radiationExposure, safetyIndex, missionNotes]
    );

    res.json({ success: true, mission: result.rows[0] });
  } catch (err) {
    console.error('Помилка збереження Artemis місії:', err);
    res.status(500).json({ error: 'Помилка збереження місії' });
  }
});

// GET /api/artemis/experiments - Отримання Artemis сценаріїв
app.get('/api/artemis/experiments', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM artemis_missions ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Помилка отримання Artemis місій:', err);
    res.status(500).json({ error: 'Помилка отримання даних' });
  }
});

// GET /artemis - Сторінка модуля Artemis
app.get('/artemis', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'artemis', 'index.html'));
});

// GET /api/system/info - Системна інформація
app.get('/api/system/info', (req, res) => {
  const systemInfo = {
    version: '2.0.0-PWA',
    modules: [
      { name: 'LunaEnergy AI', status: 'active', experiments: 'dynamic' },
      { name: 'LunaRadiation AI', status: 'active', experiments: 'dynamic' },
      { name: 'LunaThermo AI', status: 'active', experiments: 'dynamic' },
      { name: 'Artemis 2 Lab', status: 'active', experiments: 'dynamic' }
    ],
    features: [
      'PWA Support',
      'Offline Mode',
      'Cross-platform',
      'Real-time Calculations',
      'Data Export (CSV/JSON)',
      'Advanced Analytics',
      'Mobile Responsive',
      'Global Search'
    ],
    technologies: ['Node.js', 'Express.js', 'PostgreSQL', 'Tailwind CSS', 'Chart.js', 'PWA'],
    last_updated: new Date().toISOString(),
    uptime: process.uptime(),
    memory_usage: process.memoryUsage(),
    platform: {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch
    }
  };
  res.json(systemInfo);
});

// GET /api/system/stats - Загальна статистика системи
app.get('/api/system/stats', async (req, res) => {
  try {
    const [energyStats, radiationStats, thermoStats, artemisStats] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM energy_experiments'),
      pool.query('SELECT COUNT(*) as count FROM radiation_experiments'),
      pool.query('SELECT COUNT(*) as count FROM thermo_experiments'),
      pool.query('SELECT COUNT(*) as count FROM artemis_missions')
    ]);

    const stats = {
      total_experiments: 
        parseInt(energyStats.rows[0].count) + 
        parseInt(radiationStats.rows[0].count) + 
        parseInt(thermoStats.rows[0].count) + 
        parseInt(artemisStats.rows[0].count),
      modules: {
        energy: parseInt(energyStats.rows[0].count),
        radiation: parseInt(radiationStats.rows[0].count),
        thermo: parseInt(thermoStats.rows[0].count),
        artemis: parseInt(artemisStats.rows[0].count)
      },
      last_activity: new Date().toISOString(),
      system_health: 'excellent'
    };

    res.json(stats);
  } catch (err) {
    console.error('Помилка отримання статистики:', err);
    res.status(500).json({ error: 'Помилка отримання статистики' });
  }
});

// GET / - Головна сторінка
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GET /api/modules - Список усіх модулів
app.get('/api/modules', (req, res) => {
  res.json({
    modules: [
      {
        id: 'energy',
        name: 'LunaEnergy AI',
        description: 'Ефективність сонячних панелей на Місяці',
        icon: '☀️',
        url: '/energy'
      },
      {
        id: 'radiation',
        name: 'LunaRadiation AI',
        description: 'Моделювання захисту від космічної радіації',
        icon: '☢️',
        url: '/radiation'
      },
      {
        id: 'thermo',
        name: 'LunaThermo AI',
        description: 'Моделювання теплопередачі на Місяці',
        icon: '🌡️',
        url: '/thermo'
      },
      {
        id: 'artemis',
        name: 'Artemis 2 Lab',
        description: 'Науковий модуль Artemis II: траєкторія, delta-v та радіація',
        icon: '🚀',
        url: '/artemis'
      }
    ]
  });
});

// Обробка помилок 404
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не знайдено' });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`
  🌕 ╔════════════════════════════════════════════════╗
  🌕 ║     LUNA AI RESEARCH CENTER UNIFIED 🌕          ║
  🌕 ║        Обєднана система досліджень Місяця       ║
  🌕 ╠════════════════════════════════════════════════╣
  🌕 ║  Сервер запущено на:  http://localhost:${PORT}   
  🌕 ║  
  🌕 ║  Доступні модулі:
  🌕 ║  ☀️  LunaEnergy - http://localhost:${PORT}/energy
  🌕 ║  ☢️  LunaRadiation - http://localhost:${PORT}/radiation
  🌕 ║  🌡️  LunaThermo - http://localhost:${PORT}/thermo
  🌕 ║  🚀  Artemis 2 Lab - http://localhost:${PORT}/artemis
  🌕 ║  
  🌕 ║  API: http://localhost:${PORT}/api
  🌕 ╚════════════════════════════════════════════════╝
  `);
});
