/* Escala (demo tCr8) — visão do funcionário no celular: a semana publicada, confirmar que viu,
 * pedir folga, oferecer troca e pegar turno aberto. Sem login no demo: escolhe-se a pessoa. */
(function () {
  'use strict';
  const C = window.EscalaCore;
  const { h, api, icon, toast } = UI;
  const app = document.getElementById('app');
  const qs = new URLSearchParams(location.search);
  const E = {
    me: qs.get('pessoa') || UI.store.get('eu.me', null),
    storeId: qs.get('loja') || UI.store.get('eu.loja', null),
    week: C.weekStart(C.todayISO()), data: null, emp: null, selfUntil: 0,
  };
  const when = (stamp) => { const [d, t] = stamp.split('T'); return C.DOW_SHORT[C.dow(d)] + ' ' + C.fmtDay(d) + ' às ' + t.slice(0, 5); };
  const dlabel = (d) => C.DOW_SHORT[C.dow(d)] + ' ' + C.fmtDay(d);

  async function load() {
    if (!E.me || !E.storeId) return picker(E.storeId);
    try { E.data = await api.get('/api/state?store=' + E.storeId + '&week=' + E.week + '&scope=published'); }
    catch (e) { app.replaceChildren(h('div', { class: 'empty' }, 'Sem conexão com o servidor.')); return; }
    E.emp = E.data.employees.find((e) => e.id === E.me);
    if (!E.emp) { E.me = null; return picker(E.storeId); }
    render();
  }

  async function picker(storeId) {
    let st;
    try { st = await api.get('/api/state?scope=published' + (storeId ? '&store=' + storeId : '')); }
    catch (e) { app.replaceChildren(h('div', { class: 'empty' }, 'Sem conexão com o servidor.')); return; }
    const roles = Object.fromEntries(st.roles.map((r) => [r.id, r]));
    app.replaceChildren(h('div', { class: 'card' },
      h('h2', null, 'Quem é você?'),
      h('p', { class: 'lead' }, 'No demo não tem login: escolha uma pessoa para ver a escala como ela vê no celular.'),
      h('div', { class: 'seg' }, st.stores.map((s) => h('button', { 'aria-pressed': String(s.id === st.store.id), onclick: () => picker(s.id) }, s.short))),
      h('div', { class: 'people-list' }, st.employees.map((e) => h('button', { class: 'pick', onclick: () => choose(st.store.id, e.id) },
        h('span', { class: 'av', '--rc': roles[e.role_id].color }, UI.initials(e.name)),
        h('span', null, h('b', null, e.name), h('small', null, roles[e.role_id].name + ' · ' + st.store.name)))))));
  }
  function choose(storeId, id) {
    E.storeId = storeId; E.me = id;
    UI.store.set('eu.loja', storeId); UI.store.set('eu.me', id);
    history.replaceState(null, '', UI.link('eu.html', { loja: storeId, pessoa: id }));
    load();
  }

  function render() {
    const d = E.data, me = E.emp, today = C.todayISO(), days = C.weekDays(E.week), nowM = C.nowMin();
    const roles = Object.fromEntries(d.roles.map((r) => [r.id, r]));
    const empById = Object.fromEntries(d.employees.map((e) => [e.id, e]));
    const pub = d.publication;
    const mine = d.shifts.filter((s) => s.employee_id === me.id).sort((a, b) => C.absStart(a) - C.absStart(b));
    const myReq = (type) => d.requests.filter((r) => r.employee_id === me.id && r.type === type && r.status === 'pendente');
    const nodes = [
      h('div', { class: 'hello' },
        h('span', { class: 'av', '--rc': roles[me.role_id].color }, UI.initials(me.name)),
        h('div', null, h('h1', null, 'Oi, ' + UI.first(me.name)), h('small', null, roles[me.role_id].name + ' · ' + d.store.name)),
        h('button', { class: 'btn sm ghost', onclick: () => { E.me = null; UI.store.set('eu.me', null); history.replaceState(null, '', UI.link('eu.html')); picker(E.storeId); } }, 'Trocar pessoa')),
      h('div', { class: 'wnav' },
        h('button', { class: 'btn icon ghost', 'aria-label': 'Semana anterior', onclick: () => { E.week = C.addDays(E.week, -7); load(); } }, icon('chevL')),
        h('b', null, C.fmtWeek(E.week)),
        h('button', { class: 'btn icon ghost', 'aria-label': 'Próxima semana', onclick: () => { E.week = C.addDays(E.week, 7); load(); } }, icon('chevR'))),
    ];
    if (!pub.published) {
      nodes.push(h('div', { class: 'card' }, h('b', null, 'A escala desta semana ainda não foi publicada.'), h('span', { class: 'muted' }, 'Quando a gerência publicar, ela aparece aqui sozinha.')));
      app.replaceChildren(...nodes);
      return;
    }
    const seen = d.receipts[me.id];
    nodes.push(seen
      ? h('div', { class: 'notice done' }, icon('check'), h('span', null, 'Você confirmou que viu esta escala ' + when(seen) + '.'))
      : h('div', { class: 'notice' }, h('b', null, 'Escala publicada ' + when(pub.published_at) + ' por ' + UI.first(pub.by)), h('span', null, 'Confira seus horários e confirme que viu.'), h('button', { class: 'btn', onclick: confirmSeen }, icon('check'), 'Confirmar que vi')));

    const next = mine.find((s) => (s.date > today || (s.date === today && C.span(s)[1] > nowM)) && !C.absenceOn(d.absences, me.id, s.date));
    if (next) {
      const [a, b] = C.span(next), isNow = next.date === today && nowM >= a;
      const txt = isNow ? 'Agora · sai às ' + next.end + (next.break_min ? ' · intervalo às ' + C.fromMin(C.breakStart(next)) : '')
        : next.date === today ? 'Hoje · começa em ' + C.fmtDur(a - nowM)
        : (next.date === C.addDays(today, 1) ? 'Amanhã' : C.DOW_LONG[C.dow(next.date)]) + ', ' + C.fmtDay(next.date) + (next.break_min ? ' · intervalo às ' + C.fromMin(C.breakStart(next)) : '');
      nodes.push(h('div', { class: 'hero' }, h('small', null, isNow ? 'Você está no turno' : 'Próximo turno'), h('span', { class: 't' }, next.start + '–' + next.end), h('span', { class: 'd' }, txt),
        isNow ? h('div', { class: 'bar' }, h('i', { style: { width: ((nowM - a) / (b - a)) * 100 + '%' } })) : null));
    }

    const minutes = mine.reduce((a, s) => a + C.worked(s), 0);
    const workDays = new Set(mine.map((s) => s.date)).size;
    nodes.push(h('div', { class: 'sum' },
      h('div', null, h('b', null, C.fmtDur(minutes)), h('small', null, 'na semana')),
      h('div', null, h('b', null, workDays), h('small', null, workDays === 1 ? 'dia de trabalho' : 'dias de trabalho')),
      h('div', null, h('b', null, 7 - workDays), h('small', null, 7 - workDays === 1 ? 'folga' : 'folgas'))));

    const folgaPend = new Set(myReq('folga').map((r) => r.date));
    const trocaPend = new Set(myReq('troca').map((r) => r.shift_id));
    nodes.push(h('div', { class: 'days' }, days.map((x) => {
      const list = mine.filter((s) => s.date === x);
      const ab = C.absenceOn(d.absences, me.id, x), win = C.storeWindow(d.store, x), hol = C.holiday(x);
      const body = h('div', { class: 'body' });
      if (ab) body.append(h('span', { class: 'tag' }, C.ABSENCE_TYPES[ab.type].label + (ab.note ? ' · ' + ab.note : '')));
      if (hol) body.append(h('span', { class: 'tag hol' }, hol.name));
      if (!ab) list.forEach((s) => {
        const [a, b] = C.span(s);
        const others = d.shifts.filter((o) => o.date === x && o.employee_id && o.employee_id !== me.id && C.span(o)[0] < b && C.span(o)[1] > a);
        body.append(h('span', { class: 't' }, s.start + '–' + s.end));
        body.append(h('span', { class: 'meta' }, C.fmtDur(C.worked(s)) + (s.break_min ? ' · intervalo de ' + s.break_min + ' min às ' + C.fromMin(C.breakStart(s)) : '') + (s.note ? ' · ' + s.note : '')));
        if (others.length) body.append(h('div', { class: 'with' }, 'Com ', others.slice(0, 6).map((o) => { const e = empById[o.employee_id]; return h('span', { class: 'av', '--rc': roles[e.role_id].color, title: e.name }, UI.initials(e.name)); }), others.length > 6 ? ' +' + (others.length - 6) : null));
        if (x >= today) body.append(h('div', { class: 'acts' },
          trocaPend.has(s.id) ? h('span', { class: 'tag pend' }, 'troca pedida') : h('button', { class: 'btn sm', onclick: () => offerSwap(s) }, icon('swap'), 'Trocar'),
          folgaPend.has(x) ? h('span', { class: 'tag pend' }, 'folga pedida') : h('button', { class: 'btn sm ghost', onclick: () => askOff(x) }, 'Pedir folga')));
      });
      if (!list.length && !ab) body.append(h('span', { class: 'off' + (C.dow(x) === 0 && win ? ' sun' : '') }, win ? (C.dow(x) === 0 ? 'Folga no domingo' : 'Folga') : 'Loja fechada'));
      return h('div', { class: 'day' + (x === today ? ' today' : x < today ? ' past' : '') },
        h('div', { class: 'dt' }, h('small', null, x === today ? 'hoje' : C.DOW_SHORT[C.dow(x)]), h('b', null, x.slice(8)), h('small', null, C.MONTHS[+x.slice(5, 7) - 1])), body);
    })));

    const opens = d.shifts.filter((s) => !s.employee_id && s.date >= today).sort((a, b) => C.absStart(a) - C.absStart(b));
    const pegarPend = new Set(myReq('pegar').map((r) => r.shift_id));
    if (opens.length) nodes.push(h('div', { class: 'card' }, h('h2', null, 'Turnos abertos na loja'),
      h('div', { class: 'open-list' }, opens.map((s) => {
        const busy = mine.some((m) => m.date === s.date) || !!C.absenceOn(d.absences, me.id, s.date);
        return h('div', { class: 'oshift' },
          h('div', { class: 'grow' }, h('b', null, s.start + '–' + s.end), h('small', null, C.DOW_LONG[C.dow(s.date)] + ', ' + C.fmtDay(s.date) + ' · ' + (roles[s.role_id] || {}).name + ' · ' + C.fmtDur(C.worked(s)))),
          pegarPend.has(s.id) ? h('span', { class: 'tag pend' }, 'pedido enviado')
            : h('button', { class: 'btn sm lime', disabled: busy || null, title: busy ? 'Você já trabalha ou está fora neste dia' : 'Pedir para pegar', onclick: () => send({ type: 'pegar', shift_id: s.id }) }, icon('hand'), 'Quero'));
      }))));

    const reqs = d.requests.filter((r) => r.employee_id === me.id).slice().reverse().slice(0, 6);
    if (reqs.length) nodes.push(h('div', { class: 'card' }, h('h2', null, 'Meus pedidos'),
      h('div', { class: 'req-list' }, reqs.map((r) => h('div', { class: 'rq' }, h('span', { class: 'grow' }, reqLabel(r, empById)),
        h('span', { class: 'badge ' + (r.status === 'aprovado' ? 'ok' : r.status === 'negado' ? 'erro' : 'info') }, r.status))))));
    app.replaceChildren(...nodes);
  }

  function reqLabel(r, empById) {
    const s = r.shift_id && E.data.shifts.find((x) => x.id === r.shift_id);
    const sl = s ? dlabel(s.date) + ' ' + s.start + '–' + s.end : 'turno';
    if (r.type === 'folga') return 'Folga em ' + dlabel(r.date) + (r.note ? ' — ' + r.note : '');
    if (r.type === 'troca') return 'Troca de ' + sl + (r.to_employee_id && empById[r.to_employee_id] ? ' com ' + UI.first(empById[r.to_employee_id].name) : ' (turno aberto)');
    return 'Pegar o turno aberto de ' + sl;
  }

  function confirmSeen() {
    E.selfUntil = Date.now() + 1500;
    api.post('/api/receipts', { employee_id: E.me, week: E.week }).then(() => { toast('Pronto — a gerência já sabe que você viu'); load(); }).catch((e) => toast(e.message, 'erro'));
  }
  function send(body) {
    E.selfUntil = Date.now() + 1500;
    return api.post('/api/requests', Object.assign({ employee_id: E.me }, body))
      .then(() => { UI.closeDrawer(); toast('Pedido enviado para a gerência'); load(); })
      .catch((e) => toast(e.message, 'erro'));
  }
  function askOff(date) {
    const note = h('input', { class: 'input', placeholder: 'ex.: consulta médica, compromisso', maxlength: 140 });
    UI.drawer('Pedir folga · ' + C.DOW_LONG[C.dow(date)] + ', ' + C.fmtDay(date), [
      h('p', { class: 'lead' }, 'A gerência recebe na hora. Se aprovar, seu turno vira turno aberto para alguém da equipe pegar.'),
      h('label', { class: 'field' }, h('span', null, 'Motivo (opcional)'), note),
    ], [h('button', { class: 'btn primary', onclick: () => send({ type: 'folga', date, note: note.value }) }, icon('send'), 'Enviar pedido'), h('button', { class: 'btn', onclick: UI.closeDrawer }, 'Cancelar')]);
  }
  function offerSwap(s) {
    const d = E.data;
    const roles = Object.fromEntries(d.roles.map((r) => [r.id, r]));
    const note = h('input', { class: 'input', placeholder: 'ex.: tenho um compromisso', maxlength: 140 });
    const list = h('div', { class: 'people-list' });
    let to = null;
    const sel = (on) => (on ? { borderColor: 'var(--ink)', boxShadow: '0 0 0 1px var(--ink)' } : null);
    const draw = () => list.replaceChildren(
      h('button', { class: 'pick', style: sel(to === null), onclick: () => { to = null; draw(); } },
        h('span', { class: 'av', style: { background: 'var(--sunken)', color: 'var(--muted)' } }, icon('hand')),
        h('span', null, h('b', null, 'Qualquer pessoa'), h('small', null, 'vira turno aberto; quem pegar leva'))),
      ...d.employees.filter((e) => e.id !== E.me).map((e) => {
        const busy = d.shifts.some((x) => x.employee_id === e.id && x.date === s.date) || !!C.absenceOn(d.absences, e.id, s.date);
        return h('button', { class: 'pick', disabled: busy || null, style: sel(to === e.id), onclick: () => { to = e.id; draw(); } },
          h('span', { class: 'av', '--rc': roles[e.role_id].color }, UI.initials(e.name)),
          h('span', null, h('b', null, e.name), h('small', null, busy ? 'já trabalha ou está fora neste dia' : 'livre neste dia')));
      }));
    draw();
    UI.drawer('Trocar ' + dlabel(s.date) + ' · ' + s.start + '–' + s.end, [
      h('p', { class: 'lead' }, 'Escolha quem fica com o turno. Quando a gerência aprovar, a escala muda no mural e no celular de todo mundo.'),
      list,
      h('label', { class: 'field' }, h('span', null, 'Recado (opcional)'), note),
    ], [h('button', { class: 'btn primary', onclick: () => send({ type: 'troca', shift_id: s.id, to_employee_id: to, note: note.value }) }, icon('send'), 'Enviar pedido'), h('button', { class: 'btn', onclick: UI.closeDrawer }, 'Cancelar')]);
  }

  UI.live((ev) => {
    if (ev.type === 'reconnect' || ev.type === 'reset') return load();
    if (!E.me || (ev.store_id && ev.store_id !== E.storeId) || ev.type === 'draft') return;
    const mine = E.emp && ev.msg && ev.msg.includes(UI.first(E.emp.name));
    if (Date.now() > E.selfUntil && (ev.type === 'published' || mine) && ev.msg) toast(ev.msg);
    load();
  }, (on) => document.getElementById('live').classList.toggle('on', on));

  document.getElementById('brand').prepend(UI.logo());
  document.getElementById('brand').setAttribute('href', UI.link('eu.html'));
  setInterval(() => { if (E.data && E.emp) render(); }, 60000);
  load();
})();
