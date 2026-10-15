/* Escala (demo tCr8) — modo hospedado (sem Node): a API roda aqui no navegador com as mesmas regras
 * do servidor (js/routes.js) e o api.php só guarda o JSON da "sala" com versão.
 * Duas pessoas mexendo ao mesmo tempo: quem gravar em cima de versão velha recebe 409, recarrega e refaz.
 * O "ao vivo" é uma consulta curta a cada 2,5 s (não prende processo do PHP como um SSE prenderia). */
(function () {
  'use strict';
  const R = window.EscalaRoutes;
  const qs = new URLSearchParams(location.search);
  const sala = (qs.get('sala') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'demo';
  const L = { db: null, version: 0, known: 0, mine: new Set() };
  const url = (op, extra) => 'api.php?op=' + op + '&sala=' + encodeURIComponent(sala) + (extra || '');
  const copy = (x) => JSON.parse(JSON.stringify(x));

  async function json(res) {
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(d.error || 'Falha na requisição'); e.status = res.status; throw e; }
    return d;
  }
  async function push(db, events) {
    const r = await fetch(url('put'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base: L.version, db, events }) }).then(json);
    db.version = r.version;
    L.db = db; L.version = r.version; L.known = Math.max(L.known, r.version); L.mine.add(r.version);
  }
  async function pull() {
    const r = await fetch(url('get'), { cache: 'no-store' }).then(json);
    L.version = r.version; L.known = Math.max(L.known, r.version);
    if (R.isStale(r.db)) { // sala nova, semana já passou ou dados quebrados: gera o demo de novo
      try { await push(R.seed(), [{ type: 'reset', ids: [], msg: 'Demo preparado para esta semana' }]); return; }
      catch (e) { if (e.status === 409) return pull(); throw e; }
    }
    r.db.version = r.version;
    L.db = r.db;
  }
  let pulling = null;
  function ensure() {
    if (L.db && L.version >= L.known) return Promise.resolve();
    return pulling || (pulling = pull().finally(() => { pulling = null; }));
  }

  async function call(method, path, body) {
    const u = new URL(path, location.origin);
    const p = u.pathname, q = Object.fromEntries(u.searchParams);
    await ensure();
    if (method === 'GET') return R.handle(L.db, 'GET', p, q, {}).result;
    for (let attempt = 0; attempt < 4; attempt++) {
      const out = R.handle(copy(L.db), method, p, q, body || {}); // erro de validação sobe direto
      if (!out.events.length) return out.result;
      try { await push(out.db, out.events); return out.result; }
      catch (e) { if (e.status !== 409) throw e; await pull(); }
    }
    throw new Error('Muita gente mexendo ao mesmo tempo — tente de novo');
  }

  function live(onEvent, onStatus) {
    let v = null, fails = 0, timer = null;
    async function tick() {
      clearTimeout(timer);
      try {
        const r = await fetch(url('since', '&v=' + (v == null ? 0 : v)), { cache: 'no-store' }).then(json);
        if (v == null || fails) onStatus && onStatus(true);
        if (fails) onEvent({ type: 'reconnect' });
        fails = 0;
        L.known = Math.max(L.known, r.version);
        if (v == null) v = L.db ? Math.min(L.version, r.version) : r.version;
        if (r.gap) { v = r.version; onEvent({ type: 'reconnect' }); }
        else if (r.version > v) {
          v = r.version;
          r.events.forEach((ev) => { if (!L.mine.has(ev.version)) onEvent(ev); });
        }
      } catch (e) { fails++; onStatus && onStatus(false); }
      timer = setTimeout(tick, document.hidden ? 10000 : 2500);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    tick();
  }

  window.EscalaLocal = { call, live, sala };
})();
