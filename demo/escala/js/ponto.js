/* Escala (demo tCr8) — ponto do freela pelo link expirável (sem login: o link é a credencial).
 * Mostra a escala, pede o aceite de cada convocação (CLT art. 452-A) e libera a batida só na janela certa:
 * a regra é a mesma do servidor (EscalaCore.pontoNext), aqui ela só serve para a contagem regressiva. */
(function () {
  'use strict';
  const C = window.EscalaCore;
  const { h, api, icon, toast } = UI;
  const app = document.getElementById('app');
  const token = new URLSearchParams(location.search).get('t') || '';
  const P = { view: null, offset: 0, receipt: null, busy: false };
  const dl = (d) => C.DOW_SHORT[C.dow(d)] + ' ' + C.fmtDay(d);
  const parseStamp = (s) => { const [d, t] = s.split('T'); const [y, m, dd] = d.split('-').map(Number); const [hh, mi, ss] = t.split(':').map(Number); return new Date(y, m - 1, dd, hh, mi, ss || 0); };
  const serverNow = () => new Date(Date.now() + P.offset);

  async function load() {
    try {
      const v = await api.get('/api/ponto?t=' + encodeURIComponent(token));
      if (v.ok && v.now) P.offset = parseStamp(v.now).getTime() - Date.now();
      P.view = v;
      render();
    } catch (e) { app.replaceChildren(h('div', { class: 'card dead' }, icon('alert'), h('h1', null, 'Sem conexão'), h('p', { class: 'note' }, 'Tente de novo em instantes.'))); }
  }

  function dead(v) {
    const msg = { expirado: ['Este link expirou', 'O período desta convocação acabou.'], revogado: ['Link cancelado', 'A loja cancelou este link.'], invalido: ['Link inválido', 'Confira se o link chegou inteiro.'] }[v.reason] || ['Link inválido', ''];
    document.getElementById('where').textContent = v.store || '—';
    app.replaceChildren(h('div', { class: 'card dead' }, icon('lock'), h('h1', null, msg[0]), h('p', { class: 'note' }, msg[1] + (v.name ? ' ' + v.name + ', ' : ' ') + 'peça um link novo para a loja.')));
  }

  function todayItem(v, now) {
    const t = C.todayISO(now);
    return v.items.find((i) => i.date === t && i.status === 'aceito' && !i.punches.some((p) => p.type === 'saida'))
      || v.items.find((i) => i.date === t && i.status !== 'recusado') || null;
  }

  function render() {
    const v = P.view;
    if (!v || !v.ok) return dead(v || {});
    const now = serverNow();
    document.getElementById('where').textContent = v.store.name;
    document.title = 'Ponto · ' + v.store.name;
    const nodes = [
      h('div', { class: 'hello' }, h('h1', null, 'Olá, ' + UI.first(v.name)), h('small', null, v.role + ' · ' + v.store.name + ' · CPF ' + v.cpf)),
      h('div', { class: 'clock' }, h('span', { class: 't', id: 'clk' }, clockText(now)), h('span', { class: 'd' }, C.fmtDayLong(C.todayISO(now))), h('span', { class: 'src' }, 'hora oficial do sistema')),
    ];
    const it = todayItem(v, now);
    nodes.push(todayCard(it, now));
    if (P.receipt) nodes.push(receiptCard(P.receipt));
    nodes.push(scheduleCard(v, now));
    // transparência: a pessoa vê o mesmo comparecimento que a loja usa para escalar (LGPD art. 9º)
    const hs = v.historico;
    if (hs && hs.ok + hs.falta + hs.just) {
      const faltas = hs.list.filter((x) => x.out !== 'presente');
      nodes.push(h('div', { class: 'card' }, h('h2', null, 'Seu comparecimento'),
        h('div', { class: 'pay' }, h('span', null, 'Turnos aceitos nos últimos 6 meses'), h('b', null, hs.ok + ' de ' + (hs.ok + hs.falta))),
        faltas.length ? h('div', { class: 'plist' }, faltas.map((x) => h('span', null, dl(x.date) + ' · ', h('b', null, x.out === 'falta' ? 'falta' : 'justificada')))) : h('p', { class: 'note' }, 'Nenhuma falta registrada.'),
        h('p', { class: 'note' }, 'Recusar uma convocação não conta. A loja usa isso só para organizar a escala. Se algo estiver errado (você veio e o ponto não registrou, ou teve um motivo), fale com a loja para corrigir.')));
    }
    const wk = C.weekStart(C.todayISO(now)); // paga-se por período: mostra o desta semana
    const total = v.items.filter((i) => i.date >= wk).reduce((a, i) => a + i.pay, 0);
    if (total > 0) nodes.push(h('div', { class: 'card' }, h('h2', null, 'A receber nesta semana'),
      h('div', { class: 'pay' }, h('span', null, 'Combinado dos dias trabalhados + 13º e férias + 1/3 proporcionais'), h('b', null, C.money2(total * (1 + v.reflexos)))),
      h('p', { class: 'note' }, 'Diária combinada ' + C.money2(v.daily_rate) + ', mais os adicionais combinados em cada dia. O pagamento sai ao fim de cada período trabalhado (CLT art. 452-A §6º).')));
    nodes.push(h('p', { class: 'note', style: { textAlign: 'center' } }, 'Link pessoal — não repasse. Vale até ' + dl(v.valid_until.slice(0, 10)) + ' ' + v.valid_until.slice(11, 16) + '. ',
      h('br'), 'Convocação de trabalho intermitente (CLT art. 452-A): sem resposta em 1 dia útil, conta como recusa.'));
    app.replaceChildren(...nodes);
  }

  const clockText = (d) => C.pad(d.getHours()) + ':' + C.pad(d.getMinutes()) + ':' + C.pad(d.getSeconds());

  function todayCard(it, now) {
    const card = h('div', { class: 'card', id: 'today' }, h('h2', null, 'Hoje'));
    if (!it) { card.append(h('p', { class: 'note' }, 'Você não tem turno hoje. Veja abaixo os próximos dias.')); return card; }
    card.append(h('div', { class: 'shiftline' }, h('span', { class: 't' }, it.start + '–' + it.end), h('small', null, it.break_min ? 'intervalo de ' + it.break_min + ' min' : 'sem intervalo')), combLine(it.combinado));
    if (it.status === 'pendente') {
      card.append(h('div', { class: 'why' }, h('b', null, 'Confirme antes'), h('span', null, 'Aceite a convocação para poder bater o ponto.')),
        h('div', { class: 'row' }, h('button', { class: 'punchbtn', onclick: () => answer(it, 'aceito') }, icon('check'), 'Aceitar'), h('button', { class: 'punchbtn alt', onclick: () => answer(it, 'recusado') }, 'Recusar')));
      return card;
    }
    if (it.punches.length) card.append(h('div', { class: 'plist' }, it.punches.map((p) => h('span', null, C.PUNCH_LABEL[p.type] + ' ', h('b', null, p.at.slice(11, 16))))));
    const next = C.pontoNext({ status: it.status, punches: it.punches }, it, now, P.view.ponto ? { ponto: P.view.ponto } : null);
    if (next.ok) {
      next.actions.forEach((a, i) => card.append(h('button', { class: 'punchbtn' + (i ? ' alt' : ''), disabled: P.busy || null, onclick: () => punch(it, a.type) }, icon(a.type === 'entrada' ? 'login' : a.type === 'saida' ? 'logout' : 'coffee'), a.label)));
      if (next.late > C.PONTO.tolerancia && next.actions[0].type === 'entrada') card.append(h('p', { class: 'note' }, 'Você está ' + next.late + ' min atrasado(a) — vai ficar registrado.'));
    } else if (next.code === 'fim') {
      const min = C.pontoWorked({ punches: it.punches }, null);
      card.append(h('div', { class: 'done' }, '✓ Turno encerrado · ' + C.fmtDur(min) + ' trabalhadas. Obrigado!'));
    } else {
      card.append(h('button', { class: 'punchbtn', disabled: true }, icon('lock'), next.code === 'intervalo' ? 'Voltar do intervalo' : 'Bater entrada'));
      const why = h('div', { class: 'why' }, h('b', null, next.code === 'cedo' ? 'Ainda não dá para bater' : next.code === 'intervalo' ? 'Intervalo em andamento' : 'Não dá agora'), h('span', null, next.msg));
      if (next.libera != null) why.append(h('span', { class: 'cd', id: 'cd', dataset: { at: String(next.libera) } }, countdown(next.libera, now)));
      card.append(why);
    }
    return card;
  }

  function countdown(liberaMin, now) {
    const left = Math.max(0, Math.ceil((liberaMin * 60 - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()))));
    const hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60), ss = left % 60;
    return 'faltam ' + (hh ? hh + 'h ' + C.pad(mm) + 'min' : mm + 'min ' + C.pad(ss) + 's');
  }

  // o combinado do dia: diária + adicional à parte (quando houver)
  const combLine = (p) => (p ? h('div', { class: 'comb' }, 'Combinado ', h('b', null, C.money2(p.total)), p.extra ? h('small', null, ' · diária ' + C.money2(p.daily) + ' + ' + C.money2(p.extra) + (p.note ? ' (' + p.note + ')' : '')) : null) : null);

  function receiptCard(r) {
    return h('div', { class: 'receipt' }, h('h3', null, icon('check'), 'Comprovante de registro de ponto'),
      h('span', { class: 'big' }, r.tipo + ' · ' + r.at.slice(11, 16)),
      h('dl', null,
        h('dt', null, 'NSR'), h('dd', null, String(r.nsr).padStart(9, '0')),
        h('dt', null, 'Data e hora'), h('dd', null, C.fmtDay(r.at.slice(0, 10)) + '/' + r.at.slice(0, 4) + ' ' + r.at.slice(11, 19)),
        h('dt', null, 'Nome'), h('dd', null, r.nome),
        h('dt', null, 'CPF'), h('dd', null, r.cpf),
        h('dt', null, 'Empresa'), h('dd', null, (r.empresa || '') + ' · ' + r.loja),
        r.late ? [h('dt', null, 'Atraso'), h('dd', null, r.late + ' min')] : null),
      h('p', { class: 'note' }, 'Modelo de demonstração. Guarde um print se quiser.'));
  }

  function scheduleCard(v, now) {
    const t = C.todayISO(now);
    const card = h('div', { class: 'card' }, h('h2', null, 'Sua escala'));
    const recent = v.items.filter((i) => i.date >= C.addDays(t, -7)); // o histórico mais antigo fica no resumo de comparecimento
    if (!recent.length) { card.append(h('p', { class: 'note' }, 'Nenhum dia convocado.')); return card; }
    recent.forEach((i) => {
      const body = h('div', { class: 'body' }, h('span', { class: 'tt' }, i.start + '–' + i.end), i.status !== 'recusado' ? combLine(i.combinado) : null);
      const st = i.status === 'pendente' ? h('span', { class: 'badge info' }, 'aguardando sua resposta')
        : i.status === 'recusado' ? h('span', { class: 'badge erro' }, 'recusado')
        : i.punches.some((p) => p.type === 'saida') ? h('span', { class: 'badge ok' }, '✓ trabalhado · ' + C.fmtDur(i.worked))
        : i.punches.length ? h('span', { class: 'badge lime' }, 'em andamento')
        : i.date < t ? h('span', { class: 'badge erro' }, 'sem ponto') : h('span', { class: 'badge ok' }, 'confirmado');
      body.append(h('div', null, st));
      if (i.status === 'pendente' && i.date >= t) body.append(h('div', { class: 'acts' }, h('button', { class: 'btn sm lime', onclick: () => answer(i, 'aceito') }, icon('check'), 'Aceitar'), h('button', { class: 'btn sm', onclick: () => answer(i, 'recusado') }, 'Recusar')));
      if (i.punches.length && i.date !== t) body.append(h('div', { class: 'plist' }, i.punches.map((p) => h('span', null, C.PUNCH_LABEL[p.type] + ' ', h('b', null, p.at.slice(11, 16))))));
      card.append(h('div', { class: 'conv' + (i.date === t ? ' today' : '') }, h('div', { class: 'dt' }, h('small', null, i.date === t ? 'hoje' : C.DOW_SHORT[C.dow(i.date)]), h('b', null, i.date.slice(8)), h('small', null, C.MONTHS[+i.date.slice(5, 7) - 1])), body));
    });
    return card;
  }

  async function answer(it, ans) {
    if (ans === 'recusado' && !window.confirm('Recusar ' + dl(it.date) + ' ' + it.start + '–' + it.end + '? O turno volta para a loja.')) return;
    try {
      P.view = await api.post('/api/ponto/responder', { t: token, conv_id: it.id, answer: ans });
      toast(ans === 'aceito' ? 'Confirmado! A loja já sabe.' : 'Recusado — a loja foi avisada.');
      render();
    } catch (e) { toast(e.message, 'erro'); load(); }
  }

  async function punch(it, type) {
    if (P.busy) return;
    P.busy = true;
    try {
      const r = await api.post('/api/ponto/bater', { t: token, conv_id: it.id, type });
      P.receipt = r.comprovante;
      P.view = r.view;
      if (navigator.vibrate) navigator.vibrate(60);
      toast(r.comprovante.tipo + ' registrada às ' + r.comprovante.at.slice(11, 16));
    } catch (e) { toast(e.message, 'erro'); await load(); }
    P.busy = false;
    render();
  }

  // relógio e contagem regressiva; quando a janela abre, redesenha para liberar o botão
  setInterval(() => {
    if (!P.view || !P.view.ok) return;
    const now = serverNow();
    const clk = document.getElementById('clk'); if (clk) clk.textContent = clockText(now);
    const cd = document.getElementById('cd');
    if (cd) { const at = +cd.dataset.at; if (now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 >= at) render(); else cd.textContent = countdown(at, now); }
  }, 1000);

  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) dead({ reason: 'invalido' });
  else {
    load();
    UI.live((ev) => { if (!P.busy && ev.type !== 'receipt') load(); }, (on) => document.getElementById('live').classList.toggle('on', on));
  }
  document.getElementById('brand').prepend(UI.logo());
})();
