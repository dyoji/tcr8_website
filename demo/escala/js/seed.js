/* Escala (demo tCr8) — dados de demonstração: três lojas fictícias, 20 pessoas e oito semanas de escala
 * (sete publicadas + a próxima em rascunho), geradas pelo próprio gerador automático.
 * Tudo relativo à data de hoje, para o demo sempre abrir na semana corrente. Roda no Node e no navegador. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./auto.js'));
  else root.EscalaSeed = factory(root.EscalaCore, root.EscalaAuto);
})(typeof self !== 'undefined' ? self : this, function (C, A) {
  'use strict';

  const ROLES = [
    { id: 'ger', name: 'Gerência', color: '#B5DC1E' },
    { id: 'ven', name: 'Vendas', color: '#7C9CFF' },
    { id: 'cx', name: 'Caixa', color: '#F5B841' },
    { id: 'est', name: 'Estoque', color: '#3FC6A0' },
    { id: 'mon', name: 'Monitoria', color: '#FF7FA8' },
    { id: 'rec', name: 'Recepção', color: '#B58CFF' },
  ];

  const wk = (from, to) => ({ 1: [from, to], 2: [from, to], 3: [from, to], 4: [from, to], 5: [from, to] });

  const STORES = [
    {
      id: 'SHO', name: 'Loja Shopping', short: 'Shopping', kind: 'Moda · shopping center',
      hours: Object.assign(wk('10:00', '22:00'), { 6: ['10:00', '22:00'], 0: ['14:00', '20:00'], holiday: ['14:00', '20:00'] }),
      holiday_cct: true, sunday_window: 3, key_required: true, default_role: 'ven', prep_before: 20, prep_after: 10,
      demand: {
        daily: { 1: 7000, 2: 6600, 3: 7000, 4: 7500, 5: 9400, 6: 14000, 0: 6600 }, holiday_factor: 0.8, splh: 235, min_staff: 2,
        curve: { 10: 0.5, 11: 0.7, 12: 1.0, 13: 1.1, 14: 1.0, 15: 1.0, 16: 1.1, 17: 1.2, 18: 1.35, 19: 1.4, 20: 1.2, 21: 0.8 },
      },
    },
    {
      id: 'RUA', name: 'Loja de Rua', short: 'Rua', kind: 'Moda · rua',
      hours: Object.assign(wk('09:00', '19:00'), { 6: ['09:00', '15:00'], 0: null, holiday: null }),
      holiday_cct: false, sunday_window: 3, key_required: true, default_role: 'ven', prep_before: 20, prep_after: 10,
      demand: {
        daily: { 1: 6300, 2: 6000, 3: 6300, 4: 6650, 5: 7700, 6: 7000, 0: 0 }, holiday_factor: 1, splh: 315, min_staff: 1,
        curve: { 9: 0.6, 10: 0.9, 11: 1.1, 12: 1.3, 13: 1.2, 14: 1.0, 15: 1.0, 16: 1.05, 17: 1.1, 18: 0.8 },
      },
    },
    {
      id: 'KID', name: 'Espaço Kids', short: 'Kids', kind: 'Recreação infantil',
      hours: Object.assign(wk('10:00', '20:00'), { 1: null, 6: ['10:00', '21:00'], 0: ['10:00', '20:00'], holiday: ['10:00', '20:00'] }),
      holiday_cct: true, sunday_window: 7, key_required: true, default_role: 'mon', prep_before: 20, prep_after: 10,
      demand: {
        daily: { 1: 0, 2: 4000, 3: 4000, 4: 4500, 5: 6500, 6: 14000, 0: 15000 }, holiday_factor: 1.3, splh: 300, min_staff: 2,
        curve: { 10: 0.6, 11: 0.9, 12: 0.8, 13: 1.0, 14: 1.4, 15: 1.6, 16: 1.6, 17: 1.3, 18: 1.0, 19: 0.7, 20: 0.5 },
      },
    },
  ];

  const P = (id, store_id, name, role_id, o) => Object.assign({ id, store_id, name, role_id, contract: 'clt', weekly_hours: 44, gender: 'F', skills: [], unavail: [], active: true }, o);
  const EMPLOYEES = [
    P('e1', 'SHO', 'Marina Alves', 'ger', { salary: 4800, skills: ['chave'], birth: '1988-03-14' }),
    P('e2', 'SHO', 'Bruna Costa', 'ven', { salary: 2700, skills: ['chave'], birth: '1994-07-02' }),
    P('e3', 'SHO', 'Camila Rocha', 'ven', { salary: 2300, birth: '1997-11-20' }),
    P('e4', 'SHO', 'Débora Lima', 'ven', { salary: 2500, skills: ['chave'], birth: '1992-05-09' }),
    P('e5', 'SHO', 'Elisa Martins', 'ven', { salary: 2300, birth: '1999-01-30' }),
    P('e6', 'SHO', 'Fernanda Souza', 'ven', { salary: 2300, birth: '1996-09-12' }),
    P('e7', 'SHO', 'Gabriela Nunes', 'cx', { salary: 2100, birth: '1995-02-25' }),
    P('e8', 'SHO', 'Igor Santos', 'est', { salary: 950, contract: 'aprendiz', weekly_hours: 30, days: 5, gender: 'M', birth: '2009-04-18' }),
    P('e9', 'RUA', 'Juliana Prado', 'ger', { salary: 4200, skills: ['chave'], birth: '1986-12-01' }),
    P('e10', 'RUA', 'Kátia Ramos', 'ven', { salary: 2400, skills: ['chave'], birth: '1991-06-17' }),
    P('e11', 'RUA', 'Larissa Melo', 'ven', { salary: 2200, birth: '1998-08-08' }),
    P('e12', 'RUA', 'Mônica Tavares', 'ven', { salary: 1600, contract: 'parcial', weekly_hours: 30, days: 5, birth: '2003-10-05', unavail: [{ dow: [1, 2, 3, 4, 5], from: '07:00', to: '12:30', reason: 'faculdade' }] }),
    P('e13', 'RUA', 'Natália Freitas', 'cx', { salary: 2000, birth: '1993-04-22' }),
    P('e14', 'KID', 'Olívia Cardoso', 'ger', { salary: 4000, skills: ['chave'], birth: '1989-09-30' }),
    P('e15', 'KID', 'Paula Ribeiro', 'mon', { salary: 2100, birth: '2000-02-11' }),
    P('e16', 'KID', 'Rafael Gomes', 'mon', { salary: 2100, skills: ['chave'], gender: 'M', birth: '1997-07-23' }),
    P('e17', 'KID', 'Sabrina Lopes', 'mon', { salary: 1800, weekly_hours: 36, birth: '2001-12-19' }),
    P('e18', 'KID', 'Tatiane Moraes', 'rec', { salary: 2000, birth: '1995-03-03' }),
    P('e19', 'KID', 'Vinícius Araújo', 'mon', { salary: 1500, contract: 'parcial', weekly_hours: 30, days: 5, gender: 'M', birth: '2002-05-27', unavail: [{ dow: [2, 3], from: '00:00', to: '23:59', reason: 'faculdade' }] }),
    P('e20', 'KID', 'Yasmin Castro', 'mon', { salary: 1000, contract: 'parcial', weekly_hours: 20, days: 3, birth: '2004-01-15', unavail: [{ dow: [1, 2, 3, 4], from: '00:00', to: '23:59', reason: 'estágio' }] }),
  ];

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const stamp = (date, hhmm) => date + 'T' + hhmm + ':00';

  function seed(now) {
    now = now || new Date();
    const today = C.todayISO(now);
    const W = C.weekStart(today);
    let seq = 0;
    const newId = () => 'sh' + ++seq;
    const db = {
      version: 1, schema: 3, seq: 0, created_at: now.toISOString(), seed_week: W,
      company: { name: 'Demo tCr8' },
      settings: { regime: 'clt', rules: { art386: true, compensacao: true, noturno: true, feriado: true }, labor_target_pct: 14 },
      roles: clone(ROLES), stores: clone(STORES), employees: clone(EMPLOYEES),
      shifts: [], absences: [], requests: [], publications: {}, receipts: {}, justifications: {}, log: [],
    };
    const emp = (id) => db.employees.find((e) => e.id === id);
    const first = (id) => emp(id).name.split(' ')[0];
    const managerOf = (sid) => db.employees.find((e) => e.store_id === sid && e.role_id === 'ger');

    // férias já programadas (entram antes de gerar)
    db.absences.push({ id: 'a1', employee_id: 'e6', type: 'ferias', date_ini: C.addDays(W, 7), date_end: C.addDays(W, 16), status: 'aprovado', note: '' });
    db.absences.push({ id: 'a2', employee_id: 'e17', type: 'curso', date_ini: C.addDays(W, 9), date_end: C.addDays(W, 9), status: 'aprovado', note: 'Primeiros socorros' });

    // 7 semanas de histórico + a atual (publicadas) e a próxima (rascunho)
    for (let k = -7; k <= 1; k++) {
      const ws = C.addDays(W, 7 * k);
      for (const store of db.stores) {
        const employees = db.employees.filter((e) => e.store_id === store.id);
        const res = A.autoSchedule({
          settings: db.settings, store, employees, absences: db.absences, weekStart: ws, newId,
          shifts: db.shifts.filter((s) => s.store_id === store.id && s.date >= C.addDays(ws, -56)),
        });
        res.shifts.forEach((s) => { delete s.auto; });
        db.shifts.push(...res.shifts);
        if (k <= 0) {
          const at = stamp(C.addDays(ws, -4), k === 0 ? '17:42' : '18:05');
          db.publications[store.id + '|' + ws] = { published_at: at, by: managerOf(store.id).name, shifts: clone(res.shifts) };
          db.receipts[store.id + '|' + ws] = Object.fromEntries(employees.map((e) => [e.id, stamp(C.addDays(ws, -3), '09:1' + (e.id.length % 10))]));
        }
      }
    }

    const inW = (s) => s.date >= W && s.date <= C.addDays(W, 6);
    const applyBoth = (shift, patch) => {
      Object.assign(shift, patch);
      const pub = db.publications[shift.store_id + '|' + C.weekStart(shift.date)];
      const p = pub && pub.shifts.find((x) => x.id === shift.id);
      if (p) Object.assign(p, patch);
    };
    const futureFirst = (list) => list.filter((s) => s.date >= today).concat(list.filter((s) => s.date < today));

    // ajustes manuais que entraram na escala publicada (e geram apontamentos de verdade)
    // 1) Débora fecha num dia e abre cedo no seguinte → menos de 11h de descanso
    const deb = futureFirst(db.shifts.filter((s) => s.employee_id === 'e4' && inW(s)).sort((a, b) => a.date.localeCompare(b.date)));
    for (const a of deb) {
      const b = db.shifts.find((s) => s.employee_id === 'e4' && s.date === C.addDays(a.date, 1));
      const sw = C.staffWindow(db.stores[0], a.date);
      if (!b || !sw || C.dow(a.date) === 6 || C.dow(a.date) === 0) continue;
      const len = C.span(a)[1] - C.span(a)[0];
      applyBoth(a, { start: C.fromMin(sw.end - len), end: C.fromMin(sw.end), break_at: null });
      const lb = C.span(b)[1] - C.span(b)[0];
      applyBoth(b, { start: '09:00', end: C.fromMin(540 + lb), break_at: null });
      break;
    }
    // 2) o aprendiz (17 anos) foi para o fechamento numa sexta/sábado
    const igor = futureFirst(db.shifts.filter((s) => s.employee_id === 'e8' && inW(s) && C.dow(s.date) >= 5));
    if (igor[0]) applyBoth(igor[0], { start: '16:00', end: '22:15', break_min: 15, break_at: '19:00' });

    // atestado lançado hoje cedo, depois da escala publicada
    db.absences.push({ id: 'a3', employee_id: 'e5', type: 'atestado', date_ini: today, date_end: C.addDays(today, 1), status: 'aprovado', note: 'CID J11 — 2 dias' });

    // turno aberto no sábado do Kids, se o gerador não tiver aberto
    const kidSat = C.addDays(W, 5);
    if (!db.shifts.some((s) => s.store_id === 'KID' && s.date === kidSat && !s.employee_id)) {
      const s = { id: newId(), store_id: 'KID', employee_id: null, date: kidSat, start: '14:00', end: '20:15', break_min: 15, role_id: 'mon' };
      db.shifts.push(s);
      db.publications['KID|' + W].shifts.push(clone(s));
    }

    // pedidos da equipe
    const sunW = C.addDays(W, 6);
    const shoSun = db.shifts.filter((s) => s.store_id === 'SHO' && s.date === sunW && s.employee_id);
    const giver = shoSun.find((s) => s.employee_id === 'e4') || shoSun.find((s) => ['e3', 'e5', 'e6', 'e2'].includes(s.employee_id)) || shoSun.find((s) => s.employee_id !== 'e1');
    const taker = giver && db.employees.find((e) => e.store_id === 'SHO' && e.role_id === 'ven' && e.id !== giver.employee_id && !shoSun.some((s) => s.employee_id === e.id) && !C.absenceOn(db.absences, e.id, sunW));
    db.requests.push({ id: 'r1', type: 'folga', store_id: 'SHO', employee_id: 'e3', date: C.addDays(W, 12), note: 'Aniversário da minha filha', status: 'pendente', created_at: stamp(C.addDays(today, -1), '21:14') });
    if (giver && taker) db.requests.push({ id: 'r2', type: 'troca', store_id: 'SHO', employee_id: giver.employee_id, shift_id: giver.id, to_employee_id: taker.id, note: 'Tenho um casamento no domingo — ' + first(taker.id) + ' topou', status: 'pendente', created_at: stamp(today, '08:47') });
    const freeOn = (id, d) => !db.shifts.some((s) => s.employee_id === id && s.date === d) && !C.absenceOn(db.absences, id, d);
    let kidOpen = null, claimer = null;
    for (const s of db.shifts.filter((x) => x.store_id === 'KID' && !x.employee_id && x.date >= today && x.date <= C.addDays(W, 6))) {
      const c = ['e20', 'e19', 'e15', 'e17', 'e18'].find((id) => freeOn(id, s.date));
      if (c) { kidOpen = s; claimer = c; break; }
    }
    if (kidOpen && claimer) db.requests.push({ id: 'r3', type: 'pegar', store_id: 'KID', employee_id: claimer, shift_id: kidOpen.id, note: 'Posso cobrir', status: 'pendente', created_at: stamp(today, '07:58') });

    // freelas intermitentes de exemplo, com link de ponto já gerado (demo_token só existe no demo)
    db.convocations = []; db.nsr = 0;
    const reserved = new Set(db.requests.map((r) => r.shift_id).filter(Boolean));
    const token = () => { let t = ''; while (t.length < 32) t += Math.random().toString(36).slice(2); return t.slice(0, 32); };
    const sent = stamp(C.addDays(W, -4), '17:55');
    function freela(id, store_id, name, role_id, cpf9, rate) {
      const cpf = C.cpfCheck(cpf9), t = token();
      const e = { id, store_id, name, role_id, contract: 'freela', weekly_hours: 0, gender: null, skills: [], unavail: [], active: true, daily_rate: rate,
        cpf_hash: C.sha256(cpf), cpf_mask: C.cpfMask(cpf), created_at: sent,
        link: { hash: C.sha256(t), created_at: sent, valid_until: C.addDays(W, 6) + 'T23:59:59', revoked: false, demo_token: t } };
      db.employees.push(e);
      return e;
    }
    // usa o turno aberto do dia (se houver e ninguém pediu) ou cria um que termina no fechamento
    function turno(e, date, len) {
      const sw = C.staffWindow(db.stores.find((x) => x.id === e.store_id), date);
      if (!sw) return null;
      let sh = db.shifts.find((x) => x.store_id === e.store_id && x.date === date && !x.employee_id && !reserved.has(x.id));
      if (sh) { applyBoth(sh, { employee_id: e.id, role_id: e.role_id }); return sh; }
      const wk = C.maxWorkedIn(len), br = C.breakFor(wk);
      sh = { id: newId(), store_id: e.store_id, employee_id: e.id, date, start: C.fromMin(sw.end - wk - br), end: C.fromMin(sw.end), break_min: br, role_id: e.role_id };
      db.shifts.push(sh);
      const pub = db.publications[e.store_id + '|' + C.weekStart(date)];
      if (pub) pub.shifts.push(clone(sh));
      return sh;
    }
    function convoca(e, sh, status, at, punches, extra, note) {
      if (!sh) return;
      db.convocations.push({ id: 'c' + (db.convocations.length + 1), employee_id: e.id, shift_id: sh.id, sent_at: at, status, answered_at: status === 'pendente' ? null : at, punches: punches || [],
        pay: { daily: e.daily_rate, extra: extra || 0, note: extra ? note || '' : '' } });
    }
    const ana = freela('f1', 'SHO', 'Ana Beatriz Freitas', 'ven', '274185963', 150);
    // um dia que já passou, com o ponto completo
    const past = [0, 1, 2, 3, 4].map((i) => C.addDays(W, i)).find((d) => d < today && C.staffWindow(db.stores[0], d));
    if (past) {
      const sh = turno(ana, past, 375);
      const [a, b] = C.span(sh), bs = a + 180, p = (m, sec) => past + 'T' + C.fromMin(m) + ':' + C.pad(sec) ;
      convoca(ana, sh, 'aceito', sent, [
        { type: 'entrada', at: p(a + 2, 14), nsr: ++db.nsr },
        { type: 'intervalo_ini', at: p(bs, 2), nsr: ++db.nsr },
        { type: 'intervalo_fim', at: p(bs + sh.break_min + 1, 40), nsr: ++db.nsr },
        { type: 'saida', at: p(b + 3, 9), nsr: ++db.nsr },
      ]);
    }
    convoca(ana, turno(ana, today, 310), 'aceito', sent);                       // hoje, no fim do dia
    if (C.addDays(W, 5) > today) convoca(ana, turno(ana, C.addDays(W, 5), 490), 'aceito', stamp(today, '08:30'), null, 20, 'sábado'); // em cima da hora (alerta do art. 452-A) e com +R$ 20 para fechar o sábado
    if (C.addDays(W, 6) > today) convoca(ana, turno(ana, C.addDays(W, 6), 375), 'pendente', stamp(today, '08:30')); // menos de 3 dias: alerta
    const diego = freela('f2', 'KID', 'Diego Martins', 'mon', '853902174', 140);
    if (C.addDays(W, 6) > today) convoca(diego, turno(diego, C.addDays(W, 6), 490), 'aceito', sent);

    // aptidões: em que outros cargos cada um pode trabalhar
    const APT = { e2: ['cx', 'ger'], e4: ['cx'], e7: ['ven'], e10: ['cx'], e13: ['ven'], e14: ['mon', 'rec'], e16: ['rec'], e18: ['mon'] };
    Object.keys(APT).forEach((id) => { emp(id).apt = APT[id]; });
    ana.apt = ['cx']; diego.apt = ['rec'];

    // banco de freelas com 6 semanas de histórico — o comparecimento muda conforme o dia da semana
    function pastShift(e, date, len) {
      const sw = C.staffWindow(db.stores.find((x) => x.id === e.store_id), date);
      if (!sw) return null;
      const wk = C.maxWorkedIn(len), br = C.breakFor(wk);
      const sh = { id: newId(), store_id: e.store_id, employee_id: e.id, date, start: C.fromMin(sw.end - wk - br), end: C.fromMin(sw.end), break_min: br, role_id: e.role_id };
      db.shifts.push(sh);
      const pub = db.publications[e.store_id + '|' + C.weekStart(date)];
      if (pub) pub.shifts.push(clone(sh));
      return sh;
    }
    const at = (date, m, salt) => date + 'T' + C.fromMin(m) + ':' + C.pad(Math.floor(C.rand(salt) * 60));
    function history(e, plan, extra) {
      for (let k = 6; k >= 1; k--) {
        const ws = C.addDays(W, -7 * k);
        for (const p of plan) {
          const date = C.addDays(ws, p.d === 0 ? 6 : p.d - 1);
          if (C.rand(e.id + date + 'pula') < 0.2) continue; // nem toda semana é chamado
          const sh = pastShift(e, date, p.len || 375);
          if (!sh) continue;
          const sentAt = stamp(C.addDays(date, -4), '18:10');
          const came = C.rand(e.id + date) < p.p;
          const [a, b] = C.span(sh);
          const late = came && C.rand(e.id + date + 'atraso') < 0.2 ? 6 + Math.floor(C.rand(e.id + date + 'min') * 12) : 0;
          const punches = [];
          if (came) {
            punches.push(Object.assign({ type: 'entrada', at: at(date, a - 4 + late, e.id + date + 'e'), nsr: ++db.nsr }, late ? { late } : {}));
            if (sh.break_min) {
              punches.push({ type: 'intervalo_ini', at: at(date, a + 180, e.id + date + 'i'), nsr: ++db.nsr });
              punches.push({ type: 'intervalo_fim', at: at(date, a + 180 + sh.break_min + 1, e.id + date + 'f'), nsr: ++db.nsr });
            }
            punches.push({ type: 'saida', at: at(date, b + 2, e.id + date + 's'), nsr: ++db.nsr });
          }
          const extra = p.extra && C.dow(date) === p.extraDow ? p.extra : 0;
          db.convocations.push({ id: 'c' + (db.convocations.length + 1), employee_id: e.id, shift_id: sh.id, sent_at: sentAt, status: 'aceito', answered_at: sentAt, punches,
            pay: { daily: e.daily_rate, extra, note: extra ? (p.extraDow === 0 ? 'domingo' : 'sábado') : '' } });
        }
      }
      (extra || []).forEach((x) => {
        const date = C.addDays(W, x.week * 7 + (x.d === 0 ? 6 : x.d - 1));
        const sh = pastShift(e, date, 375); if (!sh) return;
        const c = { id: 'c' + (db.convocations.length + 1), employee_id: e.id, shift_id: sh.id, sent_at: stamp(C.addDays(date, -4), '18:10'), status: 'aceito', answered_at: stamp(C.addDays(date, -4), '19:02'), punches: [], pay: { daily: e.daily_rate, extra: 0, note: '' } };
        if (x.kind === 'recusa') { c.status = 'recusado'; applyBoth(sh, { employee_id: null }); }
        if (x.kind === 'justificada') { c.attendance = 'justificada'; c.attendance_reason = 'atestado'; c.attendance_by = stamp(date, '21:00'); }
        db.convocations.push(c);
      });
    }
    const roster = (id, store, name, role, apt, cpf9, rate, withLink) => { const e = freela(id, store, name, role, cpf9, rate); e.apt = apt; if (!withLink) e.link = null; return e; };
    history(ana, [{ d: 6, p: 1, len: 490, extra: 20, extraDow: 6 }, { d: 5, p: 0.9 }]);
    history(diego, [{ d: 6, p: 0.9, len: 490 }, { d: 0, p: 0.85 }]);
    const bianca = roster('f3', 'SHO', 'Bianca Rocha', 'ven', ['cx'], '418273650', 140);
    history(bianca, [{ d: 6, p: 0.95, len: 490, extra: 20, extraDow: 6 }, { d: 0, p: 0.3 }, { d: 3, p: 1 }]);
    const julia = roster('f4', 'SHO', 'Júlia Andrade', 'ven', ['est'], '629184037', 130, true);
    history(julia, [{ d: 6, p: 0.25, len: 490 }, { d: 5, p: 0.95 }]);
    const rafael = roster('f5', 'SHO', 'Rafael Lima', 'cx', ['ven'], '730295184', 160);
    history(rafael, [{ d: 6, p: 1, len: 490 }, { d: 0, p: 1, extra: 30, extraDow: 0 }, { d: 2, p: 1 }]);
    roster('f6', 'SHO', 'Thiago Nunes', 'est', [], '841306295', 120); // novo, sem histórico
    const larissa = roster('f7', 'SHO', 'Larissa Gomes', 'ven', [], '952417306', 150);
    history(larissa, [{ d: 6, p: 0.95, len: 490 }, { d: 0, p: 0.9 }], [{ week: -3, d: 6, kind: 'recusa' }, { week: -2, d: 0, kind: 'justificada' }]);
    const patricia = roster('f8', 'KID', 'Patrícia Souza', 'mon', ['rec'], '163528417', 130, true);
    history(patricia, [{ d: 0, p: 0.25, len: 490 }, { d: 6, p: 0.85, len: 490 }]);
    const bruno = roster('f9', 'KID', 'Bruno Teixeira', 'rec', ['mon'], '274639528', 145);
    history(bruno, [{ d: 6, p: 1, len: 490 }, { d: 0, p: 1, len: 490 }]);
    // convocados desta semana com histórico ruim naquele dia: o painel avisa
    if (C.addDays(W, 5) > today) convoca(julia, turno(julia, C.addDays(W, 5), 490), 'aceito', sent);
    if (C.addDays(W, 6) > today) convoca(patricia, turno(patricia, C.addDays(W, 6), 375), 'aceito', sent);

    // quem ainda não confirmou a leitura da semana atual
    ['e3', 'e7', 'e8', 'e12', 'e19', 'e20'].forEach((id) => { const r = db.receipts[emp(id).store_id + '|' + W]; if (r) delete r[id]; });

    db.log.push(
      ...db.stores.map((s) => ({ at: stamp(C.addDays(W, -4), '17:42'), store_id: s.id, msg: 'Escala da semana publicada por ' + managerOf(s.id).name.split(' ')[0] })),
      { at: stamp(today, '08:05'), store_id: 'SHO', msg: 'Atestado de ' + first('e5') + ' lançado (2 dias)' }
    );
    db.seq = seq;
    return db;
  }

  return { seed };
});
