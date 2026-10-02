/* transCr8 — demonstração animada do topo (caixa e recreação se alternando).
   O HTML já traz o estado final de cada cena; sem JavaScript ou com "reduzir movimento", fica parado nele. */
(() => {
  const mock = document.querySelector('.mock');
  if (!mock) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const $ = (sel) => mock.querySelector(sel);

  // Relógio da barra
  const clock = $('[data-clock]');
  const tickClock = () => { clock.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  tickClock();
  setInterval(tickClock, 30000);

  const tabs = [...mock.querySelectorAll('[data-scene-tab]')];
  const scenes = [...mock.querySelectorAll('[data-scene]')];
  const show = (name) => {
    tabs.forEach((t) => t.classList.toggle('is-on', t.dataset.sceneTab === name));
    scenes.forEach((s) => s.classList.toggle('is-on', s.dataset.scene === name));
  };

  /* ---------- Agenda de passos (cancelável) ---------- */
  let timers = [];
  let current = 'caixa';
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  const every = (ms, fn) => timers.push(setInterval(fn, ms));
  const stop = () => { timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers = []; };

  const countTo = (el, from, to, fmt, ms = 450) => {
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      el.textContent = fmt.format(from + (to - from) * (1 - (1 - p) ** 3));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    at(ms + 60, () => { el.textContent = fmt.format(to); }); // garante o valor final mesmo sem quadros de animação
  };

  /* ---------- Cena 1: caixa ---------- */
  const items = $('[data-items]');
  const itemTpl = [...items.children].map((li) => li.cloneNode(true));
  const prices = [289.9, 159.9, 89.9];
  const total = $('[data-total]');
  const pays = [...$('[data-pay]').children];
  const toast = $('[data-toast]');
  const toastText = $('[data-toast-text]');
  const centro = $('[data-store="centro"]');
  const today = $('[data-today]');
  const HOJE = 28850;

  const setToast = (el, textEl, text, wait = false) => {
    el.classList.remove('is-on');
    at(180, () => {
      textEl.textContent = text;
      el.classList.toggle('is-wait', wait);
      el.classList.add('is-on');
    });
  };

  const playCaixa = () => {
    items.innerHTML = '';
    total.textContent = brl.format(0);
    pays.forEach((p) => p.classList.remove('is-on'));
    toast.classList.remove('is-on', 'is-wait');
    centro.classList.remove('is-changed');
    centro.querySelector('b').textContent = '3';
    centro.querySelector('.bar i').style.setProperty('--v', '.3');
    const soma = prices.reduce((a, b) => a + b, 0);
    today.textContent = brl0.format(HOJE - soma);

    let acc = 0;
    itemTpl.forEach((tpl, i) => {
      at(500 + i * 800, () => {
        const li = tpl.cloneNode(true);
        li.style.animation = 'slide-in .45s ease both';
        items.appendChild(li);
        countTo(total, acc, acc + prices[i], brl);
        acc += prices[i];
      });
    });
    at(3000, () => pays[0].classList.add('is-on'));
    at(3500, () => setToast(toast, toastText, 'Transmitindo NFC-e para a SEFAZ…', true));
    at(5000, () => {
      setToast(toast, toastText, 'NFC-e autorizada · Protocolo 135 2610 0042 118');
      centro.classList.add('is-changed');
      centro.querySelector('b').textContent = '2';
      centro.querySelector('.bar i').style.setProperty('--v', '.2');
      countTo(today, HOJE - soma, HOJE, brl0, 700);
    });
    at(9000, () => play('kids'));
  };

  /* ---------- Cena 2: recreação ---------- */
  const kids = $('[data-kids]');
  const kidTpl = [...kids.children].map((li) => li.cloneNode(true));
  const kidsCount = $('[data-kids-count]');
  const kToast = $('[data-kids-toast]');
  const kToastText = $('[data-kids-toast-text]');
  const fmtMin = (m) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;

  const playKids = () => {
    kids.innerHTML = '';
    kidTpl.slice(0, 3).forEach((tpl) => kids.appendChild(tpl.cloneNode(true)));
    kidsCount.textContent = '3 crianças';
    kToast.classList.remove('is-on', 'is-wait');

    // O relógio de cada criança anda (1 minuto por segundo, para dar para ver)
    every(1000, () => {
      kids.querySelectorAll('[data-min]').forEach((el) => {
        const m = Number(el.dataset.min) + 1;
        el.dataset.min = String(m);
        el.textContent = fmtMin(m);
      });
    });
    at(1200, () => {
      const li = kidTpl[3].cloneNode(true);
      li.classList.add('is-new');
      kids.appendChild(li);
      kidsCount.textContent = '4 crianças';
      setToast(kToast, kToastText, 'Check-in pelo app · Lucas, 5 anos');
    });
    at(4200, () => setToast(kToast, kToastText, 'Oficina de slime às 16h · 2 vagas restantes'));
    at(6800, () => setToast(kToast, kToastText, 'Lanchonete: suco + pão de queijo · comanda 1.532'));
    at(9500, () => play('caixa'));
  };

  const play = (name) => {
    stop();
    current = name;
    show(name);
    if (reduceMotion) return;
    (name === 'caixa' ? playCaixa : playKids)();
  };

  tabs.forEach((t) => t.addEventListener('click', () => play(t.dataset.sceneTab)));

  if (reduceMotion) return;

  // Só anima quando a demonstração está na tela e a aba está visível
  let visible = false;
  const sync = () => {
    if (visible && !document.hidden) {
      if (!timers.length) play(current);
    } else {
      stop();
    }
  };
  document.addEventListener('visibilitychange', sync);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      sync();
    }, { threshold: 0.25 }).observe(mock);
  } else {
    visible = true;
    sync();
  }
})();
