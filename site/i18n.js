/* Traductions : la langue est choisie automatiquement d'après les langues du navigateur
   (navigator.languages). Aucune géolocalisation ni requête à un service externe :
   cela enverrait l'adresse IP de la visiteuse à un tiers. Le choix manuel est mémorisé
   dans ce navigateur seulement (localStorage), si celui-ci le permet. */
(() => {
const LANGS = [
  ['fr','Français'],['en','English'],['es','Español'],['pt','Português'],['de','Deutsch'],
  ['it','Italiano'],['ro','Română'],['pl','Polski'],['uk','Українська'],['ru','Русский'],
  ['ar','العربية',1],['tr','Türkçe'],['zh','中文'],['ja','日本語'],['ko','한국어'],
  ['hi','हिन्दी'],['bn','বাংলা'],['id','Bahasa Indonesia'],['vi','Tiếng Việt'],['ur','اردو',1]
];
const has = c => LANGS.some(l => l[0] === c);
const cache = {};
let cur = 'fr';
const KEY = 'adc-lang';

function detect(){
  try { const s = localStorage.getItem(KEY); if (s && has(s)) return s; } catch (_) {}
  const list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'fr'];
  for (const l of list) {
    const p = String(l).toLowerCase().split('-')[0];
    if (p === 'zh' || has(p)) return p;
  }
  return 'en';
}
async function load(c){
  if (cache[c]) return cache[c];
  const r = await fetch('i18n/' + c + '.json');
  if (!r.ok) throw new Error('i18n ' + c + ' ' + r.status);
  return (cache[c] = await r.json());
}
window.t = (k, v) => {
  let s = (cache[cur] && cache[cur][k]) ?? (cache.fr && cache.fr[k]) ?? k;
  if (v) s = s.replace(/\{(\w+)\}/g, (m, n) => v[n] !== undefined ? v[n] : m);
  return s;
};
function apply(){
  const rtl = LANGS.find(l => l[0] === cur)[2];
  document.documentElement.lang = cur;
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i]').forEach(el => {
    if (el.closest('#v-medecin')) return;               /* l'espace pro reste en français */
    const k = el.getAttribute('data-i'), v = window.t(k);
    if (v !== k) { if (el.tagName === 'TITLE') document.title = v; else el.innerHTML = v; }
  });
  document.querySelectorAll('[data-ip]').forEach(el => { const k = el.getAttribute('data-ip'), v = window.t(k); if (v !== k) el.placeholder = v; });
  const sel = document.getElementById('langSel'); if (sel) sel.value = cur;
  document.dispatchEvent(new Event('langchange'));
}
window.setLang = async (c, remember) => {
  if (!has(c)) c = 'en';
  await load('fr');
  try { await load(c); cur = c; } catch (_) { cur = 'fr'; }
  if (remember) { try { localStorage.setItem(KEY, c); } catch (_) {} }
  apply();
};
function initSelect(){
  const sel = document.getElementById('langSel'); if (!sel) return;
  sel.innerHTML = LANGS.map(([c, n]) => `<option value="${c}" lang="${c}">${n}</option>`).join('');
  sel.addEventListener('change', () => window.setLang(sel.value, true));
}
initSelect();
window.LANGS = LANGS;
window.i18nReady = window.setLang(detect()).catch(() => {});
})();
