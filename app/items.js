'use strict';
/* Тухайн тоглолтын нөхцөлд тулгуурласан item зөвлөгөө.
   Нийтлэг build биш: дайсны баатрууд, чамд ирсэн damage-ийн төрөл, чамайг хэн алсан зэргээс шалтгаална. */

/* TRAITS, NEEDS, MAGIC_ITEMS нь data.json-оос ачаалагдана (data.js). */

const NEED_LABEL = {
  magic: 'Магик damage их ирсэн', phys: 'Физик (цохилт) damage их ирсэн', single: 'Нэг target-тай disable-д онилогдсон', aoe: 'Дайсанд том AoE disable',
  silence: 'Silence/hex-д өртсөн', heal: 'Дайсанд их heal', evasion: 'Дайсанд evasion', units: 'Дайсанд illusion/summon', invis: 'Дайсанд invisible баатар',
  passive: 'Дайсны passive хүчтэй', escape: 'Дайсан зугтдаг', mana: 'Дайсан mana-аас хамааралтай', save: 'Дайсанд save/buff',
};

const hkey = p => (hero(p.hero_id).k || '').replace('npc_dota_hero_', '');

function damageSplit(me) {
  const r = { mag: 0, phys: 0, pure: 0, other: 0, src: { mag: [], phys: [], pure: [] } };
  for (const [k, v] of Object.entries(me.damage_inflictor_received || {})) {
    let t;
    if (k === 'null') t = 'phys';
    else if (MAGIC_ITEMS.has(k)) t = 'mag';
    else { const a = abilityByKey(k); const d = a && a.t; t = d === 'Magical' ? 'mag' : d === 'Physical' ? 'phys' : d === 'Pure' ? 'pure' : 'other'; }
    r[t] += v;
    if (r.src[t]) r.src[t].push({ k, n: inflictorName(k), v });
  }
  r.total = r.mag + r.phys + r.pure + r.other;
  for (const t of ['mag', 'phys', 'pure']) r.src[t].sort((a, b) => b.v - a.v);
  return r;
}

/* Дайсан бүр чамд хэр аюултай байсан бэ */
function threats(m, me) {
  const enemies = m.players.filter(p => isRad(p) !== isRad(me));
  const dt = me.damage_taken || {}, kb = me.killed_by || {};
  const tot = enemies.reduce((s, p) => s + (dt[hero(p.hero_id).k] || 0), 0) || 1;
  const nwSorted = [...enemies].sort((a, b) => (b.net_worth || 0) - (a.net_worth || 0));
  return enemies.map(p => {
    const k = hero(p.hero_id).k, dmg = dt[k] || 0, kills = kb[k] || 0;
    return { p, key: hkey(p), dmg, share: dmg / tot, kills, core: nwSorted.indexOf(p) < 3, score: dmg / tot + kills * 0.12 };
  }).sort((a, b) => b.score - a.score);
}

function boughtMap(me) {
  const mp = {};
  for (const e of (me.purchase_log || [])) if (!(e.key in mp)) mp[e.key] = e.time;
  const fin = [0, 1, 2, 3, 4, 5].map(i => me['item_' + i]).concat([me.backpack_0, me.backpack_1, me.backpack_2, me.item_neutral]);
  for (const id of fin) { const it = S.itemsId[id]; if (it && !(it.key in mp)) mp[it.key] = null; }
  return mp;
}

function itemAdvice(m, me) {
  const role = roleOf(m, me), core = role <= 3, dur = m.duration / 60;
  const ds = damageSplit(me), th = threats(m, me), bought = boughtMap(me);
  const deaths = deathDetails(m, me);
  const hn = p => hero(p.hero_id).n;
  const recs = [];
  const valid = keys => keys.filter(k => itemByKey(k));

  const rec = (need, prio, title, why, heroesP) => {
    const keys = valid(core ? NEEDS[need].core : NEEDS[need].sup);
    if (!keys.length) return;
    const have = keys.filter(k => k in bought).map(k => ({ k, time: bought[k] })).sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9))[0] || null;
    const heroKeys = new Set((heroesP || []).map(p => hero(p.hero_id).k));
    const deathsBy = heroesP ? deaths.filter(d => d.killer && heroKeys.has(hero(d.killer.hero_id).k)) : deaths;
    let late = false, before = 0;
    if (have && have.time != null) { before = deathsBy.filter(d => d.time < have.time).length; late = have.time > 22 * 60 && before >= 2; }
    recs.push({ need, prio, title, why, items: keys, have, late, before, deathsBy: heroesP ? deathsBy.length : null });
  };

  /* 1. Damage-ийн төрөл (чамд бодитоор ирсэн) */
  if (ds.total > 3000) {
    const mg = ds.mag / ds.total, ph = ds.phys / ds.total;
    if (mg >= 0.42) rec('magic', 0.4 + mg * 1.2, `Чамд ирсэн damage-ийн ${pct(mg)} нь МАГИК байсан`,
      `Гол эх үүсвэр: ${ds.src.mag.slice(0, 3).map(s => `${s.n} (${fmtK(s.v)})`).join(', ')}. Магик эсэргүүцэл нэмэх item энэ тоглолтод хамгийн их ашиг өгөх байсан.`);
    if (ph >= 0.55) {
      const carry = th.filter(t => t.core).sort((a, b) => b.dmg - a.dmg)[0];
      rec('phys', 0.3 + ph, `Чамд ирсэн damage-ийн ${pct(ph)} нь ФИЗИК (цохилт) байсан`,
        `${carry ? `Хамгийн их цохисон нь ${hn(carry.p)} (${fmtK(carry.dmg)}). ` : ''}Armor, evasion эсвэл цохилтыг зогсоох item хэрэгтэй байсан.`);
    }
  }

  /* 2. Чамд аюултай байсан дайсны онцлог */
  const danger = th.filter(t => t.share >= 0.15 || t.kills >= 2);
  const enemyCores = th.filter(t => t.core);
  const pick = (trait, list) => list.filter(t => TRAITS[trait].has(t.key));
  const names = arr => arr.map(t => hn(t.p)).join(', ');

  const sg = pick('single', danger);
  if (sg.length) rec('single', 0.35 + sg.reduce((s, t) => s + t.score, 0) * 0.8, `${names(sg)}-ийн нэг target-тай disable/burst чамайг онилсон`,
    `${sg.map(t => `${hn(t.p)}: ${fmtK(t.dmg)} damage, ${t.kills} удаа алсан`).join('; ')}. Spell-ийг нь хаах эсвэл буцаах item хэрэгтэй байсан.`, sg.map(t => t.p));
  const ao = pick('aoe', th);
  if (ao.length && core) rec('aoe', 0.4 + ao.reduce((s, t) => s + t.score, 0) * 0.6, `Дайсанд том AoE disable байсан: ${names(ao)}`,
    'Багийн тулаанд эдгээрийн ult нэг дор хэд хэдэн хүнийг хорьдог. Spell immunity-гүйгээр тулаанд нөлөөлөхөд хэцүү.', ao.map(t => t.p));
  const si = pick('silence', danger);
  if (si.length) rec('silence', 0.3 + si.reduce((s, t) => s + t.score, 0) * 0.8, `${names(si)} чамайг silence/hex хийж байсан`,
    'Silence-ийг dispel хийх эсвэл урьдчилан хамгаалах item хэрэгтэй.', si.map(t => t.p));

  const hl = pick('heal', enemyCores.concat(danger)).filter((t, i, a) => a.indexOf(t) === i);
  if (hl.length) rec('heal', 0.35 + hl.length * 0.12, `Дайсанд их heal/regen-тэй баатар байсан: ${names(hl)}`,
    'Heal-ийг бууруулах item байхгүй бол тэд тулаанаас амьд гарч, дахин орж ирдэг.', hl.map(t => t.p));
  const ev = pick('evasion', enemyCores);
  if (ev.length && core) rec('evasion', 0.5 + ev.reduce((s, t) => s + t.share, 0), `${names(ev)}-д evasion байсан`,
    'Цохилтын тодорхой хувь нь мисс болно — true strike item-гүйгээр damage чинь алдагдана.', ev.map(t => t.p));
  const un = pick('units', enemyCores.concat(th.filter(t => t.share >= 0.12)));
  if (un.length && core) rec('units', 0.4 + un.length * 0.15, `Дайсанд illusion/summon олон байсан: ${names(un)}`,
    'Олон unit-ийг нэг дор цэвэрлэх (cleave/AoE) item хэрэгтэй.', un.map(t => t.p));
  const iv = pick('invis', th);
  if (iv.length) rec('invis', 0.5 + iv.reduce((s, t) => s + t.score, 0), `Дайсанд invisible баатар байсан: ${names(iv)}`,
    'Detection-гүй бол харж ч чадахгүй алуулна. Dust 80 gold — үргэлж барь.', iv.map(t => t.p));
  const pa = pick('passive', enemyCores.concat(danger)).filter((t, i, a) => a.indexOf(t) === i);
  if (pa.length && core) rec('passive', 0.35 + pa.reduce((s, t) => s + t.score, 0) * 0.7, `${names(pa)}-ийн хүч passive skill-д нь байсан`,
    'Break эффект passive-ийг унтраадаг — тэр баатрууд эрс сулардаг.', pa.map(t => t.p));
  const es = pick('escape', enemyCores);
  if (es.length) rec('escape', 0.35 + es.length * 0.12, `Дайсны core-ууд хөдөлгөөнтэй, зугтдаг: ${names(es)}`,
    'Тэднийг blink/зугтахаас өмнө хорих (root, hex, silence, stun) item хэрэгтэй.', es.map(t => t.p));
  const mn = pick('mana', enemyCores.concat(danger)).filter((t, i, a) => a.indexOf(t) === i);
  if (mn.length && core) rec('mana', 0.3 + mn.length * 0.1, `${names(mn)} mana-аас их хамааралтай`, 'Mana-г нь шатаавал spell хийж чадахгүй болно.', mn.map(t => t.p));
  const sv = pick('save', th);
  if (sv.length && core) rec('save', 0.3 + sv.length * 0.1, `Дайсанд хамгаалалтын buff-тай баатар байсан: ${names(sv)}`,
    'Тэдний shield/save-ийг dispel хийж байж бай алж чадна.', sv.map(t => t.p));

  /* Ижил item олон хэрэгцээнд давхардвал нэгтгэнэ */
  recs.sort((a, b) => b.prio - a.prio);
  const top = recs.slice(0, 6);

  /* Хэрэггүй худалдан авалт */
  const mis = [];
  const magicLow = ds.total > 3000 && ds.mag / ds.total < 0.25;
  if ('black_king_bar' in bought && magicLow && !ao.length && !si.length) mis.push({ k: 'black_king_bar', why: `Магик damage ердөө ${pct(ds.mag / ds.total)}, том disable бараг байгаагүй — BKB-ийн оронд damage/armor item илүү үр дүнтэй байсан байж магадгүй.` });
  if ('pipe' in bought && magicLow) mis.push({ k: 'pipe', why: `Магик damage ердөө ${pct(ds.mag / ds.total)} байсан — Pipe бага хамгаалсан.` });
  if ('sphere' in bought && !pick('single', th).length) mis.push({ k: 'sphere', why: 'Дайсанд нэг target-тай хүчтэй disable бараг байгаагүй — Linken-ийн үнэ цэнэ бага байсан.' });
  if ('monkey_king_bar' in bought && !pick('evasion', th).length) mis.push({ k: 'monkey_king_bar', why: 'Дайсанд evasion байгаагүй — MKB-ийн гол давуу тал ашиглагдаагүй (damage-ийн хувьд Daedalus/Desolator илүү байж болно).' });
  return { role, core, ds, th, recs: top, mis, dur };
}

/* Analysis-д нэмэх: хамгийн чухал item-ээ аваагүй бол */
function itemInsights(m, me) {
  const a = itemAdvice(m, me), out = [];
  for (const r of a.recs.slice(0, 3)) {
    if (r.prio < 0.6) continue;
    const names = r.items.slice(0, 2).map(k => itemByKey(k).n).join(' эсвэл ');
    if (!r.have) out.push({ type: r.prio >= 0.9 ? 'bad' : 'warn', title: `${names} хэрэгтэй байсан ч аваагүй`, detail: r.title + '.', tip: r.why });
    else if (r.late) out.push({ type: 'warn', title: `${itemByKey(r.have.k).n} хэтэрхий оройтсон (${fmtT(r.have.time)})`, detail: `Түүнээс өмнө энэ шалтгаанаар ${r.before} удаа үхсэн.`, tip: 'Хэрэгцээтэй item-ээ тоглолтын эхний 20 минутад төлөвлө — бусад item-ийг хойшлуул.' });
  }
  for (const x of a.mis) out.push({ type: 'info', title: `${itemByKey(x.k).n} — энэ тоглолтод тохироогүй байж магадгүй`, detail: x.why });
  return out;
}
