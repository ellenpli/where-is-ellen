/* ---- Follow E, Benesse: a plain serif home, a map plate that opens, a page per stop ---- */
const E = { W: null, map: null, marks: [], me: null, spot: null, sel: null, mode: 'home', playing: 0, tall: false };
const isPhone = () => innerWidth <= 820;
const ROUTE = { colors: { train: '#3b4390', flight: '#2b2b2e', ferry: '#5f7fa0', bus: '#8a867c', taxi: '#8a867c', car: '#8a867c' }, caseColor: '#f3eee3', accent: '#3b4390' };

bootFollow(async W => {
  E.W = W; $('#port').appendChild($('#stage'));
  tick(); renderLine();
  $('#portbtn').onclick = $('#portlink').onclick = () => enterMap(curLegIndex());
  $('#back').onclick = exitMap;
  $('#prev').onclick = () => { stopPlay(); go(E.sel == null || E.sel < 0 ? 0 : E.sel - 1); };
  $('#next').onclick = () => { stopPlay(); go(E.sel == null || E.sel < 0 ? 0 : E.sel + 1); };
  $('#play').onclick = () => E.playing ? stopPlay() : playStops();
  addEventListener('keydown', e => {
    if (E.mode !== 'map' || !$('#lightbox').hidden) return;
    if (e.key === 'Escape') exitMap();
    if (e.key === 'ArrowRight') $('#next').click();
    if (e.key === 'ArrowLeft') $('#prev').click();
  });
  addEventListener('resize', () => { clearTimeout(E.rt); E.rt = setTimeout(() => { if (E.map) E.map.resize(); }, 200); });
  setInterval(tick, 30000);
  await loadStyle(FOLLOW.base);
  E.map = await makeMap('map', Object.assign({ palette: 'benesse', pitch: 45, zoom: 10, hills: 0.22, hideLabels: W.legs.map(l => l.place) }, ROUTE));
  interactive(false); paint(); homeCamera(0);
});
/* ---------- home: the answer in words ---------- */
function tick() {
  const t = CLOCK.now(), W = E.W, st = W.status(t);
  $('#tyo').textContent = clk(t, TZJ); $('#nyc').textContent = clk(t, TZE);
  $('#day').textContent = dayLong(dayKey(t)) + ', in Japan';
  $('#status').textContent = st.h; $('#say').textContent = st.sub || '';
  const nm = W.nextMove(st.phase === 'moving' && st.move ? st.move.t1 : t);
  $('#nextrow').hidden = !nm;
  if (nm) $('#nextsay').textContent = ({ flight: 'Flight to ', ferry: 'Boat to ', train: 'Train to ' }[nm.main.mode] || 'On to ') + W.dest(nm);
  const ph = shownPhotos(W, t)[0], lt = $('#latest');
  if (ph) {
    lt.hidden = false;
    if (lt.dataset.id !== ph.id) { lt.dataset.id = ph.id; photoSrc(ph).then(s => lt.querySelector('img').src = s); }
    const l = W.leg(ph.leg); $('#latestcap').textContent = ph.caption + (l ? ' · ' + l.place : '');
    $('#latestbtn').onclick = () => openLightbox(shownPhotos(W, CLOCK.now()), 0);
  } else lt.hidden = true;
  $('#line').style.setProperty('--p', linePos(t).toFixed(4));
  $('#fine').textContent = (CLOCK.simulated ? 'Simulated time: ' + dayLabel(dayKey(t)) + ', ' + clk(t) + ' in Tokyo. ' : '') + 'Where Ellen is comes from her itinerary, not GPS.';
  renderLine(); if (E.mode === 'map') renderDock();
  if (E.map && E.mode === 'home') paint();
}
function untilText(d) { const m = Math.round(d / 6e4), h = Math.floor(m / 60), dd = Math.floor(h / 24); return 'in ' + (dd ? dd + 'd ' + (h % 24) + 'h' : h ? h + 'h ' + (m % 60) + 'm' : m + ' min'); }
function linePos(t) {
  const W = E.W, st = W.status(t), N = W.legs.length + 1;
  if (st.phase === 'before') return 0; if (st.phase === 'home') return 1;
  if (st.phase === 'moving') { const m = st.move, b = m.leg ? m.leg.i + 1 : N, prev = W.legs.filter(l => l.t1 <= m.t0 + 6e5).pop(), a = prev ? prev.i + 1 : 0; return (a + (b - a) * clamp((t - m.t0) / (m.t1 - m.t0), 0, 1)) / N; }
  return (st.leg.i + 1) / N;
}
function curLegIndex() { const st = E.W.status(CLOCK.now()); const l = st.leg || (st.move && st.move.leg); return st.phase === 'before' ? 0 : st.phase === 'home' ? E.W.legs.length - 1 : l ? l.i : 0; }
function renderLine() {
  const W = E.W, p = linePos(CLOCK.now()), N = W.legs.length + 1;
  const st = [{ nm: 'New York', dt: 'Nov 4', ends: 1 }].concat(W.legs.map(l => ({ nm: l.place, dt: rangeText(l).replace('Nov ', '').replace(' – ', '–'), leg: l })), [{ nm: 'Home', dt: 'Nov 24', ends: 1 }]);
  $('#stations').innerHTML = st.map((s, i) => '<li class="' + (i / N < p - 1e-6 ? 'past' : Math.abs(i / N - p) < 1e-6 ? 'on' : '') + (s.ends ? ' ends' : '') + '"><button type="button" data-i="' + (s.leg ? s.leg.i : -1) + '"><span class="st"></span><span class="nm">' + esc(s.nm) + '</span><span class="dt">' + esc(s.dt) + '</span></button></li>').join('');
  $$('#stations button').forEach(b => b.onclick = () => enterMap(+b.dataset.i));
}
/* ---------- the map: a plate at home, full screen when opened ---------- */
const HANDLERS = ['scrollZoom', 'boxZoom', 'dragRotate', 'dragPan', 'keyboard', 'doubleClickZoom', 'touchZoomRotate'];
function interactive(on) { if (!E.map) return; HANDLERS.forEach(h => E.map[h] && E.map[h][on ? 'enable' : 'disable']()); if (on && !E.nav) { E.nav = new maplibregl.NavigationControl({ showCompass: false }); E.map.addControl(E.nav, 'top-left'); } }
function paint() {
  const W = E.W, t = CLOCK.now(), st = W.status(t), map = E.map; if (!map) return;
  const sl = E.sel != null && E.sel >= 0 ? W.legs[E.sel] : null, inMove = sl && W.moves.find(m => m.leg === sl && m.major);
  /* a selected stop shows how she gets there, each leg in its own line style (boat dotted, train solid, flight dashed); the rest fades */
  if (E.mode === 'map' && inMove) { drawRoute(map, W.steps, s => s.move !== inMove); drawHl(map, []); }
  else { drawRoute(map, W.steps, s => s.t1 > t); drawHl(map, st.step ? [slicePath(st.step.path, st.step.cum, st.f)] : []); }
  E.marks.forEach(m => m.remove()); E.marks = [];
  const seen = {};
  W.legs.forEach(l => {
    if (seen[l.place]) return; seen[l.place] = 1;
    const on = sl ? sl.place === l.place : false, hereNow = st.phase === 'stay' && st.leg && st.leg.place === l.place;
    /* when the next stop sits close by (Miyanoshita and Hakone), this label goes on the left so they don't overlap */
    const near = W.legs.find(o => o.i > l.i && o.place !== l.place && haversine(o.ll, l.ll) < 25);
    E.marks.push(pin(map, l.ll, near ? '<span class="lab">' + esc(l.place) + '</span><i></i>' : '<i></i><span class="lab">' + esc(l.place) + '</span>', 'stop' + (on ? ' sel' : '') + (hereNow ? ' here' : ''), () => enterMap(sl && sl.place === l.place ? sl.i : l.i), near ? 'right' : 'left'));
  });
  /* places as small dots for the open stop; photos live only in the stop page */
  if (E.mode === 'map' && sl) shownPicks(W, t, sl.id).forEach(p => { const m = pin(map, p.ll, '', 'pick', () => openPlace(p)); m.getElement().dataset.pk = p.id; E.marks.push(m); });
  if (E.me) E.me.remove();
  E.me = new maplibregl.Marker({ element: Object.assign(document.createElement('div'), { className: 'me' }) }).setLngLat(st.ll).addTo(map);
}
function homeCamera(dur) {
  const st = E.W.status(CLOCK.now());
  if (st.step && st.step.cum[st.step.cum.length - 1] > 3000) return fitTo(E.map, st.step.path, { padding: 20, pitch: 10, maxZoom: 2, duration: dur });
  return flyTo(E.map, { center: st.ll, zoom: st.phase === 'stay' ? 10.6 : 7.5, pitch: 45, bearing: -12, duration: dur == null ? 1400 : dur, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
}
function pads() {
  const c = $('#card');
  if (isPhone()) return { top: 60, left: 20, right: 20, bottom: c.hidden ? 30 : Math.min(innerHeight * (E.tall ? 0.88 : 0.52), c.offsetHeight || innerHeight * 0.52) + 16 };
  return { top: 50, left: 70, bottom: 90, right: c.hidden ? 60 : c.offsetWidth + 60 };
}
async function enterMap(i) {
  const stage = $('#stage');
  if (E.mode !== 'map') {
    E.mode = 'map'; document.body.classList.add('mapmode');
    const r = stage.getBoundingClientRect();
    Object.assign(stage.style, { top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px' });
    stage.classList.add('full'); void stage.offsetWidth; stage.classList.add('fly');
    Object.assign(stage.style, { top: '0px', left: '0px', width: innerWidth + 'px', height: innerHeight + 'px' });
    resizeFor(760);
    $('#dock').hidden = false; interactive(true);
    await sleep(720); stage.classList.remove('fly'); Object.assign(stage.style, { width: '100vw', height: '100vh' }); E.map && E.map.resize();
  }
  go(i);
}
async function exitMap() {
  stopPlay(); clearSpot(); const stage = $('#stage'), slot = $('#slot').getBoundingClientRect();
  E.mode = 'home'; E.sel = null; $('#card').hidden = true; $('#dock').hidden = true; interactive(false);
  stage.classList.add('fly'); Object.assign(stage.style, { top: slot.top + 'px', left: slot.left + 'px', width: slot.width + 'px', height: slot.height + 'px' });
  resizeFor(760); homeCamera(700);
  await sleep(720); stage.classList.remove('fly', 'full'); stage.removeAttribute('style'); document.body.classList.remove('mapmode');
  if (E.map) { E.map.resize(); paint(); homeCamera(0); }
}
function resizeFor(ms) { const t0 = performance.now(); (function f(n) { if (E.map) E.map.resize(); if (n - t0 < ms) requestAnimationFrame(f); })(t0); }
/* stop by stop */
function go(i) {
  const W = E.W; i = Math.max(-1, Math.min(W.legs.length - 1, i)); E.sel = i; clearSpot();
  renderDock();
  if (i < 0) { $('#card').hidden = true; paint(); if (E.map) fitTo(E.map, W.steps.filter(s => s.cum[s.cum.length - 1] < 3000).flatMap(s => [s.path[0], s.path[s.path.length - 1]]), { padding: pads(), pitch: 40, bearing: -8 }); return; }
  const l = W.legs[i]; renderCard(l); paint();
  if (!E.map) return;
  /* a stop reached by a mixed journey (boat, then trains) opens on the whole route so each leg is visible */
  const m = W.moves.find(x => x.leg === l && x.major), modes = m ? new Set(m.steps.filter(s => !(s.est && s.t1 - s.t0 < 50 * 6e4)).map(s => s.mode)) : null;
  if (m && modes.size > 1 && haversine(m.steps[0].frm.ll, l.ll) < 900) return fitTo(E.map, m.steps.flatMap(s => s.path).concat([l.ll]), { padding: pads(), pitch: 35, bearing: -8, maxZoom: 11 });
  flyTo(E.map, { center: l.ll, zoom: l.place === 'Tokyo' ? 11 : 11.6, pitch: 50, bearing: -12, padding: pads(), duration: 1800 });
}
function renderDock() {
  const W = E.W, t = CLOCK.now(), cur = curLegIndex();
  $('#dstations').innerHTML = W.legs.map(l => '<li class="' + (t >= l.t1 ? 'past' : '') + (l.i === cur && t < l.t1 && t >= W.start ? ' on' : '') + (l.i === E.sel ? ' sel' : '') + '"><button type="button" data-i="' + l.i + '"><span class="nm">' + esc(l.place) + '</span><span class="dt">' + rangeText(l) + '</span></button></li>').join('');
  $$('#dstations button').forEach(b => b.onclick = () => { stopPlay(); if (+b.dataset.i === E.sel && $('#card').hidden) renderCard(W.legs[E.sel]); else go(+b.dataset.i); });
  $('#dnow').textContent = E.sel >= 0 ? (E.sel + 1) + ' of ' + W.legs.length + ' · ' + W.legs[E.sel].place : 'The whole trip';
  $('#prev').disabled = E.sel <= 0; $('#next').disabled = E.sel >= W.legs.length - 1;
}
async function playStops() {
  const my = ++E.playing; $('#play').textContent = 'Stop';
  for (let i = 0; i < E.W.legs.length && E.playing === my; i++) { go(i); await sleep(4200); }
  if (E.playing === my) stopPlay();
}
function stopPlay() { E.playing = 0; const b = $('#play'); if (b) b.textContent = 'Play'; }
/* a place, shown on the map */
function clearSpot() {
  if (E.spot) { E.spot.remove(); E.spot = null; }
  $$('#card [data-pk]').forEach(b => b.classList.remove('on'));
  $$('.mk.pick').forEach(el => el.style.visibility = '');
  document.body.classList.remove('spotting');
}
function showSpot(p) {
  if (!E.map) return; clearSpot();
  E.spot = pin(E.map, p.ll, '<i></i><span>' + esc(p.name) + '</span>', 'spot', null, 'left');
  const b = $('#card [data-pk="' + p.id + '"]'); if (b) b.classList.add('on');
  $$('.mk.pick').forEach(el => el.style.visibility = el.dataset.pk === p.id ? 'hidden' : '');
  document.body.classList.add('spotting');
  if (isPhone() && E.tall) { E.tall = false; $('#card').classList.remove('tall'); }
  flyTo(E.map, { center: p.ll, zoom: 14.2, pitch: 50, bearing: -12, padding: pads(), duration: 1600 });
}
/* ---------- the stop page ---------- */
const placeShort = n => n.replace(/ Terminal \d/, '').replace(/ Station$/, '').replace(/ \(EWR\)/, '').replace(/ Port, Naoshima/, ', Naoshima');
const at = iso => { const tz = tzOf(iso), t = ms(iso); return WD[kd(dayKey(t, tz)).getUTCDay()] + ' ' + clk(t, tz) + (tz === TZE ? ' NY' : ''); };
function travelHtml(l, t) {
  const W = E.W, m = W.moves.find(m => m.leg === l && m.major); if (!m) return '';
  const s = m.main, from = placeShort(s.frm.name);
  if (t >= m.t1) return '<p class="travel done">' + (s.mode === 'flight' ? 'Arrived ' : 'Got in ') + at(m.steps[m.steps.length - 1].arr) + ', ' + ({ flight: 'flew', train: 'by train', ferry: 'by boat' }[s.mode]) + ' from ' + esc(from) + (s.number ? ' (' + esc(s.number) + ')' : '') + '.</p>';
  const legs = m.steps.filter(x => !(x.est && x.t1 - x.t0 < 50 * 6e4) || x === s);
  return '<div class="travel"><div class="tl">' + (t >= m.t0 ? 'On the way now' : 'Getting there') + '</div>' + legs.map(x => '<div class="lg"' + (t >= x.t1 ? ' style="opacity:.45"' : '') + '><div>' + esc((x.number ? x.number : MODE_NOUN[x.mode]) + ', ' + placeShort(x.frm.name) + ' → ' + placeShort(x.to.name)) + '</div><span>' + at(x.dep) + '</span></div>').join('') + '</div>';
}
/* the stop's days as an itinerary: a day heading, then rows with a time where one is known */
const WORDS = s => (s.toLowerCase().match(/[a-z0-9_]{4,}/g) || []).filter(w => !['with', 'from', 'back', 'tour', 'house', 'museum', 'project'].includes(w));
function timeFor(line, k, l) {
  const W = E.W, low = line.toLowerCase();
  const ev = W.events.find(e => e.date === k && (e.title.toLowerCase() === low || WORDS(e.title).some(w => WORDS(line).includes(w)) || e.title.toLowerCase().replace(/ tour$/, '') === low.replace(/ tour$/, '')));
  if (ev) return ms(ev.start);
  const mode = /\b(flight|fly)\b/.test(low) ? 'flight' : /\b(boat|ferry)\b/.test(low) ? 'ferry' : /\b(train|shinkansen|romancecar)\b/.test(low) ? 'train' : null;
  if (!mode) return null;
  const s = W.steps.find(x => x.mode === mode && dayKey(x.t0) === k) || W.steps.find(x => x.move.major && dayKey(x.t0) === k && /\bferry\b/.test(low) && x.mode === 'ferry');
  return s ? s.t0 : null;
}
function itineraryHtml(l, t) {
  const W = E.W, today = dayKey(t), days = W.dayLines(l).filter(d => d.lines.length);
  /* places she ticked as "went" join the day she went */
  const went = shownPicks(W, t, l.id).filter(p => p.went && p.wentOn);
  went.forEach(p => { if (!days.some(d => d.k === p.wentOn)) days.push({ k: p.wentOn, lines: [] }); });
  days.sort((a, b) => a.k.localeCompare(b.k));
  if (!days.length && !(l.plans && l.plans.length)) return '';
  let h = '<h3>Itinerary</h3><div class="itin">';
  days.forEach(d => {
    const rows = d.lines.map(x => ({ x, at: timeFor(x, d.k, l) })).concat(went.filter(p => p.wentOn === d.k).map(p => ({ x: 'Went to ' + p.name, at: null, pk: p.id })));
    h += '<div class="iday' + (d.k === today ? ' today' : '') + (d.k < today ? ' past' : '') + '"><p class="idate">' + dayLong(d.k) + (d.k === today ? ' · today' : '') + '</p>' + rows.map(r => '<div class="irow"><span class="itime">' + (r.at ? clk(r.at) : '') + '</span>' + (r.pk ? '<button type="button" class="iwent" data-pk="' + esc(r.pk) + '">' + esc(r.x) + '</button>' : '<span>' + esc(r.x) + '</span>') + '</div>').join('') + '</div>';
  });
  if (l.plans && l.plans.length) h += '<div class="iday"><p class="idate">Also planned</p>' + l.plans.map(p => '<div class="irow"><span class="itime"></span><span>' + esc(p) + '</span></div>').join('') + '</div>';
  return h + '</div>';
}
function renderCard(l) {
  const W = E.W, t = CLOCK.now(), st = W.status(t), today = dayKey(t);
  const here = st.phase === 'stay' && st.leg === l, coming = st.phase === 'moving' && st.move.leg === l;
  const tomorrow = addDays(today, 1), arrive = W.moves.find(m => m.leg === l && m.major);
  const status = here ? '<span class="status here">' + (today === l.outKey ? 'Ellen’s here · leaving today' : 'Ellen’s here now') + '</span>'
    : coming ? '<span class="status here">On her way here</span>'
    : t >= l.t1 ? '<span class="status">Ellen was here</span>'
    : (arrive ? dayKey(arrive.t0) : l.inKey) === today ? '<span class="status">Heading here today</span>'
    : l.inKey === tomorrow ? '<span class="status">Coming up tomorrow</span>'
    : '<span class="status">Coming up · ' + dayLabel(l.inKey) + '</span>';
  const days = W.dayLines(l).filter(d => d.lines.length), ph = shownPhotos(W, t, l.id), pk = shownPicks(W, t, l.id);
  let h = '<header class="cover"><span class="grab" data-grab></span><div class="ctop">' + status + '<button type="button" class="x" data-x aria-label="Hide">×</button></div><h2>' + esc(l.place) + '</h2></header><div class="body">';
  h += '<p class="meta">' + esc(l.hotel) + ' · ' + rangeText(l) + ' · ' + nightsText(l) + '</p>';
  h += travelHtml(l, t);
  h += '<p class="blurb">' + esc(l.blurb) + '</p>';
  h += itineraryHtml(l, t);
  h += '<h3>Photos</h3>' + (ph.length ? '<div class="prints">' + ph.map((p, j) => '<button type="button" data-ph="' + j + '"><img alt=""><span>' + esc([p.caption, p.place].filter(Boolean).join(' · ')) + '</span></button>').join('') + '</div>' : '<p class="empty">' + (t < l.t0 ? 'Not there yet.' : 'None shared from here yet.') + '</p>');
  if (pk.length) h += '<h3>Places</h3><ul class="places">' + pk.map(p => '<li><button type="button" data-pk="' + esc(p.id) + '"><span class="nm">' + esc(p.name) + '</span>' + (p.area ? '<span class="ar">' + esc(p.area) + '</span>' : '') + (p.went && p.wentOn ? '<span class="ar">· went ' + dayLabel(p.wentOn) + '</span>' : '') + (p.note ? '<small>' + esc(p.note) + '</small>' : '') + '</button></li>').join('') + '</ul>';
  h += '</div>';
  const c = $('#card'); c.hidden = false; c.innerHTML = h; c.scrollTop = 0; c.classList.toggle('tall', E.tall);
  c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
  c.querySelector('[data-x]').onclick = () => { c.hidden = true; clearSpot(); if (E.map) flyTo(E.map, { center: l.ll, zoom: E.map.getZoom(), padding: pads(), duration: 600 }); };
  c.querySelector('[data-grab]').onclick = () => { E.tall = !E.tall; c.classList.toggle('tall', E.tall); };
  $$('[data-ph]', c).forEach(b => { const p = ph[+b.dataset.ph]; photoSrc(p).then(s => b.querySelector('img').src = s); b.onclick = () => openLightbox(ph, +b.dataset.ph); });
  $$('[data-pk]', c).forEach(b => b.onclick = () => { const p = pk.find(x => x.id === b.dataset.pk); if (p) openPlace(p); });
}
/* ---------- a place's own page, inside the stop card ---------- */
const KIND = { food: 'Food', cafe: 'Coffee', bar: 'Bar', museum: 'Museum', architecture: 'Architecture', walk: 'Walk', garden: 'Garden', photo: 'Photo spot', shop: 'Shop', craft: 'Craft', onsen: 'Hot spring' };
async function openPlace(p) {
  const W = E.W, l = W.leg(p.leg) || W.legs[E.sel] || W.legs[0], t = CLOCK.now();
  if (E.mode !== 'map') await enterMap(l.i);
  const ph = shownPhotos(W, t, l.id).filter(x => x.place && x.place === p.name);
  let h = '<header class="phead"><span class="grab dark" data-grab></span><div class="ctop"><button type="button" class="pback" data-back>\u2190 ' + esc(l.place) + '</button><button type="button" class="x dark" data-x aria-label="Hide">\u00d7</button></div>';
  h += '<h2>' + esc(p.name) + '</h2><p class="meta">' + [p.area, KIND[p.kind]].filter(Boolean).map(esc).join(' \u00b7 ') + '</p></header><div class="body">';
  if (p.went && p.wentOn) h += '<p class="pwent">Ellen went ' + dayLong(p.wentOn) + '.</p>';
  if (p.note) h += '<blockquote class="pnote">\u201c' + esc(p.note) + '\u201d</blockquote>';
  if (p.about) h += '<p class="blurb">' + esc(p.about) + '</p>';
  if (ph.length) h += '<h3>Photos</h3><div class="prints">' + ph.map((x, j) => '<button type="button" data-ph="' + j + '"><img alt=""><span>' + esc(x.caption || '') + '</span></button>').join('') + '</div>';
  if (p.hours || p.url) h += '<div class="travel pfacts">' + (p.hours ? '<div class="lg"><div>Hours</div><span>' + esc(p.hours) + '</span></div>' : '') + (p.url ? '<div class="lg"><div>Website</div><span><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')) + ' \u2197</a></span></div>' : '') + '</div>';
  h += '</div>';
  const c = $('#card'); c.hidden = false; c.innerHTML = h; c.scrollTop = 0; c.classList.toggle('tall', E.tall);
  c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
  c.querySelector('[data-back]').onclick = () => { clearSpot(); renderCard(l); flyTo(E.map, { center: l.ll, zoom: l.place === 'Tokyo' ? 11 : 11.6, pitch: 50, bearing: -12, padding: pads(), duration: 1200 }); };
  c.querySelector('[data-x]').onclick = () => { c.hidden = true; clearSpot(); };
  c.querySelector('[data-grab]').onclick = () => { E.tall = !E.tall; c.classList.toggle('tall', E.tall); };
  $$('[data-ph]', c).forEach(b => { const x = ph[+b.dataset.ph]; photoSrc(x).then(s => b.querySelector('img').src = s); b.onclick = () => openLightbox(ph, +b.dataset.ph); });
  showSpot(p);
}
