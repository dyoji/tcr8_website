/* Escala (demo tCr8) — as regras da API, separadas do transporte.
 * O mesmo código atende o servidor Node (server.js) e o modo hospedado em PHP, em que a lógica roda
 * no navegador e o servidor só guarda o JSON (api.php + js/local.js).
 * handle() altera o db recebido e devolve { result, db, events }; quem chama grava e avisa as telas. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./auto.js'), require('./seed.js'));
  else root.EscalaRoutes = factory(root.EscalaCore, root.EscalaAuto, root.EscalaSeed);
})(typeof self !== 'undefined' ? self : this, function (C, A, Seed) {
  'use strict';

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const pubKey = (sid, ws) => sid + '|' + ws;
  // Relógio das regras (o ponto depende dele). No modo hospedado o local.js acerta pela hora do servidor.
  let clock = () => new Date();
  const setClock = (fn) => { clock = fn; };
  const stampOf = (d) => C.todayISO(d) + 'T' + C.pad(d.getHours()) + ':' + C.pad(d.getMinutes()) + ':' + C.pad(d.getSeconds());
  const nowStamp = () => stampOf(clock());
  const bad = (msg, code) => { const e = new Error(msg); e.status = code || 400; throw e; };
  const FIELDS = ['employee_id', 'date', 'start', 'end', 'break_min', 'break_at', 'role_id', 'note'];
  const nn = (v) => (v === undefined ? null : v);
  const same = (a, b) => FIELDS.every((f) => nn(a[f]) === nn(b[f]));

  // O demo se renova sozinho quando a semana em que foi gerado já passou (sempre abre com a semana atual cheia).
  function isStale(db) {
    return !db || !Array.isArray(db.stores) || !Array.isArray(db.shifts) || !Array.isArray(db.employees) || !db.publications
      || (db.seed_week && C.weekStart(C.todayISO()) > db.seed_week);
  }

  function diff(db, storeId, ws) {
    const pub = db.publications[pubKey(storeId, ws)];
    const we = C.addDays(ws, 6);
    const work = db.shifts.filter((s) => s.store_id === storeId && s.date >= ws && s.date <= we);
    if (!pub) return { published: false, added: work.map((s) => s.id), removed: [], changed: [], total: work.length };
    const pm = new Map(pub.shifts.map((s) => [s.id, s]));
    const wm = new Map(work.map((s) => [s.id, s]));
    const added = work.filter((s) => !pm.has(s.id)).map((s) => s.id);
    const removed = pub.shifts.filter((s) => !wm.has(s.id)).map((s) => s.id);
    const changed = work.filter((s) => pm.has(s.id) && !same(s, pm.get(s.id))).map((s) => s.id);
    return { published: true, published_at: pub.published_at, by: pub.by, added, removed, changed, total: added.length + removed.length + changed.length };
  }

  // O hash do link nunca sai daqui; o token de demonstração (só nos freelas de exemplo) sai para o gestor abrir o link.
  function publicEmp(e) {
    if (!e.link) return e;
    const o = Object.assign({}, e, { link: Object.assign({}, e.link) });
    delete o.link.hash; delete o.cpf_hash;
    return o;
  }

  function state(db, q) {
    q = q || {};
    const store = db.stores.find((s) => s.id === q.store) || db.stores[0];
    const ws = C.weekStart(q.week || C.todayISO());
    const we = C.addDays(ws, 6);
    const published = q.scope === 'published';
    const pub = db.publications[pubKey(store.id, ws)];
    const shifts = published ? (pub ? clone(pub.shifts) : []) : db.shifts.filter((s) => s.store_id === store.id && s.date >= C.addDays(ws, -49) && s.date <= we);
    const ids = new Set(db.employees.filter((e) => e.store_id === store.id).map((e) => e.id));
    return {
      version: db.version, server_now: nowStamp(), settings: db.settings, regimes: C.REGIMES, company: db.company,
      roles: db.roles, stores: db.stores.map((s) => ({ id: s.id, name: s.name, short: s.short, kind: s.kind })),
      store, week: ws, scope: published ? 'published' : 'draft',
      employees: db.employees.filter((e) => e.store_id === store.id && e.active !== false).map(publicEmp),
      shifts,
      convocations: (db.convocations || []).filter((c) => ids.has(c.employee_id)).map((c) => { const sh = db.shifts.find((x) => x.id === c.shift_id); return Object.assign({}, c, { shift: sh ? { date: sh.date, start: sh.start, end: sh.end, break_min: sh.break_min || 0 } : null }); }),
      absences: db.absences.filter((a) => ids.has(a.employee_id) && a.date_end >= C.addDays(ws, -49) && a.date_ini <= C.addDays(we, 21)),
      requests: db.requests.filter((r) => r.store_id === store.id).slice(-40),
      publication: diff(db, store.id, ws),
      receipts: db.receipts[pubKey(store.id, ws)] || {},
      justifications: db.justifications,
      log: db.log.filter((l) => l.store_id === store.id).slice(-12),
    };
  }

  // Executa uma rota. method: 'GET'|'POST'|'PUT'|'DELETE'; path: '/api/...'; q: query; b: corpo.
  function handle(db, method, path, q, b) {
    q = q || {}; b = b || {};
    const events = [];
    const emit = (evt) => events.push(Object.assign({ at: nowStamp(), ids: [] }, evt));
    const newId = (p) => (p || 'sh') + ++db.seq;
    const storeOf = (id) => db.stores.find((s) => s.id === id);
    const empOf = (id) => db.employees.find((e) => e.id === id);
    const firstName = (id) => { const e = empOf(id); return e ? e.name.split(' ')[0] : 'Turno aberto'; };
    db.convocations = db.convocations || [];
    db.nsr = db.nsr || 0;
    const isFreelaShift = (sh) => !!sh.employee_id && C.isFreela(empOf(sh.employee_id));
    const dl = (d) => C.DOW_SHORT[C.dow(d)] + ' ' + C.fmtDay(d);
    const weekPublished = (storeId, date) => !!db.publications[pubKey(storeId, C.weekStart(date))];
    const addPublished = (sh) => { const pub = db.publications[pubKey(sh.store_id, C.weekStart(sh.date))]; if (pub && !pub.shifts.some((x) => x.id === sh.id)) pub.shifts.push(clone(sh)); };
    const tokenOk = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(t);

    // convoca o freela para os dias (cobrindo turno aberto quando vier shift_id)
    function convocar(emp, days) {
      if (!Array.isArray(days) || !days.length) bad('Escolha pelo menos um dia');
      if (days.length > 14) bad('No máximo 14 dias por convocação');
      const made = [];
      for (const d of days) {
        let sh = d.shift_id && db.shifts.find((x) => x.id === d.shift_id && x.store_id === emp.store_id && !x.employee_id);
        if (sh) patchEverywhere(sh.id, { employee_id: emp.id, role_id: emp.role_id });
        else {
          sh = sanitizeShift({ date: d.date, start: d.start, end: d.end, break_min: d.break_min, note: d.note }, { id: newId(), store_id: emp.store_id, employee_id: emp.id, role_id: emp.role_id, break_min: 0 });
          if (d.break_min === undefined) sh.break_min = C.breakFor(C.worked(sh));
          db.shifts.push(sh);
          addPublished(sh);
        }
        if (db.convocations.some((c) => c.shift_id === sh.id && c.status !== 'recusado')) continue;
        const c = { id: newId('c'), employee_id: emp.id, shift_id: sh.id, sent_at: nowStamp(), status: 'pendente', answered_at: null, punches: [] };
        db.convocations.push(c);
        made.push({ conv: c, shift: sh });
      }
      return made;
    }
    function lastDay(emp) {
      const dates = db.convocations.filter((c) => c.employee_id === emp.id && c.status !== 'recusado').map((c) => (db.shifts.find((x) => x.id === c.shift_id) || {}).date).filter(Boolean).sort();
      return dates[dates.length - 1] || C.todayISO(clock());
    }
    function setLink(emp, token, validUntil) {
      if (!tokenOk(token)) bad('Link inválido');
      emp.link = { hash: C.sha256(token), created_at: nowStamp(), valid_until: validUntil && /^\d{4}-\d{2}-\d{2}/.test(validUntil) ? validUntil.slice(0, 10) + 'T23:59:59' : lastDay(emp) + 'T23:59:59', revoked: false };
    }
    // acha o freela pelo link e diz se ainda vale
    function byToken(t) {
      if (!tokenOk(t)) return { reason: 'invalido' };
      const h = C.sha256(t);
      const emp = db.employees.find((e) => e.link && e.link.hash === h);
      if (!emp || emp.active === false) return { reason: 'invalido' };
      if (emp.link.revoked) return { reason: 'revogado', emp };
      if (nowStamp() > emp.link.valid_until) return { reason: 'expirado', emp };
      return { emp };
    }
    function pontoView(emp) {
      const now = clock();
      const store = storeOf(emp.store_id) || {};
      const role = db.roles.find((r) => r.id === emp.role_id) || { name: '' };
      const items = db.convocations.filter((c) => c.employee_id === emp.id).map((c) => {
        const sh = db.shifts.find((x) => x.id === c.shift_id) || null;
        if (!sh) return null;
        const worked = C.pontoWorked(c, sh.date === C.todayISO(now) ? now : null);
        return { id: c.id, date: sh.date, start: sh.start, end: sh.end, break_min: sh.break_min || 0, status: c.status, sent_at: c.sent_at, punches: c.punches || [],
          next: C.pontoNext(c, sh, now, db.settings), worked, pay: C.freelaCost(emp, worked) };
      }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
      return {
        ok: true, now: nowStamp(), name: emp.name, cpf: emp.cpf_mask, role: role.name, rate_hour: emp.rate_hour || 0, reflexos: C.FREELA_REFLEXOS,
        store: { id: store.id, name: store.name, kind: store.kind }, company: db.company && db.company.name, valid_until: emp.link.valid_until,
        ponto: Object.assign({}, C.PONTO, db.settings.ponto), items,
      };
    }
    const log = (store_id, msg) => { db.log.push({ at: nowStamp(), store_id, msg }); if (db.log.length > 200) db.log.splice(0, db.log.length - 200); };

    function sanitizeShift(src, base) {
      const s = Object.assign({}, base || {});
      if (src.employee_id !== undefined) { if (src.employee_id && !empOf(src.employee_id)) bad('Funcionário não existe'); s.employee_id = src.employee_id || null; }
      if (src.date !== undefined) { if (!/^\d{4}-\d{2}-\d{2}$/.test(src.date)) bad('Data inválida'); s.date = src.date; }
      for (const f of ['start', 'end']) if (src[f] !== undefined) { if (!/^\d{2}:\d{2}$/.test(src[f])) bad('Horário inválido'); s[f] = src[f]; }
      if (src.break_min !== undefined) s.break_min = Math.max(0, Math.min(240, parseInt(src.break_min, 10) || 0));
      if (src.break_at !== undefined) s.break_at = src.break_at && /^\d{2}:\d{2}$/.test(src.break_at) ? src.break_at : null;
      if (src.role_id !== undefined) s.role_id = String(src.role_id).slice(0, 20);
      if (src.note !== undefined) s.note = String(src.note || '').slice(0, 200);
      if (!s.date || !s.start || !s.end) bad('Turno incompleto');
      if (s.start === s.end) bad('Início e fim iguais');
      return s;
    }
    // mudança que vale para o rascunho e também para a escala já publicada (trocas e turnos abertos aprovados)
    function patchEverywhere(id, patch) {
      const s = db.shifts.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
      for (const pub of Object.values(db.publications)) { const p = pub.shifts.find((x) => x.id === id); if (p) Object.assign(p, patch); }
      return s;
    }

    const routes = {
      'GET /api/state': () => state(db, q),

      'POST /api/shifts': () => {
        const store = storeOf(b.store_id) || bad('Loja não existe');
        const s = sanitizeShift(b, { id: newId(), store_id: store.id, break_min: 0, role_id: store.default_role });
        if (b.employee_id) s.role_id = b.role_id || empOf(b.employee_id).role_id;
        db.shifts.push(s);
        emit({ type: 'draft', store_id: s.store_id, week: C.weekStart(s.date), ids: [s.id] });
        return s;
      },
      'PUT /api/shifts/:id': (id) => {
        const s = db.shifts.find((x) => x.id === id) || bad('Turno não existe', 404);
        Object.assign(s, sanitizeShift(b, s));
        emit({ type: 'draft', store_id: s.store_id, week: C.weekStart(s.date), ids: [s.id] });
        return s;
      },
      'DELETE /api/shifts/:id': (id) => {
        const i = db.shifts.findIndex((x) => x.id === id); if (i < 0) bad('Turno não existe', 404);
        const [s] = db.shifts.splice(i, 1);
        emit({ type: 'draft', store_id: s.store_id, week: C.weekStart(s.date), ids: [s.id] });
        return { ok: true };
      },

      'POST /api/week/auto': () => {
        const store = storeOf(b.store_id) || bad('Loja não existe');
        const ws = C.weekStart(b.week), we = C.addDays(ws, 6);
        const settings = Object.assign({}, db.settings, b.regime ? { regime: b.regime } : {});
        db.shifts = db.shifts.filter((s) => !(s.store_id === store.id && s.date >= ws && s.date <= we) || isFreelaShift(s));
        const res = A.autoSchedule({
          settings, store, weekStart: ws, newId: () => newId(), absences: db.absences,
          fixed: db.shifts.filter((s) => s.store_id === store.id && s.date >= ws && s.date <= we && isFreelaShift(s)),
          employees: db.employees.filter((e) => e.store_id === store.id),
          shifts: db.shifts.filter((s) => s.store_id === store.id && s.date >= C.addDays(ws, -56) && s.date < ws),
        });
        db.shifts.push(...res.shifts);
        emit({ type: 'draft', store_id: store.id, week: ws, ids: res.shifts.map((s) => s.id), msg: 'Escala gerada automaticamente' });
        return { count: res.shifts.length };
      },
      // Compara a mesma semana gerada em cada regime (CLT atual × fases da PEC) sem gravar nada.
      'POST /api/week/simulate': () => {
        const store = storeOf(b.store_id) || bad('Loja não existe');
        const ws = C.weekStart(b.week);
        const employees = db.employees.filter((e) => e.store_id === store.id);
        const history = db.shifts.filter((s) => s.store_id === store.id && s.date >= C.addDays(ws, -56) && s.date < ws);
        let n = 0;
        return Object.keys(C.REGIMES).map((rid) => {
          const settings = Object.assign({}, db.settings, { regime: rid });
          const res = A.autoSchedule({ settings, store, employees, weekStart: ws, newId: () => 'sim' + ++n, absences: db.absences, shifts: history, openShifts: false });
          const st = C.weekStats({ store, employees, shifts: res.shifts, weekStart: ws, settings });
          const issues = C.validate({ settings, store, employees, shifts: history.concat(res.shifts), absences: db.absences, weekStart: ws });
          const missing = Object.values(st.perDay).reduce((a, d) => a + d.cov.reduce((x, c) => x + Math.max(0, c.need - c.have), 0), 0);
          const reg = C.regimeOf(settings);
          const extraPeople = missing / (reg.weekly / 60);
          return {
            regime: rid, label: C.REGIMES[rid].label, short: C.REGIMES[rid].short,
            hours: st.minutes, payroll: st.payroll, overtime: st.overtime, hour_cost: st.hour_cost, coverage_pct: st.coverage_pct, sales: st.sales,
            missing_hours: missing, extra_people: Math.ceil(extraPeople * 10) / 10,
            extra_cost: extraPeople * (st.payroll / employees.length),
            total: st.payroll + st.overtime + extraPeople * (st.payroll / employees.length),
            sundays_off: employees.filter((e) => !res.shifts.some((s) => s.employee_id === e.id && s.date === C.addDays(ws, 6))).length,
            errors: issues.filter((i) => i.sev === 'erro').length, alerts: issues.filter((i) => i.sev === 'alerta').length,
          };
        });
      },
      'POST /api/week/copy': () => {
        const store = storeOf(b.store_id) || bad('Loja não existe');
        const ws = C.weekStart(b.week), we = C.addDays(ws, 6), prev = C.addDays(ws, -7);
        const src = db.shifts.filter((s) => s.store_id === store.id && s.date >= prev && s.date < ws && !isFreelaShift(s));
        if (!src.length) bad('A semana anterior está vazia');
        db.shifts = db.shifts.filter((s) => !(s.store_id === store.id && s.date >= ws && s.date <= we) || isFreelaShift(s));
        const made = src.map((s) => {
          const date = C.addDays(s.date, 7);
          const busy = s.employee_id && C.absenceOn(db.absences, s.employee_id, date);
          return Object.assign(clone(s), { id: newId(), date, employee_id: busy ? null : s.employee_id });
        });
        db.shifts.push(...made);
        emit({ type: 'draft', store_id: store.id, week: ws, ids: made.map((s) => s.id), msg: 'Semana anterior copiada' });
        return { count: made.length };
      },
      'POST /api/week/clear': () => {
        const ws = C.weekStart(b.week), we = C.addDays(ws, 6);
        db.shifts = db.shifts.filter((s) => !(s.store_id === b.store_id && s.date >= ws && s.date <= we) || isFreelaShift(s));
        emit({ type: 'draft', store_id: b.store_id, week: ws });
        return { ok: true };
      },
      'POST /api/week/discard': () => {
        const ws = C.weekStart(b.week), we = C.addDays(ws, 6);
        const pub = db.publications[pubKey(b.store_id, ws)] || bad('Esta semana ainda não foi publicada');
        db.shifts = db.shifts.filter((s) => !(s.store_id === b.store_id && s.date >= ws && s.date <= we)).concat(clone(pub.shifts));
        emit({ type: 'draft', store_id: b.store_id, week: ws });
        return { ok: true };
      },
      'POST /api/week/publish': () => {
        const store = storeOf(b.store_id) || bad('Loja não existe');
        const ws = C.weekStart(b.week), we = C.addDays(ws, 6);
        const d = diff(db, store.id, ws);
        const shifts = clone(db.shifts.filter((s) => s.store_id === store.id && s.date >= ws && s.date <= we));
        db.publications[pubKey(store.id, ws)] = { published_at: nowStamp(), by: String(b.by || 'Gerência').slice(0, 40), shifts };
        db.receipts[pubKey(store.id, ws)] = {}; // nova versão: todo mundo precisa confirmar de novo
        const what = d.published ? d.total + (d.total === 1 ? ' alteração' : ' alterações') : 'primeira versão';
        log(store.id, 'Escala ' + C.fmtWeek(ws) + ' publicada (' + what + ')');
        emit({ type: 'published', store_id: store.id, week: ws, ids: d.added.concat(d.changed, d.removed), msg: 'Escala publicada — ' + what });
        return { ok: true };
      },

      'POST /api/absences': () => {
        const e = empOf(b.employee_id) || bad('Funcionário não existe');
        if (!C.ABSENCE_TYPES[b.type]) bad('Tipo inválido');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date_ini || '') || !/^\d{4}-\d{2}-\d{2}$/.test(b.date_end || '') || b.date_end < b.date_ini) bad('Período inválido');
        const a = { id: newId('a'), employee_id: e.id, type: b.type, date_ini: b.date_ini, date_end: b.date_end, status: 'aprovado', note: String(b.note || '').slice(0, 120) };
        db.absences.push(a);
        // opcional: os turnos dessa pessoa no período viram turnos abertos (só no rascunho)
        const freed = b.free ? db.shifts.filter((s) => s.employee_id === e.id && s.date >= a.date_ini && s.date <= a.date_end) : [];
        freed.forEach((s) => { s.employee_id = null; });
        a.freed = freed.map((s) => s.id);
        log(e.store_id, C.ABSENCE_TYPES[a.type].label + ' de ' + firstName(e.id) + ' lançad' + (a.type === 'ferias' ? 'as' : 'o') + ' (' + C.fmtDay(a.date_ini) + (a.date_end !== a.date_ini ? '–' + C.fmtDay(a.date_end) : '') + ')');
        emit({ type: 'absence', store_id: e.store_id, week: C.weekStart(a.date_ini), ids: a.freed });
        return a;
      },
      'DELETE /api/absences/:id': (id) => {
        const i = db.absences.findIndex((a) => a.id === id); if (i < 0) bad('Não existe', 404);
        const [a] = db.absences.splice(i, 1);
        emit({ type: 'absence', store_id: (empOf(a.employee_id) || {}).store_id, week: C.weekStart(a.date_ini) });
        return { ok: true };
      },

      'POST /api/requests': () => {
        const e = empOf(b.employee_id) || bad('Funcionário não existe');
        if (!['folga', 'troca', 'pegar'].includes(b.type)) bad('Tipo inválido');
        const r = { id: newId('r'), type: b.type, store_id: e.store_id, employee_id: e.id, status: 'pendente', created_at: nowStamp(), note: String(b.note || '').slice(0, 140) };
        if (b.type === 'folga') { if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) bad('Informe o dia'); r.date = b.date; }
        else {
          const s = db.shifts.find((x) => x.id === b.shift_id) || bad('Turno não existe');
          r.shift_id = s.id;
          if (b.type === 'troca') r.to_employee_id = b.to_employee_id && empOf(b.to_employee_id) ? b.to_employee_id : null;
          if (b.type === 'pegar' && s.employee_id) bad('Esse turno já tem alguém');
        }
        if (db.requests.some((x) => x.status === 'pendente' && x.employee_id === e.id && x.type === r.type && (x.shift_id || x.date) === (r.shift_id || r.date))) bad('Você já pediu isso');
        db.requests.push(r);
        const label = r.type === 'folga' ? 'pediu folga em ' + C.fmtDay(r.date) : r.type === 'troca' ? 'quer trocar um turno' : 'quer pegar um turno aberto';
        log(e.store_id, firstName(e.id) + ' ' + label);
        emit({ type: 'request', store_id: e.store_id, msg: firstName(e.id) + ' ' + label });
        return r;
      },
      'POST /api/requests/:id/decide': (id) => {
        const r = db.requests.find((x) => x.id === id) || bad('Pedido não existe', 404);
        if (r.status !== 'pendente') bad('Pedido já decidido');
        const ok = b.decision === 'aprovado';
        r.status = ok ? 'aprovado' : 'negado';
        r.decided_at = nowStamp();
        let ids = [], msg = '', week = null, published = false;
        if (ok && r.type === 'folga') {
          db.absences.push({ id: newId('a'), employee_id: r.employee_id, type: 'folga', date_ini: r.date, date_end: r.date, status: 'aprovado', note: r.note });
          // turno daquele dia vira turno aberto (no rascunho e na escala publicada)
          db.shifts.filter((s) => s.employee_id === r.employee_id && s.date === r.date).forEach((s) => { patchEverywhere(s.id, { employee_id: null }); ids.push(s.id); });
          week = C.weekStart(r.date); published = ids.length > 0 && !!db.publications[pubKey(r.store_id, week)];
          msg = 'Folga de ' + firstName(r.employee_id) + ' em ' + C.fmtDay(r.date) + ' aprovada' + (ids.length ? ' — turno ficou aberto' : '');
        } else if (ok) {
          const s = db.shifts.find((x) => x.id === r.shift_id) || bad('O turno não existe mais');
          const to = r.type === 'pegar' ? r.employee_id : r.to_employee_id || null;
          const from = s.employee_id;
          patchEverywhere(s.id, { employee_id: to, role_id: to ? empOf(to).role_id : s.role_id });
          ids = [s.id]; week = C.weekStart(s.date); published = !!db.publications[pubKey(r.store_id, week)];
          msg = r.type === 'pegar' ? firstName(to) + ' pegou o turno aberto de ' + C.DOW_SHORT[C.dow(s.date)] + ' ' + C.fmtDay(s.date)
            : firstName(from) + ' ⇄ ' + (to ? firstName(to) : 'turno aberto') + ' — ' + C.DOW_SHORT[C.dow(s.date)] + ' ' + C.fmtDay(s.date) + ' ' + s.start + '–' + s.end;
        } else msg = 'Pedido de ' + firstName(r.employee_id) + ' negado';
        log(r.store_id, msg);
        emit({ type: published ? 'published' : 'request', store_id: r.store_id, week, ids, msg });
        return r;
      },

      'POST /api/receipts': () => {
        const e = empOf(b.employee_id) || bad('Funcionário não existe');
        const ws = C.weekStart(b.week);
        (db.receipts[pubKey(e.store_id, ws)] = db.receipts[pubKey(e.store_id, ws)] || {})[e.id] = nowStamp();
        emit({ type: 'receipt', store_id: e.store_id, week: ws, msg: firstName(e.id) + ' confirmou que viu a escala' });
        return { ok: true };
      },
      'POST /api/justify': () => {
        if (!b.key) bad('Sem chave');
        const key = String(b.key).slice(0, 120);
        if (b.text) db.justifications[key] = { text: String(b.text).slice(0, 200), at: nowStamp() };
        else delete db.justifications[key];
        emit({ type: 'draft', store_id: b.store_id, week: b.week });
        return { ok: true };
      },
      'POST /api/settings': () => {
        if (b.regime) { if (!C.REGIMES[b.regime]) bad('Regime inválido'); db.settings.regime = b.regime; }
        if (b.rules) for (const k of ['art386', 'compensacao', 'noturno', 'feriado']) if (k in b.rules) db.settings.rules[k] = !!b.rules[k];
        if (b.labor_target_pct) db.settings.labor_target_pct = Math.max(1, Math.min(60, +b.labor_target_pct));
        emit({ type: 'settings' });
        return db.settings;
      },
      // ---------------- freela intermitente (CLT art. 452-A): cadastro, convocação e link
      'POST /api/freelas': () => {
        const store = storeOf(b.store_id) || bad('Loja não existe');
        const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        if (name.split(' ').length < 2) bad('Informe nome e sobrenome');
        if (!C.cpfValid(b.cpf)) bad('CPF inválido');
        if (!db.roles.some((r) => r.id === b.role_id)) bad('Função inválida');
        const cpfHash = C.sha256(C.cpfDigits(b.cpf));
        let emp = db.employees.find((e) => e.store_id === store.id && e.cpf_hash === cpfHash);
        const reused = !!emp;
        if (emp) Object.assign(emp, { name, role_id: b.role_id, rate_hour: Math.max(0, +b.rate_hour || emp.rate_hour || 0), active: true });
        else {
          emp = { id: newId('f'), store_id: store.id, name, role_id: b.role_id, contract: 'freela', weekly_hours: 0, gender: null, skills: [], unavail: [], active: true,
            rate_hour: Math.max(0, Math.min(500, +b.rate_hour || 0)), cpf_hash: cpfHash, cpf_mask: C.cpfMask(b.cpf), created_at: nowStamp() };
          db.employees.push(emp);
        }
        const made = convocar(emp, b.days);
        setLink(emp, b.token, b.valid_until);
        const first = name.split(' ')[0];
        log(store.id, 'Convocação enviada para ' + first + ' (freela): ' + made.length + (made.length === 1 ? ' dia' : ' dias'));
        const pubd = made.some((x) => weekPublished(store.id, x.shift.date));
        emit({ type: pubd ? 'published' : 'draft', store_id: store.id, week: made[0] ? C.weekStart(made[0].shift.date) : null, ids: made.map((x) => x.shift.id), msg: 'Convocação enviada para ' + first + ' — aguardando aceite' });
        return { employee_id: emp.id, valid_until: emp.link.valid_until, link_created_at: emp.link.created_at, convocations: made.map((x) => x.conv.id), reused };
      },
      'POST /api/freelas/:id/convocar': (id) => {
        const emp = empOf(id); if (!C.isFreela(emp)) bad('Freela não existe', 404);
        const made = convocar(emp, b.days);
        if (emp.link && !emp.link.revoked && emp.link.valid_until < lastDay(emp) + 'T23:59:59') emp.link.valid_until = lastDay(emp) + 'T23:59:59';
        log(emp.store_id, 'Nova convocação para ' + firstName(emp.id) + ' (freela): mais ' + made.length + (made.length === 1 ? ' dia' : ' dias'));
        emit({ type: made.some((x) => weekPublished(emp.store_id, x.shift.date)) ? 'published' : 'draft', store_id: emp.store_id, week: made[0] ? C.weekStart(made[0].shift.date) : null, ids: made.map((x) => x.shift.id), msg: 'Nova convocação para ' + firstName(emp.id) });
        return { count: made.length, valid_until: emp.link && emp.link.valid_until };
      },
      'POST /api/freelas/:id/link': (id) => {
        const emp = empOf(id); if (!C.isFreela(emp)) bad('Freela não existe', 404);
        setLink(emp, b.token, b.valid_until);
        log(emp.store_id, 'Novo link de ponto para ' + firstName(emp.id) + ' (o anterior deixou de valer)');
        emit({ type: 'freela', store_id: emp.store_id, msg: 'Novo link gerado para ' + firstName(emp.id) });
        return { valid_until: emp.link.valid_until, link_created_at: emp.link.created_at };
      },
      'POST /api/freelas/:id/revoke': (id) => {
        const emp = empOf(id); if (!C.isFreela(emp) || !emp.link) bad('Freela não existe', 404);
        emp.link.revoked = true;
        log(emp.store_id, 'Link de ponto de ' + firstName(emp.id) + ' cancelado');
        emit({ type: 'freela', store_id: emp.store_id, msg: 'Link de ' + firstName(emp.id) + ' cancelado' });
        return { ok: true };
      },
      'POST /api/freelas/:id/cancel': (id) => {
        const emp = empOf(id); if (!C.isFreela(emp)) bad('Freela não existe', 404);
        const c = db.convocations.find((x) => x.id === b.conv_id && x.employee_id === emp.id) || bad('Convocação não existe');
        if ((c.punches || []).length) bad('Esse turno já tem ponto batido');
        c.status = 'recusado'; c.answered_at = nowStamp(); c.canceled = true;
        const sh = db.shifts.find((x) => x.id === c.shift_id);
        if (sh) patchEverywhere(sh.id, { employee_id: null });
        log(emp.store_id, 'Convocação de ' + firstName(emp.id) + (sh ? ' em ' + dl(sh.date) : '') + ' cancelada — turno voltou a ficar aberto');
        emit({ type: sh && weekPublished(emp.store_id, sh.date) ? 'published' : 'draft', store_id: emp.store_id, week: sh && C.weekStart(sh.date), ids: sh ? [sh.id] : [], msg: 'Convocação de ' + firstName(emp.id) + ' cancelada' });
        return { ok: true };
      },

      // ---------------- ponto pelo link (público, sem login: o link é a credencial)
      'GET /api/ponto': () => {
        const r = byToken(q.t);
        if (!r.emp || r.reason) return { ok: false, reason: r.reason || 'invalido', name: r.emp ? r.emp.name.split(' ')[0] : null, store: r.emp ? (storeOf(r.emp.store_id) || {}).name : null };
        return pontoView(r.emp);
      },
      'POST /api/ponto/responder': () => {
        const r = byToken(b.t); if (r.reason) bad(r.reason === 'expirado' ? 'Este link expirou' : 'Link inválido', 403);
        const emp = r.emp;
        const c = db.convocations.find((x) => x.id === b.conv_id && x.employee_id === emp.id) || bad('Convocação não encontrada');
        if (c.status !== 'pendente') bad('Você já respondeu esta convocação');
        const sh = db.shifts.find((x) => x.id === c.shift_id) || bad('O turno não existe mais');
        const ok = b.answer === 'aceito';
        c.status = ok ? 'aceito' : 'recusado'; c.answered_at = nowStamp();
        if (!ok) patchEverywhere(sh.id, { employee_id: null });
        const msg = firstName(emp.id) + ' (freela) ' + (ok ? 'aceitou ' : 'recusou ') + dl(sh.date) + ' ' + sh.start + '–' + sh.end + (ok ? '' : ' — turno voltou a ficar aberto');
        log(emp.store_id, msg);
        emit({ type: weekPublished(emp.store_id, sh.date) ? 'published' : 'draft', store_id: emp.store_id, week: C.weekStart(sh.date), ids: [sh.id], msg });
        return pontoView(emp);
      },
      'POST /api/ponto/bater': () => {
        const r = byToken(b.t); if (r.reason) bad(r.reason === 'expirado' ? 'Este link expirou' : 'Link inválido', 403);
        const emp = r.emp, now = clock();
        const c = db.convocations.find((x) => x.id === b.conv_id && x.employee_id === emp.id) || bad('Convocação não encontrada');
        const sh = db.shifts.find((x) => x.id === c.shift_id) || bad('O turno não existe mais');
        const next = C.pontoNext(c, sh, now, db.settings);
        if (!next.ok) bad(next.msg, 409);
        if (!next.actions.some((a) => a.type === b.type)) bad('Agora o registro é: ' + next.actions.map((a) => a.label.toLowerCase()).join(' ou '), 409);
        const tol = (Object.assign({}, C.PONTO, db.settings.ponto)).tolerancia;
        const punch = { type: b.type, at: nowStamp(), nsr: ++db.nsr };
        if (b.type === 'entrada' && next.late > tol) punch.late = next.late;
        c.punches = (c.punches || []).concat([punch]);
        const hhmm = punch.at.slice(11, 16);
        const msg = firstName(emp.id) + ' (freela) ' + ({ entrada: 'chegou', intervalo_ini: 'saiu para o intervalo', intervalo_fim: 'voltou do intervalo', saida: 'encerrou o turno' })[b.type] + ' às ' + hhmm + (punch.late ? ' — ' + punch.late + ' min de atraso' : '');
        log(emp.store_id, msg);
        emit({ type: 'ponto', store_id: emp.store_id, week: C.weekStart(sh.date), ids: [sh.id], msg });
        const store = storeOf(emp.store_id) || {};
        return {
          comprovante: { nsr: punch.nsr, at: punch.at, tipo: C.PUNCH_LABEL[b.type], nome: emp.name, cpf: emp.cpf_mask, empresa: db.company && db.company.name, loja: store.name, late: punch.late || 0 },
          view: pontoView(emp),
        };
      },

      'POST /api/reset': () => {
        const fresh = Seed.seed();
        fresh.version = db.version || 0;
        db = fresh;
        emit({ type: 'reset', msg: 'Demo recomeçado' });
        return { ok: true };
      },
    };

    const parts = path.split('/'); // ['', 'api', 'shifts', ':id', ...]
    let key = method + ' ' + path, id = null;
    if (!routes[key] && parts.length >= 4) { id = decodeURIComponent(parts[3]); key = method + ' /api/' + parts[2] + '/:id' + (parts[4] ? '/' + parts[4] : ''); }
    const fn = routes[key];
    if (!fn) bad('Rota não existe', 404);
    const result = fn(id);
    return { result, db, events };
  }

  return { handle, state, diff, isStale, setClock, now: () => clock(), seed: Seed.seed };
});
