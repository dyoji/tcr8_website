<?php
/**
 * transCr8 — envio do formulário de contato por SMTP.
 *
 * As credenciais NÃO ficam aqui: são lidas de um arquivo fora da pasta pública
 * (por padrão, ../config-contato-tcr8.php). Modelo em contato.config.example.php.
 */

declare(strict_types=1);

// Precisam ser iguais às opções dos <select> do index.html
const SEGMENTOS = [
    'Varejo de moda e acessórios',
    'Outro tipo de varejo',
    'Recreação infantil',
    'Outro',
];
const LOJAS = [
    '1 loja',
    '2 a 5 lojas',
    '6 ou mais lojas',
    'Ainda vou abrir',
];
const CONTATO_EMAIL = 'contato@mikamihub.com'; // aparece nas mensagens de erro
const LIMITE_POR_IP = 5;      // envios por IP...
const LIMITE_GLOBAL = 60;     // ...e no total, por janela
const JANELA = 3600;          // segundos

date_default_timezone_set('America/Sao_Paulo');
$querJson = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');

function responder(bool $ok, string $mensagem, int $status = 200): never
{
    global $querJson;
    http_response_code($status);
    header('Cache-Control: no-store');
    if ($querJson) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => $ok, 'message' => $mensagem], JSON_UNESCAPED_UNICODE);
    } else {
        // Sem JavaScript: devolve uma página simples com link de volta
        header('Content-Type: text/html; charset=utf-8');
        $texto = htmlspecialchars($mensagem, ENT_QUOTES, 'UTF-8');
        echo "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
            . "<title>Contato — transCr8</title><body style=\"font-family:system-ui,sans-serif;background:#0c1810;color:#eaf3e5;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px\">"
            . "<main style=\"max-width:480px;text-align:center\"><p style=\"font-size:1.2rem\">{$texto}</p><p><a href=\"/#contato\" style=\"color:#a4e45a\">Voltar ao site</a></p></main></body></html>";
    }
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    responder(false, 'Método não permitido.', 405);
}

$configPath = getenv('CONTATO_CONFIG') ?: dirname(__DIR__) . '/config-contato-tcr8.php';
if (!is_readable($configPath)) {
    error_log("[contato] arquivo de configuração não encontrado ou sem permissão de leitura: {$configPath}");
    responder(false, 'O formulário está temporariamente indisponível. Escreva para ' . CONTATO_EMAIL . '.', 500);
}
$config = require $configPath;

/* ---------- Validação ---------- */
$campo = static fn(string $nome): string => trim((string) ($_POST[$nome] ?? ''));
$umaLinha = static fn(string $s): string => trim(preg_replace('/[\r\n\t]+/', ' ', $s) ?? '');

// Campo isca: invisível para pessoas, robôs costumam preencher. Finge sucesso.
if ($campo('hp_extra') !== '') {
    responder(true, 'Mensagem enviada! Em breve entraremos em contato.');
}

$nome = $umaLinha($campo('nome'));
$email = $campo('email');
$telefone = $umaLinha($campo('telefone'));
$empresa = $umaLinha($campo('empresa'));
$segmento = $campo('segmento');
$lojas = $campo('lojas');
$mensagem = str_replace("\r\n", "\n", $campo('mensagem'));

foreach ([$nome, $email, $telefone, $empresa, $segmento, $lojas, $mensagem] as $valor) {
    if (!mb_check_encoding($valor, 'UTF-8')) {
        responder(false, 'O texto enviado tem caracteres inválidos.', 422);
    }
}

$erros = [];
if ($nome === '' || mb_strlen($nome) > 100) $erros[] = 'nome';
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) $erros[] = 'e-mail';
if ($telefone !== '' && !preg_match('/^[0-9+().\s-]{8,30}$/', $telefone)) $erros[] = 'telefone';
if (mb_strlen($empresa) > 100) $erros[] = 'empresa';
if (!in_array($segmento, SEGMENTOS, true)) $erros[] = 'tipo de loja';
if (!in_array($lojas, LOJAS, true)) $erros[] = 'quantidade de lojas';
if ($mensagem === '' || mb_strlen($mensagem) > 5000) $erros[] = 'mensagem';
if ($erros) {
    responder(false, 'Confira os campos: ' . implode(', ', $erros) . '.', 422);
}

/* ---------- Limite de envios ---------- */
// Atrás do Cloudflare, o IP real do visitante vem neste cabeçalho
$ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? 'desconhecido';
if (!dentroDoLimite('ip-' . hash('sha256', $ip), LIMITE_POR_IP) || !dentroDoLimite('global', LIMITE_GLOBAL)) {
    responder(false, 'Muitas mensagens em pouco tempo. Tente novamente mais tarde ou escreva para ' . CONTATO_EMAIL . '.', 429);
}

/* ---------- Envio ---------- */
$corpo = implode("\n", [
    'Nova mensagem pelo formulário do site tcr8.co',
    '',
    "Nome: {$nome}",
    "E-mail: {$email}",
    'Telefone: ' . ($telefone !== '' ? $telefone : '—'),
    'Empresa: ' . ($empresa !== '' ? $empresa : '—'),
    "Tipo de loja: {$segmento}",
    "Lojas: {$lojas}",
    '',
    'Mensagem:',
    $mensagem,
    '',
    '—',
    'Enviado em ' . date('d/m/Y H:i') . " · IP {$ip}",
    'Responda este e-mail para falar direto com a pessoa.',
]);

try {
    smtpEnviar($config['smtp'], [
        'from' => $config['from'],
        'from_name' => $config['from_name'] ?? 'Site transCr8',
        'to' => $config['to'],
        'reply_to' => $email,
        'reply_to_name' => $nome,
        'subject' => "[transCr8] {$segmento} · {$lojas} — {$nome}",
        'body' => $corpo,
    ]);
} catch (Throwable $e) {
    error_log('[contato] falha no envio: ' . $e->getMessage());
    responder(false, 'Não conseguimos enviar agora. Tente de novo em instantes ou escreva para ' . CONTATO_EMAIL . '.', 502);
}

responder(true, 'Mensagem enviada! Em breve entraremos em contato.');

/* ========================================================================== */

/**
 * Janela deslizante simples guardada em arquivo temporário.
 * Se o armazenamento falhar, não bloqueia o envio.
 */
function dentroDoLimite(string $chave, int $maximo): bool
{
    $arquivo = sys_get_temp_dir() . "/tcr8-contato-{$chave}.json";
    $agora = time();
    $fp = @fopen($arquivo, 'c+');
    if (!$fp) return true;
    try {
        flock($fp, LOCK_EX);
        $envios = json_decode((string) stream_get_contents($fp), true);
        $envios = array_values(array_filter(is_array($envios) ? $envios : [], static fn($t) => is_int($t) && $t > $agora - JANELA));
        if (count($envios) >= $maximo) return false;
        $envios[] = $agora;
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($envios));
        return true;
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function cabecalhoUtf8(string $texto): string
{
    return preg_match('/[^\x20-\x7E]/', $texto) ? '=?UTF-8?B?' . base64_encode($texto) . '?=' : $texto;
}

function endereco(string $email, string $nome = ''): string
{
    if ($nome === '') return "<{$email}>";
    $nome = preg_match('/[^\x20-\x7E]/', $nome) ? cabecalhoUtf8($nome) : '"' . addcslashes($nome, '"\\') . '"';
    return "{$nome} <{$email}>";
}

/**
 * Cliente SMTP mínimo (SSL na 465, STARTTLS na 587 ou sem criptografia para testes locais).
 * Lança RuntimeException em qualquer resposta inesperada do servidor.
 */
function smtpEnviar(array $smtp, array $msg): void
{
    $secure = $smtp['secure'] ?? 'ssl';
    $remoto = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $smtp['host'] . ':' . $smtp['port'];
    $contexto = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $smtp['host']]]);
    $fp = @stream_socket_client($remoto, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $contexto);
    if (!$fp) {
        throw new RuntimeException("não conectou em {$remoto}: {$errstr} ({$errno})");
    }
    stream_set_timeout($fp, 20);

    // Envia um comando e confere o código da resposta. O rótulo evita que dados sensíveis vão para o log.
    $comando = static function (?string $linha, string $rotulo, int ...$esperado) use ($fp): string {
        if ($linha !== null) fwrite($fp, $linha . "\r\n");
        $resposta = '';
        while (($l = fgets($fp, 1024)) !== false) {
            $resposta .= $l;
            if (strlen($l) < 4 || $l[3] === ' ') break;
        }
        $codigo = (int) substr($resposta, 0, 3);
        if (!in_array($codigo, $esperado, true)) {
            throw new RuntimeException("{$rotulo}: " . (trim($resposta) ?: 'sem resposta'));
        }
        return $resposta;
    };

    try {
        $dominio = substr(strrchr($msg['from'], '@') ?: '@localhost', 1);
        $comando(null, 'conexão', 220);
        $comando("EHLO {$dominio}", 'EHLO', 250);
        if ($secure === 'tls') {
            $comando('STARTTLS', 'STARTTLS', 220);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                throw new RuntimeException('falha ao iniciar TLS');
            }
            $comando("EHLO {$dominio}", 'EHLO', 250);
        }
        if (($smtp['user'] ?? '') !== '') {
            $comando('AUTH PLAIN ' . base64_encode("\0{$smtp['user']}\0{$smtp['pass']}"), 'AUTH', 235);
        }
        $comando("MAIL FROM:<{$msg['from']}>", 'MAIL FROM', 250);
        $comando("RCPT TO:<{$msg['to']}>", 'RCPT TO', 250, 251);
        $comando('DATA', 'DATA', 354);

        $cabecalhos = [
            'Date: ' . date('r'),
            'From: ' . endereco($msg['from'], $msg['from_name']),
            'To: ' . endereco($msg['to']),
            'Reply-To: ' . endereco($msg['reply_to'], $msg['reply_to_name']),
            'Subject: ' . cabecalhoUtf8($msg['subject']),
            'Message-ID: <' . bin2hex(random_bytes(16)) . "@{$dominio}>",
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
        ];
        $dados = implode("\r\n", $cabecalhos) . "\r\n\r\n"
            . rtrim(chunk_split(base64_encode(str_replace("\n", "\r\n", $msg['body'])), 76, "\r\n"));
        $comando($dados . "\r\n.", 'envio da mensagem', 250);
        try { $comando('QUIT', 'QUIT', 221); } catch (RuntimeException) { /* já foi enviado */ }
    } finally {
        fclose($fp);
    }
}
