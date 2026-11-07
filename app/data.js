'use strict';
/* Гараар засварладаг өгөгдөл (баатрын онцлог, counter item, зорилтот тоо) — app/data.json.
   1) app-тай хамт ирсэн data.json, 2) GitHub дээрх хамгийн сүүлийн data.json (6 цаг тутам шалгана) —
   аль version нь их байна, түүнийг хэрэглэнэ. GitHub дээр файлыг засахад бүх хэрэглэгч шинэ exe-гүйгээр шинэчлэгдэнэ. */

const DATA_REPO = 'tengisbatsaikhan41-hub/dotalens';
const DATA_URL = `https://raw.githubusercontent.com/${DATA_REPO}/main/app/data.json`;
const DATA_EDIT_URL = `https://github.com/${DATA_REPO}/edit/main/app/data.json`;
const GD = { src: 'алга', version: 0, patch: '', updated: '', checked: 0 };

let TRAITS = {}, NEEDS = {}, MAGIC_ITEMS = new Set(), CONSUMABLES = new Set(), MAGIC_HEROES = new Set(), PHYS_HEROES = new Set(),
  LH10_TARGET = {}, KNOWN_HEROES = new Set();

const splitList = s => Array.isArray(s) ? s : String(s || '').split(/\s+/).filter(Boolean);
const mkSet = s => new Set(splitList(s));

function validData(d) {
  return !!(d && d.schema === 1 && typeof d.version === 'number' && d.traits && d.needs && d.consumables);
}

function applyData(d, src) {
  TRAITS = {}; for (const [k, v] of Object.entries(d.traits)) TRAITS[k] = mkSet(v);
  NEEDS = {}; for (const [k, v] of Object.entries(d.needs)) NEEDS[k] = { core: splitList(v.core), sup: splitList(v.sup) };
  MAGIC_ITEMS = mkSet(d.magicItems); CONSUMABLES = mkSet(d.consumables);
  MAGIC_HEROES = mkSet(d.magicHeroes); PHYS_HEROES = mkSet(d.physHeroes);
  LH10_TARGET = d.lh10Target || {}; KNOWN_HEROES = mkSet(d.knownHeroes);
  Object.assign(GD, { src, version: d.version, patch: d.patch || '', updated: d.updated || '' });
}

function cachedRemote() { try { const c = JSON.parse(ls('gdata') || 'null'); return c && validData(c.d) ? c : null; } catch (e) { return null; } }

/* GitHub-аас шинэ хувилбар татна. Шинэчлэгдвэл true. */
async function refreshRemoteData(force) {
  const c = cachedRemote();
  if (!force && c && Date.now() - c.t < 6 * 3600e3) return false;
  try {
    const r = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return false;
    const d = await r.json();
    if (!validData(d)) return false;
    try { ls('gdata', JSON.stringify({ t: Date.now(), d })); } catch (e) { }
    GD.checked = Date.now();
    if (d.version > GD.version) { applyData(d, 'GitHub'); return true; }
  } catch (e) { }
  return false;
}

async function loadGameData() {
  let best = null, src = '';
  try {
    const r = await fetch('data.json', { cache: 'no-cache' });
    if (r.ok) { const d = await r.json(); if (validData(d)) { best = d; src = 'app-тай хамт ирсэн'; } }
  } catch (e) { /* file:// үед ажиллахгүй — GitHub/кэшээс авна */ }
  const c = cachedRemote();
  if (c && (!best || c.d.version > best.version)) { best = c.d; src = 'GitHub (кэш)'; }
  if (best) { applyData(best, src); refreshRemoteData(false).then(up => { if (up) toast(`Баатар/item-ийн жагсаалт шинэчлэгдлээ (data v${GD.version}).`); }); }
  else { await refreshRemoteData(true); }
  if (!GD.version) throw new Error('Баатар/item-ийн жагсаалтыг (data.json) ачаалж чадсангүй.');
}

/* data.json-д ороогүй (онцлог нь тодорхойлогдоогүй) шинэ баатрууд */
function unknownHeroes() {
  if (!KNOWN_HEROES.size) return [];
  return Object.values(S.heroes).filter(h => h.k && !KNOWN_HEROES.has(h.k.replace('npc_dota_hero_', ''))).map(h => h.n).sort();
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 20);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 6000);
}
