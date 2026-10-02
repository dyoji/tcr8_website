/* transCr8 — interações gerais do site */
(() => {
  const CONTATO_EMAIL = 'contato@mikamihub.com';
  const LOGIN_DOMINIO = 'tcr8.co';

  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.getElementById('menu');

  // Cabeçalho mais opaco depois de rolar um pouco
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Menu mobile
  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    menu.classList.toggle('is-open', open);
  };
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a, button')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  window.matchMedia('(min-width: 1121px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

  // Animações de entrada ao rolar
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach((el) => io.observe(el));

    // Destaca no menu a seção visível
    const links = [...document.querySelectorAll('.nav-menu ul a')];
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = `#${entry.target.id}`;
        links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main section[id]').forEach((s) => spy.observe(s));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  // Ano atual no rodapé
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  // QR Code ilustrativo do cupom (decorativo, não é um QR válido)
  document.querySelectorAll('[data-fake-qr]').forEach((el) => {
    const n = 25;
    let seed = 8;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const finder = (x, y) => {
      for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
        const dx = x - fx;
        const dy = y - fy;
        if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
          const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          return ring !== 2 ? 1 : 0;
        }
        if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) return 0;
      }
      return null;
    };
    let rects = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const f = finder(x, y);
        if (f === 1 || (f === null && rnd() > 0.52)) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
      }
    }
    el.innerHTML = `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" shape-rendering="crispEdges" fill="#222">${rects}</svg>`;
  });

  // Entrar: leva para o endereço da loja (<loja>.tcr8.co)
  const dialog = document.getElementById('login-dialog');
  if (dialog && typeof dialog.showModal === 'function') {
    const loginForm = document.getElementById('login-form');
    const lojaInput = loginForm.elements.loja;
    const lembrar = {
      get: () => { try { return localStorage.getItem('tcr8_loja') || ''; } catch { return ''; } },
      set: (v) => { try { localStorage.setItem('tcr8_loja', v); } catch { /* sem armazenamento */ } },
    };
    document.querySelectorAll('[data-open-login]').forEach((btn) => {
      btn.addEventListener('click', () => {
        lojaInput.value = lembrar.get();
        dialog.showModal();
        lojaInput.focus();
        lojaInput.select();
      });
    });
    // Clique fora do cartão fecha
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    loginForm.addEventListener('submit', (e) => {
      if (e.submitter && e.submitter.value === 'cancel') return;
      e.preventDefault();
      const loja = lojaInput.value.trim().toLowerCase().replace(/^https?:\/\//, '').split('.')[0];
      lojaInput.value = loja;
      if (!lojaInput.checkValidity()) { lojaInput.reportValidity(); return; }
      lembrar.set(loja);
      window.location.href = `https://${loja}.${LOGIN_DOMINIO}/`;
    });
  } else {
    // Navegador sem <dialog>: o botão leva direto ao contato
    document.querySelectorAll('[data-open-login]').forEach((btn) => btn.addEventListener('click', () => { window.location.hash = '#contato'; }));
  }

  // Formulário de contato: envia para contato.php sem sair da página
  const form = document.getElementById('contact-form');
  if (!form) return;
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');
  const label = button.querySelector('.btn-label');
  const defaultLabel = label.textContent;
  const fallback = `Não conseguimos enviar agora. Tente de novo em instantes ou escreva para ${CONTATO_EMAIL}.`;

  const setStatus = (text, isError) => {
    status.textContent = text;
    status.classList.toggle('is-error', Boolean(isError));
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.classList.add('was-validated');
    if (!form.reportValidity()) return;

    button.disabled = true;
    label.textContent = 'Enviando…';
    setStatus('');
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        form.reset();
        form.classList.remove('was-validated');
        setStatus(data.message || 'Mensagem enviada!');
      } else {
        setStatus(data.message || fallback, true);
      }
    } catch {
      setStatus(fallback, true);
    } finally {
      button.disabled = false;
      label.textContent = defaultLabel;
    }
  });
})();
