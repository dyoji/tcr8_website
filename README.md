# tCr8 — site institucional

Site da tCr8 (transcreate), o sistema de gestão para lojas de varejo e espaços de recreação infantil: caixa, estoque de várias lojas, clientes, NFC-e e NF-e, relatórios e integrações. Endereço previsto: **https://tcr8.co/**.

As páginas são HTML, CSS e JavaScript puros (sem etapa de build); só o envio do formulário de contato usa PHP.

## Estrutura

```
index.html                   Página única com todas as seções
contato.php                  Recebe o formulário e envia o e-mail por SMTP
contato.config.example.php   Modelo da configuração do SMTP (a real fica fora do git)
favicon.ico
assets/css/style.css         Estilos (cores e fonte da marca nas variáveis do topo, em :root)
assets/js/pixel.js           Desenho dos blocos da marca e o loop do 8 — cópia de brands/tcr8/pixel.js
assets/js/main.js            Menu mobile, animações de entrada, "Entrar", envio do formulário
assets/js/demo.js            Demonstração animada do topo (caixa ↔ recreação)
assets/img/favicon.svg       O 8 sobre preto — cópia de brands/tcr8/files/img/favicon.svg
assets/img/favicon-32.png, apple-touch-icon.png   O mesmo favicon em PNG
assets/img/og-tcr8.png       Imagem de compartilhamento 1200×630 (WhatsApp, LinkedIn etc.)
robots.txt, sitemap.xml
```

## Marca

O site segue a identidade **Pixel ∞** do Brand Resources (`sys/brands/tcr8`):

- **Logo**: blocos numa grade 3×5. O símbolo é o 8 (em pé) ou o infinito (deitado); a palavra é `tCr8` em blocos. Tudo é desenhado pelo `pixel.js` a partir de `<span class="px" data-px="8|inf|tCr8" data-tom="preto|claro|limao|led" data-loop="1">`. Se a marca mudar o desenho, basta copiar o `pixel.js` novo para `assets/js/`.
- **Cores**: Preto `#0A0A0A`, Limão `#C8F031`, Névoa `#E9EAE4`, Giz `#F2F3EE`, Grafite `#4D5147` e os quatro tons do rastro do loop. O limão é o "bloco aceso": um acento por área (o número da seção, o botão principal, o carimbo da nota), nunca fundo de página.
- **Fonte**: só Geist Mono (400, 500, 600, 800), pelo Google Fonts.
- **Movimento**: o cursor percorrendo o 8 aparece no infinito da seção "Feito no balcão" e como indicador de carregamento (aviso da NFC-e na demonstração e botão de enviar o formulário).
- **Assinatura**: "transcreate · criações transparentes" e "tCr8 Systems by Daniel", como no Brand Resources.

## Seções

Topo (com a demonstração animada) · Para quem é · Varejo · Recreação infantil · Gestão · Fiscal · Integrações · Feito no balcão · Implantação · Dúvidas · Contato.

Os dados que aparecem nas telas ilustrativas (vendas, lojas "Centro", "Shopping Norte", "Matriz", crianças, comanda, cupom da "Loja Exemplo Ltda") são **inventados**. Nenhum dado real de cliente ou loja vai para o site.

## Rodar localmente

Com PHP instalado (o formulário precisa dele):

```bash
php -S 127.0.0.1:5175
```

E abra http://127.0.0.1:5175. Sem PHP, `python -m http.server 5175` mostra o site, mas o formulário não envia.

Para testar o envio sem mexer em nada fora da pasta, aponte a variável `CONTATO_CONFIG` para uma configuração de teste:

```bash
CONTATO_CONFIG=/caminho/para/config-teste.php php -S 127.0.0.1:5175
```

## Formulário de contato

O formulário envia para `contato.php`, que manda um e-mail por SMTP:

- **De:** `nao-responda@mikamihub.com` (a mesma conta de envio do site da Mikami Hub)
- **Para:** `contato@mikamihub.com`
- **Responder para:** o e-mail do visitante — é só clicar em "Responder"
- **Assunto:** `[tCr8] <tipo de loja> · <quantas lojas> — <nome>`

Proteções: campo isca contra robôs, validação dos campos, bloqueio de injeção de cabeçalhos e limite de 5 envios por IP e 60 no total por hora.

### Configuração (senha fora do git)

A senha fica em `config-contato-tcr8.php`, **um nível acima** da pasta do site, onde o navegador não alcança:

```
<pasta da hospedagem>/
├── config-contato-tcr8.php   ← configuração real com a senha (não versionar)
└── <pasta pública do site>/  ← este repositório
```

Para criar: copie `contato.config.example.php` para esse local com o nome `config-contato-tcr8.php`, preencha a senha (é a mesma do `config-contato.php` da Mikami Hub, se a conta de envio for a mesma) e deixe o arquivo legível só pelo usuário do site (`chmod 600`).

Requer PHP 8.1 ou mais novo. Se o envio falhar, o motivo vai para o log de erros do PHP com o prefixo `[contato]`.

## Botão "Entrar"

Cada loja acessa o sistema pelo próprio endereço (`<loja>.tcr8.co`). O botão "Entrar" abre uma janelinha onde a pessoa digita só o começo do endereço (ex.: `infinivm`) e é levada para `https://infinivm.tcr8.co/`. O último endereço digitado fica salvo no navegador dela. O domínio está na constante `LOGIN_DOMINIO` no topo de `assets/js/main.js`.

## O que personalizar

- **E-mail de contato exibido**: `contato@mikamihub.com` aparece em `index.html` (seção Contato e bloco JSON-LD do `<head>`), na constante `CONTATO_EMAIL` de `contato.php` e de `assets/js/main.js`. O destino real das mensagens é o campo `to` do `config-contato-tcr8.php`.
- **WhatsApp / telefone**: o site ainda não mostra nenhum; quando houver, a seção Contato e o rodapé são os lugares.
- **Domínio**: o site assume `https://tcr8.co/` em `index.html` (canonical, Open Graph e JSON-LD), `robots.txt` e `sitemap.xml`.
- **Textos**: todos em `index.html`, organizados por seção.
- **Opções do formulário**: as listas dos `<select>` "Tipo de loja" e "Quantas lojas?" em `index.html` precisam ser iguais às constantes `SEGMENTOS` e `LOJAS` de `contato.php`.
- **Cores e fonte**: variáveis em `:root` no início de `assets/css/style.css`, com os nomes da marca (`--limao`, `--bg` = Giz, `--bg-alt` = Névoa, `--ink` = Preto, `--ink-2` = Grafite).
- **Logos de clientes / depoimentos**: ainda não há; se quiser mostrar as lojas que usam o sistema, a seção "Feito no balcão" é o lugar (com autorização de cada uma).

## Publicar / atualizar

No servidor, dentro da pasta do site:

```bash
git pull origin main
```

**Ao alterar CSS ou JS, aumente o `?v=` nos links do `index.html`** (ex.: `style.css?v=1` → `style.css?v=2`). O Cloudflare guarda CSS/JS em cache por horas; com o número novo, o endereço muda e todo mundo recebe a versão atualizada na hora. Se esquecer, dá para limpar manualmente em Cloudflare → Caching → Configuration → Purge Everything.
