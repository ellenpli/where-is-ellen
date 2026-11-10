/* ---- shared Follow helpers: boot, published things up to now, timeline segments, lightbox ---- */
const FOLLOW = { W: null, key: null, base: '', preview: false };
/* Trip's mirror can hand a world in directly (preview of drafts); otherwise open the sealed bundle */
function bootFollow(start) {
  const go = (pub, key) => { FOLLOW.W = World(pub); FOLLOW.key = key; start(FOLLOW.W); };
  if (window.parent !== window && new URLSearchParams(location.search).has('mirror')) {
    window.addEventListener('message', e => { if (e.origin === location.origin && e.data && e.data.type === 'mirror') { FOLLOW.preview = true; FOLLOW.reload = () => {}; go(e.data.pub, null); } });
    window.parent.postMessage({ type: 'mirror-ready' }, location.origin);
    return;
  }
  openSealed(FOLLOW.base, go);
}
async function photoSrc(p) {
  if (p.src) return p.src;            // mirror preview passes laptop URLs
  return photoUrl(FOLLOW.base, FOLLOW.key, p);
}
const shownPhotos = (W, t, legId) => W.photos.filter(p => (!p.date || ms(p.date) <= t) && (!legId || p.leg === legId)).sort((a, b) => ms(b.date || 0) - ms(a.date || 0));
const shownPicks = (W, t, legId) => W.picks.filter(p => (!p.publishedAt || ms(p.publishedAt) <= t) && (!legId || p.leg === legId));
/* trip as segments: out, legs and the travel between them, home. weights keep travel visible */
function segments(W) {
  const seg = [], L = W.legs;
  seg.push({ kind: 'go', t0: W.start, t1: L[0].t0, label: 'New York' });
  L.forEach((l, i) => {
    seg.push({ kind: 'leg', leg: l, t0: l.t0, t1: l.t1, label: l.place });
    if (L[i + 1] && L[i + 1].t0 > l.t1) seg.push({ kind: 'move', t0: l.t1, t1: L[i + 1].t0 });
    if (L[i + 1] && L[i + 1].t0 <= l.t1) seg[seg.length - 1].t1 = L[i + 1].t0;
  });
  seg.push({ kind: 'home', t0: L[L.length - 1].t1, t1: W.end, label: 'Home' });
  seg.forEach(s => {
    const h = (s.t1 - s.t0) / 36e5; s.w = s.kind === 'leg' ? 66 + Math.sqrt(h) * 5 : 14;
    s.move = W.moves.find(m => m.t0 >= s.t0 - 6e5 && m.t1 <= s.t1 + 6e5 && m.major);
  });
  const tot = seg.reduce((a, s) => a + s.w, 0); let x = 0;
  seg.forEach(s => { s.x0 = x / tot; x += s.w; s.x1 = x / tot; });
  return seg;
}
function segX(seg, t) {
  if (t <= seg[0].t0) return 0; if (t >= seg[seg.length - 1].t1) return 1;
  const s = seg.find(s => t >= s.t0 && t < s.t1) || seg.find(s => s.t0 > t);
  return s.x0 + (s.x1 - s.x0) * clamp((t - s.t0) / ((s.t1 - s.t0) || 1), 0, 1);
}
function segT(seg, x) {
  const s = seg.find(s => x >= s.x0 && x <= s.x1) || seg[seg.length - 1];
  return s.t0 + (s.t1 - s.t0) * clamp((x - s.x0) / ((s.x1 - s.x0) || 1), 0, 1);
}
function nightsText(l) { return l.nights + ' night' + (l.nights === 1 ? '' : 's'); }
function rangeText(l) { const a = kd(l.inKey), b = kd(l.outKey); return MON[a.getUTCMonth()] + ' ' + a.getUTCDate() + ' – ' + (a.getUTCMonth() === b.getUTCMonth() ? '' : MON[b.getUTCMonth()] + ' ') + b.getUTCDate(); }
function arrivalText(W, l) {
  const m = W.moves.find(m => m.leg === l && m.major); if (!m) return '';
  const s = m.main, how = { flight: 'Flies', train: 'Takes the train', ferry: 'Takes the boat' }[s.mode] || 'Travels';
  const tz = tzOf(s.dep); return how + ' from ' + s.frm.name.replace(/ Terminal \d/, '').replace(/ \(.*\)/, '') + (s.number ? ' (' + s.number + ')' : '') + ', ' + dayLabel(dayKey(s.t0, tz)) + ' at ' + clk(s.t0, tz) + (tz === TZE ? ' New York time' : '') + '.';
}
function clockLine(t) { return WD[kd(dayKey(t)).getUTCDay()] + ' ' + clk(t) + ' in Tokyo · ' + clk(t, TZE) + ' in New York'; }
function openLightbox(items, i) {
  const lb = document.getElementById('lightbox'); if (!lb) return;
  const show = async () => {
    const p = items[i], src = await photoSrc(p);
    lb.innerHTML = '<button class="x" type="button" aria-label="Close">×</button><figure>' + (p.type === 'video' ? '<video controls playsinline autoplay></video>' : '<img alt="">') + '<figcaption></figcaption></figure>';
    if (p.type === 'video') {
      const v = lb.querySelector('video');
      photoSrc({ id: p.poster || p.id, media: 'media/' + (p.poster || p.id) + '.enc' }).then(s => v.poster = s);
      photoSrc(p).then(s => { v.src = s; v.play().catch(() => {}); });
    } else lb.querySelector('img').src = src;
    lb.querySelector('figcaption').innerHTML = esc([p.caption, p.place].filter(Boolean).join(' \u00b7 '));
    lb.querySelector('.x').onclick = () => { lb.hidden = true; };
  };
  lb.hidden = false; lb.onclick = e => { if (e.target === lb) lb.hidden = true; };
  document.onkeydown = e => { if (lb.hidden) return; if (e.key === 'Escape') lb.hidden = true; if (e.key === 'ArrowRight' && i < items.length - 1) { i++; show(); } if (e.key === 'ArrowLeft' && i > 0) { i--; show(); } };
  show();
}
