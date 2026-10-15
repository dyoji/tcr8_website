/* Escala (demo tCr8) — utilitários de tela comuns: DOM, API, canal ao vivo, avisos e ícones. */
(function () {
  'use strict';

  // h('div', { class: 'x', onclick: fn, style: {...} }, filhos...)
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k.startsWith('--')) el.style.setProperty(k, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach((x) => add(el, x));
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }

  // Transporte: servidor Node (server.js, com SSE) ou modo hospedado em PHP (api.php + js/local.js). Descobre sozinho.
  const backend = (async () => {
    if (!window.EscalaLocal) return 'node';
    try { const r = await fetch('api.php?op=ping', { cache: 'no-store' }); const d = await r.json(); if (d && d.mode === 'php') return 'php'; } catch (e) { /* não é PHP */ }
    return 'node';
  })();

  async function call(method, url, body) {
    if ((await backend) === 'php') return window.EscalaLocal.call(method, url, body);
    const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Falha na requisição'); e.status = res.status; throw e; }
    return data;
  }
  const api = {
    get: (u) => call('GET', u), post: (u, b) => call('POST', u, b || {}), put: (u, b) => call('PUT', u, b), del: (u) => call('DELETE', u),
  };

  // Links entre as telas carregam a "sala" do demo hospedado (?sala=cliente), para cada cliente ter a sua cópia.
  const sala = new URLSearchParams(location.search).get('sala');
  function link(page, params) {
    const p = new URLSearchParams(params || {});
    if (sala) p.set('sala', sala);
    const s = p.toString();
    return page + (s ? '?' + s : '');
  }

  function live(onEvent, onStatus) {
    backend.then((m) => (m === 'php' ? window.EscalaLocal.live(onEvent, onStatus) : sseLive(onEvent, onStatus)));
  }

  // Canal ao vivo do Node: reconecta sozinho; ao reconectar avisa com { type: 'reconnect' } para a tela recarregar.
  function sseLive(onEvent, onStatus) {
    let es, wasOpen = false, retry = 1000;
    function connect() {
      es = new EventSource('/api/stream');
      es.addEventListener('hello', () => { onStatus && onStatus(true); if (wasOpen) onEvent({ type: 'reconnect' }); wasOpen = true; retry = 1000; });
      es.addEventListener('change', (e) => { try { onEvent(JSON.parse(e.data)); } catch (err) { /* ignora */ } });
      es.onerror = () => {
        onStatus && onStatus(false);
        if (es.readyState === 2) { setTimeout(connect, retry); retry = Math.min(retry * 2, 15000); }
      };
    }
    connect();
  }

  function toast(msg, kind, ms) {
    let box = document.getElementById('toasts');
    if (!box) { box = h('div', { id: 'toasts' }); document.body.appendChild(box); }
    const t = h('div', { class: 'toast ' + (kind || ''), role: 'status' }, h('i'), msg);
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, ms || 3600);
  }

  const initials = (name) => { const p = name.trim().split(/\s+/); return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
  const first = (name) => name.split(' ')[0];

  const store = {
    get(k, d) { try { const v = localStorage.getItem('escala.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('escala.' + k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
  };

  // Ícones em traço (16px)
  const PATHS = {
    chevL: '<path d="M15 18l-6-6 6-6"/>', chevR: '<path d="M9 18l6-6-6-6"/>', chevD: '<path d="M6 9l6 6 6-6"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
    tv: '<rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>', check: '<path d="M20 6L9 17l-5-5"/>', more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>', alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>', eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    swap: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    coffee: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    scale: '<path d="M12 3v18M5 7h14M5 7l-3 7a4 4 0 0 0 6 0zM19 7l-3 7a4 4 0 0 0 6 0z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>', refresh: '<path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
  };
  const icon = (name, cls) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic ' + (cls || '')); s.innerHTML = PATHS[name] || ''; return s; };

  // Símbolo tCr8 (o 8 deitado em blocos)
  function logo() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 200 120'); s.setAttribute('class', 'logo'); s.setAttribute('aria-hidden', 'true');
    let html = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      const x = 3 + c * 40, y = 3 + r * 40;
      if (r === 1 && (c === 1 || c === 3)) html += '<rect class="h" x="' + (x + 1) + '" y="' + (y + 1) + '" width="32" height="32" rx="5"/>';
      else html += '<rect class="' + (r === 2 && c === 4 ? 'a' : 'b') + '" x="' + x + '" y="' + y + '" width="34" height="34" rx="6"/>';
    }
    s.innerHTML = html;
    return s;
  }

  // Popover simples ancorado num elemento ou ponto
  let popEl = null, popClose = null;
  function popover(anchor, content, opts) {
    closePopover();
    popEl = document.getElementById('pop') || document.body.appendChild(h('div', { id: 'pop', class: 'popover' }));
    popEl.innerHTML = ''; add(popEl, content);
    popEl.classList.add('on');
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const pw = popEl.offsetWidth, ph = popEl.offsetHeight;
    let x = (opts && opts.alignRight) ? r.right - pw : r.left, y = r.bottom + 6;
    x = Math.max(8, Math.min(x, innerWidth - pw - 8));
    if (y + ph > innerHeight - 8) y = Math.max(8, r.top - ph - 6);
    popEl.style.left = x + 'px'; popEl.style.top = y + 'px';
    const first = popEl.querySelector('button, input, select');
    if (first) first.focus({ preventScroll: true });
    setTimeout(() => {
      popClose = (e) => { if (e.type === 'keydown' ? e.key === 'Escape' : !popEl.contains(e.target)) closePopover(); };
      document.addEventListener('mousedown', popClose); document.addEventListener('keydown', popClose);
    });
  }
  function closePopover() {
    if (popEl) popEl.classList.remove('on');
    if (popClose) { document.removeEventListener('mousedown', popClose); document.removeEventListener('keydown', popClose); popClose = null; }
  }

  // Painel lateral (drawer)
  let drawerEl = null, scrimEl = null;
  function drawer(title, body, footer, opts) {
    if (!drawerEl) {
      scrimEl = document.body.appendChild(h('div', { class: 'scrim', onclick: closeDrawer }));
      drawerEl = document.body.appendChild(h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true' }));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerEl.classList.contains('on') && !document.querySelector('.popover.on')) closeDrawer(); });
    }
    drawerEl.innerHTML = '';
    drawerEl.className = 'drawer' + (opts && opts.wide ? ' wide' : '');
    drawerEl.setAttribute('aria-label', typeof title === 'string' ? title : 'Painel');
    add(drawerEl, [
      h('header', null, h('h2', null, title), h('button', { class: 'btn icon ghost', 'aria-label': 'Fechar', onclick: closeDrawer }, icon('x'))),
      h('div', { class: 'body' }, body),
      footer ? h('footer', null, footer) : null,
    ]);
    requestAnimationFrame(() => { drawerEl.classList.add('on'); scrimEl.classList.add('on'); });
    return drawerEl;
  }
  function closeDrawer() { if (drawerEl) { drawerEl.classList.remove('on'); scrimEl.classList.remove('on'); } }
  const drawerOpen = () => !!(drawerEl && drawerEl.classList.contains('on'));

  window.UI = { h, add, api, live, link, sala, toast, initials, first, store, icon, logo, popover, closePopover, drawer, closeDrawer, drawerOpen };
})();
