'use strict';
/* Live тоглолтын item зөвлөгөө: өөрийн баатар + роль + дайсны баатруудыг сонгоход build гаргана. */

const ROLE_SHORT = { 1: 'Carry', 2: 'Mid', 3: 'Offlane', 4: 'Soft sup', 5: 'Hard sup' };
const ROLE_TIPS = {
  1: 'Эхний 10 минутад 50+ LH зорилт. Тулаанаас илүү farm, гол item-ээ хурдан гаргах нь чухал.',
  2: 'Rune бүрийг (2, 4, 6 мин) ав, лайнаа ялаад 6-р level-ээс rotation хий. Bottle/TP үргэлж бэлэн.',
  3: 'Дайсны carry-г лайнд дарамтал, үхэхгүй байх нь эхний зорилго. Багийн тулаан эхлүүлэх item (Blink) эрт.',
  4: 'Rotation, rune хамгаал, smoke-оор gank хий. Ward-ийг pos 5-тай хуваа.',
  5: 'Observer ward-ыг 0 секундээс тогтмол тавь, sentry-гээр deward хий. Carry-гаа лайнд хамгаал. Мөнгөө ward, dust, smoke-д зарцуул.',
};
/* Магик damage-ийн голлогч (Nuker роль дээр нэмэлт) */
const MAGIC_HEROES = mkSet('lina lion zuus leshrac skywrath_mage tinker queenofpain puck storm_spirit invoker pugna necrolyte death_prophet nyx_assassin lich jakiro ogre_magi earthshaker sand_king ember_spirit witch_doctor crystal_maiden disruptor obsidian_destroyer dark_willow grimstroke venomancer viper batrider phoenix warlock bane snapfire void_spirit techies ancient_apparition keeper_of_the_light rubick huskar shadow_shaman muerta leshrac');
const PHYS_HEROES = mkSet('antimage phantom_assassin juggernaut sven troll_warlord ursa slark faceless_void drow_ranger luna medusa spectre life_stealer chaos_knight phantom_lancer terrorblade naga_siren weaver clinkz monkey_king gyrocopter lone_druid templar_assassin sniper skeleton_king riki bloodseeker marci legion_commander tiny kunkka razor morphling arc_warden');

function liveState() {
  try { return JSON.parse(ls('live') || 'null') || { me: null, role: 1, en: [] }; } catch (e) { return { me: null, role: 1, en: [] }; }
}
const saveLive = st => ls('live', JSON.stringify(st));
const heroIconImg = (id, cls = '') => { const h = hero(id); return `<img class="hicon ${cls}" src="${CDN}${h.icon || h.img}" alt="" title="${esc(h.n)}" loading="lazy" onerror="this.style.visibility='hidden'">`; };
const hk = id => (hero(id).k || '').replace('npc_dota_hero_', '');

function guessRole(id) {
  const r = hero(id).roles || [];
  if (r.includes('Carry')) return 1;
  if (r.includes('Support')) return 5;
  if (r.includes('Initiator') || r.includes('Durable')) return 3;
  return 2;
}

/* Дайсны бүрэлдэхүүнээс хэрэгцээ тодорхойлох */
function liveNeeds(role, enemies) {
  const core = role <= 3, out = [];
  const keys = enemies.map(id => ({ id, k: hk(id), n: hero(id).n, roles: hero(id).roles || [] }));
  const has = (trait) => keys.filter(e => TRAITS[trait].has(e.k));
  const names = a => a.map(e => e.n).join(', ');
  const add = (need, prio, title, why, list) => {
    const items = (core ? NEEDS[need].core : NEEDS[need].sup).filter(k => itemByKey(k));
    if (items.length) out.push({ need, prio, title, why, items, heroes: list ? list.map(e => e.id) : [] });
  };
  const mag = keys.filter(e => MAGIC_HEROES.has(e.k) || (e.roles.includes('Nuker') && !PHYS_HEROES.has(e.k)));
  const phy = keys.filter(e => PHYS_HEROES.has(e.k));
  if (mag.length >= 2) add('magic', 0.25 + mag.length * 0.18, `${mag.length} магик damage-тай дайсан`, `${names(mag)} — магик burst-аар алах болно. Магик эсэргүүцэл эрт хэрэгтэй.`, mag);
  if (phy.length >= 2) add('phys', 0.2 + phy.length * 0.15, `${phy.length} физик (цохилтын) core`, `${names(phy)} — цохилтын damage давамгайлна. Armor/evasion/цохилт зогсоох item.`, phy);
  const t = [
    ['single', 0.2, 0.14, a => `Нэг target-тай disable: ${names(a)}`, 'Чамайг онилж барих spell-үүд — хааж эсвэл буцааж болно.'],
    ['aoe', 0.2, 0.14, a => `Том AoE disable: ${names(a)}`, 'Багийн тулаанд ult нь олон хүнийг хорьдог — spell immunity хэрэгтэй.'],
    ['silence', 0.2, 0.15, a => `Silence/hex: ${names(a)}`, 'Silence-д орвол spell/item хэрэглэж чадахгүй — dispel item.'],
    ['heal', 0.2, 0.15, a => `Их heal/regen: ${names(a)}`, 'Heal бууруулах item-гүйгээр тэд тулаанаас амьд гарна.'],
    ['evasion', 0.45, 0.2, a => `Evasion: ${names(a)}`, 'Цохилт чинь мисс болно — true strike хэрэгтэй.'],
    ['units', 0.25, 0.15, a => `Illusion/summon: ${names(a)}`, 'Олон unit-ийг AoE-гээр цэвэрлэ.'],
    ['invis', 0.45, 0.15, a => `Invisible: ${names(a)}`, 'Detection-гүй бол харахгүй алуулна. Dust-ыг лайнаас эхлэн барь.'],
    ['passive', 0.2, 0.12, a => `Хүчтэй passive: ${names(a)}`, 'Break эффект тэднийг эрс сулруулна.'],
    ['escape', 0.15, 0.1, a => `Зугтдаг/хөдөлгөөнтэй: ${names(a)}`, 'Blink/зугтахаас өмнө хорих item хэрэгтэй.'],
    ['mana', 0.12, 0.1, a => `Mana-аас хамааралтай: ${names(a)}`, 'Mana шатаавал spell хийж чадахгүй.'],
    ['save', 0.15, 0.1, a => `Save/buff: ${names(a)}`, 'Shield/save-ийг нь dispel хийж бай ал.'],
  ];
  for (const [need, base, per, title, why] of t) { const a = has(need); if (a.length) add(need, base + per * a.length, title(a), why, a); }
  return out.sort((a, b) => b.prio - a.prio);
}

function popRank(pop, phase) { return Object.entries((pop && pop[phase]) || {}).map(([id, c]) => ({ it: S.itemsId[id], c })).filter(x => x.it).sort((a, b) => b.c - a.c); }

function buildPlan(role, pop, needs) {
  const core = role <= 3;
  const popAll = {};
  for (const ph of ['early_game_items', 'mid_game_items', 'late_game_items']) for (const x of popRank(pop, ph)) popAll[x.it.key] = (popAll[x.it.key] || 0) + x.c;
  const used = new Set();
  const pickN = (arr, n, filt = () => true) => { const r = []; for (const x of arr) { if (r.length >= n) break; if (used.has(x.it.key) || !filt(x.it)) continue; used.add(x.it.key); r.push({ k: x.it.key, why: null }); } return r; };
  const full = it => it.cr || ['boots', 'magic_stick', 'wind_lace', 'blight_stone', 'orb_of_venom', 'quelling_blade', 'infused_raindrop', 'blink', 'aghanims_shard', 'ward_observer'].includes(it.key);
  const supFilt = it => full(it) && (core || it.cost <= 4600);
  const start = pickN(popRank(pop, 'start_game_items'), 7);
  const BOOTS = new Set(['phase_boots', 'power_treads', 'arcane_boots', 'tranquil_boots', 'boots_of_bearing', 'guardian_greaves', 'travel_boots', 'travel_boots_2']);
  let bootsPicked = false;
  const early = pickN(popRank(pop, 'early_game_items'), 4, it => {
    if (it.cost < 400 || it.key === 'boots' || !supFilt(it)) return false;
    if (BOOTS.has(it.key)) { if (bootsPicked) return false; bootsPicked = true; }
    return true;
  });
  /* Хэрэгцээ бүрийн хамгийн тохиромжтой нэг item (баатрын түгээмэл байдлаар эрэмбэлсэн) */
  const counters = [];
  for (const n of needs) {
    const best = [...n.items].sort((a, b) => (popAll[b] || 0) - (popAll[a] || 0)).find(k => !used.has(k));
    if (!best) continue;
    used.add(best); counters.push({ k: best, why: n.title, prio: n.prio });
  }
  const urgent = counters.filter(c => c.prio >= 0.6 && !['dust', 'ward_sentry', 'gem'].includes(c.k));
  const cheap = counters.filter(c => ['dust', 'ward_sentry', 'gem'].includes(c.k));
  const rest = counters.filter(c => !urgent.includes(c) && !cheap.includes(c));
  const mid = [...urgent.slice(0, 2), ...pickN(popRank(pop, 'mid_game_items'), Math.max(1, 4 - Math.min(2, urgent.length)), supFilt)];
  const late = [...urgent.slice(2), ...rest.slice(0, 2), ...pickN(popRank(pop, 'late_game_items'), 3, supFilt)];
  return { start, early: [...cheap, ...early], mid, late, popAll };
}

async function viewLive() {
  const st = liveState();
  let pop = null, mu = null, mine = null;
  if (st.me) {
    const reqs = [api(`/heroes/${st.me}/itemPopularity`), api(`/heroes/${st.me}/matchups`)];
    if (S.accountId) reqs.push(api(`/players/${S.accountId}/heroes`).catch(() => null));
    [pop, mu, mine] = await Promise.all(reqs);
  }
  const all = Object.entries(S.heroes).map(([id, h]) => ({ id: +id, ...h })).sort((a, b) => a.n.localeCompare(b.n));

  let res = '';
  if (st.me) {
    const needs = liveNeeds(st.role, st.en);
    const plan = buildPlan(st.role, pop, needs);
    const tagged = (list) => list.map(x => `<div class="lit">${itemIcon(x.k, true)}${x.why ? `<div class="lwhy">↳ ${esc(x.why)}</div>` : ''}</div>`).join('') || '<span class="muted">—</span>';
    const myH = mine ? mine.find(h => h.hero_id === st.me) : null;
    const vs = st.en.map(id => {
      const m = mu ? mu.find(x => x.hero_id === id) : null;
      const p = mine ? mine.find(h => h.hero_id === id) : null;
      const wr = m && m.games_played ? m.wins / m.games_played : null;
      const pw = p && p.against_games ? p.against_win / p.against_games : null;
      return `<div class="vs">${heroImg(id, 'sm')}<div><b>${esc(hero(id).n)}</b>
        <div class="muted" style="font-size:12px">${esc(hero(st.me).n)}-ийн winrate түүний эсрэг: ${wr != null ? `<span class="${wr >= 0.5 ? 'w' : 'lo'}">${pct(wr)}</span> (${m.games_played})` : '—'}</div>
        <div class="muted" style="font-size:12px">Чиний түүний эсрэг winrate: ${pw != null ? `<span class="${pw >= 0.5 ? 'w' : 'lo'}">${pct(pw)}</span> (${p.against_games})` : '—'}</div></div></div>`;
    }).join('');
    res = `<div class="card"><div class="row" style="gap:14px">${heroImg(st.me, 'lg')}<div><div style="font-size:20px;font-weight:700">${esc(hero(st.me).n)} — ${ROLE_NAMES[st.role]}</div>
      <div class="muted">${myH && myH.games ? `Чи энэ баатрыг ${myH.games} удаа тоглож ${pct(myH.win / myH.games)} ялсан.` : 'Энэ баатрыг тоглож байсан түүх алга.'}</div>
      <div class="ins-tip" style="margin-top:6px">Ролийн зөвлөгөө: ${esc(ROLE_TIPS[st.role])}</div></div></div></div>
      <div class="grid g2">
        <div class="card"><h2>Санал болгох build ${st.en.length ? `(${st.en.length} дайсанд тохируулсан)` : '(дайсан сонгоогүй — ерөнхий)'}</h2>
          <h3>Эхлэх item</h3><div class="iis">${plan.start.map(x => itemIcon(x.k)).join('') || '<span class="muted">—</span>'}</div>
          <h3 style="margin-top:14px">Лайн (0–12 мин)</h3><div class="lits">${tagged(plan.early)}</div>
          <h3 style="margin-top:14px">Гол item (12–25 мин)</h3><div class="lits">${tagged(plan.mid)}</div>
          <h3 style="margin-top:14px">Сүүл үе (25+ мин)</h3><div class="lits">${tagged(plan.late)}</div>
          <div class="muted" style="font-size:12px;margin-top:12px">↳ тэмдэгтэй нь энэ дайснуудаас шалтгаалан нэмэгдсэн. Бусад нь ${esc(hero(st.me).n)}-ийн тоглогчдын түгээмэл item.</div></div>
        <div class="card"><h2>Яагаад эдгээр item — дайсны бүрэлдэхүүн</h2>
          ${needs.length ? needs.map(n => `<div class="rec ${n.prio >= 0.6 ? 'miss' : 'late'}"><div class="row" style="justify-content:space-between"><b>${esc(n.title)}</b><span class="tag ${n.prio >= 0.6 ? 'bad' : 'warn'}">${n.prio >= 0.6 ? 'Чухал' : 'Хэрэгтэй бол'}</span></div>
            <div class="muted" style="margin:4px 0 8px">${esc(n.why)}</div><div class="iis">${[...n.items].sort((a, b) => (plan.popAll[b] || 0) - (plan.popAll[a] || 0)).map(k => itemIcon(k)).join('')}</div></div>`).join('')
            : '<div class="muted">Дайсны баатруудаа сонгоход тэдэнд тохирсон counter item-ууд энд гарна.</div>'}
          ${vs ? `<h3 style="margin-top:14px">Дайсан бүрийн эсрэг</h3><div class="vss">${vs}</div>` : ''}</div>
      </div>`;
  }

  return {
    html: `<div class="row" style="justify-content:space-between"><div><h1>Live item зөвлөгөө</h1>
      <div class="sub">Тоглолт эхлэхэд баатар, роль, дайсны баатруудаа сонго — build болон counter item гарна.</div></div>
      <button class="btn ghost" id="lclr">Цэвэрлэх</button></div>
      <div class="card">
        <div class="row" style="gap:18px;align-items:flex-start">
          <div><h3>1. Миний баатар</h3><div class="slot ${st.me ? '' : 'empty'}" id="meSlot">${st.me ? heroImg(st.me) : '?'}</div></div>
          <div><h3>2. Роль</h3><div class="row" style="gap:6px">${[1, 2, 3, 4, 5].map(r => `<button class="btn ${st.role === r ? '' : 'ghost'} rb" data-r="${r}">${r} · ${ROLE_SHORT[r]}</button>`).join('')}</div></div>
          <div><h3>3. Дайсны баатрууд (${st.en.length}/5)</h3><div class="row" style="gap:6px">${[0, 1, 2, 3, 4].map(i => st.en[i] ? `<div class="slot en" data-i="${i}" title="Хасах">${heroImg(st.en[i])}</div>` : '<div class="slot empty">+</div>').join('')}</div></div>
        </div>
        <div class="row" style="margin-top:16px;gap:10px">
          <div class="row" style="gap:0"><button class="btn mode" data-m="me">Миний баатар сонгох</button><button class="btn ghost mode" data-m="en">Дайсан нэмэх</button></div>
          <input id="hs" class="inp" style="flex:1;min-width:180px" placeholder="Баатар хайх…">
        </div>
        <div class="hgrid" id="hg">${all.map(h => `<button class="hb" data-id="${h.id}" data-n="${esc(h.n.toLowerCase())}" title="${esc(h.n)}">${heroIconImg(h.id)}<span>${esc(h.n)}</span></button>`).join('')}</div>
      </div>
      <div id="lres">${res}</div>`,
    after: v => {
      let mode = S.liveMode || (st.me ? 'en' : 'me');
      const setMode = m => { mode = m; S.liveMode = m; v.querySelectorAll('.mode').forEach(b => b.classList.toggle('ghost', b.dataset.m !== m)); };
      setMode(mode);
      v.querySelectorAll('.mode').forEach(b => b.onclick = () => setMode(b.dataset.m));
      const mark = () => v.querySelectorAll('.hb').forEach(b => { const id = +b.dataset.id; b.classList.toggle('sel-me', id === st.me); b.classList.toggle('sel-en', st.en.includes(id)); });
      mark();
      const hs = v.querySelector('#hs'); const filt = () => { const q = hs.value.trim().toLowerCase(); S.liveQ = hs.value; v.querySelectorAll('.hb').forEach(b => b.style.display = !q || b.dataset.n.includes(q) ? '' : 'none'); }; hs.value = S.liveQ || ''; hs.oninput = filt; filt();
      const rerender = async () => { const y = $('#view').scrollTop; saveLive(st); await route(); $('#view').scrollTop = y; };
      v.querySelectorAll('.hb').forEach(b => b.onclick = () => {
        const id = +b.dataset.id;
        if (mode === 'me') { st.me = id; st.en = st.en.filter(x => x !== id); st.role = guessRole(id); S.liveMode = 'en'; S.liveQ = ''; rerender(); }
        else {
          if (id === st.me) return;
          if (st.en.includes(id)) st.en = st.en.filter(x => x !== id);
          else if (st.en.length < 5) { st.en.push(id); S.liveQ = ''; }
          rerender();
        }
      });
      v.querySelectorAll('.rb').forEach(b => b.onclick = () => { st.role = +b.dataset.r; rerender(); });
      v.querySelectorAll('.slot.en').forEach(s => s.onclick = () => { st.en.splice(+s.dataset.i, 1); rerender(); });
      v.querySelector('#meSlot').onclick = () => setMode('me');
      v.querySelector('#lclr').onclick = () => { st.me = null; st.en = []; st.role = 1; rerender(); };
    }
  };
}
