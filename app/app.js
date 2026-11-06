'use strict';
const API = 'https://api.opendota.com/api';
const CDN = 'https://cdn.cloudflare.steamstatic.com';
const STEAM64 = 76561197960265728n;

function ls(k, v) {
  try {
    if (v === undefined) return localStorage.getItem('dl_' + k);
    if (v === null) localStorage.removeItem('dl_' + k); else localStorage.setItem('dl_' + k, v);
  } catch (e) { return null; }
}

const S = { accountId: ls('accountId'), apiKey: ls('apiKey') || '', heroes: {}, heroKey: {}, items: {}, itemsId: {}, cache: new Map(), token: 0 };
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = v => Math.round(v * 100) + '%';
const fmtT = s => { const n = s < 0; s = Math.abs(Math.round(s)); const t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; return n ? '-' + t : t; };
const fmtK = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v));
const ago = ts => {
  const d = Date.now() / 1000 - ts;
  if (d < 3600) return Math.max(1, Math.round(d / 60)) + ' мин өмнө';
  if (d < 86400) return Math.round(d / 3600) + ' цагийн өмнө';
  if (d < 86400 * 30) return Math.round(d / 86400) + ' өдрийн өмнө';
  return new Date(ts * 1000).toLocaleDateString();
};
const MODES = { 1: 'All Pick', 2: 'Captains Mode', 3: 'Random Draft', 4: 'Single Draft', 5: 'All Random', 16: 'Captains Draft', 18: 'Ability Draft', 20: 'All Random DM', 21: '1v1 Mid', 22: 'All Pick', 23: 'Turbo' };
const modeName = (m) => (m.lobby_type === 7 ? 'Ranked ' : '') + (MODES[m.game_mode] || 'Mode ' + m.game_mode);
const RANKS = ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'];

/* ---------- API ---------- */
function api(path, params = {}, { method = 'GET', fresh = false } = {}) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) (Array.isArray(v) ? v : [v]).forEach(x => u.searchParams.append(k, x));
  if (S.apiKey) u.searchParams.set('api_key', S.apiKey);
  const key = method + ' ' + u;
  if (method === 'GET' && !fresh && S.cache.has(key)) return S.cache.get(key);
  const p = (async () => {
    for (let attempt = 0; ; attempt++) {
      let r;
      try { r = await fetch(u, { method }); }
      catch (e) { throw new Error('Интернэт холболт эсвэл OpenDota API-тай холбогдож чадсангүй.'); }
      if (r.status === 429) {
        if (method === 'GET' && attempt < 5) { rateNote(true); await sleep(15000); continue; }
        rateNote(false);
        throw new Error('OpenDota-ийн хязгаарт хүрлээ (минутад 60 хүсэлт). Түр хүлээгээд дахин оролдоно уу.');
      }
      rateNote(false);
      if (!r.ok) throw new Error(`OpenDota API алдаа: ${r.status}`);
      return r.json();
    }
  })();
  if (method === 'GET') { S.cache.set(key, p); p.catch(() => S.cache.delete(key)); }
  return p;
}

function rateNote(on) {
  let el = document.getElementById('rate');
  if (!el) { el = document.createElement('div'); el.id = 'rate'; el.className = 'rate'; document.body.appendChild(el); }
  el.textContent = 'OpenDota хязгаарт хүрсэн — хэдэн секунд хүлээгээд автоматаар үргэлжилнэ…';
  el.style.display = on ? 'block' : 'none';
}

async function loadConstants() {
  let c = null;
  try { c = JSON.parse(ls('const5') || 'null'); } catch (e) { }
  if (!c || Date.now() - c.t > 3 * 864e5) {
    ['const', 'const2', 'const3', 'const4'].forEach(k => ls(k, null));
    const [h, it, ab, aid] = await Promise.all([api('/constants/heroes'), api('/constants/items'), api('/constants/abilities'), api('/constants/ability_ids')]);
    const heroes = {};
    for (const x of Object.values(h)) heroes[x.id] = { n: x.localized_name, k: x.name, img: x.img, icon: x.icon, roles: x.roles || [], atk: x.attack_type };
    const items = {};
    for (const [k, x] of Object.entries(it)) if (x && x.id != null) items[k] = { id: x.id, n: x.dname || k, img: x.img, cost: x.cost || 0, cr: !!x.created };
    const abil = {};
    for (const [k, x] of Object.entries(ab)) if (x && (x.dname || x.img)) abil[k] = { n: x.dname || k, img: x.img || '', t: x.dmg_type || undefined };
    c = { t: Date.now(), heroes, items, abil, aid };
    try { ls('const5', JSON.stringify(c)); } catch (e) { }
  }
  S.heroes = c.heroes; S.items = c.items; S.abil = c.abil || {}; S.aid = c.aid || {};
  for (const h of Object.values(c.heroes)) S.heroKey[h.k] = h;
  for (const [k, x] of Object.entries(c.items)) S.itemsId[x.id] = { ...x, key: k };
}
const hero = id => S.heroes[id] || { n: 'Unknown', k: '', img: '' };
const heroByKey = k => S.heroKey[k] || null;
const itemByKey = k => S.items[k] || null;
const abilityByKey = k => (S.abil && S.abil[k]) || null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const heroImg = (id, cls = '') => { const h = hero(id); return `<img class="hero ${cls}" src="${CDN}${h.img}" alt="" title="${esc(h.n)}" loading="lazy" onerror="this.style.visibility='hidden'">`; };
const itemImg = (id) => { const it = S.itemsId[id]; if (!it) return '<span class="empty"></span>'; return `<img class="item" src="${CDN}${it.img}" alt="" title="${esc(it.n)}" loading="lazy" onerror="this.style.visibility='hidden'">`; };
const rankInfo = (rt, lb) => {
  if (!rt) return { t: 0, txt: 'Rank тодорхойгүй' };
  const t = Math.floor(rt / 10), s = rt % 10;
  return { t, txt: t === 8 ? 'Immortal' + (lb ? ' #' + lb : '') : `${RANKS[t] || '?'} ${s || ''}` };
};
const rankImg = t => t ? `<img src="https://www.opendota.com/assets/images/dota2/rank_icons/rank_icon_${t}.png" alt="" onerror="this.remove()">` : '';

/* ---------- Router ---------- */
const routes = { overview: viewOverview, live: viewLive, recent: viewRecent, matches: viewMatches, match: viewMatch, heroes: viewHeroes, settings: viewSettings };
async function route() {
  const [, name = 'overview', arg] = (location.hash || '#/overview').split('/');
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.r === name || (name === 'match' && a.dataset.r === 'matches')));
  const view = $('#view');
  const token = ++S.token;
  if (!S.accountId && name !== 'settings') { viewSetup(view); return; }
  view.innerHTML = `<div class="loading"><span class="spin"></span>Ачааллаж байна…</div>`;
  try {
    const r = await (routes[name] || viewOverview)(arg);
    if (token !== S.token) return;
    view.innerHTML = r.html;
    view.scrollTop = 0;
    if (r.after) r.after(view);
  } catch (e) {
    if (token !== S.token) return;
    view.innerHTML = `<div class="err"><b>Алдаа:</b> ${esc(e.message)}<div style="margin-top:10px"><button class="btn ghost" onclick="route()">Дахин оролдох</button></div></div>`;
  }
}

async function loadPlayerCard() {
  const el = $('#playerCard');
  if (!S.accountId) { el.innerHTML = '<span class="muted">Тоглогч сонгоогүй</span>'; return; }
  try {
    const p = await api(`/players/${S.accountId}`);
    const pr = p.profile || {};
    const r = rankInfo(p.rank_tier, p.leaderboard_rank);
    el.innerHTML = `<img class="av" src="${esc(pr.avatarfull || pr.avatarmedium || '')}" alt="" onerror="this.style.visibility='hidden'">
      <div><div class="nm" title="${esc(pr.personaname)}">${esc(pr.personaname || 'ID ' + S.accountId)}</div><div class="rk">${rankImg(r.t)}${esc(r.txt)}</div></div>`;
  } catch (e) { el.innerHTML = `<span class="muted">ID ${esc(S.accountId)}</span>`; }
}

/* ---------- Setup ---------- */
async function resolveInput(q) {
  q = q.trim();
  let m = q.match(/(?:dotabuff\.com|opendota\.com|stratz\.com)\/players\/(\d+)/i);
  if (m) return [{ account_id: +m[1] }];
  m = q.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (m) q = m[1];
  if (/^\d{17}$/.test(q)) return [{ account_id: Number(BigInt(q) - STEAM64) }];
  if (/^\d{1,12}$/.test(q)) return [{ account_id: +q }];
  m = q.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  if (m) q = decodeURIComponent(m[1]);
  return api('/search', { q });
}

function viewSetup(view) {
  view.innerHTML = `<div class="setup">
    <h1>DotaLens-д тавтай морил</h1>
    <div class="sub">Dota 2 статистик, тоглолт бүрийн алдааны дүн шинжилгээ.</div>
    <div class="card">
      <h2>Өөрийн Dota аккаунтаа холбо</h2>
      <form id="sf" class="row">
        <input id="sq" class="inp" style="flex:1" placeholder="Friend ID, Steam profile URL, Dotabuff link эсвэл нэр" autofocus>
        <button class="btn" type="submit">Хайх</button>
      </form>
      <div id="sres" class="results"></div>
      <ol style="margin-top:18px">
        <li>Friend ID: Dota 2 → Profile хэсэгт байгаа тоо (жишээ нь 123456789).</li>
        <li>Эсвэл Dotabuff link: <span class="muted">dotabuff.com/players/123456789</span></li>
        <li><b>Чухал:</b> Dota 2 → Settings → Options → Social → <b>"Expose Public Match Data"</b>-г асаа. Үгүй бол тоглолтууд харагдахгүй.</li>
      </ol>
    </div></div>`;
  const res = $('#sres');
  $('#sf').onsubmit = async e => {
    e.preventDefault();
    const q = $('#sq').value; if (!q.trim()) return;
    res.innerHTML = '<div class="muted"><span class="spin"></span>Хайж байна…</div>';
    try {
      let list = await resolveInput(q);
      if (list.length === 1 && !list[0].personaname) {
        const p = await api(`/players/${list[0].account_id}`);
        if (!p.profile) { res.innerHTML = `<div class="err">${list[0].account_id} ID-тай тоглогч олдсонгүй. ID зөв эсэх, "Expose Public Match Data" асаалттай эсэхийг шалгана уу.</div>`; return; }
        list = [{ account_id: list[0].account_id, personaname: p.profile.personaname, avatarfull: p.profile.avatarfull }];
      }
      if (!list.length) { res.innerHTML = '<div class="muted">Олдсонгүй. Friend ID-гаа оруулж үзээрэй.</div>'; return; }
      res.innerHTML = list.slice(0, 12).map(p => `<div class="res-item" data-id="${p.account_id}">
        <img src="${esc(p.avatarfull || '')}" alt="" onerror="this.style.visibility='hidden'">
        <div><div><b>${esc(p.personaname || 'ID ' + p.account_id)}</b></div><div class="muted" style="font-size:12px">ID ${p.account_id}${p.last_match_time ? ' · сүүлд ' + ago(Date.parse(p.last_match_time) / 1000) : ''}</div></div>
        <div style="margin-left:auto" class="badge">Сонгох</div></div>`).join('');
      res.querySelectorAll('.res-item').forEach(el => el.onclick = () => setAccount(el.dataset.id));
    } catch (err) { res.innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  };
}
function setAccount(id) {
  S.accountId = String(id); ls('accountId', S.accountId); S.cache.clear();
  loadPlayerCard();
  location.hash = '#/overview'; route();
}

/* ---------- Shared data ---------- */
const MATCH_FIELDS = ['hero_id', 'kills', 'deaths', 'assists', 'gold_per_min', 'xp_per_min', 'last_hits', 'duration', 'start_time', 'player_slot',
  'radiant_win', 'party_size', 'game_mode', 'lobby_type', 'hero_damage', 'tower_damage', 'lane_role', 'version', 'leaver_status'];
const getMatches = (limit = 200) => api(`/players/${S.accountId}/matches`, { limit, project: MATCH_FIELDS });

function matchRow(m, compact) {
  const w = isWin(m);
  const res = `<div><div class="${w ? 'w' : 'lo'}" style="font-weight:700">${w ? 'Ялсан' : 'Ялагдсан'}</div><div class="t">${ago(m.start_time)}</div></div>`;
  const kda = `<div class="num"><b>${m.kills}</b>/<span class="lo">${m.deaths}</span>/<b>${m.assists}</b><div class="t">KDA</div></div>`;
  if (compact) return `<a class="mrow ${w ? 'win' : 'loss'}" href="#/match/${m.match_id}">${heroImg(m.hero_id, 'sm')}
    <div><div class="hn">${esc(hero(m.hero_id).n)}</div><div class="t">${esc(modeName(m))}</div></div>${res}${kda}<div class="num">${fmtT(m.duration)}<div class="t">хугацаа</div></div></a>`;
  return `<a class="mrow ${w ? 'win' : 'loss'}" href="#/match/${m.match_id}">${heroImg(m.hero_id)}
    <div><div class="hn">${esc(hero(m.hero_id).n)}</div><div class="t">${esc(modeName(m))}${m.party_size > 1 ? ' · party ' + m.party_size : ''}</div></div>
    ${res}${kda}
    <div class="num">${fmtT(m.duration)}<div class="t">хугацаа</div></div>
    <div class="num">${m.gold_per_min} / ${m.xp_per_min}<div class="t">GPM / XPM</div></div>
    <div>${m.version != null ? '<span class="badge ok">Parsed</span>' : '<span class="badge">Энгийн</span>'}<div class="t">LH ${m.last_hits}</div></div></a>`;
}
const insHTML = list => list.length ? list.map(i => `<div class="ins ins-${i.type}"><div class="ins-ico">${{ bad: '✕', warn: '!', good: '✓', info: 'i' }[i.type]}</div>
  <div><div class="ins-t">${esc(i.title)}</div>${i.detail ? `<div class="ins-d">${esc(i.detail)}</div>` : ''}${i.tip ? `<div class="ins-tip">Зөвлөгөө: ${esc(i.tip)}</div>` : ''}</div></div>`).join('')
  : '<div class="muted">Онцлох зүйл илэрсэнгүй.</div>';

/* ---------- Charts ---------- */
function lineChart(series, { h = 200, area = false, xStep = 5, xFmt = i => i + "'", yFmt = fmtK } = {}) {
  const W = 800, H = h, P = { l: 46, r: 10, t: 10, b: 22 };
  const n = Math.max(...series.map(s => s.data.length));
  if (n < 2) return '<div class="muted">Өгөгдөл хүрэлцэхгүй.</div>';
  const vals = series.flatMap(s => s.data);
  let mn = Math.min(0, ...vals), mx = Math.max(0, ...vals);
  if (mx === mn) mx = mn + 1;
  const pad = (mx - mn) * 0.06; mx += pad; if (mn < 0) mn -= pad;
  const x = i => P.l + (W - P.l - P.r) * i / (n - 1), y = v => P.t + (H - P.t - P.b) * (1 - (v - mn) / (mx - mn));
  let g = '<g class="grid">';
  for (let k = 0; k <= 4; k++) { const v = mn + (mx - mn) * k / 4; g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${yFmt(v)}</text>`; }
  for (let i = 0; i < n; i += xStep) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${xFmt(i)}</text>`;
  g += '</g>';
  const zero = `<line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" stroke="#4a5566" stroke-dasharray="4 3"/>`;
  const id = 'c' + Math.random().toString(36).slice(2, 8);
  let body = '';
  for (const s of series) {
    const pts = s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    if (area) {
      const ap = `M${x(0)},${y(0)} L${pts.join(' L')} L${x(s.data.length - 1)},${y(0)} Z`;
      body += `<defs><clipPath id="${id}a"><rect x="0" y="0" width="${W}" height="${y(0)}"/></clipPath><clipPath id="${id}b"><rect x="0" y="${y(0)}" width="${W}" height="${H}"/></clipPath></defs>
        <path d="${ap}" fill="var(--win)" opacity=".22" clip-path="url(#${id}a)"/><path d="${ap}" fill="var(--loss)" opacity=".22" clip-path="url(#${id}b)"/>`;
    }
    body += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
  }
  const legend = `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}${zero}${body}</svg>${legend}`;
}

/* ---------- Overview ---------- */
async function viewOverview() {
  const [p, wl, ms] = await Promise.all([api(`/players/${S.accountId}`), api(`/players/${S.accountId}/wl`), getMatches(200)]);
  const pr = p.profile || {};
  const valid = ms.filter(m => m.radiant_win != null);
  const last100 = valid.slice(0, 100);
  const W = last100.filter(isWin).length;
  const avg = (f, a = last100) => a.length ? a.reduce((s, m) => s + f(m), 0) / a.length : 0;
  let streak = 0; const sw = valid.length ? isWin(valid[0]) : false;
  for (const m of valid) { if (isWin(m) === sw) streak++; else break; }
  const tot = wl.win + wl.lose;
  const r = rankInfo(p.rank_tier, p.leaderboard_rank);

  const last50 = valid.slice(0, 50).reverse();
  let c = 0; const cum = [0, ...last50.map(m => (c += isWin(m) ? 1 : -1))];
  const gpm = last50.map(m => m.gold_per_min);
  const ma = gpm.map((_, i) => { const a = gpm.slice(Math.max(0, i - 4), i + 1); return a.reduce((s, v) => s + v, 0) / a.length; });

  const byHero = {};
  for (const m of last100) { const h = byHero[m.hero_id] = byHero[m.hero_id] || { id: m.hero_id, g: 0, w: 0, k: 0, d: 0, a: 0 }; h.g++; h.w += isWin(m); h.k += m.kills; h.d += m.deaths; h.a += m.assists; }
  const top = Object.values(byHero).sort((a, b) => b.g - a.g).slice(0, 8);
  const ins = analyzeHistory(valid);
  queueParse(ms.slice(0, 10).filter(m => m.version == null).map(m => m.match_id));

  if (!ms.length) return {
    html: `<h1>${esc(pr.personaname || '')} <span class="muted" style="font-size:14px;font-weight:400">ID ${esc(S.accountId)}</span></h1>
    <div class="banner"><div><b>OpenDota таны тоглолтуудыг хараахан татаж аваагүй байна.</b>
      <div class="muted">"Expose Public Match Data" асаалттай бол доорх товчийг дарахад Steam-ээс тоглолтуудыг чинь татна (10–60 секунд).</div></div>
      <div class="row"><span id="rst" class="muted"></span><button class="btn" id="rf">Тоглолтуудыг татах</button><button class="btn ghost" id="chg">Өөр аккаунт</button></div></div>`,
    after: v => {
      v.querySelector('#chg').onclick = () => { S.accountId = null; ls('accountId', null); loadPlayerCard(); route(); };
      const b = v.querySelector('#rf'), st = v.querySelector('#rst');
      const go = async () => {
        b.disabled = true; st.innerHTML = '<span class="spin"></span>Татаж байна…';
        try { await api(`/players/${S.accountId}/refresh`, {}, { method: 'POST' }); } catch (e) { st.textContent = e.message; b.disabled = false; return; }
        const t0 = Date.now(), tok = S.token;
        const poll = async () => {
          if (tok !== S.token) return;
          const sec = Math.round((Date.now() - t0) / 1000);
          st.innerHTML = `<span class="spin"></span>Татаж байна… ${sec}с`;
          try { const wl2 = await api(`/players/${S.accountId}/wl`, {}, { fresh: true }); if (wl2.win + wl2.lose > 0) { S.cache.clear(); route(); return; } } catch (e) { }
          if (sec > 120) { st.textContent = 'Тоглолт олдсонгүй. "Expose Public Match Data" асаалттай эсэх, ID зөв эсэхийг шалгаад дахин оролдоно уу.'; b.disabled = false; return; }
          setTimeout(poll, 8000);
        };
        setTimeout(poll, 6000);
      };
      b.onclick = go;
      go();
    }
  };

  return {
    html: `<div class="row" style="justify-content:space-between"><div><h1>${esc(pr.personaname || 'ID ' + S.accountId)}</h1>
      <div class="sub">${esc(r.txt)} · Сүүлийн ${valid.length} тоглолтын дүн шинжилгээ</div></div>
      <button class="btn ghost" id="refresh">↻ Шинэчлэх</button></div>
    <div class="stats">
      <div class="stat"><div class="l">Нийт</div><div class="v">${tot ? pct(wl.win / tot) : '—'}</div><div class="s"><span class="w">${wl.win}</span> - <span class="lo">${wl.lose}</span></div></div>
      <div class="stat"><div class="l">Сүүлийн ${last100.length}</div><div class="v ${W / last100.length >= 0.5 ? 'w' : 'lo'}">${pct(W / Math.max(1, last100.length))}</div><div class="s">${W} ялалт</div></div>
      <div class="stat"><div class="l">Дундаж KDA</div><div class="v">${avg(m => m.kills).toFixed(1)}/<span class="lo">${avg(m => m.deaths).toFixed(1)}</span>/${avg(m => m.assists).toFixed(1)}</div><div class="s">K / D / A</div></div>
      <div class="stat"><div class="l">GPM / XPM</div><div class="v">${Math.round(avg(m => m.gold_per_min))} / ${Math.round(avg(m => m.xp_per_min))}</div><div class="s">дундаж</div></div>
      <div class="stat"><div class="l">Streak</div><div class="v ${sw ? 'w' : 'lo'}">${streak} ${sw ? 'ялалт' : 'ялагдал'}</div><div class="s">дараалсан</div></div>
    </div>
    <div class="grid g2">
      <div class="card"><h2>Сүүлийн 50 тоглолт — ялалт/ялагдлын шугам</h2>
        ${lineChart([{ name: 'Цэвэр ялалт (+1 / −1)', color: 'var(--gold)', data: cum }], { h: 200, area: true, xStep: 10, xFmt: i => '#' + i, yFmt: v => Math.round(v) })}
        <div class="strip">${last50.map(m => `<a class="${isWin(m) ? 'win' : 'loss'}" href="#/match/${m.match_id}" title="${esc(hero(m.hero_id).n)} ${m.kills}/${m.deaths}/${m.assists}"></a>`).join('')}</div></div>
      <div class="card"><h2>GPM-ийн явц (5 тоглолтын дундаж)</h2>
        ${lineChart([{ name: 'GPM', color: '#5b9be0', data: gpm }, { name: '5-ын дундаж', color: 'var(--gold)', data: ma }], { h: 200, xStep: 10, xFmt: i => '#' + (i + 1), yFmt: v => Math.round(v) })}</div>
    </div>
    <div class="card"><h2>Таны тоглолтын хэв маяг — юу буруу, юу зөв байна</h2>
      <div class="score">${['bad', 'warn', 'good'].map(t => `<span class="pill ${t}">${ins.filter(i => i.type === t).length} ${{ bad: 'ноцтой алдаа', warn: 'анхааруулга', good: 'давуу тал' }[t]}</span>`).join('')}</div>
      ${insHTML(ins)}</div>
    <div class="grid g2">
      <div class="card"><h2>Их тоглосон баатрууд (сүүлийн ${last100.length})</h2>
        <table><tr><th>Баатар</th><th>Тоглолт</th><th>Winrate</th><th>KDA</th></tr>
        ${top.map(h => `<tr><td><div class="tname">${heroImg(h.id, 'sm')}${esc(hero(h.id).n)}</div></td><td>${h.g}</td>
          <td><div class="hbar"><span class="${h.w / h.g >= 0.5 ? 'w' : 'lo'}" style="width:38px">${pct(h.w / h.g)}</span><div class="bar"><i style="width:${pct(h.w / h.g)};background:${h.w / h.g >= 0.5 ? 'var(--win)' : 'var(--loss)'}"></i></div></div></td>
          <td>${((h.k + h.a) / Math.max(1, h.d)).toFixed(2)}</td></tr>`).join('')}</table></div>
      <div class="card"><h2>Сүүлийн тоглолтууд</h2><div class="mlist compact">${ms.slice(0, 10).map(m => matchRow(m, true)).join('')}</div>
        <div style="margin-top:10px"><a class="btn ghost" href="#/matches">Бүгдийг харах →</a></div></div>
    </div>`,
    after: v => {
      v.querySelector('#refresh').onclick = async e => {
        e.target.disabled = true; e.target.textContent = 'Шинэчилж байна…';
        try { await api(`/players/${S.accountId}/refresh`, {}, { method: 'POST' }); } catch (err) { }
        setTimeout(() => { S.cache.clear(); loadPlayerCard(); route(); }, 4000);
      };
    }
  };
}

/* ---------- Matches ---------- */
async function viewMatches() {
  const ms = await getMatches(200);
  const heroes = [...new Set(ms.map(m => m.hero_id))].sort((a, b) => hero(a).n.localeCompare(hero(b).n));
  return {
    html: `<h1>Тоглолтууд</h1><div class="sub">Сүүлийн ${ms.length} тоглолт. Аль нэгийг дарж дэлгэрэнгүй дүн шинжилгээг хар.</div>
      <div class="toolbar">
        <select id="fr" class="inp"><option value="">Бүх үр дүн</option><option value="w">Ялсан</option><option value="l">Ялагдсан</option></select>
        <select id="fh" class="inp"><option value="">Бүх баатар</option>${heroes.map(h => `<option value="${h}">${esc(hero(h).n)}</option>`).join('')}</select>
        <label class="row" style="gap:6px"><input type="checkbox" id="frk"> Зөвхөн Ranked</label>
        <span id="fc" class="muted"></span>
      </div><div id="ml" class="mlist"></div>`,
    after: v => {
      const draw = () => {
        const r = v.querySelector('#fr').value, h = v.querySelector('#fh').value, rk = v.querySelector('#frk').checked;
        const f = ms.filter(m => (!r || (r === 'w') === isWin(m)) && (!h || m.hero_id == h) && (!rk || m.lobby_type === 7));
        const w = f.filter(isWin).length;
        v.querySelector('#fc').textContent = `${f.length} тоглолт · winrate ${f.length ? pct(w / f.length) : '—'}`;
        v.querySelector('#ml').innerHTML = f.map(m => matchRow(m)).join('') || '<div class="muted">Тоглолт алга.</div>';
      };
      v.querySelectorAll('select, input').forEach(el => el.onchange = draw);
      draw();
    }
  };
}

/* ---------- Deep sections ---------- */
const sgn = v => v == null ? '—' : (v >= 0 ? '+' : '−') + fmtK(Math.abs(v));
const sgnCls = v => v == null ? 'muted' : v >= 0 ? 'w' : 'lo';
const keyHeroImg = (p) => p ? heroImg(p.hero_id, 'sm') : '<span></span>';

function itemIcon(k, big) {
  const it = itemByKey(k); if (!it) return '';
  return `<span class="ii${big ? ' big' : ''}" title="${esc(it.n)}"><img src="${CDN}${it.img}" alt="" onerror="this.style.visibility='hidden'"><span>${esc(it.n)}</span></span>`;
}
function itemAdviceHTML(m, me, compact) {
  const a = itemAdvice(m, me), ds = a.ds, tot = ds.total || 1;
  const bar = ds.total > 0 ? `<div class="dsplit"><i style="width:${pct(ds.mag / tot)};background:#5b9be0" title="Магик"></i><i style="width:${pct(ds.phys / tot)};background:var(--loss)" title="Физик"></i><i style="width:${pct(ds.pure / tot)};background:#e8e8e8" title="Pure"></i><i style="width:${pct(ds.other / tot)};background:#4a5566" title="Бусад"></i></div>
    <div class="legend"><span><i style="background:#5b9be0"></i>Магик ${pct(ds.mag / tot)}</span><span><i style="background:var(--loss)"></i>Физик ${pct(ds.phys / tot)}</span><span><i style="background:#e8e8e8"></i>Pure ${pct(ds.pure / tot)}</span>${ds.other ? `<span><i style="background:#4a5566"></i>Тодорхойгүй ${pct(ds.other / tot)}</span>` : ''}<span>· нийт ${fmtK(ds.total)} damage авсан</span></div>` : '';
  const thr = a.th.filter(t => t.dmg > 0 || t.kills).slice(0, 5).map(t => `<div class="thr">${heroImg(t.p.hero_id, 'sm')}<div><div>${esc(hero(t.p.hero_id).n)}</div>
    <div class="muted" style="font-size:12px">${fmtK(t.dmg)} damage (${pct(t.share)}) · ${t.kills} удаа алсан</div></div></div>`).join('');
  const recs = a.recs.map(r => {
    const st = !r.have ? '<span class="tag bad">✕ Аваагүй</span>'
      : r.late ? `<span class="tag warn">⏱ Оройтсон: ${esc(itemByKey(r.have.k).n)} ${fmtT(r.have.time)}</span>`
      : `<span class="tag ok">✓ Авсан: ${esc(itemByKey(r.have.k).n)}${r.have.time != null ? ' ' + fmtT(r.have.time) : ''}</span>`;
    return `<div class="rec ${!r.have ? 'miss' : r.late ? 'late' : 'ok'}"><div class="row" style="justify-content:space-between"><b>${esc(r.title)}</b>${st}</div>
      <div class="muted" style="margin:4px 0 8px">${esc(r.why)}${r.deathsBy && !r.have ? ` Энэ шалтгаанаар ${r.deathsBy} удаа үхсэн.` : ''}${r.late ? ` Авахаасаа өмнө ${r.before} удаа үхсэн.` : ''}</div>
      <div class="iis">${r.items.map(k => itemIcon(k)).join('')}</div></div>`;
  }).join('') || '<div class="muted">Онцгой хэрэгцээ илрээгүй — энэ тоглолтод стандарт build тохирох байсан.</div>';
  const mis = a.mis.map(x => `<div class="rec late"><div class="row" style="gap:10px">${itemIcon(x.k)}<span class="muted">${esc(x.why)}</span></div></div>`).join('');
  const myBuild = (me.purchase_log || []).filter(e => { const it = itemByKey(e.key); return it && it.cost >= 1000 && !CONSUMABLES.has(e.key) && !e.key.startsWith('recipe'); });
  return `<div class="card"><h2>Item зөвлөгөө — энэ тоглолтод яг юу хэрэгтэй байсан</h2>
    <div class="muted" style="font-size:12px;margin-bottom:12px">Нийтлэг build биш: чамд ирсэн damage-ийн төрөл, чамайг хэн алсан, дайсны баатруудын онцлогоос тооцоолсон. Роль: ${ROLE_NAMES[a.role] || ''}.</div>
    <div class="grid ${compact ? '' : 'g2'}"><div><h3>Чамд ирсэн damage</h3>${bar}<h3 style="margin-top:14px">Хамгийн аюултай дайснууд</h3><div class="thrs">${thr}</div>
      ${!compact && myBuild.length ? `<h3 style="margin-top:14px">Чиний авсан гол item-ууд</h3><div class="build">${myBuild.map(e => { const it = itemByKey(e.key); return `<div class="bi"><img src="${CDN}${it.img}" alt="" title="${esc(it.n)}" onerror="this.style.visibility='hidden'">${fmtT(e.time)}</div>`; }).join('')}</div>` : ''}</div>
    <div><h3>Хэрэгтэй байсан item-ууд (чухлаас нь эхлээд)</h3>${recs}${mis ? `<h3 style="margin-top:14px">Тохироогүй байж болох item</h3>${mis}` : ''}</div></div></div>`;
}

function storyHTML(m, me) {
  return `<div class="card"><h2>Юу болсон бэ — тоглолтын явц</h2><ol class="story">${matchStory(m, me).map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>`;
}
function phaseHTML(m, me) {
  const ps = phaseStats(m, me);
  return `<div class="card"><h2>Үе шат бүрээр</h2><div class="scroll-x"><table><tr><th>Үе</th><th>Алсан</th><th>Үхсэн</th><th>LH</th><th>LH/мин</th><th>Gold/мин</th><th>Багийн gold</th></tr>
    ${ps.map(p => `<tr><td>${p.name}</td><td>${p.kills}</td><td class="${p.deaths >= 3 ? 'lo' : ''}">${p.deaths}</td><td>${p.lh ?? '—'}</td><td>${p.lhpm != null ? p.lhpm.toFixed(1) : '—'}</td>
      <td>${p.gpm != null ? Math.round(p.gpm) : '—'}</td><td class="${sgnCls(p.adv)}">${sgn(p.adv)}</td></tr>`).join('')}</table></div>
    <div class="muted" style="font-size:12px;margin-top:8px">"Багийн gold" = тухайн үед танай багийн gold-ын давуу байдал хэр өөрчлөгдсөн.</div></div>`;
}
function minuteHTML(m, me) {
  const rows = minuteCompare(m, me); if (!rows.length) return '';
  const op = rows[0].op;
  return `<div class="card"><h2>Минут тутмын харьцуулалт${op ? ` — vs ${esc(hero(op.hero_id).n)}` : ''}</h2><div class="scroll-x"><table><tr><th>Мин</th><th>Таны LH/DN</th>${op ? '<th>Өрсөлдөгч LH</th>' : ''}<th>Таны NW</th>${op ? '<th>Өрсөлдөгч NW</th>' : ''}<th>Багийн дундаж NW</th><th>Багийн давуу</th></tr>
    ${rows.map(r => `<tr><td>${r.t}'</td><td>${r.lh ?? '—'}/${r.dn ?? '—'}</td>${op ? `<td class="${r.opLh > r.lh ? 'lo' : 'w'}">${r.opLh ?? '—'}</td>` : ''}<td class="gd">${fmtK(r.nw || 0)}</td>
      ${op ? `<td class="${r.opNw > r.nw ? 'lo' : 'w'}">${fmtK(r.opNw || 0)}</td>` : ''}<td>${fmtK(r.teamAvg)}</td><td class="${sgnCls(r.adv)}">${sgn(r.adv)}</td></tr>`).join('')}</table></div></div>`;
}
function deathsHTML(m, me) {
  const dd = deathDetails(m, me);
  const solo = dd.filter(d => d.solo).length, tf = dd.filter(d => d.tf).length;
  return `<div class="card"><h2>Үхэл бүр (${dd.length})</h2>
    ${dd.length ? `<div class="score"><span class="pill bad">${solo} ганцаараа баригдсан</span><span class="pill warn">${tf} багийн тулаанд</span><span class="pill">${dd.length - solo - tf} бусад</span></div>` : ''}
    <div class="dl">${dd.map(d => {
      const ctx = d.tf ? `<span class="tag warn">Тулаан (${d.tf.deaths} үхэл)</span>` : d.solo ? '<span class="tag bad">Ганцаараа</span>' : `<span class="tag">Хамт ${d.mates} нөхөр үхсэн</span>`;
      const nw = d.myNW != null && d.kNW != null ? `NW ${fmtK(d.myNW)} vs ${fmtK(d.kNW)}` : '';
      return `<div class="drow2"><span class="tm">${fmtT(d.time)}</span><span class="tag">${d.phase}</span>${keyHeroImg(d.killer)}
        <span>${d.killer ? esc(hero(d.killer.hero_id).n) + ' алсан' : esc(String(d.key || 'Тодорхойгүй').replace(/^npc_dota_/, '').replace(/_/g, ' '))}</span>${ctx}
        <span class="muted" style="font-size:12px;text-align:right">${[nw, d.gold_lost != null ? `−${d.gold_lost}g` : '', d.time_dead ? `${d.time_dead}с үхсэн` : ''].filter(Boolean).join(' · ')}</span></div>`;
    }).join('') || `<div class="muted">${me.deaths ? 'Үхлийн дэлгэрэнгүй мэдээлэл алга.' : 'Нэг ч удаа үхээгүй!'}</div>`}</div></div>`;
}
function fightsHTML(m, me) {
  const fs = fightsOf(m, me); if (!fs.length) return '';
  return `<div class="card"><h2>Багийн тулаан бүр (${fs.length})</h2><div class="scroll-x"><table><tr><th>Цаг</th><th>Үхэл (бид : тэд)</th><th>Үр дүн</th><th>Чи</th><th>Таны K/D</th><th>Таны damage</th><th>Таны gold</th><th>Эхэнд үхсэн</th></tr>
    ${fs.map(f => `<tr><td>${fmtT(f.start)}</td><td><span class="lo">${f.our}</span> : <span class="w">${f.their}</span></td>
      <td class="${f.won ? 'w' : f.even ? 'muted' : 'lo'}">${f.won ? 'Ялсан' : f.even ? 'Тэнцүү' : 'Ялагдсан'}</td>
      <td>${f.present ? 'Оролцсон' : '<span class="lo">Байгаагүй</span>'}</td><td>${f.present ? `${f.myKills}/${f.myDeaths}` : '—'}</td><td>${f.present ? fmtK(f.myDmg) : '—'}</td>
      <td class="${sgnCls(f.gold)}">${f.present ? sgn(f.gold) : '—'}</td>
      <td>${f.first && f.first.victim ? `<div class="tname">${heroImg(f.first.victim.hero_id, 'sm')}${f.firstDeathMe ? '<b class="lo">Чи</b>' : ''}</div>` : '—'}</td></tr>`).join('')}</table></div></div>`;
}
function dmgHTML(title, list, color) {
  const mx = Math.max(1, ...list.map(x => x.v));
  return `<div class="card"><h2>${title}</h2>${list.map(x => `<div class="bm2"><span title="${esc(x.k)}">${esc(x.n)}</span><div class="bar"><i style="width:${(x.v / mx * 100).toFixed(1)}%;background:${color}"></i></div><span class="val">${fmtK(x.v)}</span></div>`).join('') || '<div class="muted">Мэдээлэл алга.</div>'}</div>`;
}
function goldHTML(me) {
  const g = goldSources(me);
  return `<div class="card"><h2>Gold хаанаас олсон</h2>${g.map(x => `<div class="bm2"><span>${x.n}</span><div class="bar"><i style="width:${pct(x.p)};background:var(--gold)"></i></div><span class="val">${pct(x.p)}</span></div>`).join('') || '<div class="muted">Мэдээлэл алга.</div>'}</div>`;
}
function abilityHTML(me) {
  const arr = me.ability_upgrades_arr || []; if (!arr.length) return '';
  return `<div class="card"><h2>Skill авсан дараалал</h2><div class="build">${arr.map((id, i) => {
    const k = S.aid[id], a = k ? abilityByKey(k) : null, talent = k && k.startsWith('special_bonus');
    const icon = a && a.img ? `<img src="${CDN}${a.img}" alt="" title="${esc(a.n)}" onerror="this.style.visibility='hidden'">` : `<span class="talent" title="${esc(a ? a.n : k || '')}">${talent ? 'T' : '?'}</span>`;
    return `<div class="bi">${icon}Lv${i + 1}</div>`; }).join('')}</div></div>`;
}

/* ---------- Recent matches deep feed ---------- */
async function viewRecent() {
  const ms = (await getMatches(200)).slice(0, 10);
  queueParse(ms.filter(m => m.version == null).map(m => m.match_id));
  return {
    html: `<div class="row" style="justify-content:space-between"><div><h1>Сүүлийн 10 тоглолт — дэлгэрэнгүй</h1>
      <div class="sub">Тоглолт бүрт юу болсон, ямар алдаа гаргасан, хэрхэн үхсэн. Parse хийгдээгүйг автоматаар задлуулна.</div></div>
      <button class="btn ghost" id="rl">↻ Шинэчлэх</button></div>
      <div id="habit"></div>
      <div id="feed">${ms.map(m => `<div class="card feed" id="f${m.match_id}">${feedHead(m)}<div class="fbody"><div class="muted"><span class="spin"></span>Ачааллаж байна…</div></div></div>`).join('')}</div>`,
    after: async v => {
      const tok = S.token;
      v.querySelector('#rl').onclick = () => { S.cache.clear(); route(); };
      const advs = {};
      const drawHabit = () => {
        const el = v.querySelector('#habit'); if (!el) return;
        const list = Object.values(advs); if (list.length < 2) return;
        const agg = {};
        for (const a of list) for (const r of a.recs) {
          if (r.prio < 0.6) continue;
          const g = agg[r.need] = agg[r.need] || { n: 0, miss: 0, late: 0, items: r.items, title: r.title };
          g.n++; if (!r.have) g.miss++; else if (r.late) g.late++;
        }
        const rows = Object.entries(agg).filter(([, g]) => g.miss + g.late > 0).sort((a, b) => (b[1].miss + b[1].late) - (a[1].miss + a[1].late));
        el.innerHTML = `<div class="card"><h2>Item-ийн зуршил — parse хийгдсэн ${list.length} тоглолтоор</h2>
          ${rows.length ? rows.map(([need, g]) => `<div class="rec ${g.miss / g.n >= 0.5 ? 'miss' : 'late'}"><div class="row" style="justify-content:space-between">
            <b>${esc(NEED_LABEL[need] || need)}: ${g.n} тоглолтын ${g.miss}-д аваагүй${g.late ? `, ${g.late}-д оройтсон` : ''}</b></div>
            <div class="iis" style="margin-top:8px">${g.items.map(k => itemIcon(k)).join('')}</div></div>`).join('')
          : '<div class="muted">Хэрэгтэй item-ээ ихэнхдээ цагтаа авч байна. Сайн байна!</div>'}</div>`;
      };
      const load = async (m, fresh) => {
        try {
          const d = await api(`/matches/${m.match_id}`, {}, { fresh });
          if (tok !== S.token) return true;
          d.players.forEach(p => { if (p.isRadiant == null) p.isRadiant = p.player_slot < 128; });
          const me = d.players.find(p => String(p.account_id) === String(S.accountId));
          const el = v.querySelector(`#f${m.match_id} .fbody`);
          if (el) el.innerHTML = me ? feedBody(d, me) : '<div class="muted">Таны тоглогч олдсонгүй.</div>';
          if (me && d.version != null) { try { advs[m.match_id] = itemAdvice(d, me); } catch (e) { } drawHabit(); }
          return d.version != null;
        } catch (e) { const el = v.querySelector(`#f${m.match_id} .fbody`); if (el) el.innerHTML = `<div class="err">${esc(e.message)}</div>`; return true; }
      };
      const done = {};
      for (const m of ms) { if (tok !== S.token) return; done[m.match_id] = await load(m, false); }
      for (let round = 0; round < 12; round++) {
        await sleep(60000);
        if (tok !== S.token) return;
        const left = ms.filter(m => !done[m.match_id]);
        if (!left.length) return;
        for (const m of left) { if (tok !== S.token) return; done[m.match_id] = await load(m, true); }
      }
    }
  };
}
function feedHead(m) {
  const w = isWin(m);
  return `<div class="fhead"><a href="#/match/${m.match_id}" class="row" style="gap:12px">${heroImg(m.hero_id)}
    <div><div style="font-weight:700;font-size:16px">${esc(hero(m.hero_id).n)} <span class="${w ? 'w' : 'lo'}">${w ? 'Ялсан' : 'Ялагдсан'}</span></div>
    <div class="muted" style="font-size:12px">${esc(modeName(m))} · ${fmtT(m.duration)} · ${ago(m.start_time)}</div></div></a>
    <div class="row" style="gap:18px;margin-left:auto"><div class="num"><b>${m.kills}</b>/<span class="lo">${m.deaths}</span>/<b>${m.assists}</b><div class="t muted">KDA</div></div>
    <div class="num">${m.last_hits}<div class="t muted">LH</div></div><div class="num">${m.gold_per_min}/${m.xp_per_min}<div class="t muted">GPM/XPM</div></div>
    <a class="btn ghost" href="#/match/${m.match_id}">Бүрэн задаргаа →</a></div></div>`;
}
function feedBody(m, me) {
  const parsed = m.version != null, ins = analyzeMatch(m, me);
  const head = `<div class="score">${['bad', 'warn', 'good'].map(t => `<span class="pill ${t}">${ins.filter(i => i.type === t).length} ${{ bad: 'алдаа', warn: 'анхааруулга', good: 'сайн зүйл' }[t]}</span>`).join('')}
    ${parsed ? '<span class="badge ok">Parsed</span>' : `<span class="badge"><span class="spin" style="width:10px;height:10px"></span>Replay задлагдаж байна — дуусахаар энд гүнзгий задаргаа гарна</span>`}</div>`;
  if (!parsed) return head + insHTML(ins);
  return head + `<div class="grid g2"><div><h3>Юу болсон</h3><ol class="story">${matchStory(m, me).map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>
    <div><h3>Алдаа ба сайн зүйлс</h3>${insHTML(ins)}</div></div>
    <div class="grid" style="margin-top:12px">${itemAdviceHTML(m, me)}${phaseHTML(m, me)}${deathsHTML(m, me)}</div>`;
}

/* ---------- Parse queue ---------- */
const PQ = { q: [], running: false };
function parseReqMap() { try { return JSON.parse(ls('preq') || '{}'); } catch (e) { return {}; } }
function updPQ() { const el = $('#pq'); if (el) el.innerHTML = PQ.q.length ? `<span class="spin" style="width:10px;height:10px"></span>Parse дараалал: ${PQ.q.length}` : ''; }
function queueParse(ids) {
  const mp = parseReqMap(), now = Date.now();
  for (const id of ids) if (!(mp[id] && now - mp[id] < 6 * 3600e3) && !PQ.q.includes(id)) PQ.q.push(id);
  updPQ(); runPQ();
}
async function runPQ() {
  if (PQ.running) return; PQ.running = true;
  while (PQ.q.length) {
    const id = PQ.q[0];
    try {
      await api(`/request/${id}`, {}, { method: 'POST' });
      const mp = parseReqMap(); mp[id] = Date.now(); ls('preq', JSON.stringify(mp));
      PQ.q.shift(); updPQ(); await sleep(8000);
    } catch (e) {
      if (/хязгаар/.test(e.message)) { await sleep(65000); } else { PQ.q.shift(); updPQ(); }
    }
  }
  PQ.running = false; updPQ();
}

/* ---------- Single match ---------- */
async function viewMatch(id) {
  const fresh = S.freshMatch === id; S.freshMatch = null;
  const m = await api(`/matches/${id}`, {}, { fresh });
  const parsed = m.version != null;
  m.players.forEach(p => { if (p.isRadiant == null) p.isRadiant = p.player_slot < 128; });
  const me = m.players.find(p => String(p.account_id) === String(S.accountId));
  const myRad = me ? me.isRadiant : true;
  const won = me ? isWin(me) : m.radiant_win;
  const ins = me ? analyzeMatch(m, me) : [];
  const role = me ? roleOf(m, me) : 0;
  const adv = me ? teamAdv(m, me) : { gold: m.radiant_gold_adv || [], xp: m.radiant_xp_adv || [] };
  const date = new Date(m.start_time * 1000).toLocaleString();

  let html = `<div class="row" style="justify-content:space-between;margin-bottom:14px"><a class="btn ghost" href="#/matches">← Буцах</a>
    <span class="muted">Match ${m.match_id} · ${date} · ${esc(modeName(m))}</span></div>`;

  html += `<div class="card"><div class="mhead">
    ${me ? heroImg(me.hero_id, 'lg') : ''}
    <div><div class="res ${won ? 'w' : 'lo'}">${won ? 'ЯЛСАН' : 'ЯЛАГДСАН'}</div>
      ${me ? `<div class="muted">${esc(hero(me.hero_id).n)} · ${ROLE_NAMES[role] || ''} · Level ${me.level}</div>` : '<div class="muted">Энэ тоглолтод таны аккаунт олдсонгүй</div>'}</div>
    ${me ? `<div><div class="kda">${me.kills} / <span class="lo">${me.deaths}</span> / ${me.assists}</div><div class="muted">K / D / A</div></div>
    <div><div class="kda">${me.last_hits} / ${me.denies}</div><div class="muted">LH / DN</div></div>
    <div><div class="kda">${me.gold_per_min} / ${me.xp_per_min}</div><div class="muted">GPM / XPM</div></div>
    <div><div class="kda gd">${fmtK(me.net_worth || me.total_gold || 0)}</div><div class="muted">Net worth</div></div>` : ''}
    <div style="margin-left:auto;text-align:right"><div class="scoreline"><span class="r">${m.radiant_score}</span><span class="muted">:</span><span class="d">${m.dire_score}</span></div><div class="muted">${fmtT(m.duration)}</div></div>
  </div></div>`;

  if (!parsed) html += `<div class="banner"><div><b>Энэ тоглолт parse хийгдээгүй байна.</b><div class="muted">Replay-г задлуулбал үхэл бүр, лайн, ward, item timing зэрэг гүнзгий дүн шинжилгээ гарна (1–3 минут).</div></div>
    <div class="row"><span id="pst" class="muted"></span><button class="btn" id="parse">Replay parse хүсэх</button></div></div>`;

  if (me && parsed) html += storyHTML(m, me);

  if (me) html += `<div class="card"><h2>Дүн шинжилгээ — юу болсон, ямар алдаа гаргасан</h2>
    <div class="score">${['bad', 'warn', 'good'].map(t => `<span class="pill ${t}">${ins.filter(i => i.type === t).length} ${{ bad: 'алдаа', warn: 'анхааруулга', good: 'сайн зүйл' }[t]}</span>`).join('')}</div>
    ${insHTML(ins)}</div>`;

  if (me && parsed) html += itemAdviceHTML(m, me);

  if (adv.gold.length > 1) html += `<div class="card"><h2>Багийн давуу байдал ${me ? '(таны багийн талаас)' : '(Radiant)'}</h2>
    ${lineChart([{ name: 'Gold давуу', color: 'var(--gold)', data: adv.gold }, { name: 'XP давуу', color: '#5b9be0', data: adv.xp, dash: true }], { area: true, h: 220 })}</div>`;

  if (me && parsed) {
    const op = laneOpponent(m, me);
    const g = [];
    if (me.networth_t || me.gold_t) {
      const ser = [{ name: `Та (${hero(me.hero_id).n}) net worth`, color: 'var(--gold)', data: me.networth_t || me.gold_t }];
      if (op) ser.push({ name: `Лайн өрсөлдөгч ${hero(op.hero_id).n}`, color: 'var(--loss)', data: op.networth_t || op.gold_t, dash: true });
      g.push(`<div class="card"><h2>Net worth: та vs лайн өрсөлдөгч</h2>${lineChart(ser, { h: 200 })}</div>`);
    }
    if (me.lh_t) {
      const ser = [{ name: 'Таны last hit', color: '#5b9be0', data: me.lh_t }];
      if (op && op.lh_t) ser.push({ name: `${hero(op.hero_id).n} last hit`, color: 'var(--loss)', data: op.lh_t, dash: true });
      g.push(`<div class="card"><h2>Last hit-ийн явц</h2>${lineChart(ser, { h: 200, yFmt: v => Math.round(v) })}</div>`);
    }
    html += `<div class="grid g2">${g.join('')}</div>`;

    const bm = me.benchmarks || {};
    const BL = { gold_per_min: 'GPM', xp_per_min: 'XPM', kills_per_min: 'Kill/мин', last_hits_per_min: 'Last hit/мин', hero_damage_per_min: 'Hero dmg/мин', hero_healing_per_min: 'Heal/мин', tower_damage: 'Tower dmg' };
    html += `<div class="grid g2">${phaseHTML(m, me)}${minuteHTML(m, me)}</div>`;
    html += `<div class="grid g2">
      <div class="card"><h2>${esc(hero(me.hero_id).n)}-ийн бусад тоглогчидтой харьцуулалт</h2>
        <div class="muted" style="margin-bottom:10px;font-size:12px">Хувь = энэ баатрыг тоглосон тоглогчдын хэдэн хувиас илүү байсан.</div>
        ${Object.entries(BL).filter(([k]) => bm[k]).map(([k, l]) => { const b = bm[k], c = b.pct >= 0.6 ? 'var(--win)' : b.pct >= 0.35 ? 'var(--warn)' : 'var(--loss)';
          return `<div class="bm"><span>${l}</span><div class="bar"><i style="width:${pct(b.pct)};background:${c}"></i></div><span class="val muted">${b.raw >= 100 ? Math.round(b.raw) : (+b.raw).toFixed(2)}</span><span class="pc" style="color:${c}">${pct(b.pct)}</span></div>`; }).join('') || '<div class="muted">Benchmark алга.</div>'}</div>
      ${deathsHTML(m, me)}</div>`;
    html += fightsHTML(m, me);
    html += `<div class="grid g3">${dmgHTML('Чамайг юу их гэмтээсэн', topDamageTaken(me), 'var(--loss)')}${dmgHTML('Чиний damage юунаас гарсан', topDamageDealt(me), 'var(--win)')}${goldHTML(me)}</div>`;
    html += abilityHTML(me);

    const build = (me.purchase_log || []).filter(e => { const it = itemByKey(e.key); return it && it.cost >= 500 && !CONSUMABLES.has(e.key) && !e.key.startsWith('recipe'); });
    html += `<div class="card"><h2>Item build-ийн дараалал</h2><div class="build">
      ${build.map(e => { const it = itemByKey(e.key); return `<div class="bi"><img src="${CDN}${it.img}" alt="" title="${esc(it.n)}" onerror="this.style.visibility='hidden'">${fmtT(e.time)}</div>`; }).join('') || '<span class="muted">Мэдээлэл алга.</span>'}
      </div><div class="muted" style="margin-top:10px;font-size:12px">Ward: ${me.obs_placed || 0} observer, ${me.sen_placed || 0} sentry · Stun: ${(me.stuns || 0).toFixed(1)}с · Stack: ${me.camps_stacked || 0} · Teamfight: ${me.teamfight_participation != null ? pct(me.teamfight_participation) : '—'} · APM: ${me.actions_per_min || '—'}</div></div>`;
  }

  const teamTable = rad => {
    const ps = m.players.filter(p => p.isRadiant === rad);
    return `<div class="team-h ${rad ? 'r' : 'd'}">${rad ? 'Radiant' : 'Dire'} ${m.radiant_win === rad ? '— Ялсан' : ''}</div>
    <div class="scroll-x"><table><tr><th>Тоглогч</th><th>K/D/A</th><th>LH/DN</th><th>GPM/XPM</th><th>NW</th><th>Hero dmg</th><th>Tower</th><th>Heal</th><th>Items</th></tr>
    ${ps.map(p => `<tr class="${me && p === me ? 'me' : ''}"><td><div class="tname">${heroImg(p.hero_id, 'sm')}<div><div class="pn">${p.account_id ? `<a href="#" data-acc="${p.account_id}">${esc(p.personaname || 'ID ' + p.account_id)}</a>` : '<span class="muted">Anonymous</span>'}</div><div class="muted" style="font-size:11px">${esc(hero(p.hero_id).n)} · Lv ${p.level}</div></div></div></td>
      <td>${p.kills}/${p.deaths}/${p.assists}</td><td>${p.last_hits}/${p.denies}</td><td>${p.gold_per_min}/${p.xp_per_min}</td><td class="gd">${fmtK(p.net_worth || p.total_gold || 0)}</td>
      <td>${fmtK(p.hero_damage || 0)}</td><td>${fmtK(p.tower_damage || 0)}</td><td>${fmtK(p.hero_healing || 0)}</td>
      <td><div class="items">${[0, 1, 2, 3, 4, 5].map(i => itemImg(p['item_' + i])).join('')}</div></td></tr>`).join('')}</table></div>`;
  };
  html += `<div class="card"><h2>Онооны самбар</h2>${teamTable(myRad)}<div style="height:14px"></div>${teamTable(!myRad)}</div>`;

  return {
    html,
    after: v => {
      v.querySelectorAll('[data-acc]').forEach(a => a.onclick = e => { e.preventDefault(); if (confirm('Энэ тоглогчийн статистик руу шилжих үү?')) setAccount(a.dataset.acc); });
      const b = v.querySelector('#parse');
      if (b) b.onclick = async () => {
        const st = v.querySelector('#pst');
        b.disabled = true; st.innerHTML = '<span class="spin"></span>Хүсэлт илгээж байна…';
        try { await api(`/request/${id}`, {}, { method: 'POST' }); }
        catch (e) { st.textContent = e.message; b.disabled = false; return; }
        const t0 = Date.now(), tok = S.token;
        const poll = async () => {
          if (tok !== S.token) return;
          const sec = Math.round((Date.now() - t0) / 1000);
          st.innerHTML = `<span class="spin"></span>Parse хийж байна… ${sec}с`;
          try {
            const mm = await api(`/matches/${id}`, {}, { fresh: true });
            if (mm.version != null) { S.cache.clear(); S.freshMatch = id; route(); return; }
          } catch (e) { }
          if (sec > 300) { st.textContent = 'Удаж байна. Дараа дахин нээж үзээрэй (хуучин тоглолтын replay устсан байж магадгүй).'; b.disabled = false; return; }
          setTimeout(poll, 10000);
        };
        setTimeout(poll, 8000);
      };
    }
  };
}

/* ---------- Heroes ---------- */
async function viewHeroes() {
  const [hs, ms] = await Promise.all([api(`/players/${S.accountId}/heroes`), getMatches(200)]);
  const agg = {};
  for (const m of ms) { const a = agg[m.hero_id] = agg[m.hero_id] || { g: 0, k: 0, d: 0, a: 0, gpm: 0 }; a.g++; a.k += m.kills; a.d += m.deaths; a.a += m.assists; a.gpm += m.gold_per_min; }
  const list = hs.filter(h => h.games > 0).sort((a, b) => b.games - a.games);
  return {
    html: `<h1>Баатрууд</h1><div class="sub">Бүх цаг үеийн статистик. KDA/GPM нь сүүлийн 200 тоглолтоос.</div>
    <div class="card scroll-x"><table><tr><th>Баатар</th><th>Тоглолт</th><th>Winrate</th><th>Сүүлд</th><th>Дундаж K/D/A</th><th>GPM</th><th>Хамт тоглосон</th><th>Эсрэг</th></tr>
    ${list.map(h => { const wr = h.win / h.games, a = agg[h.hero_id];
      return `<tr><td><div class="tname">${heroImg(h.hero_id, 'sm')}${esc(hero(h.hero_id).n)}</div></td><td>${h.games}</td>
      <td><div class="hbar"><span class="${wr >= 0.5 ? 'w' : 'lo'}" style="width:38px">${pct(wr)}</span><div class="bar"><i style="width:${pct(wr)};background:${wr >= 0.5 ? 'var(--win)' : 'var(--loss)'}"></i></div></div></td>
      <td class="muted">${h.last_played ? ago(h.last_played) : '—'}</td>
      <td>${a ? `${(a.k / a.g).toFixed(1)}/<span class="lo">${(a.d / a.g).toFixed(1)}</span>/${(a.a / a.g).toFixed(1)}` : '<span class="muted">—</span>'}</td>
      <td>${a ? Math.round(a.gpm / a.g) : '<span class="muted">—</span>'}</td>
      <td class="muted">${h.with_games ? `${h.with_games} (${pct(h.with_win / h.with_games)})` : '—'}</td>
      <td class="muted">${h.against_games ? `${h.against_games} (${pct(h.against_win / h.against_games)})` : '—'}</td></tr>`; }).join('')}
    </table></div>`
  };
}

/* ---------- Settings ---------- */
async function viewSettings() {
  return {
    html: `<h1>Тохиргоо</h1><div class="sub">Аккаунт, API түлхүүр</div>
    <div class="card"><h2>Холбогдсон аккаунт</h2>
      <div class="row"><span>Account ID: <b>${esc(S.accountId || '—')}</b></span><button class="btn ghost" id="chg">Аккаунт солих</button></div></div>
    <div class="card"><h2>OpenDota API key (заавал биш)</h2>
      <div class="muted" style="margin-bottom:10px">Түлхүүргүйгээр минутад 60, өдөрт 2000 хүсэлт хийх боломжтой — хувийн хэрэглээнд хангалттай. Илүү хэрэгтэй бол opendota.com/api-keys -ээс авна.</div>
      <div class="row"><input id="key" class="inp" style="flex:1" type="password" value="${esc(S.apiKey)}" placeholder="API key"><button class="btn" id="sv">Хадгалах</button></div></div>
    <div class="card"><h2>Кэш</h2><button class="btn ghost" id="clr">Баатар/item мэдээллийг шинэчлэх</button></div>`,
    after: v => {
      v.querySelector('#chg').onclick = () => { S.accountId = null; ls('accountId', null); loadPlayerCard(); location.hash = '#/overview'; route(); };
      v.querySelector('#sv').onclick = () => { S.apiKey = v.querySelector('#key').value.trim(); ls('apiKey', S.apiKey || null); S.cache.clear(); alert('Хадгаллаа'); };
      v.querySelector('#clr').onclick = async () => { ls('const5', null); S.cache.clear(); await loadConstants(); alert('Шинэчиллээ'); };
    }
  };
}

/* ---------- Boot ---------- */
(async function boot() {
  $('#view').innerHTML = `<div class="loading"><span class="spin"></span>Баатар, item мэдээллийг ачааллаж байна…</div>`;
  try { await loadConstants(); }
  catch (e) { $('#view').innerHTML = `<div class="err">${esc(e.message)}<div style="margin-top:10px"><button class="btn ghost" onclick="location.reload()">Дахин оролдох</button></div></div>`; return; }
  window.addEventListener('hashchange', route);
  loadPlayerCard();
  route();
})();
