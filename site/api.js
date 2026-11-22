/* I'm Still Mine — client for the detection API.
   The detector itself is NOT in this repository: it runs on our server.

   How an image is sent (the "city"):
   1. The browser asks for a new city (this counts as one check).
   2. It cuts the suspect image into pieces ("streets"). Each piece gets a random one-time
      street name, e.g. "lilas-9f2c41d07ab3e815", and the pieces are sent in shuffled order.
   3. Only the browser knows the map (the right order). It sends the map last; the server
      rebuilds the image in memory, answers with a coarse verdict, and forgets everything.

   Only the suspect image is sent — never your selfie, never your face template, and
   nothing is stored. The verdict is deliberately coarse ("likely", "possible", "no sign")
   so the service cannot be used to fine-tune fakes. */
(() => {
const API = (window.IMSM_API_BASE || '') + '/api/v1';
const STREETS = ['lilas','vauban','pasteur','voltaire','soleil','marronniers','jasmin','colombe','rivoli',
  'liberte','tilleuls','moulin','port','fontaine','etoile','peupliers','cerisiers','phare','dunes','quai'];
const PASS_KEY = 'imsm-pass';

function streetName(){
  const r = crypto.getRandomValues(new Uint8Array(9));
  const hex = [...r.slice(1)].map(b => b.toString(16).padStart(2, '0')).join('');
  return STREETS[r[0] % STREETS.length] + '-' + hex;
}
function shuffle(a){
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pass(){
  try {
    const m = location.hash.match(/[?&]pass=([\w-]{20,})/);
    if (m) { sessionStorage.setItem(PASS_KEY, m[1]); history.replaceState(null, '', location.pathname + '#outils'); }
    return sessionStorage.getItem(PASS_KEY);
  } catch (_) { return null; }
}

class LimitError extends Error {
  constructor(info, retry){ super(info.error || 'limit'); this.info = info; this.retry = retry; }
}

async function check(file){
  const p = pass();
  const r = await fetch(API + '/city', { method: 'POST', headers: p ? { 'X-IMSM-Pass': p } : {} });
  if (r.status === 429 || r.status === 403) {
    const info = await r.json().catch(() => ({}));
    throw new LimitError(info, +(r.headers.get('Retry-After') || 0));
  }
  if (!r.ok) throw new Error('api ' + r.status);
  const city = await r.json();
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength > city.max_bytes) throw new Error('too_big');
  const pieces = [];
  for (let i = 0; i < buf.byteLength; i += city.street_bytes) pieces.push({ name: streetName(), data: buf.slice(i, i + city.street_bytes) });
  const map = pieces.map(x => x.name);                 /* the map stays here until the end */
  for (const s of shuffle(pieces.slice())) {
    const u = await fetch(`${API}/city/${city.city}/${s.name}`, { method: 'PUT', body: s.data, headers: { 'Content-Type': 'application/octet-stream' } });
    if (!u.ok) throw new Error('api ' + u.status);
  }
  const v = await fetch(`${API}/city/${city.city}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ streets: map }) });
  if (!v.ok) throw new Error('api ' + v.status);
  return (await v.json()).verdict;                     /* likely | possible | possible_low | no_sign | insufficient */
}

async function unlock(email, lang){
  const r = await fetch(API + '/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, lang }) });
  if (!r.ok) throw new Error('api ' + r.status);
  return r.json();
}

window.ImStillMineAPI = { check, unlock, LimitError };
})();
