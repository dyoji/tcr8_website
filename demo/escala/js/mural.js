/* Escala (demo tCr8) — mural para a TV da loja.
 * Mostra a escala PUBLICADA da semana, quem está na loja agora e as próximas trocas; atualiza sozinho
 * pelo canal ao vivo e destaca o que mudou. Também serve de quadro da escala de revezamento (CLT art. 67 p.ú.).
 * Parâmetros: ?loja=SHO|todas  ?rotacao=20 (segundos, com "todas")  ?hora=15:30&dia=2026-10-17&vel=60 (simulação)
 *             ?escopo=rascunho (mostra o rascunho em vez do publicado) */
(function () {
  'use strict';
  const C = window.EscalaCore;
  const { h, api, icon } = UI;
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const FIELDS = ['employee_id', 'date', 'start', 'end', 'break_min', 'break_at'];

  // relógio — real ou simulado
  const t0 = Date.now(), vel = Math.max(1, +qs.get('vel') || 1);
  let base = null;
  if (qs.get('hora') || qs.get('dia')) {
    const [y, mo, d] = (qs.get('dia') || C.todayISO()).split('-').map(Number);
    const [hh, mm] = (qs.get('hora') || '12:00').split(':').map(Number);
    base = new Date(y, mo - 1, d, hh || 0, mm || 0, 0).getTime();
  } else if (vel > 1) base = t0;
  const now = () => (base == null ? new Date() : new Date(base + (Date.now() - t0) * vel));
  const minuteOf = (n) => n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60;

  const M = {
    stores: [], order: [], idx: 0, cache: {}, freshCells: {},
    rotate: Math.max(8, +qs.get('rotacao') || 20),
    scope: qs.get('escopo') === 'rascunho' ? 'draft' : 'published',
  };
  const want = qs.get('loja') || UI.store.get('mural.loja', 'SHO');
  const when = (stamp) => { const [d, t] = stamp.split('T'); return C.DOW_SHORT[C.dow(d)] + ' ' + C.fmtDay(d) + ' ' + t.slice(0, 5); };

  async function fetchStore(id) {
    const ws = C.weekStart(C.todayISO(now()));
    const st = await api.get('/api/state?store=' + id + '&week=' + ws + '&scope=' + M.scope);
    const old = M.cache[id];
    if (old && old.week === st.week) { // marca as células que mudaram para piscar
      const om = new Map(old.shifts.map((s) => [s.id, s])), nm = new Map(st.shifts.map((s) => [s.id, s]));
      const until = Date.now() + 12000;
      const mark = (s) => { M.freshCells[(s.employee_id || '-') + '|' + s.date] = until; };
      st.shifts.forEach((s) => { const o = om.get(s.id); if (!o) mark(s); else if (FIELDS.some((f) => (s[f] ?? null) !== (o[f] ?? null))) { mark(s); mark(o); } });
      old.shifts.forEach((o) => { if (!nm.has(o.id)) mark(o); });
    }
    M.cache[id] = st;
    return st;
  }
  const refreshAll = () => Promise.all(M.order.map(fetchStore));

  // ------------------------------------------------------------ desenho
  function render() {
    const st = M.cache[M.order[M.idx]];
    if (!st) return;
    $('store').textContent = st.store.name;
    const pub = st.publication;
    $('sub').replaceChildren('Escala da semana · ', h('b', null, C.fmtWeek(st.week)), pub.published ? ' · publicada ' + when(pub.published_at) + ' por ' + UI.first(pub.by) : '', M.scope === 'draft' ? ' · RASCUNHO' : '');
    document.title = 'Mural · ' + st.store.short;
    renderNow(st); renderWeek(st); renderTicker(st); renderDots();
  }

  function renderNow(st) {
    const n = now(), d = C.todayISO(n), m = minuteOf(n);
    const empOf = (id) => st.employees.find((e) => e.id === id) || { name: '?' };
    const roleOf = (id) => st.roles.find((r) => r.id === id) || { color: '#888', name: '' };
    const win = C.storeWindow(st.store, d);
    const todays = st.shifts.filter((s) => s.date === d && s.employee_id && !C.absenceOn(st.absences, s.employee_id, d));
    const on = todays.filter((s) => { const [a, b] = C.span(s); return m >= a && m < b; }).sort((a, b) => C.span(a)[1] - C.span(b)[1]);
    const c = win ? C.demandCurve(st.store, d).find((x) => x.h === Math.floor(m / 60)) : null;
    const present = on.filter((s) => !C.onBreakAt(s, m)).length;
    const opened = win && m >= win.open && m < win.close;
    let pill;
    if (!win) pill = h('span', { class: 'pill' }, 'Hoje a loja não abre');
    else if (m < win.open) pill = h('span', { class: 'pill' }, 'Abre às ' + C.fromMin(win.open));
    else if (m >= win.close) pill = h('span', { class: 'pill' }, 'Loja fechada');
    else if (c && present < c.need) pill = h('span', { class: 'pill bad' }, (c.need - present > 1 ? 'Faltam ' : 'Falta ') + (c.need - present));
    else pill = h('span', { class: 'pill ok' }, icon('check'), 'Equipe completa');

    const person = (s) => {
      const e = empOf(s.employee_id), r = roleOf(s.role_id), [a, b] = C.span(s), brk = C.onBreakAt(s, m), bs = C.breakStart(s), left = b - m;
      return h('div', { class: 'pp' + (brk ? ' break' : ''), '--rc': r.color },
        h('span', { class: 'av', '--rc': r.color }, UI.initials(e.name)),
        h('b', null, e.name), h('span', { class: 'hrs' }, s.start + '–' + s.end),
        h('span', { class: 'meta' }, r.name + (s.note ? ' · ' + s.note : '')),
        h('span', { class: 'left' }, brk ? 'intervalo até ' + C.fromMin(bs + s.break_min) : left <= 60 ? 'sai em ' + Math.ceil(left) + ' min' : 'sai em ' + C.fmtDur(Math.floor(left))),
        h('div', { class: 'bar' }, h('i', { style: { width: Math.max(2, ((m - a) / (b - a)) * 100) + '%' } })));
    };
    let body;
    const MAXP = 7;
    if (on.length) body = on.slice(0, MAXP).map(person).concat(on.length > MAXP ? [h('div', { class: 'more' }, '+ ' + (on.length - MAXP) + ' na loja')] : []);
    else {
      const nxt = nextOpening(st, d, m);
      body = h('div', { class: 'closedmsg' }, h('b', null, !win ? 'Hoje a loja não abre' : m < win.open ? 'Ainda não começou' : opened ? 'Ninguém escalado agora' : 'Expediente encerrado'), nxt ? h('span', null, nxt) : null);
    }
    const nowCard = h('div', { class: 'card nowcard' },
      h('div', { class: 'kicker' }, 'Agora na loja'),
      h('div', { class: 'nowhead' }, h('div', null, h('span', { class: 'n mono' }, present), h('span', { class: 'of' }, c && opened ? 'de ' + c.need + ' previstas' : 'pessoas')), pill),
      h('div', { class: 'people' + (on.length > 4 ? ' compact' : ''), dataset: { total: on.length } }, body));

    const evs = [];
    todays.forEach((s) => {
      const [a, b] = C.span(s), nm = UI.first(empOf(s.employee_id).name);
      if (a > m) evs.push({ t: a, k: 'in', txt: nm + ' chega' });
      if (b > m) evs.push({ t: b, k: 'out', txt: nm + ' sai' });
      if (s.break_min >= 30) { const bs = C.breakStart(s); if (bs > m) evs.push({ t: bs, k: 'brk', txt: nm + ' vai para o intervalo' }); }
    });
    evs.sort((x, y) => x.t - y.t);
    const nextCard = h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Próximas trocas'),
      h('div', { class: 'events' }, evs.length ? evs.slice(0, 5).map((x) => h('div', { class: 'ev ' + x.k }, h('span', { class: 'mono' }, C.fromMin(x.t)), icon(x.k === 'in' ? 'login' : x.k === 'out' ? 'logout' : 'coffee'), h('span', null, x.txt)))
        : h('div', { class: 'ev' }, h('span'), h('span'), h('span', null, 'Nada mais por hoje.'))));

    const away = st.employees.map((e) => ({ e, a: C.absenceOn(st.absences, e.id, d) })).filter((x) => x.a);
    const off = win ? st.employees.filter((e) => !st.shifts.some((s) => s.employee_id === e.id && s.date === d) && !away.some((x) => x.e.id === e.id)) : [];
    const awayCard = h('div', { class: 'card' }, h('div', { class: 'kicker' }, 'Fora hoje'),
      h('div', { class: 'away' },
        away.map((x) => h('span', { class: 'pill' }, UI.first(x.e.name) + ' · ' + C.ABSENCE_TYPES[x.a.type].label.toLowerCase())),
        off.map((e) => h('span', { class: 'pill' }, UI.first(e.name) + ' · folga')),
        !away.length && !off.length ? h('span', { class: 'muted' }, win ? 'Todo mundo trabalha hoje.' : 'Loja fechada.') : null));
    $('now').replaceChildren(nowCard, nextCard, awayCard);
    fitPeople();
  }

  // Se não couber todo mundo na coluna, mostra quem cabe e um "+N" no fim.
  function fitPeople() {
    const box = document.querySelector('.people');
    if (!box) return;
    const rows = [...box.querySelectorAll('.pp')];
    let hidden = 0, more = box.querySelector('.more');
    while (box.scrollHeight > box.clientHeight + 1 && rows.length - hidden > 1) {
      rows[rows.length - 1 - hidden].remove(); hidden++;
      if (!more) more = box.appendChild(h('div', { class: 'more' }));
      more.textContent = '+ ' + (+box.dataset.total - box.querySelectorAll('.pp').length) + ' na loja agora';
    }
  }

  function nextOpening(st, d, m) {
    const firstIn = st.shifts.filter((s) => s.date === d && s.employee_id && C.span(s)[0] > m).sort((a, b) => C.span(a)[0] - C.span(b)[0])[0];
    if (firstIn) return 'Primeira entrada às ' + firstIn.start;
    for (let i = 1; i <= 7; i++) {
      const x = C.addDays(d, i), w = C.storeWindow(st.store, x);
      if (w) return 'Abre ' + (i === 1 ? 'amanhã' : C.DOW_LONG[C.dow(x)]) + ' às ' + C.fromMin(w.open);
    }
    return '';
  }

  function renderWeek(st) {
    const box = $('week');
    if (M.scope === 'published' && !st.publication.published) {
      box.replaceChildren(h('div', { class: 'card unpub' }, h('div', null, h('b', null, 'A escala desta semana ainda não foi publicada'), h('p', null, 'Assim que a gerência publicar, ela aparece aqui sozinha.'))));
      return;
    }
    const n = now(), today = C.todayISO(n), m = minuteOf(n);
    const days = C.weekDays(st.week);
    const roleById = Object.fromEntries(st.roles.map((r) => [r.id, r]));
    const emps = st.roles.flatMap((r) => st.employees.filter((e) => e.role_id === r.id));
    const opens = st.shifts.filter((s) => !s.employee_id);
    const rows = emps.length + (opens.length ? 1 : 0);
    const wk = h('div', { class: 'wk', style: { gridTemplateRows: 'auto repeat(' + rows + ', minmax(0, 1fr))' } });
    wk.append(h('div', { class: 'wh corner' }, 'Equipe'));
    days.forEach((d, i) => {
      const win = C.storeWindow(st.store, d), hol = C.holiday(d);
      const cov = win ? C.coverage(st.store, d, st.shifts.filter((s) => s.date === d)) : [];
      wk.append(h('div', { class: 'wh' + (d === today ? ' today' : d < today ? ' past' : '') + (i === 6 ? ' l' : '') },
        h('span', { class: 'dw' }, d === today ? 'hoje · ' + C.DOW_SHORT[C.dow(d)] : C.DOW_SHORT[C.dow(d)]),
        h('span', { class: 'dd' }, C.fmtDay(d)),
        hol ? h('span', { class: 'hol' }, hol.name) : null,
        h('span', { class: 'hrs' }, win ? C.fromMin(win.open) + '–' + C.fromMin(win.close) : 'fechada'),
        cov.length ? h('div', { class: 'heat' }, cov.map((c) => h('i', { class: c.have + c.open < c.need ? 'short' : '' }))) : null));
    });
    const cellW = (e, d, i) => {
      const win = C.storeWindow(st.store, d);
      const list = st.shifts.filter((s) => (e ? s.employee_id === e.id : !s.employee_id) && s.date === d).sort((a, b) => a.start.localeCompare(b.start));
      const ab = e && C.absenceOn(st.absences, e.id, d);
      const fresh = (M.freshCells[(e ? e.id : '-') + '|' + d] || 0) > Date.now();
      const c = h('div', { class: 'wc' + (d === today ? ' today' : d < today ? ' past' : '') + (!win && !list.length && !ab ? ' closed' : '') + (fresh ? ' fresh' : '') + (i === 6 ? ' l' : '') });
      if (ab) c.append(h('div', { class: 'abs ' + ab.type }, C.ABSENCE_TYPES[ab.type].label));
      list.forEach((s) => {
        const r = roleById[s.role_id] || { color: '#888', name: '' };
        const isOn = d === today && m >= C.span(s)[0] && m < C.span(s)[1];
        c.append(h('div', { class: 'sh' + (e ? '' : ' open') + (isOn && !ab ? ' on' : '') + (ab ? ' canceled' : ''), '--rc': r.color },
          h('span', { class: 't' }, s.start + '–' + s.end),
          h('span', { class: 's' }, e ? s.note || C.fmtDur(C.worked(s)) : r.name + ' · quem pega?')));
      });
      if (e && win && !list.length && !ab) c.append(h('div', { class: 'off' + (C.dow(d) === 0 ? ' sun' : '') }, 'folga'));
      return c;
    };
    if (opens.length) {
      wk.append(h('div', { class: 'wn open', '--rc': 'var(--accent)' }, h('span', { class: 'av' }, icon('hand')), h('div', { style: { minWidth: 0 } }, h('b', null, 'Turno aberto'), h('small', null, 'pegue pelo celular'))));
      days.forEach((d, i) => wk.append(cellW(null, d, i)));
    }
    emps.forEach((e) => {
      const r = roleById[e.role_id];
      wk.append(h('div', { class: 'wn', '--rc': r.color }, h('span', { class: 'av', '--rc': r.color }, UI.initials(e.name)), h('div', { style: { minWidth: 0 } }, h('b', null, e.name), h('small', null, r.name))));
      days.forEach((d, i) => wk.append(cellW(e, d, i)));
    });
    box.replaceChildren(h('div', { class: 'card', style: { padding: 0, overflow: 'hidden', height: '100%' } }, wk));
  }

  function renderTicker(st) {
    const d = C.todayISO(now());
    const items = [];
    const pub = st.publication;
    if (pub.published) {
      items.push([icon('check'), 'Escala publicada ', h('b', null, when(pub.published_at)), ' por ' + pub.by]);
      const seen = Object.keys(st.receipts).filter((id) => st.employees.some((e) => e.id === id)).length;
      items.push([icon('eye'), h('b', null, seen + ' de ' + st.employees.length), ' já confirmaram que viram a escala']);
    }
    st.log.slice().reverse().slice(0, 6).forEach((l) => { const [ld, lt] = l.at.split('T'); items.push([h('span', { class: 'mono' }, ld === d ? lt.slice(0, 5) : C.fmtDay(ld)), l.msg]); });
    const nh = C.nextHoliday(d, 60);
    if (nh) { const w = C.storeWindow(st.store, nh.date); items.push(['Próximo feriado: ', h('b', null, nh.name), ' · ' + C.DOW_SHORT[C.dow(nh.date)] + ' ' + C.fmtDay(nh.date) + ' · ' + (w ? 'loja ' + C.fromMin(w.open) + '–' + C.fromMin(w.close) : 'loja fechada')]); }
    items.push([icon('phone'), 'Troca, folga e turno aberto: peça pelo celular em ', h('b', null, new URL(UI.link('eu.html'), location.href).href.replace(/^https?:\/\//, ''))]);
    const build = () => items.flatMap((it) => [h('span', { class: 'it' }, it), h('span', { class: 'sep' })]);
    const track = $('ticker');
    track.replaceChildren(...build(), ...build());
    track.style.setProperty('--dur', Math.max(40, items.length * 11) + 's');
  }

  function renderDots() {
    let el = document.querySelector('.dots');
    if (M.order.length < 2) { if (el) el.remove(); return; }
    if (!el) el = document.body.appendChild(h('div', { class: 'dots' }));
    el.replaceChildren(...M.order.map((id, i) => h('i', { class: i === M.idx ? 'on' : '' })));
  }

  let bannerTimer = null;
  function banner(msg) {
    const b = $('banner');
    b.replaceChildren(h('i'), msg);
    b.classList.add('on');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove('on'), 8000);
  }

  function rotate() {
    if (M.order.length < 2) return;
    $('main').classList.add('fade');
    setTimeout(() => { M.idx = (M.idx + 1) % M.order.length; render(); $('main').classList.remove('fade'); }, 500);
  }

  // ------------------------------------------------------------ relógio, ao vivo e TV
  let lastWeek = null;
  function tickClock() {
    const n = now();
    $('clock').textContent = C.pad(n.getHours()) + ':' + C.pad(n.getMinutes());
    $('date').textContent = C.fmtDayLong(C.todayISO(n));
    const ws = C.weekStart(C.todayISO(n));
    if (lastWeek && ws !== lastWeek) refreshAll().then(render);
    lastWeek = ws;
  }
  function tick() {
    const st = M.cache[M.order[M.idx]];
    if (st) { renderNow(st); renderWeek(st); }
  }

  async function onLive(ev) {
    if (ev.type === 'reconnect' || ev.type === 'reset' || ev.type === 'settings') { await refreshAll(); render(); return; }
    if (!ev.store_id || !M.order.includes(ev.store_id)) return;
    if (M.scope === 'published' && ev.type === 'draft') return;
    await fetchStore(ev.store_id);
    if (ev.type === 'published' && M.order[M.idx] !== ev.store_id) M.idx = M.order.indexOf(ev.store_id);
    render();
    if (ev.type === 'published' || (M.scope === 'draft' && ev.type === 'draft')) banner(ev.msg || 'Escala atualizada');
  }

  async function wakeLock() {
    if (!('wakeLock' in navigator)) return;
    const req = async () => { try { await navigator.wakeLock.request('screen'); } catch (e) { /* sem permissão */ } };
    await req();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') req(); });
  }

  async function init() {
    $('brand').prepend(UI.logo());
    if (base != null) { const s = $('sim'); s.classList.remove('hidden'); s.textContent = 'simulação' + (vel > 1 ? ' ' + vel + '×' : ''); }
    try {
      const st0 = await api.get('/api/state?scope=' + M.scope);
      M.stores = st0.stores;
    } catch (e) { $('sub').textContent = 'Sem conexão com o servidor — tentando de novo…'; setTimeout(init, 3000); return; }
    M.order = want === 'todas' ? M.stores.map((s) => s.id) : [M.stores.some((s) => s.id === want) ? want : M.stores[0].id];
    if (want !== 'todas') UI.store.set('mural.loja', M.order[0]);
    await refreshAll();
    tickClock(); render();
    setInterval(tickClock, 1000);
    setInterval(tick, vel > 1 ? 1000 : 15000);
    if (M.order.length > 1) setInterval(rotate, M.rotate * 1000);
    UI.live(onLive, (on) => $('live').classList.toggle('on', on));
    wakeLock();
    let idle;
    const wake = () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('idle'), 3000); };
    document.addEventListener('mousemove', wake); wake();
    document.addEventListener('dblclick', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen(); });
  }
  init();
})();
