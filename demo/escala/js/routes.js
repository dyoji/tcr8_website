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
  const nowStamp = () => { const d = new Date(); return C.todayISO(d) + 'T' + C.pad(d.getHours()) + ':' + C.pad(d.getMinutes()) + ':' + C.pad(d.getSeconds()); };
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
      employees: db.employees.filter((e) => e.store_id === store.id && e.active !== false),
      shifts,
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
        db.shifts = db.shifts.filter((s) => !(s.store_id === store.id && s.date >= ws && s.date <= we));
        const res = A.autoSchedule({
          settings, store, weekStart: ws, newId: () => newId(), absences: db.absences,
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
        const src = db.shifts.filter((s) => s.store_id === store.id && s.date >= prev && s.date < ws);
        if (!src.length) bad('A semana anterior está vazia');
        db.shifts = db.shifts.filter((s) => !(s.store_id === store.id && s.date >= ws && s.date <= we));
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
        db.shifts = db.shifts.filter((s) => !(s.store_id === b.store_id && s.date >= ws && s.date <= we));
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

  return { handle, state, diff, isStale, seed: Seed.seed };
});
