/* ---- the passcode lock: PBKDF2(passcode) -> AES-GCM. Followers decrypt in the browser; nothing readable is ever on the host. ---- */
const SEAL = (() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const hex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
  const ok = () => !!(window.crypto && crypto.subtle);
  async function key(pass, saltHex) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass.trim().toLowerCase()), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: hex(saltHex), iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function lockBytes(k, bytes) { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, bytes)) }; }
  async function unlockBytes(k, box) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, k, unb64(box.ct)); }
  return {
    ok, key,
    async lockJSON(k, saltHex, obj) { return Object.assign({ v: 1, kdf: 'PBKDF2-SHA256-210000', salt: saltHex }, await lockBytes(k, enc.encode(JSON.stringify(obj)))); },
    async unlockJSON(k, box) { return JSON.parse(dec.decode(await unlockBytes(k, box))); },
    lockBytes, unlockBytes
  };
})();
/* Follow pages: fetch the sealed bundle, ask for the passcode once, remember it on this device. */
async function openSealed(base, onOpen) {
  base = base || '';
  const PK = 'wheres-ellen.pass';
  let box;
  try { const r = await fetch(base + 'data/public.enc.json', { cache: 'no-store' }); if (!r.ok) throw 0; box = await r.json(); }
  catch (e) { return gate('Nothing here yet.', 'Ellen has not shared her trip yet.', true); }
  if (!SEAL.ok()) return gate('This page needs a secure connection.', 'Open it over https, or on the laptop at 127.0.0.1.', true);
  const tryPass = async (p, silent) => {
    try { const k = await SEAL.key(p, box.salt), pub = await SEAL.unlockJSON(k, box); localStorage.setItem(PK, p); document.body.classList.remove('locked'); const g = document.getElementById('gate'); if (g) g.remove(); onOpen(pub, k); return true; }
    catch (e) { if (!silent) { const f = document.querySelector('#gate form'); f.classList.remove('nope'); void f.offsetWidth; f.classList.add('nope'); } return false; }
  };
  const q = new URLSearchParams(location.search).get('pass'), saved = q || localStorage.getItem(PK);
  if (saved && await tryPass(saved, true)) return;
  gate('Ellen’s in Japan.', '');
  const f = document.querySelector('#gate form');
  f.addEventListener('submit', e => { e.preventDefault(); tryPass(f.pass.value); });
  function gate(h, p, dead) {
    document.body.classList.add('locked');
    const g = document.createElement('div'); g.id = 'gate';
    g.innerHTML = '<div class="gate-in"><h1>' + h + '</h1>' + (p ? '<p>' + p + '</p>' : '') + (dead ? '' : '<form autocomplete="off"><input name="pass" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Passcode" aria-label="Passcode" autofocus><button type="submit">Open</button></form>') + '</div>';
    document.body.appendChild(g);
  }
}
/* decrypt a published photo into an <img> src */
const PHOTO_URLS = {};
function photoUrl(base, key, p) {
  if (!PHOTO_URLS[p.id]) PHOTO_URLS[p.id] = (async () => {
    const box = await (await fetch(base + p.media, { cache: 'force-cache' })).json();
    return URL.createObjectURL(new Blob([await SEAL.unlockBytes(key, box)], { type: 'image/jpeg' }));
  })().catch(e => { delete PHOTO_URLS[p.id]; throw e; });
  return PHOTO_URLS[p.id];
}
