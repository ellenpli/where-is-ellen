'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeSine = t => 0.5 - Math.cos(Math.PI * t) / 2;
const RAD = Math.PI / 180;
const DAY = 86400000;
const wrapLng = l => ((((l + 180) % 360) + 360) % 360) - 180;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

function lerpAngle(a, b, t) { const d = ((b - a + 540) % 360) - 180; return (a + d * t + 360) % 360; }
function haversine(a, b) {
  const dLat = (b[1] - a[1]) * RAD, dLng = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
function headingDeg(a, b) {
  const y = Math.sin((b[0] - a[0]) * RAD) * Math.cos(b[1] * RAD);
  const x = Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) - Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos((b[0] - a[0]) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}
function fmtMin(m) {
  m = Math.round(m);
  const h = Math.floor(m / 60), mm = m % 60;
  return h ? (mm ? h + 'h ' + mm + 'm' : h + 'h') : mm + 'm';
}
function fmtHours(m) { return (Math.round(m / 6) / 10).toString().replace(/\.0$/, '') + 'h'; }
function parseISO(s) { const p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
function fmtDate(ms, dow) {
  return new Date(ms).toLocaleDateString('en-US', { weekday: dow ? 'short' : undefined, month: 'short', day: 'numeric', timeZone: 'UTC' });
}
const SVG = (inner, attrs) => '<svg viewBox="0 0 16 16" width="13" height="13" ' + (attrs || 'fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"') + '>' + inner + '</svg>';
const ICON = {
  train: SVG('<rect x="3.5" y="2" width="9" height="9.5" rx="2.2"/><path d="M3.5 8h9M6 14l1-2.5M10 14l-1-2.5"/>'),
  plane: SVG('<path d="M8 1.5c.6 0 1 .5 1 1.2V6l5 3v1.4l-5-1.4v3.1l1.6 1.2V15L8 14.2 5.4 15v-1.7L7 12.1V9l-5 1.4V9l5-3V2.7c0-.7.4-1.2 1-1.2z"/>', 'fill="currentColor"'),
  ferry: SVG('<path d="M2 10.2l1.4 3h9.2l1.4-3z"/><path d="M8 10V3.2M8 3.2l3.2 4.3H8"/>'),
  bus: SVG('<rect x="2.6" y="2.6" width="10.8" height="9" rx="2"/><path d="M2.6 8h10.8M5 14v-2.4M11 14v-2.4"/>')
};
ICON.car = ICON.bus;

function greatCircle(a, b, n) {
  const l1 = a[0] * RAD, p1 = a[1] * RAD, l2 = b[0] * RAD, p2 = b[1] * RAD;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  const out = [];
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = d ? Math.sin((1 - f) * d) / Math.sin(d) : 1 - f, B = d ? Math.sin(f * d) / Math.sin(d) : f;
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    const lat = Math.atan2(z, Math.hypot(x, y)) / RAD;
    let lng = Math.atan2(y, x) / RAD;
    if (prev !== null) { while (lng - prev > 180) lng -= 360; while (lng - prev < -180) lng += 360; }
    prev = lng;
    out.push([lng, lat]);
  }
  return out;
}
function smooth(pts, n) {
  if (pts.length < 3) return pts.map(p => p.slice());
  const refl = (a, b) => [2 * a[0] - b[0], 2 * a[1] - b[1]];
  const P = [refl(pts[0], pts[1])].concat(pts, [refl(pts[pts.length - 1], pts[pts.length - 2])]);
  const dist = (a, b) => Math.sqrt(Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 1e-6));
  const mix = (a, b, ta, tb, t) => [0, 1].map(j => ((tb - t) * a[j] + (t - ta) * b[j]) / (tb - ta));
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const t0 = 0, t1 = t0 + dist(p0, p1), t2 = t1 + dist(p1, p2), t3 = t2 + dist(p2, p3);
    for (let k = 0; k < n; k++) {
      const t = t1 + (t2 - t1) * (k / n);
      const A1 = mix(p0, p1, t0, t1, t), A2 = mix(p1, p2, t1, t2, t), A3 = mix(p2, p3, t2, t3, t);
      out.push(mix(mix(A1, A2, t0, t2, t), mix(A2, A3, t1, t3, t), t1, t2, t));
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
function liftArc(pts, k) {
  const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  pts.forEach((p, i) => { const s = Math.sin(Math.PI * i / (pts.length - 1)) * k * len; p[0] += nx * s; p[1] += ny * s; });
}
function measure(path) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1], path[i]));
  return cum;
}
function pointAt(path, cum, t) {
  const total = cum[cum.length - 1], d = clamp(t, 0, 1) * total;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const f = clamp((d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), 0, 1);
  return { p: [lerp(path[i - 1][0], path[i][0], f), lerp(path[i - 1][1], path[i][1], f)], hd: headingDeg(path[i - 1], path[i]) };
}
function slicePath(path, cum, t) {
  const total = cum[cum.length - 1], d = clamp(t, 0, 1) * total, out = [path[0]];
  for (let i = 1; i < path.length; i++) {
    if (cum[i] <= d) out.push(path[i]);
    else { const f = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); out.push([lerp(path[i - 1][0], path[i][0], f), lerp(path[i - 1][1], path[i][1], f)]); break; }
  }
  return out.length < 2 ? [path[0], path[0]] : out;
}
