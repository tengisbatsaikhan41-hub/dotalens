'use strict';
/* Тоглолтын дүн шинжилгээ: алдаа, анхааруулга, сайн зүйлсийг дүрмээр тодорхойлно.
   app.js доторх helper-ууд (heroByKey, itemByKey, fmtT, pct) ажиллах үед бэлэн байна. */

const INVIS_HEROES = new Set([9, 32, 46, 56, 62, 63, 83, 88]); // Mirana, Riki, TA, Clinkz, BH, Weaver, Treant, Nyx
const CONSUMABLES = new Set(['tpscroll', 'ward_observer', 'ward_sentry', 'ward_dispenser', 'dust', 'smoke_of_deceit',
  'tango', 'tango_single', 'flask', 'clarity', 'enchanted_mango', 'faerie_fire', 'tome_of_knowledge', 'blood_grenade',
  'cheese', 'aegis', 'refresher_shard', 'famango', 'great_famango', 'greater_famango']);
const LH10_TARGET = { 1: 55, 2: 50, 3: 35 };
const ROLE_NAMES = { 1: 'Carry (pos 1)', 2: 'Mid (pos 2)', 3: 'Offlane (pos 3)', 4: 'Soft support (pos 4)', 5: 'Hard support (pos 5)' };

const isWin = m => (m.player_slot < 128) === !!m.radiant_win;
const isRad = p => (p.isRadiant != null ? p.isRadiant : p.player_slot < 128);

function roleOf(m, p) {
  if (p.position_est >= 1 && p.position_est <= 5) return p.position_est;
  const team = m.players.filter(x => isRad(x) === isRad(p)).sort((a, b) => (b.net_worth || b.gold_per_min || 0) - (a.net_worth || a.gold_per_min || 0));
  const r = team.indexOf(p) + 1;
  if (p.lane_role === 2 && r <= 3) return 2;
  if (r === 1) return 1;
  if (r <= 3) return p.lane_role === 3 ? 3 : (r === 2 ? 2 : 3);
  return r === 4 ? 4 : 5;
}

function laneOpponent(m, me) {
  if (!me.lane) return null;
  const enemies = m.players.filter(p => isRad(p) !== isRad(me) && p.lane === me.lane);
  if (!enemies.length) return null;
  return enemies.sort((a, b) => ((b.lh_t && b.lh_t[10]) || 0) - ((a.lh_t && a.lh_t[10]) || 0))[0];
}

function teamAdv(m, me) {
  const s = isRad(me) ? 1 : -1;
  return {
    gold: (m.radiant_gold_adv || []).map(v => v * s),
    xp: (m.radiant_xp_adv || []).map(v => v * s),
  };
}

/* deaths_log байхгүй хуучин тоглолтод дайсны kills_log-оос сэргээнэ */
function deathsOf(m, me) {
  if (me.deaths_log && me.deaths_log.length) return me.deaths_log;
  const k = hero(me.hero_id).k;
  if (!k) return [];
  return m.players.filter(p => isRad(p) !== isRad(me))
    .flatMap(p => (p.kills_log || []).filter(e => e.key === k).map(e => ({ time: e.time, key: hero(p.hero_id).k })))
    .sort((a, b) => a.time - b.time);
}

function firstBigItem(me) {
  for (const e of (me.purchase_log || [])) {
    const it = itemByKey(e.key);
    if (it && it.cost >= 2000 && !CONSUMABLES.has(e.key) && !e.key.startsWith('recipe')) return { ...it, key: e.key, time: e.time };
  }
  return null;
}

/* ---------- Нэг тоглолт ---------- */
function analyzeMatch(m, me) {
  const out = [];
  const add = (type, title, detail, tip) => out.push({ type, title, detail, tip });
  const dur = m.duration / 60;
  const parsed = m.version != null;
  const won = isWin(me);
  const role = roleOf(m, me);
  const core = role <= 3;
  const team = m.players.filter(p => isRad(p) === isRad(me));
  const enemies = m.players.filter(p => isRad(p) !== isRad(me));

  /* Үхэл */
  const deathLimit = Math.max(7, Math.round(dur / 5));
  if (me.deaths >= deathLimit) add('bad', `Хэт олон үхсэн: ${me.deaths} удаа`,
    `${Math.round(dur)} минутын тоглолтод ${me.deaths} үхэл гэдэг нь ~${(dur / me.deaths).toFixed(1)} минут тутамд нэг үхэл.`,
    'Мини-map-аа 3–5 секунд тутамд хар. Дайсны core харагдахгүй байхад ward-гүй газар ганцаараа бүү фарм хий.');
  else if (me.deaths <= 3 && dur >= 25) add('good', `Цөөн үхсэн (${me.deaths})`, 'Амьд байх нь багт хамгийн их ашигтай. Сайн байрлал.');

  const DL = parsed ? deathsOf(m, me) : [];
  if (DL.length) {
    const early = DL.filter(d => d.time < 600);
    if (early.length >= 3) add('bad', `Лайн дээр (10 мин-ээс өмнө) ${early.length} удаа үхсэн`,
      'Эрт үхэл нь лайнаа алдаж, дайсны core-г хурдан хөгжүүлдэг.',
      'Лайн дээр дайсны rune/gank-ийг тооцоол, HP 50%-аас доош бол tower-ийн доор ухар. Регенээ эрт ав.');
    const deadSec = DL.reduce((s, d) => s + (d.time_dead || 0), 0);
    const deadPct = deadSec / m.duration;
    if (deadPct >= 0.12) add('bad', `Тоглолтын ${pct(deadPct)}-ийг үхсэн байдалтай өнгөрөөсөн`,
      `Нийт ${fmtT(deadSec)} минут үхсэн. Энэ хугацаанд фарм, XP, багийн тулаан алдагдсан.`,
      'Late game-д үхэл урт болдог: 30+ минутаас хойш buyback-д мөнгө үлдээж, smoke/ward-гүй урагшаа бүү яв.');
    const fed = DL.reduce((s, d) => s + (d.gold_fed || 0), 0);
    const lost = DL.reduce((s, d) => s + (d.gold_lost || 0), 0);
    if (fed >= 5000) add('warn', `Дайсанд ${fed.toLocaleString()} gold өгсөн`,
      `Үхэх бүрт дайсан gold авч, чи ${lost.toLocaleString()} gold алдсан.`);
  }

  /* Nemesis */
  if (me.killed_by) {
    const top = Object.entries(me.killed_by).filter(([k]) => k.startsWith('npc_dota_hero_')).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3) {
      const h = heroByKey(top[0]);
      add('warn', `${h ? h.n : top[0]} чамайг ${top[1]} удаа алсан`,
        'Энэ баатар таны гол аюул байсан.',
        'Түүний spell/item-ийг шалгаад counter item (BKB, Linken, Force Staff, Ghost, Blade Mail гэх мэт) эсвэл байрлалаа өөрчил.');
    }
  }

  /* KDA (parse-гүй ч ажиллана) */
  const kda = (me.kills + me.assists) / Math.max(1, me.deaths);
  if (kda >= 5) add('good', `KDA өндөр: ${kda.toFixed(1)}`, `${me.kills}/${me.deaths}/${me.assists}`);

  /* Лайн / фарм — core */
  if (core && parsed && me.lh_t && me.lh_t.length > 10) {
    const lh10 = me.lh_t[10], tgt = LH10_TARGET[role] || 45;
    if (lh10 < tgt * 0.7) add('bad', `10 минутад зөвхөн ${lh10} last hit`,
      `${ROLE_NAMES[role]}-д ${tgt}+ хүрэх нь зорилт. Фарм удаан байгаа нь item хоцорно гэсэн үг.`,
      'Demo горимд 10 минутад creep цохих дасгал хий. Wave-ийн хооронд ойрын jungle camp-ийг ав.');
    else if (lh10 < tgt) add('warn', `10 минутад ${lh10} last hit`, `${ROLE_NAMES[role]}-ийн зорилт ${tgt}+.`);
    else if (lh10 >= tgt * 1.15) add('good', `Сайн лайн фарм: 10 мин-д ${lh10} LH`, `Зорилтоос (${tgt}) давсан.`);
  }
  if (parsed && core && me.networth_t && me.networth_t.length > 10) {
    const op = laneOpponent(m, me);
    if (op && op.networth_t && op.networth_t.length > 10) {
      const diff = me.networth_t[10] - op.networth_t[10];
      const oh = hero(op.hero_id).n;
      if (diff <= -1000) add('bad', `Лайнаа алдсан: 10 мин-д ${oh}-аас ${Math.abs(diff).toLocaleString()} gold хоцорсон`,
        `Чиний net worth ${me.networth_t[10].toLocaleString()} vs ${oh} ${op.networth_t[10].toLocaleString()}.`,
        'Хүнд лайнд эрт support-оо дуудаж, эсвэл jungle/өөр лайн руу шилжиж фармаа аврах.');
      else if (diff >= 1000) add('good', `Лайнаа ялсан: 10 мин-д ${oh}-аас ${diff.toLocaleString()} gold түрүүлсэн`, 'Сайн лайн.');
    }
  }
  if (parsed && core && me.lane_efficiency_pct != null) {
    if (me.lane_efficiency_pct < 50) add('warn', `Лайны үр ашиг ${me.lane_efficiency_pct}%`, 'Эхний 10 минутад боломжит gold-ын хагаст ч хүрээгүй.');
    else if (me.lane_efficiency_pct >= 80) add('good', `Лайны үр ашиг ${me.lane_efficiency_pct}%`, 'Маш үр ашигтай лайн.');
  }
  if (core) {
    const fb = parsed ? firstBigItem(me) : null;
    if (fb && fb.time > 20 * 60) add('warn', `Анхны том item (${fb.n}) ${fmtT(fb.time)}-д`,
      'Core-ийн хувьд эхний том item 20 минутаас хойш гарсан бол фарм удаан.',
      'Тулаан бүрт оролцох бус, мап-ын хоосон лайн/camp-уудыг фармла. Wave → camp → wave хэв маяг.');
    else if (fb && fb.time <= 13 * 60) add('good', `${fb.n} ${fmtT(fb.time)}-д — хурдан item`, '');
    const lhpm = me.last_hits / Math.max(1, dur);
    if (!parsed && lhpm < 4 && dur > 20) add('warn', `Last hit бага: минутад ${lhpm.toFixed(1)}`, 'Core-ийн хувьд минутад 6+ LH зорилт.');
  }

  /* Benchmarks */
  if (me.benchmarks) {
    const B = { gold_per_min: 'GPM', xp_per_min: 'XPM', last_hits_per_min: 'Last hit/мин', hero_damage_per_min: 'Hero damage/мин', tower_damage: 'Tower damage' };
    const low = [], high = [];
    for (const [k, label] of Object.entries(B)) {
      const b = me.benchmarks[k]; if (!b || b.pct == null) continue;
      if (!core && (k === 'last_hits_per_min' || k === 'tower_damage' || k === 'gold_per_min')) continue;
      if (b.pct < 0.2) low.push(`${label} (доод ${pct(b.pct)})`);
      if (b.pct >= 0.8) high.push(`${label} (${pct(b.pct)})`);
    }
    const hn = hero(me.hero_id).n;
    if (low.length) add('warn', `${hn}-ийн бусад тоглогчдоос доогуур`, low.join(', '), `Энэ баатар дээр сайн тоглогчдын build/skill дарааллыг OpenDota/Dota Plus-аас харж суралц.`);
    if (high.length) add('good', `${hn}-ийн тоглогчдын дээд хэсэгт`, high.join(', '));
  }

  /* Багийн тулаан */
  if (parsed && me.teamfight_participation != null && dur >= 20) {
    const tf = me.teamfight_participation;
    if (tf < 0.45) add('warn', `Багийн тулаанд оролцоо бага: ${pct(tf)}`,
      'Баг тулалдаж байхад чи өөр газар байсан.',
      'Багийн 4 хүн нэг газар бол ганцаараа split хийхээс өмнө TP-гээ бэлдэж, тулаанд нэгд.');
    else if (tf >= 0.75) add('good', `Багийн тулаанд идэвхтэй: ${pct(tf)}`, '');
  }

  /* Hero damage-ийн хувь */
  const teamHD = team.reduce((s, p) => s + (p.hero_damage || 0), 0);
  if (core && teamHD > 0 && dur >= 20) {
    const share = me.hero_damage / teamHD;
    if (share < 0.15) add('warn', `Багийн hero damage-ийн зөвхөн ${pct(share)}`, 'Core-ийн хувьд тулаанд нөлөө бага байсан.');
  }
  if (core && !won && (me.tower_damage || 0) < 500 && dur >= 25) add('warn', 'Цамхаг бараг түрээгүй',
    `Tower damage: ${me.tower_damage || 0}. Ялалт цамхаг/барааг унагаж байж л ирдэг.`,
    'Тулаан ялсны дараа заавал цамхаг түр, Roshan ав — kill-ээс илүү objective чухал.');

  /* Support */
  if (!core && parsed) {
    const obs = me.obs_placed || 0, sen = me.sen_placed || 0;
    if (obs < dur / 5) add('bad', `Observer ward бага: ${obs} ширхэг`,
      `${Math.round(dur)} минутад support-оос ${Math.round(dur / 3.5)}+ observer хүлээгдэнэ.`,
      'Ward бүр 6 минут байдаг. Courier-оор тогтмол ward авч, rune spot, jungle-ийн орцуудад тавь.');
    else if (obs >= dur / 3) add('good', `Сайн vision: ${obs} observer, ${sen} sentry`, '');
    if (sen < dur / 10) add('warn', `Sentry ward цөөн: ${sen}`, 'Дайсны ward-ыг deward хийх нь vision-ий тал хувь.');
    if ((me.camps_stacked || 0) >= 5) add('good', `${me.camps_stacked} camp stack хийсэн`, 'Core-доо сайн туслалцаа.');
  }

  /* Invisible дайсан */
  if (parsed) {
    const inv = enemies.filter(p => INVIS_HEROES.has(p.hero_id));
    const pur = me.purchase || {};
    const det = (pur.dust || 0) + (pur.ward_sentry || 0) + (pur.gem || 0) + (me.sen_placed || 0);
    if (inv.length && det === 0 && dur >= 15) add('warn', `Дайсанд ${inv.map(p => hero(p.hero_id).n).join(', ')} байсан ч dust/sentry аваагүй`,
      'Invisible баатрын эсрэг detection байхгүй бол тэр чөлөөтэй ална.',
      'Dust of Appearance (80g) нэгийг үргэлж inventory-доо барь.');
  }

  /* TP */
  if (parsed && me.purchase_tpscroll != null && dur >= 25 && me.purchase_tpscroll < dur / 12)
    add('warn', `TP scroll цөөн авсан (${me.purchase_tpscroll})`, 'TP-гүй үед тулаан, цамхаг хамгаалалтад хоцорно.', 'Үргэлж нэг TP барь — 30-аас доош gold-ын хамгийн чухал item.');

  /* Throw / comeback */
  const adv = teamAdv(m, me).gold;
  if (adv.length) {
    const mx = Math.max(...adv), mn = Math.min(...adv);
    if (!won && mx >= 8000) add('bad', `Тоглолтыг хаясан: нэг үе ${(mx / 1000).toFixed(1)}k gold давуу байсан`,
      `Танай баг ${fmtT(adv.indexOf(mx) * 60)}-д хамгийн их давуу байсан ч ялагдсан.`,
      'Давуу байхдаа vision-гүй high ground руу бүү ор. Roshan + Aegis-тай орж, smoke-гүй дайсны jungle-д бүү яв.');
    if (won && mn <= -8000) add('good', `Comeback: ${(Math.abs(mn) / 1000).toFixed(1)}k gold хоцорч байгаад ялсан`, 'Бууж өгөөгүй нь зөв.');
  }
  if (!won && (me.gold || 0) >= 3000 && dur >= 30) add('warn', `Тоглолт дуусахад ${me.gold.toLocaleString()} gold зарцуулаагүй`, 'Мөнгө хадгалахын оронд item эсвэл buyback болгох ёстой байсан.');
  if (parsed && !won && dur >= 35 && (me.buyback_count || 0) === 0 && DL.some(d => d.time > m.duration - 180))
    add('info', 'Сүүлийн тулаанд үхээд buyback хийгээгүй', 'Шийдвэрлэх тулаан бол buyback хийх эсэхийг бод.');

  /* Үхлийн нөхцөл, багийн тулаан */
  if (parsed) {
    const dd = deathDetails(m, me);
    const solo = dd.filter(d => d.solo);
    if (solo.length >= 3) add('bad', `${solo.length} удаа ганцаараа баригдаж үхсэн (pick-off)`,
      `Цаг: ${solo.map(d => fmtT(d.time)).join(', ')}. Эдгээр үед багийн тулаан болоогүй — чи ганцаараа байсан.`,
      'Дайсны 3+ баатар map дээр харагдахгүй бол ward-гүй газар бүү фармла. Smoke, rotation-ыг мэдрэх.');
    const late = dd.filter(d => d.time >= 1500 && d.solo);
    if (late.length >= 2) add('warn', `Сүүл үед ${late.length} удаа ганцаараа үхсэн`, 'Late game-д ганц pick-off нь Roshan, барааг алдахад хүргэдэг.');
    const fights = fightsOf(m, me);
    const firstMe = fights.filter(f => f.firstDeathMe);
    if (firstMe.length >= 2) add('warn', `${firstMe.length} тулаанд хамгийн түрүүнд чи үхсэн`,
      `Цаг: ${firstMe.map(f => fmtT(f.start)).join(', ')}. Эхэнд үхэх нь багаа 4v5 тоглуулдаг.`,
      'Тулааны эхэнд урд бүү зогс (tank биш бол). Дайсны гол spell-үүд гарсны дараа ор.');
    const absentLost = fights.filter(f => !f.present && !f.won && f.deaths >= 3);
    if (absentLost.length >= 2) add('warn', `Танай баг ${absentLost.length} тулаанд ялагдахад чи оролцоогүй`,
      `Цаг: ${absentLost.map(f => fmtT(f.start)).join(', ')}.`, 'Баг тулаанд орох гэж байгааг ping/map-аас ажиглаж, TP-гээ ашигла.');
    const wonF = fights.filter(f => f.present && f.won).length, lostF = fights.filter(f => f.present && !f.won).length;
    if (wonF + lostF >= 3 && wonF >= lostF * 2) add('good', `Оролцсон тулаануудаас ${wonF}/${wonF + lostF}-д ялсан`, '');
    if (me.damage_inflictor_received) out.push(...itemInsights(m, me));
  }

  return sortIns(out);
}

/* ---------- Гүнзгий задаргаа ---------- */
const GOLD_REASONS = { 0: 'Бусад', 1: 'Үхэл', 2: 'Buyback', 5: 'Abandon', 6: 'Item зарсан', 11: 'Барилга', 12: 'Баатар алалт', 13: 'Creep (лайн)',
  14: 'Neutral camp', 15: 'Roshan', 16: 'Courier', 17: 'Bounty rune', 18: 'Хуваалцсан', 19: 'Ward устгасан', 20: 'Courier', 21: 'Watcher', 22: 'Lotus' };
const PHASES = [['Лайн (0–10)', 0, 10], ['Дунд үе (10–25)', 10, 25], ['Сүүл үе (25+)', 25, 999]];

const playerByHeroKey = (m, key) => m.players.find(p => hero(p.hero_id).k === key) || null;
const at = (arr, i) => arr && arr.length ? arr[Math.max(0, Math.min(i, arr.length - 1))] : null;

function allKills(m) {
  const out = [];
  for (const p of m.players) for (const e of (p.kills_log || [])) if (e.key && e.key.startsWith('npc_dota_hero_')) out.push({ time: e.time, killer: p, victim: playerByHeroKey(m, e.key) });
  return out.sort((a, b) => a.time - b.time);
}

function fightsOf(m, me) {
  const idx = m.players.indexOf(me), kills = allKills(m);
  return (m.teamfights || []).map(tf => {
    const tp = tf.players || [], mine = tp[idx] || {};
    let our = 0, their = 0;
    tp.forEach((pp, i) => { const p = m.players[i]; if (!p) return; if (isRad(p) === isRad(me)) our += pp.deaths || 0; else their += pp.deaths || 0; });
    const inF = kills.filter(k => k.time >= tf.start - 2 && k.time <= tf.end + 2);
    const myKills = Object.entries(mine.killed || {}).filter(([k]) => k.startsWith('npc_dota_hero_')).reduce((s, [, v]) => s + v, 0);
    const present = (mine.damage || 0) > 0 || (mine.deaths || 0) > 0 || myKills > 0 || (mine.healing || 0) > 0;
    return { start: tf.start, end: tf.end, deaths: tf.deaths, our, their, won: their > our, even: their === our, present,
      myDmg: mine.damage || 0, myDeaths: mine.deaths || 0, myKills, gold: mine.gold_delta || 0,
      firstDeathMe: !!(inF[0] && inF[0].victim === me), first: inF[0] || null };
  });
}

function deathDetails(m, me) {
  const fights = m.teamfights || [], kills = allKills(m), adv = teamAdv(m, me).gold;
  return deathsOf(m, me).map(d => {
    const tf = fights.find(f => d.time >= f.start - 3 && d.time <= f.end + 3);
    const min = Math.max(0, Math.floor(d.time / 60));
    const killer = d.key ? playerByHeroKey(m, d.key) : null;
    const mates = kills.filter(x => Math.abs(x.time - d.time) <= 12 && x.victim && x.victim !== me && isRad(x.victim) === isRad(me)).length;
    const nw = arr => at(arr && arr.length ? arr : null, min);
    return { ...d, tf, solo: !tf && mates === 0, mates, killer, myNW: nw(me.networth_t || me.gold_t), kNW: killer ? nw(killer.networth_t || killer.gold_t) : null,
      adv: adv.length ? at(adv, min) : null, phase: d.time < 600 ? 'Лайн' : d.time < 1500 ? 'Дунд үе' : 'Сүүл үе' };
  });
}

function phaseStats(m, me) {
  const end = Math.ceil(m.duration / 60), adv = teamAdv(m, me).gold;
  const kills = (me.kills_log || []).filter(e => e.key && e.key.startsWith('npc_dota_hero_'));
  const deaths = deathsOf(m, me), g = me.gold_t || me.networth_t;
  return PHASES.filter(p => p[1] < end).map(([name, a, b]) => {
    b = Math.min(b, end); const mins = Math.max(1, b - a);
    const lh = me.lh_t ? at(me.lh_t, b) - at(me.lh_t, a) : null;
    const gold = g ? at(g, b) - at(g, a) : null;
    return { name, a, b, kills: kills.filter(e => e.time >= a * 60 && e.time < b * 60).length, deaths: deaths.filter(e => e.time >= a * 60 && e.time < b * 60).length,
      lh, lhpm: lh != null ? lh / mins : null, gpm: gold != null ? gold / mins : null, adv: adv.length ? at(adv, b) - at(adv, a) : null };
  });
}

function minuteCompare(m, me) {
  const op = laneOpponent(m, me), team = m.players.filter(p => isRad(p) === isRad(me)), adv = teamAdv(m, me).gold;
  const nwOf = p => p.networth_t || p.gold_t;
  const len = (me.lh_t || []).length;
  return [5, 10, 15, 20, 25, 30, 40, 50].filter(t => t < len).map(t => ({
    t, lh: at(me.lh_t, t), dn: at(me.dn_t, t), nw: at(nwOf(me), t), opLh: op ? at(op.lh_t, t) : null, opNw: op ? at(nwOf(op), t) : null,
    teamAvg: team.reduce((s, p) => s + (at(nwOf(p), t) || 0), 0) / team.length, adv: at(adv, t), op
  }));
}

function inflictorName(k) {
  if (!k || k === 'null') return 'Энгийн цохилт (attack)';
  const it = itemByKey(k); if (it) return it.n;
  const a = abilityByKey(k); if (a) return a.n;
  return k.replace(/_/g, ' ');
}
function topDamageTaken(me, n = 6) {
  return Object.entries(me.damage_inflictor_received || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, n: inflictorName(k), v }));
}
function topDamageDealt(me, n = 6) {
  return Object.entries(me.damage_inflictor || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, n: inflictorName(k), v }));
}
function goldSources(me) {
  const r = me.gold_reasons || {}, agg = {};
  for (const [k, v] of Object.entries(r)) { if (v <= 0) continue; const n = GOLD_REASONS[k] || 'Бусад'; agg[n] = (agg[n] || 0) + v; }
  const tot = Object.values(agg).reduce((s, v) => s + v, 0);
  return Object.entries(agg).sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ n, v, p: tot ? v / tot : 0 }));
}

function matchStory(m, me) {
  const S2 = [], adv = teamAdv(m, me).gold, won = isWin(me), kills = allKills(m), hn = p => hero(p.hero_id).n;
  const fb = kills[0];
  if (fb) S2.push(`${fmtT(fb.time)}-д ${hn(fb.killer)} ${fb.victim ? hn(fb.victim) : ''}-г алж first blood авав${fb.killer === me ? ' — энэ чи байсан!' : fb.victim === me ? ' — эхний үхэл чинийх байлаа.' : '.'}`);
  const op = laneOpponent(m, me), nw = p => p.networth_t || p.gold_t;
  if (op && nw(me) && nw(op) && nw(me).length > 10) {
    const d = at(nw(me), 10) - at(nw(op), 10);
    S2.push(`Лайн: 10 минутад чи ${hn(op)}-аас ${Math.abs(d).toLocaleString()} gold ${d >= 0 ? 'түрүүлсэн' : 'хоцорсон'} (LH ${at(me.lh_t, 10)} vs ${at(op.lh_t, 10)}).`);
  }
  if (adv.length > 10) S2.push(`10 минутад танай баг ${fmtK(Math.abs(adv[10]))} gold ${adv[10] >= 0 ? 'давуу' : 'хоцорсон'} байв.`);
  if (adv.length > 20) S2.push(`20 минутад: ${fmtK(Math.abs(adv[20]))} gold ${adv[20] >= 0 ? 'давуу' : 'хоцорсон'}.`);
  if (adv.length) {
    const mx = Math.max(...adv), mn = Math.min(...adv);
    if (mx > 3000) S2.push(`Хамгийн их давуу: ${fmtK(mx)} (${adv.indexOf(mx)}-р минут).`);
    if (mn < -3000) S2.push(`Хамгийн их хоцрогдол: ${fmtK(-mn)} (${adv.indexOf(mn)}-р минут).`);
  }
  const fights = fightsOf(m, me);
  if (fights.length) {
    const big = [...fights].sort((a, b) => b.deaths - a.deaths)[0];
    S2.push(`Хамгийн том тулаан ${fmtT(big.start)}-д: ${big.deaths} үхэл — танай баг ${big.our}, дайсан ${big.their} алдсан${big.present ? `; чи ${big.myKills} алж, ${big.myDeaths} үхсэн` : '; чи оролцоогүй'}.`);
    const w = fights.filter(f => f.won).length, l = fights.filter(f => !f.won && !f.even).length;
    S2.push(`Нийт ${fights.length} багийн тулаан: ${w} ялсан, ${l} ялагдсан. Чи ${fights.filter(f => f.present).length}-д нь оролцсон.`);
  }
  const obj = m.objectives || [], myTeam = isRad(me) ? 2 : 3;
  const rosh = obj.filter(o => o.type === 'CHAT_MESSAGE_ROSHAN_KILL');
  if (rosh.length) S2.push(`Roshan: танай баг ${rosh.filter(o => o.team === myTeam).length}, дайсан ${rosh.filter(o => o.team !== myTeam).length} удаа алсан.`);
  const bk = obj.filter(o => o.type === 'building_kill' && /tower/.test(o.key || ''));
  if (bk.length) {
    const ours = isRad(me) ? 'goodguys' : 'badguys';
    const lost = bk.filter(o => o.key.includes(ours)).length;
    S2.push(`Цамхаг: танай баг ${bk.length - lost} унагааж, ${lost} алдсан.`);
  }
  const team = m.players.filter(p => isRad(p) === isRad(me));
  const rk = (f) => [...team].sort((a, b) => (f(b) || 0) - (f(a) || 0)).indexOf(me) + 1;
  S2.push(`Багтаа: net worth-оор ${rk(p => p.net_worth)}-р, hero damage-аар ${rk(p => p.hero_damage)}-р, tower damage-аар ${rk(p => p.tower_damage)}-р байр.`);
  S2.push(`${fmtT(m.duration)}-д танай баг ${won ? 'ЯЛСАН' : 'ЯЛАГДСАН'}.`);
  return S2;
}

/* ---------- Олон тоглолтын хэв маяг ---------- */
function analyzeHistory(ms) {
  const out = [];
  const add = (type, title, detail, tip) => out.push({ type, title, detail, tip });
  ms = ms.filter(m => m.radiant_win != null);
  if (ms.length < 5) return out;
  const wr = a => a.length ? a.filter(isWin).length / a.length : 0;
  const avg = (a, f) => a.length ? a.reduce((s, x) => s + f(x), 0) / a.length : 0;
  const W = ms.filter(isWin), L = ms.filter(m => !isWin(m));
  const all = wr(ms);

  const dW = avg(W, m => m.deaths), dL = avg(L, m => m.deaths), dA = avg(ms, m => m.deaths);
  if (L.length >= 3 && W.length >= 3 && dL - dW >= 2.5)
    add('bad', `Ялагдсан тоглолтод дунджаар ${dL.toFixed(1)} удаа үхдэг`, `Ялсан тоглолтод ${dW.toFixed(1)}. Үхэл таны үр дүнд хамгийн их нөлөөлж байна.`,
      'Нэг тоглолтод 5-аас доош үхэх зорилт тавь. Үхэх бүрийнхээ шалтгааныг тоглолтын дэлгэрэнгүйгээс хар.');
  if (dA >= 8) add('bad', `Дундаж үхэл өндөр: ${dA.toFixed(1)}`, 'Ихэнх rank-д дундаж 6 орчим байдаг.');
  else if (dA <= 4.5) add('good', `Дундаж үхэл бага: ${dA.toFixed(1)}`, 'Амьд үлдэх чадвар сайн.');

  const solo = ms.filter(m => (m.party_size || 1) <= 1), party = ms.filter(m => m.party_size > 1);
  if (solo.length >= 5 && party.length >= 5) {
    const ws = wr(solo), wp = wr(party);
    if (Math.abs(ws - wp) >= 0.1) add('info', ws > wp ? `Соло тоглоход илүү сайн (${pct(ws)} vs найзуудтай ${pct(wp)})` : `Найзуудтайгаа тоглоход илүү сайн (${pct(wp)} vs соло ${pct(ws)})`,
      `Соло ${solo.length}, party ${party.length} тоглолт.`);
  }

  const byHero = {};
  for (const m of ms) (byHero[m.hero_id] = byHero[m.hero_id] || []).push(m);
  const hs = Object.entries(byHero).filter(([, a]) => a.length >= 4).map(([id, a]) => ({ id: +id, n: a.length, wr: wr(a), d: avg(a, m => m.deaths) }));
  const worst = hs.filter(h => h.wr <= 0.35).sort((a, b) => a.wr - b.wr || b.n - a.n)[0];
  const best = hs.filter(h => h.wr >= 0.6).sort((a, b) => b.wr - a.wr || b.n - a.n)[0];
  if (worst) add('warn', `${hero(worst.id).n}: ${worst.n} тоглолтод ${pct(worst.wr)} winrate`, `Энэ баатар дээр дунджаар ${worst.d.toFixed(1)} үхэл.`, 'Ranked-д түр больж, unranked/demo-д build-ээ сайжруул.');
  if (best) add('good', `${hero(best.id).n} бол чиний хүчтэй баатар: ${pct(best.wr)} (${best.n} тоглолт)`, 'MMR өсгөх гэж байгаа бол энэ баатрыг илүү тогло.');

  const long = ms.filter(m => m.duration >= 45 * 60), short = ms.filter(m => m.duration < 30 * 60);
  if (long.length >= 5 && wr(long) <= all - 0.12) add('warn', `Урт тоглолтод (45+ мин) winrate ${pct(wr(long))}`, `Ерөнхий ${pct(all)}. Late game-ийн шийдвэр (buyback, high ground, Roshan) сул байж магадгүй.`);
  if (short.length >= 5 && wr(short) <= all - 0.12) add('warn', `Богино тоглолтод (<30 мин) winrate ${pct(wr(short))}`, 'Эхний 20 минут, лайн шат сул байна гэсэн дохио.');

  const s = [...ms].sort((a, b) => a.start_time - b.start_time), tilt = [];
  for (let i = 2; i < s.length; i++) {
    if (!isWin(s[i - 1]) && !isWin(s[i - 2]) && s[i].start_time - (s[i - 1].start_time + s[i - 1].duration) < 3600) tilt.push(s[i]);
  }
  if (tilt.length >= 4 && wr(tilt) <= all - 0.08) add('bad', `2 дараалан ялагдсаны дараа шууд тоглоход winrate ${pct(wr(tilt))}`,
    `${tilt.length} ийм тоглолт. Ерөнхий winrate ${pct(all)}. Энэ бол tilt.`,
    '2 ялагдлын дараа 20–30 минут завсарлага ав, эсвэл тэр өдөртөө зогсоо.');

  const night = ms.filter(m => { const h = new Date(m.start_time * 1000).getHours(); return h >= 0 && h < 6; });
  if (night.length >= 5 && wr(night) <= all - 0.1) add('warn', `Шөнө (00–06 цаг) winrate ${pct(wr(night))}`, `${night.length} тоглолт. Ядарсан үед шийдвэр муудна.`);

  const lv = ms.filter(m => m.leaver_status > 1);
  if (lv.length) add('warn', `${lv.length} тоглолтоос гарсан (abandon)`, 'Low priority, MMR алдагдал.');

  const turbo = ms.filter(m => m.game_mode === 23).length;
  if (turbo / ms.length > 0.5) add('info', `Тоглолтын ${pct(turbo / ms.length)} нь Turbo`, 'Turbo-ийн статистик (GPM, үхэл) ranked-аас ялгаатай.');

  const recent = [...ms].sort((a, b) => b.start_time - a.start_time);
  const r20 = recent.slice(0, 20), p20 = recent.slice(20, 40);
  if (r20.length >= 10 && p20.length >= 10) {
    const d = wr(r20) - wr(p20);
    if (d >= 0.15) add('good', `Сүүлийн 20 тоглолтод сайжирч байна: ${pct(wr(r20))}`, `Өмнөх 20-д ${pct(wr(p20))} байсан.`);
    if (d <= -0.15) add('warn', `Сүүлийн 20 тоглолтод муудсан: ${pct(wr(r20))}`, `Өмнөх 20-д ${pct(wr(p20))} байсан.`, 'Хамгийн их тоглосон баатар, лайн role-оо шалга — магадгүй шинэ patch-д тохирохгүй болсон.');
  }
  return sortIns(out);
}

function sortIns(a) {
  const o = { bad: 0, warn: 1, info: 2, good: 3 };
  return a.sort((x, y) => o[x.type] - o[y.type]);
}
