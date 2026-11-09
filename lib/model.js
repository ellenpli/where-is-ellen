/* ---- one trip model for Follow and Trip: legs, moves, the clock, and where Ellen is ---- */
const TZJ = 'Asia/Tokyo', TZE = 'America/New_York';
const ms = iso => new Date(iso).getTime();
const tzOf = iso => (iso && iso.indexOf('+09:00') > 0) ? TZJ : TZE;
function parts(t, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const o = {}; f.formatToParts(new Date(t)).forEach(p => o[p.type] = p.value); return o;
}
const dayKey = (t, tz) => { const p = parts(t, tz || TZJ); return p.year + '-' + p.month + '-' + p.day; };
function clk(t, tz) { const p = parts(t, tz || TZJ); let h = +p.hour; const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12; return h + ':' + p.minute + ap; }
const clkIso = iso => clk(ms(iso), tzOf(iso));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const kd = k => new Date(k + 'T12:00:00Z');
const dayLabel = k => WD[kd(k).getUTCDay()] + ' ' + MON[kd(k).getUTCMonth()] + ' ' + kd(k).getUTCDate();
const dayLong = k => WDL[kd(k).getUTCDay()] + ', ' + MON[kd(k).getUTCMonth()] + ' ' + kd(k).getUTCDate();
function addDays(k, n) { const d = kd(k); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const daysBetween = (a, b) => Math.round((kd(b) - kd(a)) / 864e5);
ICON.flight = ICON.plane; ICON.taxi = ICON.car;
const MODE_NOUN = { flight: 'Flight', train: 'Train', ferry: 'Ferry', bus: 'Bus', taxi: 'Car', car: 'Car' };

/* the clock: real time, or ?date=2026-11-09 (noon in Tokyo) / ?at=2026-11-10T14:00 (Tokyo time) for testing */
const CLOCK = (() => {
  const q = new URLSearchParams(location.search); let fixed = null;
  if (q.get('at')) fixed = ms(q.get('at').length <= 16 ? q.get('at') + ':00+09:00' : q.get('at'));
  else if (q.get('date')) fixed = ms(q.get('date') + 'T12:00:00+09:00');
  const t0 = Date.now();
  return { simulated: fixed != null, now: () => fixed != null ? fixed + (Date.now() - t0) : Date.now() };
})();

function World(pub) {
  pub = JSON.parse(JSON.stringify(pub));   // never mutate the payload we seal
  const W = { pub, legs: pub.legs, moves: pub.moves, events: pub.events || [], photos: pub.photos || [], picks: pub.picks || [] };
  W.legs.forEach((l, i) => {
    l.i = i; l.t0 = ms(l.checkIn); l.t1 = ms(l.checkOut); l.inKey = dayKey(l.t0); l.outKey = dayKey(l.t1); l.nights = daysBetween(l.inKey, l.outKey);
    l.dayText = Array.isArray(l.days) ? (l.dayText || {}) : (l.days || {}); l.days = []; for (let k = l.inKey; k <= l.outKey; k = addDays(k, 1)) l.days.push(k);
  });
  W.moves.forEach(m => {
    m.steps.forEach(s => {
      s.move = m; s.t0 = ms(s.dep); s.t1 = ms(s.arr);
      const a = s.frm.ll, b = s.to.ll;
      if (s.mode === 'flight') { s.path = greatCircle(a, b, Math.abs(a[0] - b[0]) > 60 ? 120 : 48); if (Math.abs(a[0] - b[0]) < 60) liftArc(s.path, 0.12); }
      else if (s.via && s.via.length) s.path = smooth([a].concat(s.via.map(p => [p[1], p[0]]), [b]), 8);
      else { s.path = smooth([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b], 8); liftArc(s.path, s.mode === 'ferry' ? 0.12 : 0.04); }
      s.cum = measure(s.path);
    });
    m.t0 = m.steps[0].t0; m.t1 = m.steps[m.steps.length - 1].t1;
    m.main = m.steps.find(s => s.mode === 'flight') || m.steps.find(s => s.mode === 'train' && s.number) || m.steps.find(s => s.mode === 'ferry') || m.steps.find(s => s.mode === 'train') || m.steps[0];
    m.major = ['flight', 'train', 'ferry'].includes(m.main.mode);
    m.leg = W.legs.find(l => Math.abs(l.t0 - m.t1) < 8 * 36e5) || null;   // the leg this move arrives at
  });
  W.steps = [].concat(...W.moves.map(m => m.steps));
  W.start = W.steps[0].t0; W.end = W.steps[W.steps.length - 1].t1;
  W.photos.forEach(p => p.leg = p.leg || legAt(p.date ? ms(p.date) : W.start).id);
  W.picks.forEach(p => p.leg = p.leg || (W.legs.find(l => haversine(l.ll, p.ll) < 60) || W.legs[0]).id);
  function legAt(t) {
    return W.legs.find(l => t >= l.t0 && t < l.t1) || W.legs.find(l => l.t0 > t && !W.steps.some(s => s.t0 > t && s.t1 <= l.t0 && s.move.major)) || W.legs.filter(l => l.t1 <= t).pop() || W.legs[0];
  }
  W.legAt = legAt;
  W.leg = id => W.legs.find(l => l.id === id);
  W.frac = t => clamp((t - W.start) / (W.end - W.start), 0, 1);
  W.when = t => { const k = dayKey(t), d = daysBetween(dayKey(CLOCK.now()), k); return (d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 1 && d < 6 ? WDL[kd(k).getUTCDay()] : dayLabel(k)) + ' ' + clk(t); };
  /* where a journey goes, in the words friends know: the stop, unless only the inn's name was written */
  W.dest = m => (m.leg && (!m.to || m.to === m.leg.hotel)) ? m.leg.place : (m.to || (m.leg && m.leg.place) || '');
  W.nextMove = t => W.moves.find(m => m.major && m.main.t0 > t) || null;
  W.nextPhrase = m => {
    if (!m) return '';
    const s = m.main, v = s.mode === 'flight' ? 'flying to ' : s.mode === 'ferry' ? 'the boat to ' : 'the train to ';
    return v + W.dest(m) + ', ' + W.when(s.t0);
  };
  /* the one answer: where is Ellen at time t */
  W.status = t => {
    const o = { t, local: clk(t), frac: W.frac(t) };
    const asleep = () => { const h = +parts(t, TZJ).hour; return h >= 23 || h < 7; };
    if (t < W.start) {
      const m = W.moves[0]; Object.assign(o, { phase: 'before', place: 'New York', ll: W.pub.home.ll, h: "Ellen’s in New York.", sub: 'Leaves for Tokyo ' + dayLabel(dayKey(m.t0, TZE)) + ', ' + clk(m.t0, TZE) + '.' });
      o.next = 'flying to Tokyo'; return o;
    }
    if (t >= W.end) return Object.assign(o, { phase: 'home', place: 'New York', ll: W.pub.home.ll, h: "Ellen’s home.", sub: 'Back from Japan since ' + dayLabel(dayKey(W.end, TZE)) + '.', next: '' });
    const s = W.steps.find(x => t >= x.t0 && t < x.t1);
    if (s) {
      const m = s.move, f = (t - s.t0) / (s.t1 - s.t0), p = pointAt(s.path, s.cum, f);
      Object.assign(o, { phase: 'moving', step: s, move: m, f, ll: p.p, hd: p.hd, leg: m.leg, place: m.to });
      if (m.steps.length > 1 && m.major) { o.h = "Ellen’s on her way to " + m.to + '.'; o.sub = MODE_NOUN[s.mode] + (s.number ? ' ' + s.number : '') + ', ' + s.frm.name + ' to ' + s.to.name + '. Gets in ' + clk(m.t1, tzOf(m.steps[m.steps.length - 1].arr)) + (tzOf(m.steps[m.steps.length - 1].arr) === TZE ? ' New York time' : '') + '.'; }
      else if (s.mode === 'flight') { o.h = "Ellen’s flying to " + m.to + '.'; o.sub = s.number + '. Lands ' + clk(s.t1, tzOf(s.arr)) + (tzOf(s.arr) === TZJ ? ' Tokyo time' : ' New York time') + '.'; }
      else { o.h = "Ellen’s " + ({ ferry: 'on the boat', train: 'on the train', bus: 'on the bus', taxi: 'in a car', car: 'in a car' }[s.mode]) + ' to ' + m.to + '.'; o.sub = 'Gets in about ' + clk(m.t1) + '.'; }
      const n = W.nextMove(m.t1); o.next = n && n !== m ? W.nextPhrase(n) : ''; return o;
    }
    /* between two legs of one journey (waiting at a port or changing trains): still on the way */
    const mid = W.moves.find(m => m.major && t >= m.t0 && t < m.t1);
    if (mid) {
      const nx = mid.steps.find(x => x.t0 >= t), last = mid.steps[mid.steps.length - 1], lastTz = tzOf(last.arr);
      Object.assign(o, { phase: 'moving', step: null, move: mid, f: 0, ll: nx ? nx.frm.ll : last.to.ll, leg: mid.leg, place: mid.to });
      o.h = 'Ellen\u2019s on her way to ' + mid.to + '.';
      o.sub = (nx ? 'Changing at ' + nx.frm.name.replace(/ Station$/, '') + '. ' : '') + 'Gets in ' + clk(mid.t1, lastTz) + (lastTz === TZE ? ' New York time' : '') + '.';
      const n = W.nextMove(mid.t1); o.next = n && n !== mid ? W.nextPhrase(n) : ''; return o;
    }
    const leg = legAt(t), ev = W.events.find(e => t >= ms(e.start) && t < ms(e.end));
    Object.assign(o, { phase: 'stay', leg, place: leg.place, ll: ev && ev.ll ? ev.ll : leg.ll });
    o.h = ev ? "Ellen’s at " + ev.title.replace(/ tour$/, '') + '.' : "Ellen’s in " + leg.place + '.';
    const arrived = W.moves.filter(m => m.major && m.t1 <= t).pop();
    if (arrived && t - arrived.t1 < 20 * 36e5) o.sub = (arrived.main.mode === 'flight' ? 'Landed ' : 'Got in ') + WD[kd(dayKey(arrived.t1)).getUTCDay()] + ' ' + clk(arrived.t1) + '.';
    else if (dayKey(t) === leg.outKey && W.moves.some(m => m.major && m.t0 > t && dayKey(m.t0) === leg.outKey)) o.sub = 'Leaving ' + leg.hotel + ' today.';
    else { const n = clamp(daysBetween(leg.inKey, dayKey(t - 6 * 36e5)) + 1, 1, leg.nights); o.sub = 'Staying at ' + leg.hotel + ', night ' + n + ' of ' + leg.nights + '.'; }
    if (asleep()) o.sub += " It's " + clk(t) + ' there, so she is probably asleep.';
    o.next = W.nextPhrase(W.nextMove(t)); return o;
  };
  /* days of a leg with what is public about each */
  W.dayLines = leg => leg.days.filter((k, i) => i < leg.nights || leg.dayText[k]).map(k => ({ k, lines: leg.dayText[k] || [] }));
  return W;
}
