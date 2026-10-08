// tCr8 — desenho dos blocos (Pixel ∞), usado pela página e pelo brandbook.
// Mesma geometria dos SVGs oficiais: bloco 34u com raio 6u, passo 40u (vão de 6u), vazado = contorno
// tracejado (32u, raio 5u, traço 2u, tracejado 4/4), na grade 3×5. O nome (tCr8 em tipo) e as assinaturas
// (símbolo + nome) são arquivos prontos em files/svg, gerados por ferramentas/palavra.py.
//
// Marcação: <span class="px" data-px="8" data-tom="preto" data-loop="1" aria-label="…"></span>
//   data-px    8 | inf
//   data-tom   preto (padrão) | claro | limao | led (blocos apagados, para o loop no escuro)
//   data-loop  1 = o cursor percorre o 8 sem parar (130 ms por passo). O loop só troca cores, não desloca
//              nada, então roda mesmo com "reduzir movimento"; [data-loop-alternar] pausa e retoma todos.
//   data-grade 1 = mostra a grade de construção (brandbook)
var TCR8 = (function () {
  var PADROES = {
    8: ['XXA', 'XOX', 'XXX', 'XOX', 'XXX']
  };
  // percurso do cursor no 8 em pé (coluna, linha): cruza pelo bloco central
  var CAMINHO = [[1, 2], [0, 1], [0, 0], [1, 0], [2, 0], [2, 1], [1, 2], [0, 3], [0, 4], [1, 4], [2, 4], [2, 3]];
  var RASTRO = ['#C8F031', '#A9CC2A', '#6E8520', '#3A4515'];
  var PASSO_MS = 130;
  var TONS = {
    preto: { tinta: '#0A0A0A', acento: '#C8F031', oco: '#0A0A0A' },
    claro: { tinta: '#F2F3EE', acento: '#C8F031', oco: '#8A8E82' },
    limao: { tinta: '#0A0A0A', acento: '#FFFFFF', oco: '#0A0A0A' },
    led:   { tinta: '#1D1F1A', acento: '#C8F031', oco: '#4D5147' }
  };

  // o 8 deitado vira o infinito: (linha, coluna) novo = antigo(linha = 4 - coluna, coluna = linha)
  function deitar(linhas) {
    var out = [];
    for (var r = 0; r < linhas[0].length; r++) {
      var s = '';
      for (var c = 0; c < linhas.length; c++) s += linhas[linhas.length - 1 - c].charAt(r);
      out.push(s);
    }
    return out;
  }

  // chave: 8, 'inf' ou uma grade própria (array de linhas, usado no brandbook)
  function grade(chave) {
    if (Array.isArray(chave)) return chave;
    if (chave === 'inf') return deitar(PADROES[8]);
    return PADROES[chave];
  }

  // op: { grade: mostra as células vazias, raio: raio do bloco em u (padrão 6) }
  function svg(chave, tom, op) {
    op = op || {};
    var cor = TONS[tom] || TONS.preto;
    var rx = op.raio === undefined ? 6 : op.raio, rxo = Math.max(0, rx - 1);
    var linhas = grade(chave);
    var W = linhas[0].length * 40, H = linhas.length * 40;
    var out = '';
    linhas.forEach(function (linha, r) {
        linha.split('').forEach(function (ch, c) {
          var x = 3 + c * 40, y = 3 + r * 40;
          var pos = ' data-c="' + c + '" data-r="' + r + '"';
          if (op.grade && ch === '.') out += '<rect x="' + x + '" y="' + y + '" width="34" height="34" rx="' + rx + '" fill="none" stroke="currentColor" stroke-opacity=".28" stroke-width="1" stroke-dasharray="2 3"/>';
          if (ch === 'X') out += '<rect' + pos + ' x="' + x + '" y="' + y + '" width="34" height="34" rx="' + rx + '" fill="' + cor.tinta + '"/>';
          if (ch === 'A') out += '<rect' + pos + ' data-acento="1" x="' + x + '" y="' + y + '" width="34" height="34" rx="' + rx + '" fill="' + cor.acento + '"/>';
          if (ch === 'O') out += '<rect' + pos + ' data-oco="1" x="' + (x + 1) + '" y="' + (y + 1) + '" width="32" height="32" rx="' + rxo + '" fill="none" stroke="' + cor.oco + '" stroke-width="2" stroke-dasharray="4 4"/>';
        });
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' + out + '</svg>';
  }

  var loops = [], pausado = false;

  // células do desenho indexadas pela posição no 8 em pé ("coluna,linha")
  function mapear(el, deitado) {
    var mapa = {};
    el.querySelectorAll('rect[data-c]').forEach(function (r) {
      var c = +r.getAttribute('data-c'), l = +r.getAttribute('data-r');
      // no infinito a célula (l, c) corresponde ao 8 em pé na coluna l, linha 4 - c
      mapa[deitado ? l + ',' + (4 - c) : c + ',' + l] = r;
    });
    return mapa;
  }
  // passo i do loop: os 4 últimos passos do cursor acendem com o rastro (limão → oliva)
  function pintar(mapa, i, cor) {
    Object.keys(mapa).forEach(function (k) {
      if (!mapa[k].hasAttribute('data-oco')) mapa[k].setAttribute('fill', cor.tinta);
    });
    for (var k = RASTRO.length - 1; k >= 0; k--) {
      var p = CAMINHO[((i - k) % CAMINHO.length + CAMINHO.length) % CAMINHO.length];
      var r = mapa[p[0] + ',' + p[1]];
      if (r) r.setAttribute('fill', RASTRO[k]);
    }
  }

  function animar(el, deitado, tom) {
    var cor = TONS[tom] || TONS.preto, mapa = mapear(el, deitado), i = 0;
    function passo() {
      if (pausado) return;
      pintar(mapa, i++, cor);
    }
    passo();
    loops.push(setInterval(passo, PASSO_MS));
  }

  // um quadro parado do loop (brandbook)
  function quadro(i, deitado, tom) {
    var d = document.createElement('div');
    d.innerHTML = svg(deitado ? 'inf' : 8, tom);
    pintar(mapear(d, deitado), i, TONS[tom] || TONS.preto);
    return d.innerHTML;
  }

  function alternar() {
    pausado = !pausado;
    document.querySelectorAll('[data-loop-alternar]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(pausado));
      var t = b.querySelector('[data-rotulo]');
      if (t) t.textContent = pausado ? 'Continuar loop' : 'Pausar loop';
    });
  }

  function montar(raiz) {
    (raiz || document).querySelectorAll('.px[data-px]').forEach(function (el) {
      if (el.firstChild) return;
      var chave = el.getAttribute('data-px'), tom = el.getAttribute('data-tom') || 'preto';
      el.innerHTML = svg(chave, tom, { grade: el.getAttribute('data-grade') === '1' });
      if (el.getAttribute('data-loop') === '1') animar(el, chave === 'inf', tom);
    });
    (raiz || document).querySelectorAll('[data-loop-alternar]').forEach(function (b) {
      if (b._ligado) return;
      b._ligado = true;
      b.addEventListener('click', alternar);
    });
  }

  return { PADROES: PADROES, CAMINHO: CAMINHO, RASTRO: RASTRO, PASSO_MS: PASSO_MS, TONS: TONS, svg: svg, quadro: quadro, montar: montar, deitar: deitar, alternar: alternar };
})();

document.addEventListener('DOMContentLoaded', function () { TCR8.montar(); });
