/* Escala (demo tCr8) — tela do gestor: grade da semana, linha do tempo do dia, apontamentos da CLT,
 * pedidos da equipe, publicação e o comparativo CLT × PEC do fim da 6x1. */
(function () {
  'use strict';
  const C = window.EscalaCore;
  const { h, api, icon, toast } = UI;
  const $ = (id) => document.getElementById(id);

  const qs = new URLSearchParams(location.search);
  const S = {
    storeId: qs.get('loja') || UI.store.get('store', 'SHO'),
    week: C.weekStart(qs.get('semana') || C.todayISO()),
    selDay: null, data: null, selfUntil: 0, flash: new Set(),
    filter: UI.store.get('filter', { erro: true, alerta: true, info: false }),
  };
  const D = {}; // derivados do estado
  const today = () => C.todayISO();
  const pct = (v) => (Math.round(v * 10) / 10).toLocaleString('pt-BR') + '%';
  const when = (stamp) => { const [d, t] = stamp.split('T'); return C.DOW_SHORT[C.dow(d)] + ' ' + C.fmtDay(d) + ' às ' + t.slice(0, 5); };
  const contractLabel = (e) => (e.contract === 'aprendiz' ? 'Aprendiz ' : e.contract === 'parcial' ? 'Parcial ' : 'CLT ') + e.weekly_hours + 'h';
  const avatar = (e, size) => h('span', { class: 'av', '--rc': (D.roles[e.role_id] || {}).color, style: size ? { width: size + 'px', height: size + 'px', fontSize: Math.round(size / 3.2) + 'px' } : null }, UI.initials(e.name));
  const sevColor = (sev) => 'var(--' + (sev === 'erro' ? 'danger' : sev === 'alerta' ? 'warn' : 'info') + ')';

  // ------------------------------------------------------------ dados
  let loadSeq = 0, reloadTimer = null;
  async function load(opts) {
    const my = ++loadSeq;
    let data;
    try { data = await api.get('/api/state?store=' + S.storeId + '&week=' + S.week); }
    catch (e) { toast('Sem conexão com o servidor do demo', 'erro'); return; }
    if (my !== loadSeq) return;
    S.data = data; S.storeId = data.store.id;
    const we = C.addDays(S.week, 6);
    if (!S.selDay || S.selDay < S.week || S.selDay > we) S.selDay = today() >= S.week && today() <= we ? today() : S.week;
    derive();
    const f = opts && opts.flash;
    S.flash = new Set(f === 'all' ? D.week.map((s) => s.id) : f || []);
    render();
    if (S.flash.size) setTimeout(() => S.flash.clear(), 2600);
  }
  const reload = (opts) => { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => load(opts), 60); };

  function derive() {
    const d = S.data;
    D.days = C.weekDays(S.week);
    D.we = D.days[6];
    D.roles = Object.fromEntries(d.roles.map((r) => [r.id, r]));
    D.emps = d.employees;
    D.empById = Object.fromEntries(d.employees.map((e) => [e.id, e]));
    D.week = d.shifts.filter((s) => s.date >= S.week && s.date <= D.we);
    D.regime = C.regimeOf(d.settings);
    D.issues = C.validate({ settings: d.settings, store: d.store, employees: d.employees, shifts: d.shifts, absences: d.absences, weekStart: S.week });
    D.issues.forEach((i) => { i.just = d.justifications[i.key] || null; });
    D.stats = C.weekStats({ store: d.store, employees: d.employees, shifts: D.week, weekStart: S.week, settings: d.settings });
    const rank = { erro: 3, alerta: 2, info: 1 };
    D.sevByShift = {};
    D.issuesByShift = {};
    for (const i of D.issues) {
      i.ids.forEach((id) => { (D.issuesByShift[id] = D.issuesByShift[id] || []).push(i); });
      if (i.just || i.sev === 'info') continue;
      i.ids.forEach((id) => { if (!D.sevByShift[id] || rank[i.sev] > rank[D.sevByShift[id]]) D.sevByShift[id] = i.sev; });
    }
    D.changed = new Set(d.publication.published ? d.publication.added.concat(d.publication.changed) : []);
    D.pending = d.requests.filter((r) => r.status === 'pendente');
  }

  async function mutate(fn, okMsg) {
    S.selfUntil = Date.now() + 1500;
    try {
      const ids = await fn();
      if (okMsg) toast(okMsg);
      await load({ flash: ids || [] });
      return true;
    } catch (e) { toast(e.message, 'erro'); return false; }
  }

  function go(o) {
    if (o.store) { S.storeId = o.store; UI.store.set('store', o.store); }
    if (o.week) S.week = C.weekStart(o.week);
    history.replaceState(null, '', UI.link(location.pathname, { loja: S.storeId, semana: S.week }));
    S.selDay = null;
    load();
  }

  // ------------------------------------------------------------ desenho
  function render() {
    renderTop(); renderBar(); renderKpis(); renderGrid(); renderDay(); renderIssues();
    document.title = 'Escala · ' + S.data.store.short + ' · ' + C.fmtWeek(S.week);
  }

  function renderTop() {
    const d = S.data;
    $('stores').replaceChildren(...d.stores.map((s) => h('button', { 'aria-pressed': String(s.id === S.storeId), title: s.name + ' — ' + s.kind, onclick: () => go({ store: s.id }) }, s.short)));
    $('weekLabel').textContent = C.fmtWeek(S.week);
    const r = C.REGIMES[d.settings.regime];
    $('btnRegime').replaceChildren(icon('scale'), h('b', null, r.label), h('span', { class: 'mono' }, r.short), icon('chevD'));
    $('btnRequests').replaceChildren(...[icon('inbox'), h('span', { class: 'lbl' }, 'Pedidos'), D.pending.length ? h('span', { class: 'count' }, D.pending.length) : null].filter(Boolean));
    $('lnkMural').href = UI.link('mural.html', { loja: S.storeId });
    $('lnkEu').href = UI.link('eu.html', { loja: S.storeId });
  }

  function renderBar() {
    const p = S.data.publication;
    let badge, sub;
    if (!p.published) {
      badge = h('span', { class: 'badge alerta' }, 'Rascunho');
      sub = D.week.length ? 'ainda não publicada — a equipe não vê esta semana' : 'semana vazia — gere automática ou copie a anterior';
    } else if (p.total) {
      badge = h('span', { class: 'badge info' }, p.total + (p.total > 1 ? ' alterações não publicadas' : ' alteração não publicada'));
      sub = 'publicada ' + when(p.published_at) + ' por ' + p.by;
    } else {
      badge = h('span', { class: 'badge ok' }, icon('check'), 'Publicada');
      sub = when(p.published_at) + ' por ' + p.by;
    }
    $('pubStatus').replaceChildren(h('h1', null, S.data.store.name), badge, h('span', { class: 'sub' }, sub));
    const pub = $('btnPublish');
    pub.disabled = p.published && !p.total;
    pub.replaceChildren(icon(p.published && !p.total ? 'check' : 'send'), p.published ? (p.total ? 'Publicar alterações' : 'Publicada') : 'Publicar');
  }

  function renderKpis() {
    const st = D.stats, d = S.data;
    const limit = D.emps.reduce((a, e) => a + C.weeklyLimit(e, D.regime), 0);
    const target = d.settings.labor_target_pct;
    const errs = D.issues.filter((i) => i.sev === 'erro' && !i.just).length;
    const alerts = D.issues.filter((i) => i.sev === 'alerta' && !i.just).length;
    const seen = Object.keys(d.receipts).filter((id) => D.empById[id]).length;
    const short = Object.values(st.perDay).reduce((a, x) => a + x.cov.reduce((y, c) => y + Math.max(0, c.need - c.have - c.open), 0), 0);
    const kpi = (k, v, dsc, cls, meter) => h('div', { class: 'kpi ' + (cls || '') },
      h('span', { class: 'k' }, k), h('span', { class: 'v' }, v), dsc ? h('span', { class: 'd' }, dsc) : null,
      meter != null ? h('div', { class: 'meter' }, h('i', { style: { width: Math.max(0, Math.min(100, meter)) + '%' } })) : null);
    const pub = d.publication.published;
    const staffMin = Object.values(st.perEmp).reduce((a, p) => a + p.minutes, 0);
    const openMin = D.week.filter((s) => !s.employee_id).reduce((a, s) => a + C.worked(s), 0);
    $('kpis').replaceChildren(
      kpi('Horas da equipe', [C.fmtDur(staffMin), ' ', h('small', null, '/ ' + C.fmtDur(limit))], openMin ? '+ ' + C.fmtDur(openMin) + ' em ' + st.open + (st.open > 1 ? ' turnos abertos' : ' turno aberto') : 'soma dos contratos na regra ' + D.regime.short, staffMin > limit ? 'warn' : '', (staffMin / limit) * 100),
      kpi('Custo da equipe', C.money(st.cost), (st.overtime + st.openCost > 1 ? 'folha + ' + C.money(st.overtime + st.openCost) + ' de hora extra' : 'folha da semana com encargos') + ' · ' + C.money(st.hour_cost) + '/h'),
      kpi('Custo ÷ venda prevista', pct(st.cost_pct), 'meta ' + target + '% · venda ' + C.money(st.sales), st.cost_pct > target * 1.1 ? 'bad' : st.cost_pct > target ? 'warn' : 'good', (st.cost_pct / (target * 1.5)) * 100),
      kpi('Cobertura do movimento', pct(st.coverage_pct), short ? short + ' pessoa-hora descoberta' + (short > 1 ? 's' : '') : 'tudo coberto', st.coverage_pct < 90 ? 'bad' : st.coverage_pct < 98 ? 'warn' : 'good', st.coverage_pct),
      kpi('Apontamentos', [h('span', { style: { color: errs ? 'var(--danger)' : '' } }, errs), h('small', null, errs === 1 ? ' erro · ' : ' erros · '), h('span', { style: { color: alerts ? 'var(--warn)' : '' } }, alerts), h('small', null, alerts === 1 ? ' alerta' : ' alertas')], errs ? 'corrija ou justifique antes de publicar' : 'nenhum erro da CLT', errs ? 'bad' : alerts ? '' : 'good'),
      kpi('Viram a escala', pub ? [seen, ' ', h('small', null, '/ ' + D.emps.length)] : '—', pub ? (seen >= D.emps.length ? 'todo mundo confirmou' : D.emps.length - seen + ' ainda não confirmaram') : 'publique para a equipe ver', pub && seen < D.emps.length ? 'warn' : pub ? 'good' : '', pub ? (seen / D.emps.length) * 100 : null)
    );
  }

  function renderGrid() {
    const g = $('grid');
    const d = S.data, store = d.store, t = today();
    const nodes = [h('div', { class: 'gh corner' }, 'Equipe · ' + D.emps.length)];
    D.days.forEach((day) => {
      const win = C.storeWindow(store, day), hol = C.holiday(day), pd = D.stats.perDay[day];
      const max = Math.max(1, ...pd.cov.map((c) => Math.max(c.need, c.have + c.open)));
      nodes.push(h('div', {
        class: 'gh day' + (day === t ? ' today' : '') + (day === S.selDay ? ' sel' : '') + (win ? '' : ' closed'),
        title: 'Ver a linha do tempo do dia', tabindex: '0',
        onclick: () => selectDay(day), onkeydown: (ev) => { if (ev.key === 'Enter') selectDay(day); },
      },
        h('div', { class: 'dn' }, h('b', null, C.DOW_SHORT[C.dow(day)]), h('span', null, C.fmtDay(day))),
        hol ? h('div', { class: 'hol' }, hol.name + (hol.kind === 'facultativo' ? ' (facultativo)' : '')) : null,
        win ? h('div', { class: 'spark' }, pd.cov.map((c) => { const have = c.have + c.open; return h('i', { class: have < c.need ? 'short' : have > c.need + 1 ? 'over' : 'ok', style: { height: Math.max(14, (c.need / max) * 100) + '%' }, title: c.h + 'h · ' + have + ' de ' + c.need + ' pessoas' }); })) : null,
        h('div', { class: 'cov' }, win ? C.fromMin(win.open) + '–' + C.fromMin(win.close) : 'fechado')
      ));
    });
    nodes.push(h('div', { class: 'gh last' }, 'Semana'));

    // turnos abertos
    const opens = D.week.filter((s) => !s.employee_id);
    nodes.push(h('div', { class: 'person openrow', style: { cursor: 'default' } },
      h('span', { class: 'av', style: { background: 'var(--sunken)', color: 'var(--muted)' } }, icon('hand')),
      h('div', { class: 'pinfo' }, h('b', null, 'Turnos abertos'), h('small', null, opens.length ? opens.length + ' sem ninguém — a equipe pode pegar' : 'arraste um turno para cá para liberar'))));
    D.days.forEach((day) => nodes.push(cell(null, day)));
    nodes.push(h('div', { class: 'total last' }, h('span', { class: 'hrs' }, opens.length ? C.fmtDur(opens.reduce((a, s) => a + C.worked(s), 0)) : '—'), h('small', null, 'em aberto')));

    // pessoas por função
    d.roles.forEach((role) => {
      const list = D.emps.filter((e) => e.role_id === role.id);
      if (!list.length) return;
      nodes.push(h('div', { class: 'grp' }, h('span', { class: 'dot', style: { background: role.color } }), role.name, h('span', null, '· ' + list.length)));
      list.forEach((e) => { nodes.push(personCell(e)); D.days.forEach((day) => nodes.push(cell(e, day))); nodes.push(totalCell(e)); });
    });

    // rodapé
    nodes.push(h('div', { class: 'foot label' }, 'Pessoas por hora'));
    D.days.forEach((day) => {
      const pd = D.stats.perDay[day];
      nodes.push(h('div', { class: 'foot' }, pd.cov.length ? h('div', { class: 'heat' }, pd.cov.map((c) => {
        const have = c.have + c.open, diff = have - c.need;
        return h('i', { class: diff <= -2 ? 'short2' : diff < 0 ? 'short1' : diff > 1 ? 'over' : 'ok', title: c.h + 'h: ' + have + ' de ' + c.need + ' · venda prevista ' + C.money(c.sales) });
      })) : h('span', { class: 'muted' }, '—')));
    });
    nodes.push(h('div', { class: 'foot last' }));
    nodes.push(h('div', { class: 'foot label' }, 'Horas · custo'));
    D.days.forEach((day) => { const pd = D.stats.perDay[day]; nodes.push(h('div', { class: 'foot' }, pd.minutes ? h('span', { class: 'mono' }, C.fmtDur(pd.minutes) + ' · ' + C.money(pd.cost)) : h('span', { class: 'muted' }, '—'))); });
    nodes.push(h('div', { class: 'foot last mono' }, C.fmtDur(D.stats.minutes)));
    g.replaceChildren(...nodes);
  }

  function selectDay(day) { S.selDay = day; renderGrid(); renderDay(); }

  function personCell(e) {
    const tags = [contractLabel(e)];
    if (C.isMinor(e, S.week)) tags.push('menor');
    if ((e.skills || []).includes('chave')) tags.push('chave');
    const seen = S.data.receipts[e.id];
    return h('div', { class: 'person', onclick: () => openEmployee(e), title: 'Ver ' + e.name },
      avatar(e),
      h('div', { class: 'pinfo' }, h('b', null, e.name), h('small', null, tags.join(' · '))),
      S.data.publication.published ? h('span', { class: seen ? 'seen' : 'unseen', title: seen ? 'Viu a escala ' + when(seen) : 'Ainda não confirmou que viu a escala' }, icon(seen ? 'check' : 'eye')) : null);
  }

  function totalCell(e) {
    const p = D.stats.perEmp[e.id] || { minutes: 0, days: 0 };
    const limit = C.weeklyLimit(e, D.regime);
    const cls = p.minutes > limit ? ' over' : p.minutes < limit - 240 ? ' under' : '';
    return h('div', { class: 'total last' + cls, title: p.days + ' dias · limite ' + C.fmtDur(limit) + ' pela regra ' + D.regime.label },
      h('span', { class: 'hrs' }, C.fmtDur(p.minutes)),
      h('div', { class: 'meter' }, h('i', { style: { width: Math.min(100, (p.minutes / limit) * 100) + '%' } })),
      h('small', null, p.days + 'd · de ' + C.fmtDur(limit)));
  }

  function cell(e, day) {
    const win = C.storeWindow(S.data.store, day);
    const list = D.week.filter((s) => (e ? s.employee_id === e.id : !s.employee_id) && s.date === day).sort((a, b) => a.start.localeCompare(b.start));
    const ab = e && C.absenceOn(S.data.absences, e.id, day);
    const c = h('div', { class: 'cell' + (day === today() ? ' today' : '') + (!win && !list.length ? ' closed' : ''), dataset: { emp: e ? e.id : '', date: day } });
    if (ab) c.append(h('div', { class: 'absence', title: ab.note || '' }, C.ABSENCE_TYPES[ab.type].label, ab.note ? h('small', null, ab.note) : null));
    list.forEach((s) => c.append(chip(s)));
    if (e && win && !list.length && !ab) c.append(h('span', { class: 'off' + (C.dow(day) === 0 ? ' sun' : '') }, C.dow(day) === 0 ? 'folga no domingo' : 'folga'));
    c.append(h('span', { class: 'add' }, icon('plus')));
    c.addEventListener('click', (ev) => { if (!ev.target.closest('.chip')) quickAdd(c, e, day); });
    c.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = ev.altKey || ev.ctrlKey ? 'copy' : 'move'; c.classList.add('drop'); });
    c.addEventListener('dragleave', () => c.classList.remove('drop'));
    c.addEventListener('drop', (ev) => { ev.preventDefault(); c.classList.remove('drop'); const id = ev.dataTransfer.getData('text/plain'); if (id) dropShift(id, e ? e.id : null, day, ev.altKey || ev.ctrlKey); });
    return c;
  }

  function chip(s) {
    const role = D.roles[s.role_id] || { color: '#999', name: '' };
    const sev = D.sevByShift[s.id];
    const w = C.worked(s);
    const sub = s.employee_id ? [C.fmtDur(w), s.break_min ? 'int. ' + C.fromMin(C.breakStart(s)) : null, s.note || null].filter(Boolean).join(' · ') : role.name + ' · em aberto';
    const tips = (D.issuesByShift[s.id] || []).filter((i) => !i.just).map((i) => '• ' + i.title);
    const el = h('div', {
      class: 'chip' + (s.employee_id ? '' : ' open') + (sev ? ' sev-' + sev : '') + (D.changed.has(s.id) ? ' changed' : '') + (S.flash.has(s.id) ? ' flash' : ''),
      '--rc': role.color, draggable: 'true', tabindex: '0', role: 'button', dataset: { id: s.id },
      title: [s.start + '–' + s.end + ' · ' + C.fmtDur(w) + ' trabalhadas'].concat(tips, D.changed.has(s.id) ? ['Alterado — ainda não publicado'] : [], ['Arraste para mover · Alt/Ctrl + arrastar copia']).join('\n'),
    }, h('span', { class: 't' }, s.start + '–' + s.end), h('span', { class: 's' }, sub), sev ? h('span', { class: 'flag ' + sev }) : null);
    el.addEventListener('click', (ev) => { ev.stopPropagation(); editShift(s); });
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') editShift(s); if (ev.key === 'Delete' || ev.key === 'Backspace') removeShift(s); });
    el.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', s.id); ev.dataTransfer.effectAllowed = 'copyMove'; el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    return el;
  }

  function renderDay() {
    const el = $('dayView');
    const day = S.selDay, store = S.data.store;
    const sw = C.staffWindow(store, day), hol = C.holiday(day);
    const nodes = [h('header', null,
      h('h3', null, 'Linha do tempo · ' + C.fmtDayLong(day)),
      hol ? h('span', { class: 'badge alerta' }, hol.name) : null,
      sw ? h('span', { class: 'badge' }, 'loja ' + C.fromMin(sw.open) + '–' + C.fromMin(sw.close)) : null,
      h('div', { class: 'legend' },
        h('span', null, h('i', { class: 'dot', style: { border: '1.5px dashed var(--muted)' } }), 'previsto'),
        h('span', null, h('i', { class: 'dot', style: { background: 'var(--ok)' } }), 'escalado'),
        h('span', null, h('i', { class: 'dot', style: { background: 'var(--danger)' } }), 'faltando')))];
    if (!sw) { nodes.push(h('div', { class: 'empty' }, 'A loja não abre neste dia.')); el.replaceChildren(...nodes); return; }
    const list = D.week.filter((s) => s.date === day).sort((a, b) => C.span(a)[0] - C.span(b)[0] || (a.employee_id ? 0 : 1));
    const t0 = Math.floor(Math.min(sw.start, ...list.map((s) => C.span(s)[0])) / 60) * 60;
    const t1 = Math.ceil(Math.max(sw.end, ...list.map((s) => C.span(s)[1])) / 60) * 60;
    const span = t1 - t0, X = (m) => ((m - t0) / span) * 100 + '%', W = (m) => (m / span) * 100 + '%';
    const tl = h('div', { class: 'tl', '--hw': (6000 / span) + '%' });
    const ruler = h('div', { class: 'track' });
    for (let m = t0; m <= t1; m += 60) ruler.append(h('span', { style: { left: X(m) } }, C.pad((m / 60) % 24) + 'h'));
    tl.append(h('div', { class: 'ruler' }, h('div'), ruler));
    const pd = D.stats.perDay[day];
    const max = Math.max(1, ...pd.cov.map((c) => Math.max(c.need, c.have + c.open)));
    const dem = h('div', { class: 'track' });
    pd.cov.forEach((c) => {
      const have = c.have + c.open;
      dem.append(h('div', { class: 'col', style: { left: X(c.h * 60), width: W(60), height: '100%' }, title: c.h + 'h: ' + have + ' de ' + c.need + ' · venda prevista ' + C.money(c.sales) },
        h('div', { class: 'need', style: { height: (c.need / max) * 100 + '%' } }),
        h('div', { class: 'have' + (have < c.need ? ' short' : ''), style: { height: (have / max) * 100 + '%' } }),
        h('div', { class: 'num' }, have + '/' + c.need)));
    });
    tl.append(h('div', { class: 'demand' }, h('div', { class: 'lab muted' }, 'Pessoas por hora'), dem));
    if (!list.length) tl.append(h('div', { class: 'empty' }, 'Ninguém escalado neste dia.'));
    list.forEach((s) => {
      const e = D.empById[s.employee_id], role = D.roles[s.role_id] || { color: '#999' };
      const [a, b] = C.span(s);
      const bar = h('div', { class: 'barx' + (e ? '' : ' open'), '--rc': role.color, style: { left: X(a), width: W(b - a) }, onclick: () => editShift(s), title: (e ? e.name : 'Turno aberto') + ' · ' + s.start + '–' + s.end + (s.break_min ? ' · intervalo ' + C.fromMin(C.breakStart(s)) : '') },
        s.break_min ? h('i', { class: 'brk', style: { left: ((C.breakStart(s) - a) / (b - a)) * 100 + '%', width: (s.break_min / (b - a)) * 100 + '%' } }) : null,
        h('span', null, s.start + '–' + s.end));
      tl.append(h('div', { class: 'trow' },
        h('div', { class: 'lab' }, e ? avatar(e) : h('span', { class: 'av', style: { background: 'var(--sunken)', color: 'var(--muted)' } }, '?'), e ? e.name : 'Turno aberto'),
        h('div', { class: 'track' }, h('div', { class: 'openwin', style: { left: X(sw.open), width: W(sw.close - sw.open) } }), bar)));
    });
    if (day === today()) {
      const m = C.nowMin();
      if (m >= t0 && m <= t1) tl.append(h('div', { class: 'now', style: { left: 'calc(var(--lab) + (100% - var(--lab)) * ' + (m - t0) / span + ')' } }));
    }
    nodes.push(tl);
    const away = D.emps.map((e) => ({ e, ab: C.absenceOn(S.data.absences, e.id, day) })).filter((x) => x.ab);
    const off = D.emps.filter((e) => !list.some((s) => s.employee_id === e.id) && !away.some((x) => x.e.id === e.id));
    nodes.push(h('p', { class: 'muted', style: { margin: '12px 0 0', fontSize: '12.5px' } },
      off.length ? 'De folga: ' + off.map((e) => UI.first(e.name)).join(', ') + '. ' : '',
      away.length ? 'Ausentes: ' + away.map((x) => UI.first(x.e.name) + ' (' + C.ABSENCE_TYPES[x.ab.type].label.toLowerCase() + ')').join(', ') + '.' : ''));
    el.replaceChildren(...nodes);
  }

  function renderIssues() {
    const counts = { erro: 0, alerta: 0, info: 0 };
    D.issues.forEach((i) => { if (!i.just) counts[i.sev]++; });
    const fbtn = (sev, label) => h('button', { 'aria-pressed': String(!!S.filter[sev]), onclick: () => { S.filter[sev] = !S.filter[sev]; UI.store.set('filter', S.filter); renderIssues(); } },
      h('span', { class: 'dot', style: { background: sevColor(sev) } }), counts[sev] + ' ' + label);
    const items = D.issues.filter((i) => S.filter[i.sev]);
    $('issues').replaceChildren(
      h('header', null, h('h3', null, icon('alert'), 'Apontamentos da semana'),
        h('div', { class: 'filters' }, fbtn('erro', counts.erro === 1 ? 'erro' : 'erros'), fbtn('alerta', counts.alerta === 1 ? 'alerta' : 'alertas'), fbtn('info', 'informativos'))),
      h('div', { class: 'list' }, items.length ? items.map(issueCard) : h('div', { class: 'empty' }, D.issues.length ? 'Nada nos filtros escolhidos.' : 'Nenhum apontamento nesta semana.')),
      h('footer', null, 'Regra: ', h('b', null, D.regime.label + ' (' + D.regime.short + ')'), ' · CLT, Lei 10.101' + (S.data.settings.rules.art386 !== false ? ' e art. 386' : '') + '.')
    );
  }

  function issueCard(i) {
    return h('div', { class: 'issue ' + i.sev + (i.just ? ' justified' : '') },
      h('div', { class: 'ihead' }, icon(i.sev === 'info' ? 'info' : 'alert'), h('span', null, i.title)),
      i.detail ? h('p', null, i.detail) : null,
      i.law ? h('span', { class: 'law mono' }, i.law) : null,
      i.just ? h('p', { class: 'just' }, 'Justificado: “' + i.just.text + '”') : null,
      h('div', { class: 'iact' },
        i.ids.length || i.date ? h('button', { class: 'btn sm ghost', onclick: () => focusIssue(i) }, icon('eye'), 'Ver') : null,
        quickFix(i),
        i.sev !== 'info' ? h('button', { class: 'btn sm ghost', onclick: (ev) => justify(ev.currentTarget, i) }, i.just ? 'Tirar justificativa' : 'Justificar') : null));
  }

  // correções de um clique para os casos mais comuns
  function quickFix(i) {
    if (i.just) return null;
    if (i.code === 'ausencia') return h('button', { class: 'btn sm ghost', onclick: () => mutate(async () => { for (const id of i.ids) await api.put('/api/shifts/' + id, { employee_id: null }); return i.ids; }, 'Turno liberado para a equipe pegar') }, icon('hand'), 'Liberar turno');
    if (i.code === 'cobertura' && i.h0 != null) {
      const sw = C.staffWindow(S.data.store, i.date);
      let st = Math.max(sw.start, i.h0 * 60), en = Math.min(sw.end, Math.max(i.h1 * 60, st + 240));
      if (en - st < 240) st = Math.max(sw.start, en - 240);
      const br = en - st - 60 > 360 ? 60 : en - st - 15 > 240 ? 15 : 0;
      return h('button', { class: 'btn sm ghost', title: 'Cria um turno aberto ' + C.fromMin(st) + '–' + C.fromMin(en), onclick: () => mutate(async () => { const n = await api.post('/api/shifts', { store_id: S.storeId, employee_id: null, date: i.date, start: C.fromMin(st), end: C.fromMin(en), break_min: br, role_id: S.data.store.default_role }); return [n.id]; }, 'Turno aberto criado — a equipe já pode pegar') }, icon('plus'), 'Abrir turno');
    }
    if (['interjornada', 'menor_noturno', 'intrajornada', 'jornada', 'hora_extra', 'domingo', 'domingo_386', 'dsr'].includes(i.code) && i.ids.length) {
      const s = S.data.shifts.find((x) => x.id === i.ids[i.ids.length - 1]);
      if (s) return h('button', { class: 'btn sm ghost', onclick: () => editShift(s) }, 'Ajustar');
    }
    return null;
  }

  function focusIssue(i) {
    if (i.date && i.date !== S.selDay) selectDay(i.date);
    let targets = i.ids.map((id) => document.querySelector('.chip[data-id="' + id + '"]')).filter(Boolean);
    if (!targets.length && i.emp && i.date) targets = [document.querySelector('.cell[data-emp="' + i.emp + '"][data-date="' + i.date + '"]')];
    if (!targets.length && i.date) targets = [document.querySelector('.gh.day.sel')];
    targets = targets.filter(Boolean);
    if (!targets.length) return;
    targets[0].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    targets.forEach((t) => { t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); });
  }

  function justify(anchor, i) {
    if (i.just) return mutate(() => api.post('/api/justify', { key: i.key, text: '', store_id: S.storeId, week: S.week }).then(() => []));
    const ta = h('textarea', { class: 'input', placeholder: 'Por que manter assim? Ex.: convenção de 2026 permite.', maxlength: 200 });
    const save = () => { if (!ta.value.trim()) return ta.focus(); UI.closePopover(); mutate(() => api.post('/api/justify', { key: i.key, text: ta.value.trim(), store_id: S.storeId, week: S.week }).then(() => []), 'Justificativa registrada'); };
    UI.popover(anchor, h('div', { class: 'confirm' }, h('b', null, 'Justificar e manter'), h('span', { class: 'muted' }, i.title + '. Fica registrado no histórico.'), ta,
      h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: UI.closePopover }, 'Cancelar'), h('button', { class: 'btn sm primary', onclick: save }, 'Salvar'))), { alignRight: true });
    setTimeout(() => ta.focus(), 30);
  }

  function confirmPop(anchor, content, okLabel, fn) {
    UI.popover(anchor, h('div', { class: 'confirm' }, content,
      h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: UI.closePopover }, 'Cancelar'), h('button', { class: 'btn sm primary', onclick: () => { UI.closePopover(); fn(); } }, okLabel))), { alignRight: true });
  }

  // ------------------------------------------------------------ turnos
  function quickAdd(anchor, e, day) {
    const store = S.data.store, win = C.storeWindow(store, day);
    const items = [h('h4', null, (e ? UI.first(e.name) : 'Turno aberto') + ' · ' + C.DOW_SHORT[C.dow(day)] + ' ' + C.fmtDay(day))];
    const color = e ? D.roles[e.role_id].color : 'var(--muted)';
    if (win) {
      [['abre', 'Abertura'], ['meio', 'Intermediário'], ['fecha', 'Fechamento']].forEach(([a, label]) => {
        const sg = C.suggestShift(store, e, day, a, D.regime);
        if (sg) items.push(h('button', { class: 'opt', onclick: () => { UI.closePopover(); createShift(e, day, sg); } }, h('span', { class: 'dot', style: { background: color } }), label, h('span', { class: 'mono' }, sg.start + '–' + sg.end)));
      });
    } else items.push(h('p', { class: 'muted', style: { margin: '2px 8px 8px', fontSize: '12.5px' } }, 'A loja não abre neste dia.'));
    items.push(h('button', { class: 'opt', onclick: () => {
      UI.closePopover();
      const sg = win && C.suggestShift(store, e, day, 'abre', D.regime);
      editShift(Object.assign({ id: null, employee_id: e ? e.id : null, date: day, start: '10:00', end: '18:00', break_min: 60, role_id: e ? e.role_id : store.default_role }, sg || {}));
    } }, icon('plus'), 'Personalizado…'));
    if (e) {
      items.push(h('hr'));
      items.push(h('button', { class: 'opt', onclick: () => { UI.closePopover(); addAbsence(e, 'folga', day, day, '', true); } }, h('span', { class: 'dot', style: { background: C.ABSENCE_TYPES.folga.color } }), 'Dar folga neste dia'));
      items.push(h('button', { class: 'opt', onclick: () => { UI.closePopover(); absenceForm(e, 'atestado', day); } }, h('span', { class: 'dot', style: { background: C.ABSENCE_TYPES.atestado.color } }), 'Atestado…'));
      items.push(h('button', { class: 'opt', onclick: () => { UI.closePopover(); absenceForm(e, 'ferias', day); } }, h('span', { class: 'dot', style: { background: C.ABSENCE_TYPES.ferias.color } }), 'Férias…'));
    }
    UI.popover(anchor, items);
  }

  function createShift(e, day, sg) {
    return mutate(async () => {
      const n = await api.post('/api/shifts', Object.assign({ store_id: S.storeId, employee_id: e ? e.id : null, date: day, role_id: e ? e.role_id : S.data.store.default_role }, sg));
      return [n.id];
    });
  }

  function dropShift(id, empId, date, copy) {
    const s = S.data.shifts.find((x) => x.id === id);
    if (!s || (!copy && (s.employee_id || null) === empId && s.date === date)) return;
    const role_id = empId ? D.empById[empId].role_id : s.role_id;
    mutate(async () => {
      if (copy) { const n = await api.post('/api/shifts', { store_id: S.storeId, employee_id: empId, date, start: s.start, end: s.end, break_min: s.break_min, break_at: s.break_at || null, role_id, note: s.note }); return [n.id]; }
      await api.put('/api/shifts/' + id, { employee_id: empId, date, role_id });
      return [id];
    });
  }

  function removeShift(s) { mutate(async () => { await api.del('/api/shifts/' + s.id); }, 'Turno excluído'); }

  function editShift(s) {
    const isNew = !s.id, store = S.data.store;
    const f = {
      emp: h('select', { class: 'input' }, h('option', { value: '' }, '— Turno aberto (sem ninguém) —'), D.emps.map((e) => h('option', { value: e.id, selected: e.id === s.employee_id }, e.name + ' · ' + D.roles[e.role_id].name))),
      date: h('input', { class: 'input', type: 'date', value: s.date }),
      start: h('input', { class: 'input', type: 'time', value: s.start, step: 300 }),
      end: h('input', { class: 'input', type: 'time', value: s.end, step: 300 }),
      brk: h('select', { class: 'input' }, [0, 15, 30, 60, 90, 120].map((v) => h('option', { value: v, selected: v === (s.break_min || 0) }, v ? v + ' min' : 'sem intervalo'))),
      brkAt: h('input', { class: 'input', type: 'time', value: s.break_min ? C.fromMin(C.breakStart(s)) : '', step: 300 }),
      role: h('select', { class: 'input' }, S.data.roles.map((r) => h('option', { value: r.id, selected: r.id === s.role_id }, r.name))),
      note: h('input', { class: 'input', value: s.note || '', placeholder: 'ex.: inventário, vitrine, treinamento', maxlength: 200 }),
    };
    const preview = h('div', { class: 'preview' });
    const issuesBox = h('div', { class: 'list-plain' });
    const tmpId = s.id || '__novo';
    function read() {
      const v = { employee_id: f.emp.value || null, date: f.date.value, start: f.start.value, end: f.end.value, break_min: +f.brk.value, break_at: f.brkAt.value || null, role_id: f.role.value, note: f.note.value };
      if (v.break_at && v.start && v.end) { // intervalo fora do turno volta para o automático
        const tmp = Object.assign({}, v), [a, b] = C.span(tmp); let x = C.toMin(v.break_at); if (x < a) x += 1440;
        if (x < a || x + v.break_min > b) v.break_at = null;
      }
      return v;
    }
    function refresh() {
      const v = read();
      if (!v.start || !v.end || !v.date) return;
      const tmp = Object.assign({}, s, v, { id: tmpId });
      const w = C.worked(tmp), need = C.breakFor(w);
      preview.textContent = C.fmtDur(w) + ' trabalhadas' + (v.break_min ? ' · intervalo de ' + v.break_min + ' min às ' + C.fromMin(C.breakStart(tmp)) : '') + (need > v.break_min ? ' · a CLT pede ' + need + ' min' : '');
      const iss = C.validate({ settings: S.data.settings, store, employees: D.emps, shifts: S.data.shifts.filter((x) => x.id !== s.id).concat([tmp]), absences: S.data.absences, weekStart: C.weekStart(v.date) })
        .filter((i) => i.ids.includes(tmpId));
      issuesBox.replaceChildren(...(iss.length ? iss.map((i) => h('div', { class: 'it' }, h('span', { class: 'badge ' + i.sev }, i.sev), h('span', { class: 'grow' }, i.title, h('br'), h('small', { class: 'muted' }, i.law || i.detail))))
        : [h('div', { class: 'it' }, h('span', { class: 'badge ok' }, icon('check'), 'ok'), h('span', { class: 'grow' }, 'Nenhum apontamento para este turno.'))]));
    }
    const save = () => {
      const v = read();
      if (!v.date || !v.start || !v.end) return toast('Preencha dia, entrada e saída', 'erro');
      UI.closeDrawer();
      mutate(async () => {
        if (isNew) { const n = await api.post('/api/shifts', Object.assign({ store_id: S.storeId }, v)); return [n.id]; }
        await api.put('/api/shifts/' + s.id, v); return [s.id];
      }, isNew ? 'Turno criado' : 'Turno salvo');
    };
    const buttons = [h('button', { class: 'btn primary', onclick: save }, icon('check'), 'Salvar')];
    if (!isNew && s.employee_id) buttons.push(h('button', { class: 'btn', onclick: () => { UI.closeDrawer(); mutate(async () => { await api.put('/api/shifts/' + s.id, { employee_id: null }); return [s.id]; }, 'Virou turno aberto'); } }, icon('hand'), 'Liberar'));
    buttons.push(h('span', { class: 'spacer' }));
    if (!isNew) buttons.push(h('button', { class: 'btn danger', onclick: () => { UI.closeDrawer(); removeShift(s); } }, icon('trash'), 'Excluir'));
    const who = s.employee_id && D.empById[s.employee_id];
    UI.drawer(isNew ? 'Novo turno' : 'Turno de ' + (who ? UI.first(who.name) : 'ninguém') + ' · ' + C.DOW_SHORT[C.dow(s.date)] + ' ' + C.fmtDay(s.date), [
      h('label', { class: 'field' }, h('span', null, 'Quem'), f.emp),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, 'Dia'), f.date), h('label', { class: 'field' }, h('span', null, 'Função no turno'), f.role)),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, 'Entrada'), f.start), h('label', { class: 'field' }, h('span', null, 'Saída'), f.end)),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, 'Intervalo'), f.brk), h('label', { class: 'field' }, h('span', null, 'Intervalo começa'), f.brkAt)),
      preview,
      h('label', { class: 'field' }, h('span', null, 'Observação'), f.note),
      h('div', { class: 'field' }, h('span', null, 'O que as regras dizem deste turno'), issuesBox),
    ], buttons);
    Object.values(f).forEach((x) => x.addEventListener('input', refresh));
    f.emp.addEventListener('change', () => { const e = D.empById[f.emp.value]; if (e) f.role.value = e.role_id; refresh(); });
    f.brk.addEventListener('change', refresh);
    refresh();
  }

  // ------------------------------------------------------------ pessoas e ausências
  function openEmployee(e) {
    const role = D.roles[e.role_id];
    const p = D.stats.perEmp[e.id] || { minutes: 0, days: 0 };
    const abs = S.data.absences.filter((a) => a.employee_id === e.id).sort((a, b) => a.date_ini.localeCompare(b.date_ini));
    const suns = [];
    for (let k = 5; k >= 0; k--) { const d = C.addDays(D.we, -7 * k); suns.push({ d, worked: S.data.shifts.some((s) => s.employee_id === e.id && s.date === d) }); }
    const unav = (e.unavail || []).map((u) => u.dow.map((x) => C.DOW_SHORT[x]).join('/') + ' ' + (u.from === '00:00' && u.to === '23:59' ? 'o dia todo' : u.from + '–' + u.to) + (u.reason ? ' (' + u.reason + ')' : '')).join('; ');
    UI.drawer(e.name, [
      h('div', { class: 'row' }, avatar(e, 46), h('div', null, h('b', null, e.name), h('div', { class: 'muted' }, role.name + ' · ' + contractLabel(e) + (e.gender === 'F' ? ' · art. 386 se aplica' : '')))),
      h('dl', { class: 'kv' },
        h('dt', null, 'Nesta semana'), h('dd', null, C.fmtDur(p.minutes) + ' em ' + p.days + ' dias · limite ' + C.fmtDur(C.weeklyLimit(e, D.regime))),
        h('dt', null, 'Custo'), h('dd', null, C.money(C.weeklyCost(e)) + ' por semana com encargos · R$ ' + C.hourCost(e, D.regime).toFixed(2).replace('.', ',') + '/h na regra ' + D.regime.short),
        h('dt', null, 'Habilidades'), h('dd', null, (e.skills || []).includes('chave') ? 'abre e fecha a loja (chave)' : '—'),
        h('dt', null, 'Indisponível'), h('dd', null, unav || 'sem restrição'),
        C.isMinor(e, S.week) ? [h('dt', null, 'Idade'), h('dd', null, 'menor de 18 — não trabalha depois das 22h nem faz hora extra')] : null,
        h('dt', null, 'Domingos'), h('dd', null, h('span', { class: 'row', style: { gap: '4px', flexWrap: 'wrap' } }, suns.map((x) => h('span', { class: 'badge ' + (x.worked ? 'alerta' : 'ok'), title: x.worked ? 'Trabalhou' : 'Folgou' }, C.fmtDay(x.d) + (x.worked ? ' trab.' : ' folga')))))),
      h('div', { class: 'field' }, h('span', null, 'Férias, atestados e folgas'),
        abs.length ? h('div', { class: 'list-plain' }, abs.map((a) => h('div', { class: 'it' },
          h('span', { class: 'dot', style: { background: C.ABSENCE_TYPES[a.type].color } }),
          h('span', { class: 'grow' }, C.ABSENCE_TYPES[a.type].label + ' · ' + C.fmtDay(a.date_ini) + (a.date_end !== a.date_ini ? ' a ' + C.fmtDay(a.date_end) : ''), a.note ? h('small', { class: 'muted' }, ' — ' + a.note) : null),
          h('button', { class: 'btn sm ghost danger', 'aria-label': 'Remover', onclick: () => mutate(async () => { await api.del('/api/absences/' + a.id); }).then(() => openEmployee(D.empById[e.id] || e)) }, icon('trash')))))
          : h('div', { class: 'muted' }, 'Nada lançado.')),
    ], [h('button', { class: 'btn', onclick: () => absenceForm(e, 'ferias', S.selDay) }, icon('plus'), 'Lançar ausência')]);
  }

  function absenceForm(e, type, date) {
    const f = {
      type: h('select', { class: 'input' }, Object.entries(C.ABSENCE_TYPES).map(([k, v]) => h('option', { value: k, selected: k === type }, v.label))),
      from: h('input', { class: 'input', type: 'date', value: date }),
      to: h('input', { class: 'input', type: 'date', value: type === 'ferias' ? C.addDays(date, 9) : date }),
      note: h('input', { class: 'input', placeholder: 'ex.: CID, motivo', maxlength: 120 }),
      free: h('input', { type: 'checkbox', checked: true }),
    };
    f.type.addEventListener('change', () => { if (f.type.value === 'ferias' && f.to.value === f.from.value) f.to.value = C.addDays(f.from.value, 9); });
    const ok = () => {
      if (!f.from.value || !f.to.value || f.to.value < f.from.value) return toast('Confira o período', 'erro');
      UI.closeDrawer();
      addAbsence(e, f.type.value, f.from.value, f.to.value, f.note.value, f.free.checked);
    };
    UI.drawer('Ausência · ' + e.name, [
      h('label', { class: 'field' }, h('span', null, 'Tipo'), f.type),
      h('div', { class: 'grid2' }, h('label', { class: 'field' }, h('span', null, 'De'), f.from), h('label', { class: 'field' }, h('span', null, 'Até'), f.to)),
      h('label', { class: 'field' }, h('span', null, 'Observação'), f.note),
      h('label', { class: 'switch' }, f.free, h('span', null, h('b', null, 'Liberar os turnos do período'), h('small', null, 'Os turnos desses dias viram turnos abertos para a equipe pegar.'))),
    ], [h('button', { class: 'btn primary', onclick: ok }, icon('check'), 'Lançar'), h('button', { class: 'btn', onclick: UI.closeDrawer }, 'Cancelar')]);
  }

  function addAbsence(e, type, from, to, note, free) {
    return mutate(async () => {
      const a = await api.post('/api/absences', { employee_id: e.id, type, date_ini: from, date_end: to, note, free: free !== false });
      return a.freed || [];
    }, C.ABSENCE_TYPES[type].label + ' lançada para ' + UI.first(e.name));
  }

  // ------------------------------------------------------------ pedidos
  function openRequests() {
    const reqs = S.data.requests.slice().reverse();
    const pend = reqs.filter((r) => r.status === 'pendente');
    const done = reqs.filter((r) => r.status !== 'pendente').slice(0, 8);
    UI.drawer('Pedidos da equipe', [
      pend.length ? pend.map(reqCard) : h('div', { class: 'empty' }, 'Nenhum pedido pendente nesta loja.'),
      done.length ? h('div', { class: 'muted', style: { fontSize: '11.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: '6px' } }, 'Já decididos') : null,
      done.map(reqCard),
    ]);
  }

  function reqCard(r) {
    const e = D.empById[r.employee_id] || { name: '?', role_id: '' };
    const s = r.shift_id && S.data.shifts.find((x) => x.id === r.shift_id);
    const sl = s ? C.DOW_SHORT[C.dow(s.date)] + ' ' + C.fmtDay(s.date) + ' · ' + s.start + '–' + s.end : 'um turno';
    let what;
    if (r.type === 'folga') what = ['Pede folga em ', h('b', null, C.DOW_LONG[C.dow(r.date)] + ', ' + C.fmtDay(r.date))];
    else if (r.type === 'troca') what = ['Quer passar ', h('b', null, sl), ' para ', h('b', null, r.to_employee_id && D.empById[r.to_employee_id] ? D.empById[r.to_employee_id].name : 'quem quiser (vira turno aberto)')];
    else what = ['Quer pegar o turno aberto de ', h('b', null, sl)];
    const pending = r.status === 'pendente';
    return h('div', { class: 'req' + (pending ? '' : ' done') },
      h('div', { class: 'who' }, avatar(e), h('div', null, h('b', null, e.name), h('small', null, 'pedido ' + when(r.created_at))),
        !pending ? h('span', { class: 'badge ' + (r.status === 'aprovado' ? 'ok' : 'erro'), style: { marginLeft: 'auto' } }, r.status) : null),
      h('div', { class: 'what' }, what),
      r.note ? h('div', { class: 'note' }, '“' + r.note + '”') : null,
      pending ? checkRequest(r) : null,
      pending ? h('div', { class: 'row' },
        h('button', { class: 'btn lime sm', onclick: () => decide(r, 'aprovado') }, icon('check'), 'Aprovar'),
        h('button', { class: 'btn sm', onclick: () => decide(r, 'negado') }, 'Negar')) : null);
  }

  // Simula o pedido aprovado e mostra o que pioraria (como o Deputy/7shifts fazem na troca).
  function checkRequest(r) {
    const shifts = S.data.shifts.map((x) => Object.assign({}, x));
    let absences = S.data.absences, ws;
    if (r.type === 'folga') {
      ws = C.weekStart(r.date);
      shifts.forEach((x) => { if (x.employee_id === r.employee_id && x.date === r.date) x.employee_id = null; });
      absences = absences.concat([{ employee_id: r.employee_id, type: 'folga', date_ini: r.date, date_end: r.date, status: 'aprovado' }]);
    } else {
      const s = shifts.find((x) => x.id === r.shift_id);
      if (!s) return h('div', { class: 'check bad' }, 'O turno não está nesta semana — abra a semana dele para ver o impacto.');
      ws = C.weekStart(s.date);
      s.employee_id = (r.type === 'pegar' ? r.employee_id : r.to_employee_id) || null;
    }
    if (ws !== S.week) return h('div', { class: 'check bad' }, h('span', null, 'É de outra semana. '), h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); UI.closeDrawer(); go({ week: ws }); setTimeout(openRequests, 400); } }, 'Abrir a semana de ' + C.fmtDay(ws)), ' para ver o impacto.');
    const before = new Set(D.issues.map((i) => i.key));
    const after = C.validate({ settings: S.data.settings, store: S.data.store, employees: D.emps, shifts, absences, weekStart: ws });
    const fresh = after.filter((i) => !before.has(i.key) && i.sev !== 'info');
    if (!fresh.length) return h('div', { class: 'check' }, h('span', null, '✓ Nenhum apontamento novo se aprovar.'));
    return h('div', { class: 'check ' + (fresh.some((i) => i.sev === 'erro') ? 'worse' : 'bad') }, h('b', null, 'Se aprovar:'), fresh.slice(0, 4).map((i) => h('div', null, '• ' + i.title)));
  }

  function decide(r, decision) {
    mutate(async () => { const x = await api.post('/api/requests/' + r.id + '/decide', { decision }); return x.shift_id ? [x.shift_id] : []; },
      decision === 'aprovado' ? 'Pedido aprovado — a escala já foi ajustada' : 'Pedido negado')
      .then(() => { if (UI.drawerOpen()) openRequests(); });
  }

  // ------------------------------------------------------------ regra (CLT × PEC), semana e configurações
  function regimeMenu() {
    const cur = S.data.settings.regime;
    UI.popover($('btnRegime'), [
      h('h4', null, 'Validar a escala pela regra'),
      Object.values(C.REGIMES).map((r) => h('button', { class: 'opt', onclick: () => { UI.closePopover(); setRegime(r.id); } },
        h('span', { class: 'dot', style: { background: r.id === cur ? 'var(--accent)' : 'var(--line-2)' } }),
        h('span', null, r.label, h('br'), h('small', { class: 'muted' }, r.short)))),
      h('hr'),
      h('button', { class: 'opt', onclick: () => { UI.closePopover(); openCompare(); } }, icon('scale'), 'Comparar as três nesta semana…'),
    ]);
  }
  function setRegime(id) { mutate(() => api.post('/api/settings', { regime: id }).then(() => []), 'Validando pela regra "' + C.REGIMES[id].label + '"'); }

  function pecCallout() {
    return h('div', { class: 'callout' },
      h('b', null, 'PEC 221/2019 — fim da escala 6x1'),
      h('span', null, 'Aprovada na Câmara (mai/2026) e no Senado (14/10/2026); falta a promulgação. Fase 1, 60 dias depois: teto de 42h e 2 folgas por semana, uma preferencialmente no domingo. Fase final, 14 meses depois: 40h. O salário não muda.'),
      h('small', { class: 'muted' }, 'As datas dependem da promulgação — confira no Diário Oficial antes de levar para produção.'));
  }

  async function openCompare() {
    const box = h('div', { class: 'empty' }, 'Gerando a mesma semana em cada regra…');
    UI.drawer('CLT atual × PEC do fim da 6x1', [pecCallout(), box], null, { wide: true });
    let rows;
    try { rows = await api.post('/api/week/simulate', { store_id: S.storeId, week: S.week }); }
    catch (e) { box.textContent = e.message; return; }
    const cur = S.data.settings.regime;
    const line = (label, fn) => h('tr', null, h('td', null, label), rows.map((r) => h('td', { class: r.regime === cur ? 'cur' : '' }, fn(r))));
    box.replaceWith(h('div', { style: { display: 'grid', gap: '12px' } },
      h('table', { class: 'cmp' },
        h('thead', null, h('tr', null, h('th', null, S.data.store.name + ' · ' + C.fmtWeek(S.week)), rows.map((r) => h('th', { class: r.regime === cur ? 'cur' : '' }, r.label, h('small', null, r.short))))),
        h('tbody', null,
          line('Horas escaladas', (r) => C.fmtDur(r.hours)),
          line('Cobertura do movimento', (r) => pct(r.coverage_pct)),
          line('Pessoa-hora descoberta', (r) => r.missing_hours + 'h'),
          line('Gente a mais para cobrir', (r) => (r.extra_people ? '+' + r.extra_people.toLocaleString('pt-BR') : '0')),
          line('Folha da equipe (não muda)', (r) => C.money(r.payroll)),
          line('Custo por hora trabalhada', (r) => 'R$ ' + r.hour_cost.toFixed(2).replace('.', ',')),
          line('Custo para cobrir o que falta', (r) => C.money(r.extra_cost)),
          line('Custo total ÷ venda prevista', (r) => pct((r.total / r.sales) * 100)),
          line('Folgas no domingo', (r) => r.sundays_off + ' de ' + D.emps.length),
          line('Erros · alertas', (r) => r.errors + ' · ' + r.alerts))),
      h('p', { class: 'muted', style: { fontSize: '12.5px', margin: 0 } }, 'Cada coluna é a escala que o gerador automático montaria com as mesmas pessoas, contratos, ausências e previsão de movimento. Como a PEC não reduz salário, a folha é a mesma: sobe o custo de cada hora trabalhada e o que custa contratar (ou pagar hora extra) para cobrir as horas que faltam. "Gente a mais" = pessoa-hora descoberta ÷ jornada semanal da regra.'),
      h('div', { class: 'row', style: { flexWrap: 'wrap' } }, rows.filter((r) => r.regime !== cur).map((r) => h('button', { class: 'btn sm', onclick: () => { UI.closeDrawer(); setRegime(r.regime); } }, 'Validar pela "' + r.label + '"')))));
  }

  function autoGen() {
    const run = () => mutate(async () => { await api.post('/api/week/auto', { store_id: S.storeId, week: S.week }); return 'all'; }, 'Escala gerada — confira os apontamentos e publique');
    if (D.week.length) confirmPop($('btnAuto'), h('span', null, 'Substituir os ' + D.week.length + ' turnos desta semana pela escala gerada?'), 'Gerar', run);
    else run();
  }
  function copyWeek() {
    const run = () => mutate(async () => { await api.post('/api/week/copy', { store_id: S.storeId, week: S.week }); return 'all'; }, 'Semana anterior copiada');
    if (D.week.length) confirmPop($('btnCopy'), h('span', null, 'Substituir os ' + D.week.length + ' turnos desta semana pelos da semana anterior?'), 'Copiar', run);
    else run();
  }
  function publish() {
    const errs = D.issues.filter((i) => i.sev === 'erro' && !i.just);
    const manager = D.emps.find((e) => e.role_id === 'ger');
    const run = () => mutate(async () => { await api.post('/api/week/publish', { store_id: S.storeId, week: S.week, by: manager ? manager.name : 'Gerência' }); return 'all'; }, 'Publicada — o mural e os celulares já atualizaram');
    if (errs.length) confirmPop($('btnPublish'), [h('b', null, errs.length + (errs.length > 1 ? ' erros' : ' erro') + ' da CLT sem justificativa'), h('div', { class: 'muted' }, errs.slice(0, 4).map((i) => h('div', null, '• ' + i.title)))], 'Publicar assim mesmo', run);
    else run();
  }

  function moreMenu() {
    const p = S.data.publication;
    UI.popover($('btnMore'), [
      h('button', { class: 'opt', onclick: () => { UI.closePopover(); openCompare(); } }, icon('scale'), 'Comparar CLT × PEC'),
      p.published && p.total ? h('button', { class: 'opt', onclick: () => { UI.closePopover(); mutate(async () => { await api.post('/api/week/discard', { store_id: S.storeId, week: S.week }); }, 'Alterações descartadas'); } }, icon('refresh'), 'Descartar alterações', h('span', { class: 'mono' }, p.total)) : null,
      h('button', { class: 'opt', onclick: () => { UI.closePopover(); confirmPop($('btnMore'), 'Apagar todos os turnos desta semana?', 'Apagar', () => mutate(async () => { await api.post('/api/week/clear', { store_id: S.storeId, week: S.week }); }, 'Semana limpa')); } }, icon('trash'), 'Limpar a semana'),
      h('hr'),
      h('button', { class: 'opt', onclick: () => { UI.closePopover(); window.open(UI.link('mural.html', { loja: S.storeId }), '_blank'); } }, icon('tv'), 'Abrir o mural (TV)'),
      h('button', { class: 'opt', onclick: () => { UI.closePopover(); window.open(UI.link('eu.html', { loja: S.storeId }), '_blank'); } }, icon('phone'), 'Abrir a visão da equipe'),
    ], { alignRight: true });
  }

  function weekPicker(anchor) {
    const inp = h('input', { class: 'input', type: 'date', value: S.selDay || S.week });
    UI.popover(anchor, h('div', { class: 'confirm' }, h('b', null, 'Ir para a semana de'), inp,
      h('div', { class: 'row' }, h('button', { class: 'btn sm primary', onclick: () => { UI.closePopover(); if (inp.value) go({ week: inp.value }); } }, 'Ir'))));
  }

  function openSettings() {
    const s = S.data.settings, st = S.data.store;
    const sw = (key, title, desc) => {
      const inp = h('input', { type: 'checkbox', checked: s.rules[key] !== false });
      inp.addEventListener('change', () => mutate(() => api.post('/api/settings', { rules: { [key]: inp.checked } }).then(() => [])));
      return h('label', { class: 'switch' }, inp, h('span', null, h('b', null, title), h('small', null, desc)));
    };
    const target = h('input', { class: 'input', type: 'number', min: 1, max: 60, step: 0.5, value: s.labor_target_pct });
    target.addEventListener('change', () => mutate(() => api.post('/api/settings', { labor_target_pct: +target.value }).then(() => [])));
    const hrs = ['1', '2', '3', '4', '5', '6', '0'].map((k) => C.DOW_SHORT[+k] + ' ' + (st.hours[k] ? st.hours[k].join('–') : 'fechada')).join(' · ');
    UI.drawer('Configurações', [
      h('div', { class: 'field' }, h('span', null, 'Regras que entram na validação'),
        h('div', null,
          sw('art386', 'Folga dominical quinzenal para mulheres', 'CLT art. 386. O STF manteve a regra (RE 1.403.904); vale junto com a de 3 semanas do comércio.'),
          sw('compensacao', 'Acordo de compensação semanal', 'CLT art. 59 §2º. Semana de 5 dias com até 8h48 por dia sem virar hora extra.'),
          sw('noturno', 'Avisar adicional noturno', 'CLT art. 73. Minutos trabalhados depois das 22h.'),
          sw('feriado', 'Avisar trabalho em feriado', 'Lei 605/49 art. 9º. Paga em dobro ou dá folga compensatória.'))),
      h('label', { class: 'field' }, h('span', null, 'Meta de custo de pessoal (% da venda prevista)'), target),
      h('div', { class: 'field' }, h('span', null, st.name + ' · ' + st.kind),
        h('dl', { class: 'kv' },
          h('dt', null, 'Horário'), h('dd', null, hrs + ' · feriado ' + (st.hours.holiday ? st.hours.holiday.join('–') : 'fechada')),
          h('dt', null, 'Feriado'), h('dd', null, st.holiday_cct ? 'convenção coletiva autoriza' : 'sem autorização — escalar em feriado é erro'),
          h('dt', null, 'Domingo'), h('dd', null, 'folga num domingo a cada ' + (st.sunday_window || 3) + ' semanas' + ((st.sunday_window || 3) === 3 ? ' (comércio)' : '')),
          h('dt', null, 'Movimento'), h('dd', null, 'R$ ' + st.demand.splh + ' de venda por pessoa-hora · mínimo de ' + st.demand.min_staff + ' na loja'),
          h('dt', null, 'Chave'), h('dd', null, st.key_required ? 'exige alguém com a chave na abertura e no fechamento' : '—'))),
      h('div', { class: 'field' }, h('span', null, 'Demonstração'),
        h('button', { class: 'btn danger', onclick: () => confirmPop(document.activeElement, 'Apagar tudo o que foi mexido e gerar o demo de novo?', 'Recomeçar', () => mutate(() => api.post('/api/reset').then(() => []), 'Demo recomeçado').then(UI.closeDrawer)) }, icon('refresh'), 'Recomeçar o demo do zero'),
        h('small', { class: 'muted' }, 'Gera de novo as três lojas, 8 semanas de escala e os pedidos de exemplo, a partir da semana de hoje.')),
    ]);
  }

  // ------------------------------------------------------------ ao vivo
  function onLive(ev) {
    if (ev.type === 'reconnect' || ev.type === 'settings' || ev.type === 'reset') {
      if (ev.type === 'reset' && Date.now() > S.selfUntil) toast('O demo foi recomeçado em outra tela');
      return reload();
    }
    if (ev.store_id && ev.store_id !== S.storeId) return;
    if (ev.msg && Date.now() > S.selfUntil) toast(ev.msg);
    reload({ flash: ev.ids || [] });
  }

  function init() {
    $('brand').prepend(UI.logo());
    $('brand').setAttribute('href', UI.link('./'));
    $('prev').append(icon('chevL'));
    $('next').append(icon('chevR'));
    $('btnSettings').append(icon('gear'));
    $('btnMore').append(icon('more'));
    $('btnAuto').append(icon('sparkle'), h('span', { class: 'lbl' }, 'Gerar automática'));
    $('btnCopy').append(icon('copy'), h('span', { class: 'lbl' }, 'Copiar semana anterior'));
    $('lnkMural').append(icon('tv'), h('span', { class: 'lbl' }, 'Mural'));
    $('lnkEu').append(icon('phone'), h('span', { class: 'lbl' }, 'Equipe'));
    $('prev').onclick = () => go({ week: C.addDays(S.week, -7) });
    $('next').onclick = () => go({ week: C.addDays(S.week, 7) });
    $('today').onclick = () => go({ week: C.todayISO() });
    $('weekLabel').onclick = (ev) => weekPicker(ev.currentTarget);
    $('btnRegime').onclick = regimeMenu;
    $('btnRequests').onclick = openRequests;
    $('btnSettings').onclick = openSettings;
    $('btnMore').onclick = moreMenu;
    $('btnAuto').onclick = autoGen;
    $('btnCopy').onclick = copyWeek;
    $('btnPublish').onclick = publish;
    UI.live(onLive, (on) => $('live').classList.toggle('on', on));
    setInterval(() => { if (S.data && S.selDay === today()) renderDay(); }, 60000);
    load();
  }
  init();
})();
