<?php
/* Escala (demo tCr8) — armazenamento do demo hospedado, sem Node.
 * As regras rodam no navegador (js/routes.js + js/local.js); aqui só se guarda o JSON de cada "sala",
 * com versão (quem gravou por cima de versão velha recebe 409 e refaz) e uma fila curta de eventos
 * que as telas consultam a cada poucos segundos para se atualizar sozinhas.
 *
 *   GET  api.php?op=ping                 → { ok, mode: 'php' }
 *   GET  api.php?op=get&sala=x           → { version, db|null }
 *   GET  api.php?op=since&v=N&sala=x     → { version, events (depois de N), gap }
 *   POST api.php?op=put&sala=x  {base, db, events} → { version } | 409 { version }
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const MAX_BODY = 4 * 1024 * 1024;   // o db do demo tem ~300 KB
const MAX_SALAS = 200;              // teto de arquivos para ninguém encher o disco
const KEEP_EVENTS = 60;

function out($code, $data)
{
	http_response_code($code);
	echo is_string($data) ? $data : json_encode($data, JSON_UNESCAPED_UNICODE);
	exit;
}

$sala = strtolower((string)($_GET['sala'] ?? 'demo'));
if (!preg_match('/^[a-z0-9-]{1,32}$/', $sala)) $sala = 'demo';
$dir = __DIR__ . '/.data';
if (!is_dir($dir) && !@mkdir($dir, 0770, true)) out(500, ['error' => 'Sem permissão para gravar os dados do demo']);
if (!is_file("$dir/.htaccess")) @file_put_contents("$dir/.htaccess", "Require all denied\n"); // só vale no Apache
$dbf = "$dir/$sala.json";
$evf = "$dir/$sala.events.json";
$op  = $_GET['op'] ?? 'get';

function events_of($evf)
{
	$e = is_file($evf) ? json_decode((string)file_get_contents($evf), true) : null;
	return is_array($e) ? $e : ['version' => 0, 'events' => []];
}

if ($op === 'ping') out(200, ['ok' => true, 'mode' => 'php']);

// leitura com trava compartilhada: versão e db saem do mesmo instante
$lock = fopen("$dir/$sala.lock", 'c');
if (!$lock) out(500, ['error' => 'Falha ao travar os dados']);

if ($op === 'since') {
	flock($lock, LOCK_SH);
	$e = events_of($evf);
	flock($lock, LOCK_UN);
	$v = (int)($_GET['v'] ?? 0);
	$list = array_values(array_filter($e['events'], fn($x) => ($x['version'] ?? 0) > $v));
	$oldest = $e['events'] ? (int)($e['events'][0]['version'] ?? 0) : $e['version'];
	out(200, ['version' => $e['version'], 'events' => $list, 'gap' => $v > 0 && $v < $oldest - 1]);
}

if ($op === 'get') {
	flock($lock, LOCK_SH);
	$e = events_of($evf);
	$raw = is_file($dbf) ? (string)file_get_contents($dbf) : 'null';
	flock($lock, LOCK_UN);
	out(200, '{"version":' . (int)$e['version'] . ',"db":' . $raw . '}');
}

if ($op === 'put') {
	if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(405, ['error' => 'Use POST']);
	$raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
	if ($raw === false || strlen($raw) > MAX_BODY) out(413, ['error' => 'Dados grandes demais']);
	// decodifica como objeto: em array associativo o PHP gravaria {} como [] e o JS perderia as chaves
	$in = json_decode($raw);
	if (!is_object($in) || !is_object($in->db ?? null) || !is_array($in->db->stores ?? null) || !is_array($in->db->shifts ?? null)) out(400, ['error' => 'Dados inválidos']);
	if (!is_file($dbf) && count(glob("$dir/*.json")) > MAX_SALAS * 2) out(429, ['error' => 'Salas demais neste servidor']);

	flock($lock, LOCK_EX);
	$e = events_of($evf);
	if ((int)($in->base ?? -1) !== (int)$e['version']) { flock($lock, LOCK_UN); out(409, ['error' => 'Versão desatualizada', 'version' => $e['version']]); }
	$version = $e['version'] + 1;
	$in->db->version = $version;
	$ok = file_put_contents("$dbf.tmp", json_encode($in->db, JSON_UNESCAPED_UNICODE)) !== false && rename("$dbf.tmp", $dbf);
	if ($ok) {
		foreach (array_slice(is_array($in->events ?? null) ? $in->events : [], 0, 10) as $ev) {
			if (!is_object($ev)) continue;
			$ev->version = $version;
			$e['events'][] = $ev;
		}
		$e['events'] = array_slice($e['events'], -KEEP_EVENTS);
		$e['version'] = $version;
		$ok = file_put_contents("$evf.tmp", json_encode($e, JSON_UNESCAPED_UNICODE)) !== false && rename("$evf.tmp", $evf);
	}
	flock($lock, LOCK_UN);
	if (!$ok) out(500, ['error' => 'Falha ao gravar']);
	out(200, ['version' => $version]);
}

out(404, ['error' => 'Operação desconhecida']);
