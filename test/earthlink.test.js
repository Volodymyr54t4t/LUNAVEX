'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeVisibility, parseHorizonCsv } = require('../lib/earthlink');

const series = elevations => elevations.map((elevationDeg, i) => ({ time: new Date(Date.UTC(2026, 0, 1, i)).toISOString(), elevationDeg, azimuthDeg: 90, distanceKm: 384400 }));

test('detects rise/set, interpolates horizon crossings and totals visible intervals', () => {
  const summary = summarizeVisibility(series([-2, 2, 2, -2]));
  assert.equal(summary.crossings.length, 2);
  assert.equal(summary.crossings[0].type, 'rise');
  assert.equal(summary.crossings[0].time, '2026-01-01T00:30:00.000Z');
  assert.equal(summary.crossings[1].type, 'set');
  assert.equal(summary.visibleMinutes, 120);
  assert.ok(Math.abs(summary.visiblePercent - 200 / 3) < 1e-10);
});

test('handles always-visible and always-below-horizon records', () => {
  const visible = summarizeVisibility(series([1, 2, 3]));
  assert.equal(visible.crossings.length, 0);
  assert.equal(visible.visiblePercent, 100);
  assert.equal(visible.periods[0].visible, true);
  const hidden = summarizeVisibility(series([-3, -2, -1]));
  assert.equal(hidden.crossings.length, 0);
  assert.equal(hidden.visiblePercent, 0);
  assert.equal(hidden.periods[0].visible, false);
});

test('rejects insufficient or invalid time series', () => {
  assert.throws(() => summarizeVisibility([]), /щонайменше два/);
  assert.throws(() => summarizeVisibility([{ time: 'bad', elevationDeg: 0 }, { time: 'bad2', elevationDeg: 1 }]), /часова шкала/);
});

test('parses Horizons observer CSV fields and kilometer range', () => {
  const csv = 'header\n$$SOE\n 2026-Oct-11 00:00, , , 160.5, -3.25, 384400.0, 0.1\n 2026-Oct-11 00:15, , , 161.0, 1.25, 384401.0, 0.1\n$$EOE\n';
  const rows = parseHorizonCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].elevationDeg, -3.25);
  assert.equal(rows[0].distanceKm, 384400);
  assert.throws(() => parseHorizonCsv('no data'), /не повернув таблицю/);
});
