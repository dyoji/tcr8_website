/* Escala (demo tCr8) — gerador automático da semana.
 * 1) folgas: domingos em rodízio (cota por regra da loja e art. 386), 7º dia, ausências e dias de menos movimento;
 * 2) distribui as horas do contrato pelos dias de trabalho;
 * 3) encaixa cada turno onde o movimento previsto mais precisa de gente (chave na abertura e no fechamento)
 *    e depois refina movendo turnos enquanto o buraco total diminuir;
 * 4) escalona os intervalos e abre "turnos abertos" onde ainda falta gente. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.EscalaAuto = factory(root.EscalaCore);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  function autoSchedule(ctx) {
    const { settings, store, employees, shifts, absences, weekStart: ws, newId } = ctx;
    const regime = C.regimeOf(settings);
    const rules = (settings && settings.rules) || {};
    const days = C.weekDays(ws), sun = days[6];
    const emps = employees.filter((e) => e.active !== false && e.contract !== 'freela'); // freela entra por convocação, não pelo gerador
    const fixed = ctx.fixed || []; // turnos que ficam (freelas convocados) e já contam na cobertura
    const keyIds = new Set(store.key_required ? emps.filter((e) => (e.skills || []).includes('chave')).map((e) => e.id) : []);

    // histórico (semanas anteriores) para descanso, 7º dia e domingos
    const histDates = {}, lastEnd = {};
    shifts.filter((s) => s.date < ws && s.employee_id).forEach((s) => {
      (histDates[s.employee_id] = histDates[s.employee_id] || new Set()).add(s.date);
      const e = C.absEnd(s); if (!(lastEnd[s.employee_id] >= e)) lastEnd[s.employee_id] = e;
    });
    const workedOn = (e, d) => !!(histDates[e.id] && histDates[e.id].has(d));
    const tailRun = (e) => { let k = 0; for (let d = C.addDays(ws, -1); workedOn(e, d); d = C.addDays(d, -1)) k++; return k; };
    const sundayStreak = (e) => { let k = 0; for (let d = C.addDays(ws, -1); workedOn(e, d); d = C.addDays(d, -7)) k++; return k; };

    const info = days.map((d) => {
      const sw = C.staffWindow(store, d);
      const curve = sw ? C.demandCurve(store, d) : [];
      return { date: d, sw, curve, load: curve.reduce((a, c) => a + c.need * 60, 0) };
    });
    const allDayOff = (e, d) => (e.unavail || []).some((u) => u.dow.includes(C.dow(d)) && C.toMin(u.from) <= 0 && C.toMin(u.to) >= 1439);

    // ---------- 1. folgas
    const plan = {}, avail = {}, taken = {};
    const staffCount = days.map(() => 0), keyCount = days.map(() => 0);
    emps.forEach((e) => {
      avail[e.id] = days.filter((d, i) => info[i].sw && !C.absenceOn(absences, e.id, d) && !allDayOff(e, d));
      plan[e.id] = new Set(avail[e.id]);
      taken[e.id] = [];
      avail[e.id].forEach((d) => { const i = days.indexOf(d); staffCount[i]++; if (keyIds.has(e.id)) keyCount[i]++; });
    });
    const off = (e, d) => { const i = days.indexOf(d); plan[e.id].delete(d); taken[e.id].push(d); staffCount[i]--; if (keyIds.has(e.id)) keyCount[i]--; };
    const req = info.map((x) => (x.sw ? x.load / 440 : 0));

    // domingos: quem completou o ciclo folga obrigatoriamente; depois completa a cota (rodízio estável)
    if (info[6].sw) {
      const period = (e) => (rules.art386 !== false && e.gender === 'F' ? 2 : store.sunday_window || 3);
      const onSun = emps.filter((e) => plan[e.id].has(sun));
      const forced = onSun.filter((e) => sundayStreak(e) >= period(e) - 1);
      forced.forEach((e) => off(e, sun));
      let extra = Math.round(onSun.reduce((a, e) => a + 1 / period(e), 0)) - forced.length;
      const rest = onSun.filter((e) => !forced.includes(e)).sort((a, b) => sundayStreak(b) - sundayStreak(a) || C.rand(a.id + ws) - C.rand(b.id + ws));
      for (const e of rest) {
        if (extra <= 0) break;
        if (keyIds.has(e.id) && keyCount[6] <= 1) continue;
        if (avail[e.id].length <= C.contractDays(e, regime)) continue; // ninguém perde dia de trabalho só pela cota
        off(e, sun); extra--;
      }
    }

    const order = emps.slice().sort((a, b) => tailRun(b) - tailRun(a) || C.rand(a.id + ws) - C.rand(b.id + ws));
    for (const e of order) {
      let removals = avail[e.id].length - Math.min(avail[e.id].length, C.contractDays(e, regime)) - taken[e.id].length;
      // com k dias seguidos no fim da semana passada, a folga tem que cair até o dia 6-k
      const limitIdx = 6 - tailRun(e);
      const hasEarlyOff = () => days.some((d, i) => i <= limitIdx && !plan[e.id].has(d));
      while (removals > 0 || !hasEarlyOff()) {
        let cands = [...plan[e.id]];
        if (!hasEarlyOff()) cands = cands.filter((d) => days.indexOf(d) <= limitIdx);
        if (!cands.length) break;
        let best = null, bestScore = -Infinity;
        for (const d of cands) {
          const i = days.indexOf(d);
          let score = staffCount[i] - req[i];
          if (keyIds.has(e.id)) score -= keyCount[i] <= 1 ? 8 : keyCount[i] === 2 ? 3 : 0;
          if (regime.folgas_min >= 2 && taken[e.id].some((p) => Math.abs(days.indexOf(p) - i) === 1)) score += 0.5; // folgas emendadas
          score += C.rand(e.id + d) * 0.3;
          if (score > bestScore) { bestScore = score; best = d; }
        }
        off(e, best);
        removals--;
      }
    }

    // ---------- 2. horas por dia (enche por igual, respeitando o teto de cada dia)
    const minutesPlan = {};
    for (const e of emps) {
      const ds = days.filter((d) => plan[e.id].has(d));
      const cap = {};
      ds.forEach((d) => { const sw = info[days.indexOf(d)].sw; cap[d] = Math.min(C.dailyNormal(e, regime), C.maxWorkedIn(sw.end - sw.start)); });
      let remaining = C.weeklyLimit(e, regime), open = ds.slice();
      const res = {};
      while (open.length) {
        const share = remaining / open.length;
        const capped = open.filter((d) => cap[d] <= share);
        if (!capped.length) {
          const base = Math.floor(share / 10) * 10;
          let extra = Math.round((remaining - base * open.length) / 10);
          open.forEach((d) => { res[d] = Math.min(cap[d], base + (extra-- > 0 ? 10 : 0)); });
          break;
        }
        capped.forEach((d) => { res[d] = cap[d]; remaining -= cap[d]; });
        open = open.filter((d) => cap[d] > share);
      }
      minutesPlan[e.id] = res;
    }

    // ---------- 3. horários
    const out = [];
    const prevEnd = Object.assign({}, lastEnd);
    const fits = (samples, s, len) => { let v = 0; for (const sm of samples) if (sm.m >= s && sm.m < s + len) v += Math.max(0, sm.need - sm.have) + sm.need * 0.05; return v; };
    const mark = (samples, s, len, k) => samples.forEach((sm) => { if (sm.m >= s && sm.m < s + len) sm.have += k; });
    for (const x of info) {
      if (!x.sw) continue;
      const d = x.date, sw = x.sw, dayBase = C.diffDays('2000-01-03', d) * 1440;
      const samples = x.curve.map((c) => ({ m: c.h * 60 + 30, need: c.need, have: fixed.filter((f) => f.date === x.date && C.presentAt(f, c.h * 60 + 30)).length, h: c.h }));
      const ordered = emps.filter((e) => plan[e.id].has(d))
        .sort((a, b) => (keyIds.has(b.id) - keyIds.has(a.id)) || (minutesPlan[b.id][d] - minutesPlan[a.id][d]) || (C.rand(a.id + d) - C.rand(b.id + d)));
      let openerDone = false, closerDone = false;
      const dayShifts = [], meta = {};
      for (const e of ordered) {
        const wk = minutesPlan[e.id][d]; if (!wk) continue;
        const br = C.breakFor(wk), len = wk + br;
        let lo = sw.start, hi = sw.end - len;
        if (C.isMinor(e, d)) hi = Math.min(hi, 22 * 60 - len);
        if (prevEnd[e.id] != null) lo = Math.max(lo, prevEnd[e.id] + 660 - dayBase);
        if (hi < lo) continue;
        const cands = [];
        for (let s = lo; s <= hi; s += 10) if (s === lo || (s - sw.start) % 30 === 0) cands.push(s);
        if (cands[cands.length - 1] !== hi) cands.push(hi);
        const blockedWin = (e.unavail || []).filter((u) => u.dow.includes(C.dow(d))).map((u) => [C.toMin(u.from), C.toMin(u.to)]);
        let pool = cands.filter((s) => !blockedWin.some(([f, t]) => s < t && s + len > f));
        if (!pool.length) pool = cands;
        const isKey = keyIds.has(e.id);
        let best = pool[0], bestScore = -Infinity, role = '';
        for (const s of pool) {
          let score = fits(samples, s, len), r = '';
          if (isKey && !openerDone && s <= sw.open - 5) { score += 50; r = 'abre'; }
          else if (isKey && openerDone && !closerDone && s + len >= sw.close + 5) { score += 50; r = 'fecha'; }
          if (score > bestScore + 1e-9) { bestScore = score; best = s; role = r; }
        }
        if (role === 'abre') openerDone = true;
        if (role === 'fecha') closerDone = true;
        mark(samples, best, len, 1);
        const sh = { id: newId(), store_id: store.id, employee_id: e.id, date: d, start: C.fromMin(best), end: C.fromMin(best + len), break_min: br, role_id: e.role_id };
        meta[sh.id] = { len, pool, fixed: !!role, emp: e };
        dayShifts.push(sh);
      }

      // refinamento: move turnos enquanto o buraco total diminuir
      for (let round = 0; round < 4; round++) {
        let moved = false;
        for (const sh of dayShifts) {
          const m = meta[sh.id]; if (m.fixed) continue;
          const cur = C.toMin(sh.start);
          mark(samples, cur, m.len, -1);
          let best = cur, bestScore = fits(samples, cur, m.len) + 1e-6;
          for (const s of m.pool) { const v = fits(samples, s, m.len); if (v > bestScore) { bestScore = v; best = s; } }
          mark(samples, best, m.len, 1);
          if (best !== cur) { moved = true; sh.start = C.fromMin(best); sh.end = C.fromMin(best + m.len); }
        }
        if (!moved) break;
      }
      dayShifts.forEach((sh) => { prevEnd[sh.employee_id] = dayBase + C.span(sh)[1]; });

      // ---------- 4. intervalos escalonados: cada um na hora em que a loja mais aguenta
      for (const sh of dayShifts) {
        if (!sh.break_min) continue;
        const [s, e2] = C.span(sh);
        let bestB = null, bestV = -Infinity;
        for (let b = Math.ceil((s + 120) / 30) * 30; b <= e2 - 120 - sh.break_min; b += 30) {
          let v = 0;
          samples.forEach((sm) => { if (sm.m >= b && sm.m < b + sh.break_min) v += sm.have - sm.need; });
          v -= Math.abs(b - (s + e2) / 2) * 0.004;
          if (v > bestV) { bestV = v; bestB = b; }
        }
        if (bestB == null) continue;
        sh.break_at = C.fromMin(bestB);
        samples.forEach((sm) => { if (sm.m >= bestB && sm.m < bestB + sh.break_min) sm.have--; });
      }
      out.push(...dayShifts);

      // ---------- 5. turnos abertos onde ainda falta gente por 3h ou mais
      if (ctx.openShifts !== false) {
        for (let made = 0; made < 2; made++) {
          let bi = -1, bj = -1;
          for (let i = 0; i < samples.length;) {
            if (samples[i].have >= samples[i].need) { i++; continue; }
            let j = i; while (j < samples.length && samples[j].have < samples[j].need) j++;
            if (j - i > bj - bi) { bi = i; bj = j; }
            i = j;
          }
          if (bi < 0 || bj - bi < 3) break;
          const st = Math.max(sw.start, samples[bi].h * 60);
          let en = Math.min(sw.end, (samples[bj - 1].h + 1) * 60);
          const br = en - st - 60 > 360 ? 60 : en - st - 15 > 240 ? 15 : 0;
          if (en - st - br > 480) en = st + 480 + br;
          out.push({ id: newId(), store_id: store.id, employee_id: null, date: d, start: C.fromMin(st), end: C.fromMin(en), break_min: br, role_id: store.default_role });
          mark(samples, st, en - st, 1);
        }
      }
    }

    const folgas = {};
    emps.forEach((e) => { folgas[e.id] = days.filter((d) => info[days.indexOf(d)].sw && !plan[e.id].has(d) && !C.absenceOn(absences, e.id, d)); });
    return { shifts: out, folgas };
  }

  return { autoSchedule };
});
