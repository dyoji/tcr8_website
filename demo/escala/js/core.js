/* Escala (demo tCr8) — núcleo compartilhado entre o navegador e o Node.
 * Datas, feriados, horário da loja, previsão de movimento, cobertura por hora,
 * custo e o motor de regras da CLT. Nada aqui toca em DOM nem em disco. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EscalaCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- datas
  // Sempre 'YYYY-MM-DD'; a aritmética é em UTC para não depender de fuso.
  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  const addDays = (s, n) => iso(new Date(parse(s).getTime() + n * DAY));
  const dow = (s) => parse(s).getUTCDay(); // 0 = domingo
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
  function weekStart(s) { const w = dow(s); return addDays(s, w === 0 ? -6 : 1 - w); } // semana começa na segunda
  const weekDays = (ws) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(ws, i));
  function todayISO(now) { now = now || new Date(); return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()); }
  const nowMin = (now) => { now = now || new Date(); return now.getHours() * 60 + now.getMinutes(); };

  const DOW_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const DOW_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function fmtDay(s) { const d = parse(s); return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1); }
  function fmtDayLong(s) { const d = parse(s); return DOW_LONG[d.getUTCDay()] + ', ' + d.getUTCDate() + ' de ' + MONTHS_LONG[d.getUTCMonth()]; }
  function fmtWeek(ws) {
    const a = parse(ws), b = parse(addDays(ws, 6));
    if (a.getUTCMonth() === b.getUTCMonth()) return a.getUTCDate() + '–' + b.getUTCDate() + ' ' + MONTHS[b.getUTCMonth()] + ' ' + b.getUTCFullYear();
    return a.getUTCDate() + ' ' + MONTHS[a.getUTCMonth()] + ' – ' + b.getUTCDate() + ' ' + MONTHS[b.getUTCMonth()] + ' ' + b.getUTCFullYear();
  }

  // ---------------------------------------------------------------- horas
  function toMin(hhmm) { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); }
  function fromMin(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function fmtDur(min) { min = Math.round(min); const s = min < 0 ? '-' : ''; min = Math.abs(min); const h = Math.floor(min / 60), m = min % 60; return s + (m ? h + 'h' + pad(m) : h + 'h'); }
  // Início/fim do turno em minutos do dia do turno (fim pode passar de 1440 se virar a noite).
  function span(sh) { const s = toMin(sh.start); let e = toMin(sh.end); if (e <= s) e += 1440; return [s, e]; }
  const worked = (sh) => { const [s, e] = span(sh); return e - s - (sh.break_min || 0); };
  const overlap = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));
  const EPOCH = '2000-01-03';
  const absStart = (sh) => diffDays(EPOCH, sh.date) * 1440 + span(sh)[0];
  const absEnd = (sh) => diffDays(EPOCH, sh.date) * 1440 + span(sh)[1];
  // Intervalo obrigatório pela duração trabalhada (CLT art. 71).
  const breakFor = (workedMin) => (workedMin > 360 ? 60 : workedMin > 240 ? 15 : 0);
  // Maior jornada que cabe numa janela, já descontando o intervalo que ela exige.
  function maxWorkedIn(windowMin) {
    if (windowMin - 60 > 360) return windowMin - 60;
    if (windowMin - 15 > 240) return Math.min(360, windowMin - 15);
    return Math.min(240, windowMin);
  }
  function breakStart(sh) {
    const [s, e] = span(sh);
    if (sh.break_at) { let b = toMin(sh.break_at); if (b < s) b += 1440; return b; }
    return s + Math.round((e - s - (sh.break_min || 0)) / 2 / 30) * 30;
  }
  function presentAt(sh, m) { // m em minutos do dia do turno
    const [s, e] = span(sh);
    if (m < s || m >= e) return false;
    if (sh.break_min) { const b = breakStart(sh); if (m >= b && m < b + sh.break_min) return false; }
    return true;
  }
  const onBreakAt = (sh, m) => { const [s, e] = span(sh); if (m < s || m >= e || !sh.break_min) return false; const b = breakStart(sh); return m >= b && m < b + sh.break_min; };

  // ---------------------------------------------------------------- feriados (nacionais + SP)
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return y + '-' + pad(month) + '-' + pad(day);
  }
  const _hol = {};
  function holidaysOf(y) {
    if (_hol[y]) return _hol[y];
    const e = easter(y), list = {};
    const add = (d, name, kind) => { list[d] = { date: d, name, kind }; };
    add(y + '-01-01', 'Confraternização Universal', 'nacional');
    add(y + '-01-25', 'Aniversário de São Paulo', 'municipal');
    add(addDays(e, -48), 'Carnaval', 'facultativo');
    add(addDays(e, -47), 'Carnaval', 'facultativo');
    add(addDays(e, -2), 'Sexta-feira Santa', 'nacional');
    add(y + '-04-21', 'Tiradentes', 'nacional');
    add(y + '-05-01', 'Dia do Trabalho', 'nacional');
    add(addDays(e, 60), 'Corpus Christi', 'municipal');
    add(y + '-07-09', 'Revolução Constitucionalista', 'estadual');
    add(y + '-09-07', 'Independência', 'nacional');
    add(y + '-10-12', 'Nossa Senhora Aparecida', 'nacional');
    add(y + '-11-02', 'Finados', 'nacional');
    add(y + '-11-15', 'Proclamação da República', 'nacional');
    add(y + '-11-20', 'Consciência Negra', 'nacional');
    add(y + '-12-25', 'Natal', 'nacional');
    return (_hol[y] = list);
  }
  const holiday = (s) => holidaysOf(+s.slice(0, 4))[s] || null;
  const isHoliday = (s) => { const h = holiday(s); return !!h && h.kind !== 'facultativo'; };
  function nextHoliday(from, days) {
    for (let i = 0; i <= (days || 60); i++) { const d = addDays(from, i); if (isHoliday(d)) return holiday(d); }
    return null;
  }

  // ---------------------------------------------------------------- loja
  // hours: { '0'..'6': ['10:00','22:00'] | null, holiday: [...] | null }
  function storeWindow(store, date) {
    const key = isHoliday(date) ? 'holiday' : String(dow(date));
    const w = store.hours[key] === undefined ? store.hours[String(dow(date))] : store.hours[key];
    return w ? { open: toMin(w[0]), close: toMin(w[1]) } : null;
  }
  // Janela da equipe: chega antes de abrir e sai depois de fechar o caixa.
  const staffWindow = (store, date) => {
    const w = storeWindow(store, date); if (!w) return null;
    return { start: w.open - (store.prep_before ?? 20), end: w.close + (store.prep_after ?? 10), open: w.open, close: w.close };
  };

  // Ruído determinístico (mesma previsão em todo lugar).
  function rand(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; }

  // Previsão de movimento por hora e pessoas necessárias.
  // No demo vem de um perfil da loja; em produção sai do histórico do PDV (média das últimas semanas, mesmo dia e hora).
  function demandCurve(store, date) {
    const win = storeWindow(store, date); if (!win) return [];
    const d = store.demand, wd = dow(date);
    let daily = d.daily[wd] * (isHoliday(date) ? (d.holiday_factor || 1) : 1);
    daily *= 0.92 + 0.16 * rand(store.id + date);
    const hs = []; for (let h = Math.floor(win.open / 60); h * 60 < win.close; h++) hs.push(h);
    const w = hs.map((h) => (d.curve[h] != null ? d.curve[h] : 0.6)); const sw = w.reduce((a, b) => a + b, 0) || 1;
    return hs.map((h, i) => {
      const sales = Math.round((daily * w[i]) / sw / 10) * 10;
      return { h, sales, need: Math.max(d.min_staff, Math.ceil(sales / d.splh)) };
    });
  }
  // Presença por hora (amostra em h:30, descontando o intervalo).
  function coverage(store, date, dayShifts, curve) {
    curve = curve || demandCurve(store, date);
    return curve.map((c) => {
      const m = c.h * 60 + 30;
      const who = dayShifts.filter((s) => s.employee_id && presentAt(s, m));
      const open = dayShifts.filter((s) => !s.employee_id && presentAt(s, m)).length;
      return { h: c.h, sales: c.sales, need: c.need, have: who.length, open, who: who.map((s) => s.employee_id) };
    });
  }

  // ---------------------------------------------------------------- regimes e contrato
  // PEC 221/2019 (fim da 6x1): aprovada na Câmara (mai/2026) e no Senado (14/10/2026), aguardando promulgação.
  // Fase 1 (60 dias após promulgar): teto de 42h e 2 folgas; fase final (14 meses): 40h. Na transição a
  // convenção pode alongar o dia, respeitando o teto da semana — por isso a fase 1 aceita 8h24 por dia.
  const REGIMES = {
    clt: { id: 'clt', label: 'CLT atual', short: '44h · 6x1', weekly: 44 * 60, daily: 480, folgas_min: 1, sunday_pref: false, law: 'CF art. 7º XIII · CLT art. 58' },
    pec42: { id: 'pec42', label: 'PEC · fase 1', short: '42h · 2 folgas', weekly: 42 * 60, daily: 504, folgas_min: 2, sunday_pref: true, law: 'PEC 221/2019 (transição)' },
    pec40: { id: 'pec40', label: 'PEC · final', short: '40h · 2 folgas', weekly: 40 * 60, daily: 480, folgas_min: 2, sunday_pref: true, law: 'PEC 221/2019' },
  };
  // Com acordo de compensação semanal (CLT art. 59 §2º) a semana de 5 dias pode ter até 8h48 por dia sem virar hora extra.
  function regimeOf(settings) {
    const r = REGIMES[(settings && settings.regime) || 'clt'] || REGIMES.clt;
    const comp = settings && settings.rules && settings.rules.compensacao !== false;
    return comp && r.id === 'clt' ? Object.assign({}, r, { daily: 528 }) : r;
  }
  const isMinor = (emp, date) => { if (!emp.birth) return false; const b = parse(emp.birth), d = parse(date); let age = d.getUTCFullYear() - b.getUTCFullYear(); if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age--; return age < 18; };
  const weeklyLimit = (emp, regime) => Math.min((emp.weekly_hours || 44) * 60, regime.weekly);
  const contractDays = (emp, regime) => Math.min(7 - regime.folgas_min, emp.days || ((emp.weekly_hours || 44) <= 30 ? 5 : 6));
  const dailyNormal = (emp, regime) => (emp.contract === 'aprendiz' ? 360 : emp.contract === 'parcial' ? Math.min(480, Math.ceil((emp.weekly_hours * 60) / (emp.days || 5))) : (regime && regime.daily) || 480);
  const dailyMax = (emp, regime) => (emp.contract === 'aprendiz' ? 360 : emp.contract === '12x36' ? 720 : dailyNormal(emp, regime) + 120);
  function dailyTarget(emp, regime) { return Math.min(dailyNormal(emp, regime), Math.round(weeklyLimit(emp, regime) / contractDays(emp, regime) / 10) * 10); }

  // Turno sugerido para um modelo (abre / meio / fecha) respeitando o contrato e a janela da loja.
  function suggestShift(store, emp, date, anchor, regime, workedMin) {
    const sw = staffWindow(store, date); if (!sw) return null;
    const room = sw.end - sw.start;
    let wk = Math.min(workedMin || (emp ? dailyTarget(emp, regime) : 440), maxWorkedIn(room));
    const br = breakFor(wk), len = wk + br;
    let start;
    if (anchor === 'abre') start = sw.start;
    else if (anchor === 'fecha') start = sw.end - len;
    else start = sw.start + Math.round((room - len) / 2 / 10) * 10;
    if (emp && isMinor(emp, date) && start + len > 22 * 60) start = 22 * 60 - len; // menor não trabalha depois das 22h
    start = Math.max(sw.start, start);
    return { start: fromMin(start), end: fromMin(start + len), break_min: br };
  }

  const ABSENCE_TYPES = {
    folga: { label: 'Folga', color: '#8A8E82', blocks: true },
    ferias: { label: 'Férias', color: '#27ae60', blocks: true },
    atestado: { label: 'Atestado', color: '#3498db', blocks: true },
    afastamento: { label: 'Afastamento', color: '#2980b9', blocks: true },
    curso: { label: 'Curso/treinamento', color: '#9b59b6', blocks: true },
  };
  const absenceOn = (absences, empId, date) => absences.find((a) => a.employee_id === empId && a.status !== 'negado' && a.date_ini <= date && a.date_end >= date) || null;

  // ---------------------------------------------------------------- regras
  // Devolve os apontamentos da semana: { key, sev: 'erro'|'alerta'|'info', code, emp, date, ids, title, detail, law }.
  // shifts = turnos da loja desde 7 semanas antes até o fim da semana (o histórico alimenta descanso, 7º dia e domingos).
  // key identifica o apontamento para guardar a justificativa de quem decidiu manter.
  function validate(ctx) {
    const { settings, store, employees, shifts, absences, weekStart: ws } = ctx;
    const rules = (settings && settings.rules) || {};
    const regime = regimeOf(settings);
    const days = weekDays(ws), we = days[6];
    const inWeek = (d) => d >= ws && d <= we;
    const out = [];
    const push = (sev, code, emp, date, ids, title, detail, law) => out.push({ key: [code, emp ? emp.id : store.id, date || ws].join('|'), sev, code, emp: emp ? emp.id : null, date, ids: ids || [], title, detail: detail || '', law: law || '' });
    const firstName = (e) => e.name.split(' ')[0];
    const dlabel = (d) => DOW_SHORT[dow(d)] + ' ' + fmtDay(d);
    const opensSunday = !!store.hours['0'];
    const sunWindow = store.sunday_window || 3; // comércio: 1 domingo a cada 3 semanas

    for (const emp of employees) {
      const mine = shifts.filter((s) => s.employee_id === emp.id).sort((a, b) => absStart(a) - absStart(b));
      const week = mine.filter((s) => inWeek(s.date));
      const n = firstName(emp);

      // sobreposição, descanso entre jornadas (11h) e descanso semanal + interjornada (35h)
      for (let i = 1; i < mine.length; i++) {
        const a = mine[i - 1], b = mine[i];
        if (!inWeek(b.date)) continue;
        const gap = absStart(b) - absEnd(a);
        if (gap < 0) push('erro', 'sobreposicao', emp, b.date, [a.id, b.id], n + ': turnos sobrepostos', dlabel(b.date) + ' — dois turnos ao mesmo tempo.', '');
        else if (a.date === b.date) { if (gap > 120) push('alerta', 'intervalo_longo', emp, b.date, [a.id, b.id], n + ': intervalo de ' + fmtDur(gap), 'Turno partido com intervalo acima de 2h exige acordo escrito.', 'CLT art. 71'); }
        else if (gap < 660) push('erro', 'interjornada', emp, b.date, [a.id, b.id], n + ': só ' + fmtDur(gap) + ' de descanso', 'Sai ' + dlabel(a.date) + ' às ' + a.end + ' e volta ' + dlabel(b.date) + ' às ' + b.start + '. O mínimo entre jornadas é 11h.', 'CLT art. 66');
        else if (diffDays(a.date, b.date) >= 2 && gap < 2100) push('alerta', 'dsr_35h', emp, b.date, [a.id, b.id], n + ': folga com ' + fmtDur(gap) + ' livres', 'Folga semanal (24h) + descanso entre jornadas (11h) somam 35h; aqui não fecham.', 'Súmula 110 TST');
      }

      // por dia
      const byDay = {};
      week.forEach((s) => { (byDay[s.date] = byDay[s.date] || []).push(s); });
      let nightMin = 0;
      for (const d of Object.keys(byDay)) {
        const list = byDay[d], ids = list.map((s) => s.id);
        const w = list.reduce((a, s) => a + worked(s), 0);
        const ab = absenceOn(ctx.absences, emp.id, d);
        if (ab) push('erro', 'ausencia', emp, d, ids, n + ' está de ' + (ABSENCE_TYPES[ab.type] || { label: ab.type }).label.toLowerCase(), dlabel(d) + ' — escalada num dia em que não pode trabalhar.' + (ab.note ? ' (' + ab.note + ')' : ''), '');
        if (w > dailyMax(emp, regime)) push('erro', 'jornada', emp, d, ids, n + ': ' + fmtDur(w) + ' no dia', emp.contract === 'aprendiz' ? 'Aprendiz: no máximo 6h por dia, sem hora extra.' : 'Passa de 2h extras no dia.', emp.contract === 'aprendiz' ? 'CLT art. 432' : 'CLT art. 59');
        else if (w > dailyNormal(emp, regime)) push(isMinor(emp, d) ? 'erro' : 'alerta', 'hora_extra', emp, d, ids, n + ': ' + fmtDur(w - dailyNormal(emp, regime)) + ' de hora extra', dlabel(d) + ' — ' + fmtDur(w) + ' trabalhadas.' + (isMinor(emp, d) ? ' Menor de idade não faz hora extra.' : ''), isMinor(emp, d) ? 'CLT art. 413' : 'CLT art. 59');
        for (const s of list) {
          const wk = worked(s), br = s.break_min || 0;
          if (wk > 360 && br < 60) push('erro', 'intrajornada', emp, d, [s.id], n + ': intervalo de ' + br + ' min', 'Jornada acima de 6h exige no mínimo 1h de intervalo (30 min só com convenção).', 'CLT art. 71 · art. 611-A III');
          else if (wk > 240 && wk <= 360 && br < 15) push('erro', 'intrajornada', emp, d, [s.id], n + ': sem os 15 min de intervalo', 'Jornada entre 4h e 6h exige 15 min de intervalo.', 'CLT art. 71 §1º');
          if (br > 120) push('alerta', 'intervalo_longo', emp, d, [s.id], n + ': intervalo de ' + fmtDur(br), 'Intervalo acima de 2h exige acordo escrito.', 'CLT art. 71');
          const [ss, se] = span(s);
          const night = overlap(ss, se, 1320, 1740) + overlap(ss, se, 0, 300); // 22h–5h
          if (night > 0) {
            if (isMinor(emp, d)) push('erro', 'menor_noturno', emp, d, [s.id], n + ' é menor e trabalha até ' + s.end, 'Menor de 18 anos não pode trabalhar entre 22h e 5h.', 'CF art. 7º XXXIII · CLT art. 404');
            nightMin += night;
          }
          const sw = staffWindow(store, d);
          if (!sw) push('alerta', 'loja_fechada', emp, d, [s.id], n + ' escalada com a loja fechada', dlabel(d) + ' a loja não abre.', '');
          else if (ss < sw.start - 40 || se > sw.end + 40) push('alerta', 'fora_horario', emp, d, [s.id], n + ': turno fora do horário da loja', dlabel(d) + ' a loja funciona ' + fromMin(sw.open) + '–' + fromMin(sw.close) + '.', '');
          for (const u of emp.unavail || []) {
            if (!u.dow.includes(dow(d))) continue;
            if (ss < toMin(u.to) && se > toMin(u.from)) push('alerta', 'disponibilidade', emp, d, [s.id], n + ' não está disponível', dlabel(d) + ' ' + u.from + '–' + u.to + (u.reason ? ' (' + u.reason + ')' : '') + '.', '');
          }
          if (isHoliday(d)) {
            if (!store.holiday_cct) push('erro', 'feriado', emp, d, [s.id], n + ' escalada no feriado sem convenção', holiday(d).name + ' — no comércio, trabalhar em feriado depende de autorização em convenção coletiva.', 'Lei 10.101 art. 6º-A');
            else if (rules.feriado !== false) push('info', 'feriado', emp, d, [s.id], n + ' trabalha no feriado', holiday(d).name + ' — pagar em dobro ou dar folga compensatória.', 'Lei 605/49 art. 9º · Súmula 146 TST');
          }
        }
      }
      if (rules.noturno !== false && nightMin > 0) push('info', 'noturno', emp, null, [], n + ': ' + nightMin + ' min depois das 22h', 'Gera adicional noturno de 20% (hora noturna de 52min30s).', 'CLT art. 73');

      // cargo do turno × aptidões da pessoa
      for (const s of week) {
        if (s.role_id && !isApt(emp, s.role_id)) {
          const rn = ((ctx.roles || []).find((r) => r.id === s.role_id) || { name: s.role_id }).name;
          push('alerta', 'apto', emp, s.date, [s.id], n + ' não está habilitado(a) para ' + rn, dlabel(s.date) + ' — escalado(a) como ' + rn + '. Marque a aptidão em Cargos e aptidões ou troque a pessoa.', '');
        }
      }

      // semana (o freela intermitente é convocado por dia: não tem jornada semanal contratada)
      const total = week.reduce((a, s) => a + worked(s), 0);
      const limit = weeklyLimit(emp, regime);
      if (!isFreela(emp) && total > limit) {
        const strict = emp.contract === 'aprendiz' || emp.contract === 'parcial';
        push(strict ? 'erro' : 'alerta', 'semana', emp, null, week.map((s) => s.id), n + ': ' + fmtDur(total) + ' na semana', (strict ? 'Contrato ' + (emp.contract === 'aprendiz' ? 'de aprendiz' : 'parcial') + ' não admite hora extra. ' : '') + 'Limite de ' + fmtDur(limit) + (regime.id !== 'clt' && emp.weekly_hours * 60 > limit ? ' pela PEC' : '') + '; o que passar vira hora extra (50%).', emp.contract === 'parcial' ? 'CLT art. 58-A' : emp.contract === 'aprendiz' ? 'CLT art. 432' : regime.law);
      }
      const workedDates = new Set(mine.map((s) => s.date));
      const weekWorkDays = days.filter((d) => workedDates.has(d)).length;
      if (!isFreela(emp) && regime.folgas_min >= 2 && weekWorkDays > 7 - regime.folgas_min) push('erro', 'folgas_pec', emp, null, week.map((s) => s.id), n + ': ' + weekWorkDays + ' dias na semana', 'Com a PEC são duas folgas por semana (não precisam ser seguidas).', regime.law);

      // 7º dia seguido (DSR)
      let run = 0;
      for (let d = addDays(ws, -14); d <= we; d = addDays(d, 1)) {
        run = workedDates.has(d) ? run + 1 : 0;
        if (run === 7 && inWeek(d)) push('erro', 'dsr', emp, d, mine.filter((s) => s.date === d).map((s) => s.id), n + ': 7º dia seguido sem folga', dlabel(d) + ' — o descanso semanal tem que cair dentro de cada 7 dias (senão é pago em dobro).', 'CLT art. 67 · OJ 410 TST');
      }

      // domingos
      if (opensSunday && workedDates.has(we)) {
        const streak = (() => { let k = 0; for (let d = we; workedDates.has(d); d = addDays(d, -7)) k++; return k; })();
        if (streak >= sunWindow) push('erro', 'domingo', emp, we, mine.filter((s) => s.date === we).map((s) => s.id), n + ': ' + streak + 'º domingo seguido', sunWindow === 3 ? 'No comércio a folga tem que cair num domingo pelo menos uma vez a cada 3 semanas.' : 'A folga tem que coincidir com um domingo pelo menos uma vez a cada ' + sunWindow + ' semanas.', sunWindow === 3 ? 'Lei 10.101/2000 art. 6º' : 'CLT art. 67 · Portaria 671/2021');
        else if (rules.art386 !== false && emp.gender === 'F' && streak >= 2) push('erro', 'domingo_386', emp, we, mine.filter((s) => s.date === we).map((s) => s.id), n + ': 2º domingo seguido', 'Para mulheres, a folga dominical é quinzenal (o STF manteve a regra).', 'CLT art. 386 · STF RE 1.403.904');
        else if (regime.sunday_pref && streak >= 4) push('info', 'domingo_pec', emp, we, [], n + ': 4 domingos seguidos', 'A PEC pede que uma das folgas caia preferencialmente no domingo.', regime.law);
      }
    }

    // loja: cobertura, chave e turnos abertos
    for (const d of days) {
      const sw = staffWindow(store, d); if (!sw) continue;
      const dayShifts = shifts.filter((s) => s.date === d);
      const cov = coverage(store, d, dayShifts);
      let i = 0;
      while (i < cov.length) {
        if (cov[i].have + cov[i].open >= cov[i].need) { i++; continue; }
        let j = i, worst = 0;
        while (j < cov.length && cov[j].have + cov[j].open < cov[j].need) { worst = Math.max(worst, cov[j].need - cov[j].have - cov[j].open); j++; }
        push('alerta', 'cobertura', null, d, [], dlabel(d) + ' ' + cov[i].h + 'h–' + (cov[j - 1].h + 1) + 'h: falta' + (worst > 1 ? 'm ' + worst + ' pessoas' : ' 1 pessoa'), 'Abaixo do previsto para o movimento.', '');
        Object.assign(out[out.length - 1], { key: out[out.length - 1].key + '|' + cov[i].h, h0: cov[i].h, h1: cov[j - 1].h + 1 });
        i = j;
      }
      if (store.key_required && dayShifts.some((s) => s.employee_id)) {
        const keyIds = new Set(employees.filter((e) => (e.skills || []).includes('chave')).map((e) => e.id));
        const hasKeyAt = (m) => dayShifts.some((s) => keyIds.has(s.employee_id) && span(s)[0] <= m && span(s)[1] >= m);
        if (!hasKeyAt(sw.open - 5)) { push('alerta', 'chave', null, d, [], dlabel(d) + ': ninguém com a chave na abertura', 'Escale a gerência ou alguém com a chave até ' + fromMin(sw.open - 5) + '.', ''); out[out.length - 1].key += '|abre'; }
        if (!hasKeyAt(sw.close + 5)) { push('alerta', 'chave', null, d, [], dlabel(d) + ': ninguém com a chave no fechamento', 'Escale a gerência ou alguém com a chave até ' + fromMin(sw.close + 5) + '.', ''); out[out.length - 1].key += '|fecha'; }
      }
      const opens = dayShifts.filter((s) => !s.employee_id);
      if (opens.length) push('info', 'aberto', null, d, opens.map((s) => s.id), dlabel(d) + ': ' + opens.length + (opens.length > 1 ? ' turnos abertos' : ' turno aberto'), 'Sem ninguém escalado — a equipe pode pegar pelo celular.', '');
    }

    // freela intermitente: prazo da convocação, resposta e ponto
    if (ctx.convocations) {
      const now = ctx.now || new Date(), today = todayISO(now), nm = now.getHours() * 60 + now.getMinutes();
      const empById = Object.fromEntries(employees.map((e) => [e.id, e]));
      for (const c of ctx.convocations) {
        const sh = shifts.find((x) => x.id === c.shift_id);
        const emp = empById[c.employee_id];
        if (!sh || !emp || !inWeek(sh.date) || c.status === 'recusado') continue;
        const n = firstName(emp) + ' (freela)';
        const hoursAhead = (diffDays(c.sent_at.slice(0, 10), sh.date) * 1440 + span(sh)[0] - toMin(c.sent_at.slice(11, 16))) / 60;
        if (hoursAhead < 72) push('alerta', 'convocacao_prazo', emp, sh.date, [sh.id], n + ': convocada com ' + (hoursAhead < 24 ? Math.max(0, Math.round(hoursAhead)) + 'h' : Math.floor(hoursAhead / 24) + ' dia' + (hoursAhead >= 48 ? 's' : '')) + ' de antecedência', 'O intermitente tem que ser convocado com pelo menos 3 dias corridos, já sabendo a jornada.', 'CLT art. 452-A §1º');
        if (c.status === 'pendente') push('info', 'convocacao_pendente', emp, sh.date, [sh.id], n + ' ainda não respondeu', dlabel(sh.date) + ' ' + sh.start + '–' + sh.end + '. Sem resposta em 1 dia útil, vale como recusa.', 'CLT art. 452-A §2º');
        const P = c.punches || [];
        const ended = sh.date < today || (sh.date === today && nm >= span(sh)[1]);
        if (c.status === 'aceito' && !c.attendance && !P.some((p) => p.type === 'entrada') && (ended || (sh.date === today && nm > span(sh)[0] + PONTO.tolerancia)))
          push('alerta', 'freela_sem_ponto', emp, sh.date, [sh.id], n + (ended ? ': faltou' : ': ainda sem ponto de entrada'), dlabel(sh.date) + ' — a entrada era às ' + sh.start + '.' + (ended ? ' Se veio e esqueceu o ponto, ou se tinha motivo, marque na ficha.' : ''), '');
        const late = (P.find((p) => p.type === 'entrada') || {}).late || 0;
        if (late > 0) push('info', 'freela_atraso', emp, sh.date, [sh.id], n + ': chegou ' + late + ' min depois do horário', dlabel(sh.date) + ' — tolerância de 5 min por marcação (10 min no dia).', 'CLT art. 58 §1º');
        // histórico: quem costuma faltar nesse dia da semana (o gestor decide; o sistema só avisa)
        if (!ended && !P.length && c.status !== 'recusado') {
          const st = freelaAttendance(ctx.convocations.filter((x) => x.employee_id === emp.id), now).byDow[dow(sh.date)];
          if (st.ok + st.falta >= 2 && st.rate < 0.7) push('alerta', 'freela_risco', emp, sh.date, [sh.id], n + ' veio a ' + st.ok + ' de ' + (st.ok + st.falta) + ' ' + dowPlural(dow(sh.date)) + ' aceitos', 'Nos últimos 6 meses. Vale deixar alguém de reserva para ' + dlabel(sh.date) + '.', '');
        }
      }
    }

    const order = { erro: 0, alerta: 1, info: 2 };
    return out.sort((a, b) => order[a.sev] - order[b.sev] || String(a.date || '').localeCompare(String(b.date || '')));
  }

  // ---------------------------------------------------------------- custo
  // Salário mensal é fixo: a folha da semana não cai quando a jornada diminui (a PEC não reduz salário).
  // O que muda é o custo por hora trabalhada, a hora extra e o que custa cobrir as horas que faltam.
  const ENCARGOS = 1.7, WEEKS_MONTH = 4.345;
  const weeklyCost = (emp) => ((emp.salary || 0) * ENCARGOS) / WEEKS_MONTH;
  const hourCost = (emp, regime) => weeklyCost(emp) / (weeklyLimit(emp, regime) / 60);
  // Intermitente recebe ao fim de cada período a hora + 13º proporcional (1/12) + férias proporcionais com 1/3 (1/9).
  const FREELA_REFLEXOS = 1 / 12 + 1 / 9;
  const isFreela = (e) => !!e && e.contract === 'freela';
  const freelaCost = (e, minutes) => (minutes / 60) * (e.rate_hour || 0) * (1 + FREELA_REFLEXOS);

  // ---------------------------------------------------------------- números da semana
  function weekStats(ctx) {
    const { store, employees, shifts, weekStart: ws, settings } = ctx;
    const regime = regimeOf(settings);
    const days = weekDays(ws);
    const emp = Object.fromEntries(employees.map((e) => [e.id, e]));
    const staff = employees.filter((e) => !isFreela(e));
    const avgHour = staff.reduce((a, e) => a + hourCost(e, regime), 0) / (staff.length || 1);
    const payroll = staff.reduce((a, e) => a + weeklyCost(e), 0);
    let minutes = 0, sales = 0, needH = 0, metH = 0, openCount = 0, openCost = 0, freelas = 0;
    const perEmp = {}, perDay = {};
    for (const d of days) {
      const ds = shifts.filter((s) => s.date === d);
      const curve = demandCurve(store, d);
      const cov = coverage(store, d, ds, curve);
      let dm = 0, dc = 0;
      for (const s of ds) {
        const w = worked(s);
        dm += w;
        if (!s.employee_id) { openCount++; const x = (w / 60) * avgHour * 1.5; dc += x; openCost += x; continue; }
        const e = emp[s.employee_id]; if (!e) continue;
        const p = (perEmp[e.id] = perEmp[e.id] || { minutes: 0, days: 0, cost: 0, overtime: 0 });
        p.minutes += w; p.days++;
        if (isFreela(e)) { const x = freelaCost(e, w); dc += x; p.cost += x; freelas += x; continue; }
        dc += (w / 60) * hourCost(e, regime);
      }
      const daySales = curve.reduce((a, x) => a + x.sales, 0);
      const dn = cov.reduce((a, x) => a + x.need, 0), dmet = cov.reduce((a, x) => a + Math.min(x.need, x.have + x.open), 0);
      perDay[d] = { minutes: dm, cost: dc, sales: daySales, cov, need: dn, met: dmet, people: new Set(ds.filter((s) => s.employee_id).map((s) => s.employee_id)).size };
      minutes += dm; sales += daySales; needH += dn; metH += dmet;
    }
    let overtime = 0;
    for (const e of staff) {
      const p = perEmp[e.id] || (perEmp[e.id] = { minutes: 0, days: 0, cost: 0, overtime: 0 });
      const extra = Math.max(0, p.minutes - weeklyLimit(e, regime));
      p.overtime = (extra / 60) * hourCost(e, regime) * 1.5;
      p.cost = weeklyCost(e) + p.overtime;
      overtime += p.overtime;
    }
    const cost = payroll + overtime + openCost + freelas;
    return {
      minutes, sales, payroll, overtime, openCost, freelas, cost, cost_pct: sales ? (cost / sales) * 100 : 0,
      hour_cost: minutes ? cost / (minutes / 60) : 0,
      coverage_pct: needH ? (metH / needH) * 100 : 100, open: openCount, perEmp, perDay,
    };
  }

  const money = (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  const money2 = (v) => 'R$ ' + (Math.round(v * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ---------------------------------------------------------------- ponto do freela (pelo link)
  // Libera a entrada 15 min antes; atraso conta acima de 5 min (CLT art. 58 §1º); a volta do intervalo
  // só libera depois do intervalo escalado. Quem decide é esta função — a tela e a rota usam a mesma.
  const PONTO = { antes: 15, tolerancia: 5 };
  const PUNCH_LABEL = { entrada: 'Entrada', intervalo_ini: 'Saída para o intervalo', intervalo_fim: 'Volta do intervalo', saida: 'Saída' };
  const stampMin = (at) => toMin(at.slice(11, 16)) + (+at.slice(17, 19) || 0) / 60;
  function pontoNext(conv, shift, now, settings) {
    const cfg = Object.assign({}, PONTO, settings && settings.ponto);
    const today = todayISO(now), m = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const [s, e] = span(shift);
    const P = conv.punches || [];
    const has = (t) => P.some((p) => p.type === t);
    if (conv.status === 'pendente') return { ok: false, code: 'aceite', msg: 'Aceite a convocação antes de bater o ponto.' };
    if (conv.status !== 'aceito') return { ok: false, code: 'recusado', msg: 'Você recusou esse turno.' };
    if (has('saida')) return { ok: false, code: 'fim', msg: 'Turno encerrado. Obrigado!' };
    if (shift.date > today) return { ok: false, code: 'futuro', msg: 'Esse turno é ' + DOW_LONG[dow(shift.date)] + ', ' + fmtDay(shift.date) + ', às ' + shift.start + '.' };
    if (shift.date < today && !has('entrada')) return { ok: false, code: 'passou', msg: 'Esse dia já passou.' };
    if (!has('entrada')) {
      const libera = s - cfg.antes;
      if (m < libera) return { ok: false, code: 'cedo', libera, msg: 'Sua entrada é às ' + shift.start + '. O ponto libera às ' + fromMin(libera) + '.' };
      if (m >= e) return { ok: false, code: 'tarde', msg: 'O horário desse turno já acabou (' + shift.end + '). Fale com a gerência.' };
      return { ok: true, actions: [{ type: 'entrada', label: 'Bater entrada' }], late: Math.max(0, Math.floor(m - s)) };
    }
    const brk = shift.break_min || 0;
    if (has('intervalo_ini') && !has('intervalo_fim')) {
      const volta = stampMin(P.find((p) => p.type === 'intervalo_ini').at) + brk;
      if (m < volta) return { ok: false, code: 'intervalo', libera: volta, msg: 'Intervalo de ' + brk + ' min: a volta libera às ' + fromMin(Math.ceil(volta)) + '.' };
      return { ok: true, actions: [{ type: 'intervalo_fim', label: 'Voltar do intervalo' }] };
    }
    const actions = [];
    if (brk && !has('intervalo_ini')) actions.push({ type: 'intervalo_ini', label: 'Sair para o intervalo' });
    actions.push({ type: 'saida', label: 'Encerrar o turno' });
    return { ok: true, actions };
  }
  // Minutos trabalhados pelas marcações (até agora, se o turno ainda não acabou).
  function pontoWorked(conv, now) {
    const P = conv.punches || [];
    const at = (t) => { const p = P.find((x) => x.type === t); return p ? stampMin(p.at) : null; };
    const ent = at('entrada'); if (ent == null) return 0;
    const nowM = now ? now.getHours() * 60 + now.getMinutes() : ent;
    const sai = at('saida') != null ? at('saida') : nowM;
    const bi = at('intervalo_ini'), bf = at('intervalo_fim') != null ? at('intervalo_fim') : bi != null ? nowM : null;
    return Math.max(0, Math.round(sai - ent - (bi != null ? bf - bi : 0)));
  }

  // ---------------------------------------------------------------- aptidões
  // Cargo principal + cargos em que a pessoa também pode trabalhar.
  const aptos = (e) => (e ? Array.from(new Set([e.role_id].concat(e.apt || []))).filter(Boolean) : []);
  const isApt = (e, roleId) => aptos(e).includes(roleId);

  // ---------------------------------------------------------------- comparecimento do freela
  // Conta só convocações ACEITAS: recusar é direito do intermitente e não pesa (CLT art. 452-A §3º).
  // Falta = aceitou e não bateu entrada até o fim do turno; o gestor pode marcar "justificada" ou "compareceu".
  // Janela de 6 meses: o suficiente para escalar, sem guardar avaliação para sempre (LGPD art. 6º III).
  const ATTEND_DAYS = 182;
  function attendanceOf(c, now) {
    if (!c.shift || c.status !== 'aceito') return null;
    if (c.attendance) return c.attendance; // 'presente' | 'justificada' | 'falta'
    if ((c.punches || []).some((p) => p.type === 'entrada')) return 'presente';
    const today = todayISO(now), nm = now.getHours() * 60 + now.getMinutes();
    if (c.shift.date < today || (c.shift.date === today && nm >= span(c.shift)[1])) return 'falta';
    return null; // ainda não deu para saber
  }
  function freelaAttendance(convs, now) {
    now = now || new Date();
    const since = addDays(todayISO(now), -ATTEND_DAYS);
    const mk = () => ({ ok: 0, falta: 0, just: 0, late: 0, rate: null });
    const tot = Object.assign(mk(), { recusas: 0, list: [] });
    const byDow = [0, 1, 2, 3, 4, 5, 6].map(mk);
    for (const c of convs) {
      if (!c.shift || c.shift.date < since) continue;
      if (c.status === 'recusado') { if (!c.canceled) tot.recusas++; continue; }
      const out = attendanceOf(c, now);
      if (!out) continue;
      const k = out === 'presente' ? 'ok' : out === 'falta' ? 'falta' : 'just';
      const d = byDow[dow(c.shift.date)];
      tot[k]++; d[k]++;
      const ent = (c.punches || []).find((p) => p.type === 'entrada');
      if (ent && ent.late) { tot.late++; d.late++; }
      tot.list.push({ id: c.id, date: c.shift.date, start: c.shift.start, end: c.shift.end, out, reason: c.attendance_reason || null, late: ent ? ent.late || 0 : 0 });
    }
    for (const x of byDow.concat([tot])) x.rate = x.ok + x.falta ? x.ok / (x.ok + x.falta) : null;
    tot.list.sort((a, b) => b.date.localeCompare(a.date));
    return Object.assign(tot, { byDow });
  }
  const dowPlural = (w) => DOW_LONG[w] + (w === 0 || w === 6 ? 's' : 's-feiras');
  const rateText = (x) => (x && x.rate != null ? Math.round(x.rate * 100) + '%' : '—');
  const rateLevel = (x) => (!x || x.rate == null ? 'none' : x.ok + x.falta < 2 ? 'few' : x.rate >= 0.85 ? 'good' : x.rate >= 0.6 ? 'mid' : 'bad');
  const JUST_REASONS = { atestado: 'Atestado / saúde', emergencia: 'Emergência', combinado: 'Combinado com a loja', outro: 'Outro motivo' };

  // ---------------------------------------------------------------- sha256 (para guardar só o hash do link)
  function sha256(str) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const bytes = unescape(encodeURIComponent(String(str))).split('').map((c) => c.charCodeAt(0));
    const l = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (l >>> (i * 8)) & 0xff);
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const rot = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < bytes.length; o += 64) {
      const w = [];
      for (let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }

  // ---------------------------------------------------------------- CPF
  const cpfDigits = (v) => String(v || '').replace(/\D/g, '');
  function cpfCheck(nine) {
    let d = nine.split('').map(Number);
    for (const len of [9, 10]) {
      let sum = 0;
      for (let i = 0; i < len; i++) sum += d[i] * (len + 1 - i);
      const r = (sum * 10) % 11;
      d.push(r === 10 ? 0 : r);
    }
    return d.join('');
  }
  function cpfValid(v) { const c = cpfDigits(v); return c.length === 11 && !/^(\d)\1{10}$/.test(c) && cpfCheck(c.slice(0, 9)) === c; }
  const cpfFormat = (v) => cpfDigits(v).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  const cpfMask = (v) => { const c = cpfDigits(v); return c.length === 11 ? '***.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-**' : ''; };

  return {
    pad, iso, parse, addDays, dow, diffDays, weekStart, weekDays, todayISO, nowMin,
    DOW_SHORT, DOW_LONG, MONTHS, fmtDay, fmtDayLong, fmtWeek,
    toMin, fromMin, fmtDur, span, worked, absStart, absEnd, breakFor, maxWorkedIn, breakStart, presentAt, onBreakAt,
    holiday, isHoliday, holidaysOf, nextHoliday,
    storeWindow, staffWindow, rand, demandCurve, coverage,
    REGIMES, regimeOf, isMinor, weeklyLimit, contractDays, dailyNormal, dailyMax, dailyTarget, suggestShift,
    ABSENCE_TYPES, absenceOn, validate, weekStats, weeklyCost, hourCost, money, money2,
    isFreela, freelaCost, FREELA_REFLEXOS, PONTO, PUNCH_LABEL, stampMin, pontoNext, pontoWorked,
    aptos, isApt, ATTEND_DAYS, attendanceOf, freelaAttendance, rateText, rateLevel, dowPlural, JUST_REASONS,
    sha256, cpfDigits, cpfCheck, cpfValid, cpfFormat, cpfMask,
  };
});
