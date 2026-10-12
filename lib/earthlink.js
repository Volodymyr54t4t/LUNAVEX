'use strict';

function parseHorizonCsv(result) {
  const marker = result.indexOf('$$SOE');
  const end = result.indexOf('$$EOE', marker);
  if (marker < 0 || end < 0) throw new Error('JPL Horizons не повернув таблицю часових вимірювань.');
  const data = result.slice(marker + 5, end).split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const columns = line.split(',');
    const timestamp = Date.parse(`${columns[0].trim().replace(/\s+/g, ' ')} UTC`);
    const azimuthDeg = Number(columns[3]);
    const elevationDeg = Number(columns[4]);
    // RANGE_UNITS=KM: quantity 20 contributes range after AZ/EL.
    const distanceKm = Number(columns[5]);
    if (!Number.isFinite(timestamp) || !Number.isFinite(azimuthDeg) || !Number.isFinite(elevationDeg)) return null;
    return { time: new Date(timestamp).toISOString(), azimuthDeg, elevationDeg, distanceKm: Number.isFinite(distanceKm) ? distanceKm : null };
  }).filter(Boolean);
  if (data.length < 2) throw new Error('JPL Horizons повернув недостатньо валідних вимірювань.');
  return data;
}

function summarizeVisibility(data) {
  if (!Array.isArray(data) || data.length < 2) throw new Error('Для аналізу потрібні щонайменше два вимірювання.');
  const startMs = Date.parse(data[0].time);
  const endMs = Date.parse(data.at(-1).time);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new Error('Некоректна часова шкала вимірювань.');
  const crossings = [];
  for (let i = 1; i < data.length; i++) {
    const a = data[i - 1], b = data[i];
    const aboveA = a.elevationDeg >= 0, aboveB = b.elevationDeg >= 0;
    if (aboveA !== aboveB) {
      const fraction = (0 - a.elevationDeg) / (b.elevationDeg - a.elevationDeg);
      const time = Date.parse(a.time) + fraction * (Date.parse(b.time) - Date.parse(a.time));
      crossings.push({ time: new Date(time).toISOString(), type: aboveB ? 'rise' : 'set', bracketMinutes: (Date.parse(b.time) - Date.parse(a.time)) / 60000 });
    }
  }
  const periods = [];
  let cursor = startMs, visible = data[0].elevationDeg >= 0;
  for (const event of crossings) {
    const t = Date.parse(event.time);
    if (t > cursor) periods.push({ start: new Date(cursor).toISOString(), end: new Date(t).toISOString(), visible, durationMinutes: (t - cursor) / 60000 });
    cursor = t; visible = event.type === 'rise';
  }
  if (endMs > cursor) periods.push({ start: new Date(cursor).toISOString(), end: new Date(endMs).toISOString(), visible, durationMinutes: (endMs - cursor) / 60000 });
  const totalMinutes = (endMs - startMs) / 60000;
  const visibleMinutes = periods.filter(x => x.visible).reduce((sum, x) => sum + x.durationMinutes, 0);
  return {
    crossings, periods, totalMinutes, visibleMinutes,
    visiblePercent: totalMinutes ? visibleMinutes / totalMinutes * 100 : 0,
    minElevationDeg: Math.min(...data.map(x => x.elevationDeg)),
    maxElevationDeg: Math.max(...data.map(x => x.elevationDeg)),
    criterion: 'Earth-center airless apparent elevation ≥ 0° relative to Horizons geometric local horizontal plane.',
    crossingMethod: 'Linear interpolation between adjacent ephemeris samples; bracket width is reported for every crossing.'
  };
}

module.exports = { parseHorizonCsv, summarizeVisibility };
