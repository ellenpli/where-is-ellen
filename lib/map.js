/* ---- the tilted paper map (from the October Japan map), with a palette per direction ---- */
const PALETTES = {
  paper: { land: '#f3efe6', landDeep: '#ece6d8', water: '#d3dedd', waterLine: '#c6d4d3', park: '#e4e8d6', wood: '#dce3cf', road: '#fffdf8', roadMinor: '#e8e2d4', roadCase: '#dcd5c5', rail: '#d6cfbe', building: '#e9e3d5', label: '#8f897b', halo: '#f6f2ea', boundary: '#bfb8a6', shadow: '#6f6a5d', high: '#ffffff', sky: '#dfe7ea', fog: '#f3efe6' },
  night: { land: '#16302f', landDeep: '#1a3836', water: '#0c1d1f', waterLine: '#0f2426', park: '#1b3a35', wood: '#1d3d37', road: '#2a4a46', roadMinor: '#21403d', roadCase: '#1a3533', rail: '#2c4a46', building: '#1f3d3a', label: '#7fa29b', halo: '#102526', boundary: '#3c5d58', shadow: '#05100f', high: '#3e6a63', sky: '#0b1a1b', fog: '#0f2223' },
  benesse: { land: '#f3eee3', landDeep: '#ece6d8', water: '#d3dbd4', waterLine: '#c6cfc8', park: '#e7e7d8', wood: '#e0e3d4', road: '#fbf8f1', roadMinor: '#e9e3d6', roadCase: '#ddd6c7', rail: '#d8d1c2', building: '#e8e2d5', label: '#8a8577', halo: '#f3eee3', boundary: '#c9c2b2', shadow: '#7a7466', high: '#ffffff', sky: '#ece8de', fog: '#f3eee3' },
  linen: { land: '#f6f1e7', landDeep: '#efe8da', water: '#dfe4e0', waterLine: '#d4dbd6', park: '#ebebdc', wood: '#e4e6d6', road: '#fffcf5', roadMinor: '#ece6d8', roadCase: '#e2dacb', rail: '#ddd5c4', building: '#ece5d7', label: '#9a9283', halo: '#f9f5ee', boundary: '#cdc5b3', shadow: '#7c766a', high: '#ffffff', sky: '#e8ecea', fog: '#f6f1e7' }
};
const MODEC = { train: '#c8432b', flight: '#2a2723', ferry: '#2f6f9f', bus: '#8a867c', taxi: '#8a867c', car: '#8a867c' };
const DEM_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];
const DROP = /^(highway-shield|road_shield|boundary_disputed|landcover_ice|landcover_glacier|poi|label_other|aerodrome)/;
let STYLE_JSON = null;
async function loadStyle(base) { if (!STYLE_JSON) STYLE_JSON = await (await fetch(base + 'vendor/positron.json')).json(); return STYLE_JSON; }
function buildStyle(PAL, opt) {
  const s = JSON.parse(JSON.stringify(STYLE_JSON)); opt = opt || {};
  /* hide the tile style's own labels for places the page pins itself (avoids doubled names) */
  const hide = opt.hideLabels && opt.hideLabels.length ? ['!', ['in', ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']], ['literal', opt.hideLabels]]] : null;
  const demSrc = { type: 'raster-dem', tiles: DEM_TILES, tileSize: 256, encoding: 'terrarium', maxzoom: 12 };
  s.sources.dem = Object.assign({ attribution: 'Terrain: Mapzen, AWS Open Data' }, demSrc); s.sources.dem2 = Object.assign({}, demSrc);
  s.layers = s.layers.filter(l => !DROP.test(l.id));
  const set = (l, o) => { l.paint = Object.assign(l.paint || {}, o); };
  s.layers.forEach(l => {
    const id = l.id;
    if (id === 'background') set(l, { 'background-color': PAL.land });
    else if (id === 'park') set(l, { 'fill-color': PAL.park });
    else if (id === 'landcover_wood') set(l, { 'fill-color': PAL.wood });
    else if (id === 'landuse_residential') set(l, { 'fill-color': PAL.landDeep });
    else if (id === 'water') set(l, { 'fill-color': PAL.water });
    else if (id === 'waterway') set(l, { 'line-color': PAL.waterLine });
    else if (id === 'building') { l.maxzoom = 14; set(l, { 'fill-color': PAL.building, 'fill-outline-color': PAL.landDeep }); }
    else if (id === 'aeroway-area') set(l, { 'fill-color': PAL.road });
    else if (l.type === 'line' && /casing/.test(id)) set(l, { 'line-color': PAL.roadCase });
    else if (l.type === 'line' && /^(railway)/.test(id)) set(l, { 'line-color': /dashline/.test(id) ? PAL.halo : PAL.rail });
    else if (l.type === 'line' && /^boundary/.test(id)) set(l, { 'line-color': PAL.boundary });
    else if (l.type === 'line' && /(minor|path|taxiway|subtle)/.test(id)) set(l, { 'line-color': PAL.roadMinor });
    else if (l.type === 'line' && /(highway|tunnel|bridge|aeroway)/.test(id)) set(l, { 'line-color': PAL.road });
    else if (l.type === 'symbol') {
      const big = /^label_(city|state|country)/.test(id);
      l.layout = Object.assign(l.layout || {}, { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']] });
      if (/^label_/.test(id)) l.layout['text-size'] = big ? ['interpolate', ['linear'], ['zoom'], 4, 8, 11, 11] : ['interpolate', ['linear'], ['zoom'], 7, 8, 12, 10];
      if (hide && /^label_/.test(id)) l.filter = l.filter ? ['all', l.filter, hide] : hide;
      set(l, { 'text-color': PAL.label, 'text-halo-color': PAL.halo, 'text-opacity': opt.quietLabels ? 0.6 : 0.9 });
    }
  });
  const wood = s.layers.findIndex(l => l.id === 'landcover_wood');
  s.layers.splice(wood + 1, 0, { id: 'hills', type: 'hillshade', source: 'dem2', paint: { 'hillshade-exaggeration': opt.hills || 0.3, 'hillshade-shadow-color': PAL.shadow, 'hillshade-highlight-color': PAL.high, 'hillshade-accent-color': PAL.shadow, 'hillshade-illumination-direction': 335 } });
  const wi = s.layers.findIndex(l => l.id === 'water'), water = s.layers.splice(wi, 1)[0];
  s.layers.splice(s.layers.findIndex(l => l.id === 'hills') + 1, 0, water);
  return s;
}
/* make a map with route layers; resolves once loaded */
function makeMap(el, o) {
  o = o || {}; const PAL = PALETTES[o.palette || 'paper'];
  const map = new maplibregl.Map({ container: el, style: buildStyle(PAL, o), center: o.center || [137.2, 35.4], zoom: o.zoom || 5.2, pitch: o.pitch != null ? o.pitch : 45, maxPitch: 75, attributionControl: false, fadeDuration: 100, interactive: o.interactive !== false });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  return new Promise(res => map.once('load', () => {
    if (o.terrain !== false) try { map.setTerrain({ source: 'dem', exaggeration: 1.35 }); } catch (e) {}
    try { map.setSky({ 'sky-color': PAL.sky, 'horizon-color': PAL.fog, 'fog-color': PAL.fog, 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.8 }); } catch (e) {}
    const fc = { type: 'FeatureCollection', features: [] };
    ['route', 'hl'].forEach(id => map.addSource(id, { type: 'geojson', data: fc }));
    const C = o.colors || MODEC, op = ['case', ['==', ['get', 'dim'], 1], o.dimOpacity || 0.3, 1];
    const L = (id, filter, paint, layout) => map.addLayer({ id, type: 'line', source: 'route', filter, paint, layout: Object.assign({ 'line-cap': 'round', 'line-join': 'round' }, layout || {}) });
    L('r-road', ['in', ['get', 'mode'], ['literal', ['bus', 'taxi', 'car']]], { 'line-color': C.bus, 'line-width': 2, 'line-opacity': op });
    L('r-train-case', ['==', ['get', 'mode'], 'train'], { 'line-color': o.caseColor || '#fffdf8', 'line-width': 6.5, 'line-opacity': op });
    L('r-train', ['==', ['get', 'mode'], 'train'], { 'line-color': C.train, 'line-width': 4, 'line-opacity': op });
    L('r-tick', ['==', ['get', 'mode'], 'train'], { 'line-color': o.caseColor || '#fff', 'line-width': 1.6, 'line-dasharray': [2, 3], 'line-opacity': op }, { 'line-cap': 'butt' });
    L('r-ferry', ['==', ['get', 'mode'], 'ferry'], { 'line-color': C.ferry, 'line-width': 3.5, 'line-dasharray': [0.1, 2], 'line-opacity': op });
    L('r-flight', ['==', ['get', 'mode'], 'flight'], { 'line-color': C.flight, 'line-width': 2.2, 'line-dasharray': [3, 2.5], 'line-opacity': op });
    map.addLayer({ id: 'hl', type: 'line', source: 'hl', paint: { 'line-color': o.accent || '#d6452c', 'line-width': 5, 'line-opacity': 0.9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    map.resize(); setTimeout(() => map.getContainer().querySelectorAll('.maplibregl-ctrl-attrib').forEach(a => a.classList.remove('maplibregl-compact-show')), 50); res(map);
  }));
}
const feat = (coords, props) => ({ type: 'Feature', properties: props || {}, geometry: { type: 'LineString', coordinates: coords } });
function drawRoute(map, steps, dimFn) { map.getSource('route').setData({ type: 'FeatureCollection', features: steps.map(s => feat(s.path, { mode: s.mode, dim: dimFn && dimFn(s) ? 1 : 0 })) }); }
function drawHl(map, paths) { map.getSource('hl').setData({ type: 'FeatureCollection', features: (paths || []).map(p => feat(p)) }); }
function pin(map, ll, html, cls, onClick, anchor) {
  const el = document.createElement('button'); el.type = 'button'; el.className = 'mk ' + (cls || ''); el.innerHTML = html; el.setAttribute('aria-label', (el.textContent || cls || 'marker').trim());
  if (onClick) el.addEventListener('click', e => { e.stopPropagation(); onClick(e); }); else el.tabIndex = -1;
  return new maplibregl.Marker({ element: el, anchor: anchor || 'center' }).setLngLat(ll).addTo(map);
}
function flyTo(map, o) {
  return new Promise(res => { let d = false; const fin = () => { if (!d) { d = true; res(); } }; map.once('moveend', fin); setTimeout(fin, (o.duration || 2000) + 800); map.flyTo(Object.assign({ essential: true, duration: 2000, curve: 1.4 }, o)); });
}
function fitTo(map, pts, o) {
  o = o || {}; if (!pts.length) return Promise.resolve();
  if (pts.length === 1) return flyTo(map, { center: pts[0], zoom: o.maxZoom || 11, pitch: o.pitch != null ? o.pitch : 50, bearing: o.bearing || 0, duration: o.duration, padding: o.padding });
  const b = new maplibregl.LngLatBounds(); pts.forEach(p => b.extend(p));
  /* an earlier padded flyTo leaves padding on the map; clear it so the card's space is not counted twice */
  if (map.setPadding) map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  const cam = map.cameraForBounds(b, { padding: o.padding || 60, maxZoom: o.maxZoom || 12, bearing: o.bearing || 0 });
  if (!cam) return Promise.resolve();
  return flyTo(map, { center: cam.center, zoom: cam.zoom - (o.out || 0.2), pitch: o.pitch != null ? o.pitch : 45, bearing: o.bearing || 0, duration: o.duration || 2000 });
}
/* ride one step of the route with the camera; returns when done or cancelled */
function rideStep(map, s, isLive, o) {
  o = o || {};
  return new Promise(res => {
    const km = s.cum[s.cum.length - 1], long = km > 3000, dur = clamp(km * (s.mode === 'flight' ? 5 : 14) + 1400, 1600, long ? 8000 : 5200);
    const z0 = map.getZoom(), zEnd = o.zoomEnd || 9.5, zMid = long ? 2.4 : clamp(10 - Math.log2(Math.max(km, 20) / 40), 5, 10);
    let hd = map.getBearing(); const t0 = performance.now();
    (function frame(nowMs) {
      if (!isLive()) return res();
      const u = clamp((nowMs - t0) / dur, 0, 1), e = easeSine(u), pt = pointAt(s.path, s.cum, e), bump = Math.sin(Math.PI * e);
      drawHl(map, [slicePath(s.path, s.cum, e)]); if (o.onPoint) o.onPoint(pt, e, s);
      hd = lerpAngle(hd, long ? 0 : pt.hd, 0.04);
      map.jumpTo({ center: [wrapLng(pt.p[0]), pt.p[1]], zoom: lerp(z0, zEnd, e) * (1 - bump) + zMid * bump, pitch: long ? 25 : 48 + 8 * bump, bearing: long ? 0 : hd, padding: o.padding || 0 });
      if (u < 1) requestAnimationFrame(frame); else res();
    })(t0);
  });
}
