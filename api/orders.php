<?php
/* Global Fire Company – orderopslag voor de sheet samensteller.
 * Eén bestand, geen database: elke bestelling is een JSON-bestand in api/data/orders/.
 * Vereist PHP 7.4 of nieuwer. Instellingen staan in api/config.php.
 *
 * Klant:  GET  ?action=ping | ?action=get&code=…
 *         POST {action: create | save | submit, …}
 * Beheer: POST {action: list | admin_create | status | delete, password, …}
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$CFG = require __DIR__ . '/config.php';
$DIR = __DIR__ . '/data/orders';
const STATUSES = ['draft', 'submitted', 'done'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // zonder 0/O en 1/I

function out(array $data, int $code = 200): void {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function fail(string $error, int $code = 400): void { out(['ok' => false, 'error' => $error], $code); }

function str($v, int $max): string {
  if (!is_string($v)) return '';
  $v = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '');
  return function_exists('mb_substr') ? mb_substr($v, 0, $max) : substr($v, 0, $max);
}

function clean_customer($c): array {
  $c = is_array($c) ? $c : [];
  return [
    'name' => str($c['name'] ?? '', 120),
    'company' => str($c['company'] ?? '', 160),
    'email' => str($c['email'] ?? '', 160),
    'phone' => str($c['phone'] ?? '', 60),
    'reference' => str($c['reference'] ?? '', 120),
    'notes' => str($c['notes'] ?? '', 2000),
  ];
}

/* De server kent de elementen niet; hij bewaart alleen wat er de vorm van heeft.
 * De app controleert maten en limieten bij het openen opnieuw. */
function clean_sheets($s): array {
  $out = [];
  if (!is_array($s)) return $out;
  foreach ($s as $id => $slots) {
    if (!is_string($id) || !preg_match('/^[a-z0-9_-]{1,32}$/i', $id) || !is_array($slots)) continue;
    if (count($out) >= 20) break;
    $row = [];
    foreach (array_slice(array_values($slots), 0, 200) as $t) {
      $row[] = (is_string($t) && preg_match('/^[A-Za-z0-9_-]{1,80}$/', $t)) ? $t : null;
    }
    $out[$id] = $row;
  }
  return $out;
}

function valid_code($c): bool { return is_string($c) && preg_match('/^[' . CODE_CHARS . ']{4}-[' . CODE_CHARS . ']{4}-[' . CODE_CHARS . ']{4}$/', $c) === 1; }

function new_code(): string {
  $s = '';
  for ($i = 0; $i < 12; $i++) $s .= CODE_CHARS[random_int(0, strlen(CODE_CHARS) - 1)];
  return substr($s, 0, 4) . '-' . substr($s, 4, 4) . '-' . substr($s, 8, 4);
}

function path_for(string $code): string { global $DIR; return $DIR . '/' . $code . '.json'; }

function read_order(string $code): ?array {
  $p = path_for($code);
  if (!is_file($p)) return null;
  $d = json_decode((string)file_get_contents($p), true);
  return is_array($d) ? $d : null;
}

function write_order(array $o): void {
  global $DIR;
  if (!is_dir($DIR) && !@mkdir($DIR, 0750, true)) fail('storage', 500);
  $tmp = $DIR . '/.' . $o['code'] . '.' . bin2hex(random_bytes(4)) . '.tmp';
  if (file_put_contents($tmp, json_encode($o, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX) === false) fail('storage', 500);
  if (!@rename($tmp, path_for($o['code']))) { @unlink($tmp); fail('storage', 500); }
}

/* Lees–wijzig–schrijf onder een slot, zodat twee gelijktijdige verzoeken op dezelfde order elkaar niet overschrijven. */
function with_order(string $code, callable $fn): array {
  global $DIR;
  if (!is_dir($DIR) && !@mkdir($DIR, 0750, true)) fail('storage', 500);
  $lock = fopen($DIR . '/.lock', 'c');
  if (!$lock || !flock($lock, LOCK_EX)) fail('storage', 500);
  try {
    $o = read_order($code);
    if (!$o) fail('not_found', 404);
    $o = $fn($o);
    write_order($o);
    return $o;
  } finally { flock($lock, LOCK_UN); fclose($lock); }
}

function public_view(array $o): array {
  return ['code' => $o['code'], 'status' => $o['status'], 'customer' => $o['customer'], 'sheets' => $o['sheets'],
    'lang' => $o['lang'] ?? '', 'createdAt' => $o['createdAt'], 'updatedAt' => $o['updatedAt'], 'submittedAt' => $o['submittedAt'] ?? null];
}

function create_order(array $customer, string $lang, string $by): array {
  $now = gmdate('c');
  for ($i = 0; $i < 5; $i++) {
    $code = new_code();
    if (!is_file(path_for($code))) break;
  }
  $o = ['code' => $code, 'status' => 'draft', 'customer' => $customer, 'sheets' => (object)[], 'lang' => $lang,
    'createdBy' => $by, 'createdAt' => $now, 'updatedAt' => $now, 'submittedAt' => null];
  write_order($o);
  return $o;
}

function rate_limited(int $limit): bool {
  global $DIR;
  if ($limit <= 0) return false;
  if (!is_dir($DIR) && !@mkdir($DIR, 0750, true)) return false;
  $file = $DIR . '/.ratelimit.json';
  $fh = fopen($file, 'c+');
  if (!$fh || !flock($fh, LOCK_EX)) return false;
  $data = json_decode((string)stream_get_contents($fh), true) ?: [];
  $ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . __DIR__);
  $now = time();
  foreach ($data as $k => $hits) { $data[$k] = array_values(array_filter($hits, function ($t) use ($now) { return $t > $now - 3600; })); if (!$data[$k]) unset($data[$k]); }
  $limited = count($data[$ip] ?? []) >= $limit;
  if (!$limited) $data[$ip][] = $now;
  ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($data));
  flock($fh, LOCK_UN); fclose($fh);
  return $limited;
}

function require_admin(array $in): void {
  global $CFG;
  $pw = (string)($CFG['admin_password'] ?? '');
  if ($pw === '' || $pw === 'wijzig-mij') fail('admin_disabled', 403);
  if (!is_string($in['password'] ?? null) || !hash_equals($pw, $in['password'])) { usleep(400000); fail('bad_password', 401); }
}

function lang_of($v): string { return (is_string($v) && preg_match('/^[a-z]{2}$/', $v)) ? $v : ''; }

/* Adres van de app: uit config, anders afgeleid van dit verzoek (…/sheet-organizer/). */
function app_base(): string {
  global $CFG;
  $base = rtrim((string)($CFG['app_url'] ?? ''), '/');
  if ($base !== '') return $base;
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
  $host = preg_replace('/[^A-Za-z0-9.:\-\[\]]/', '', (string)($_SERVER['HTTP_HOST'] ?? ''));
  if ($host === '') return '';
  return ($https ? 'https' : 'http') . '://' . $host . rtrim(str_replace('\\', '/', dirname(dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/orders.php')))), '/');
}

const MAIL_TEXT = [
  'nl' => ['subject' => 'Akkoord op bestelling {code}', 'intro' => 'De klant heeft akkoord gegeven op een bestelling. De bestelling is nu vergrendeld.',
    'pdf' => 'Order openen en PDF downloaden (inloggen met het beheerwachtwoord):', 'view' => 'Bekijken zoals de klant hem ziet:',
    'code' => 'Ordercode', 'name' => 'Naam', 'company' => 'Organisatie', 'email' => 'E-mail', 'phone' => 'Telefoon', 'reference' => 'Referentie', 'notes' => 'Opmerkingen', 'sheet' => 'Sheet'],
  'en' => ['subject' => 'Order {code} approved', 'intro' => 'The customer has approved an order. The order is now locked.',
    'pdf' => 'Open the order and download the PDF (log in with the admin password):', 'view' => 'View it as the customer sees it:',
    'code' => 'Order code', 'name' => 'Name', 'company' => 'Organisation', 'email' => 'Email', 'phone' => 'Phone', 'reference' => 'Reference', 'notes' => 'Notes', 'sheet' => 'Sheet'],
  'de' => ['subject' => 'Bestellung {code} freigegeben', 'intro' => 'Der Kunde hat eine Bestellung freigegeben. Die Bestellung ist jetzt gesperrt.',
    'pdf' => 'Bestellung öffnen und PDF herunterladen (Anmeldung mit dem Verwaltungspasswort):', 'view' => 'Ansicht wie beim Kunden:',
    'code' => 'Bestellcode', 'name' => 'Name', 'company' => 'Organisation', 'email' => 'E-Mail', 'phone' => 'Telefon', 'reference' => 'Referenz', 'notes' => 'Anmerkungen', 'sheet' => 'Bogen'],
];

/* Naam van een element zoals in de app (js/data.js); valt terug op de id ("Bus_Size_B_Type_1" → "Bus Type 1"). */
function token_label(string $id, string $lang): string {
  static $names = null;
  if ($names === null) {
    $names = [];
    $js = @file_get_contents(dirname(__DIR__) . '/js/data.js');
    if ($js !== false && ($a = strpos($js, '{')) !== false && ($b = strrpos($js, '}')) !== false) {
      $data = json_decode(substr($js, $a, $b - $a + 1), true);
      foreach (($data['tokens'] ?? []) as $t) if (isset($t['id'], $t['name'])) $names[$t['id']] = $t;
    }
  }
  $t = $names[$id] ?? null;
  if ($t) return (string)($t['name_' . $lang] ?? $t['name']);
  return trim(preg_replace('/\s+/', ' ', str_replace('_', ' ', preg_replace('/_Size_[A-Z]/', '', $id))));
}

function mail_header_safe(string $v): string { return trim(preg_replace('/[\r\n]+/', ' ', $v)); }

/* notify_email: 'a@x.nl' of 'a@x.nl, b@y.de' (taal = mail_lang), of ['a@x.nl' => 'nl', 'b@y.de' => 'de'] (taal per adres). */
function recipients(): array {
  global $CFG;
  $default = (string)($CFG['mail_lang'] ?? 'de');
  $cfg = $CFG['notify_email'] ?? '';
  $out = [];
  if (is_array($cfg)) {
    foreach ($cfg as $k => $v) {
      if (is_int($k)) $out[] = [trim((string)$v), $default];
      else $out[] = [trim((string)$k), trim((string)$v)];
    }
  } else {
    foreach (explode(',', (string)$cfg) as $a) $out[] = [trim($a), $default];
  }
  $out = array_filter($out, function ($r) { return filter_var($r[0], FILTER_VALIDATE_EMAIL) !== false; });
  return array_map(function ($r) use ($default) { return [$r[0], isset(MAIL_TEXT[$r[1]]) ? $r[1] : (isset(MAIL_TEXT[$default]) ? $default : 'de')]; }, array_values($out));
}

function mail_body(array $o, string $lang, string $base, string $prefix = ''): array {
  $L = MAIL_TEXT[$lang];
  $c = $o['customer'];
  $lines = [$L['intro'], ''];
  if ($base !== '') {
    $lines[] = $L['pdf'];
    $lines[] = $base . '/admin.html?order=' . $o['code'];
    $lines[] = '';
  }
  $lines[] = $L['code'] . ': ' . $o['code'];
  foreach (['name', 'company', 'email', 'phone', 'reference'] as $k) if ($c[$k] !== '') $lines[] = $L[$k] . ': ' . $c[$k];
  if ($c['notes'] !== '') { $lines[] = ''; $lines[] = $L['notes'] . ':'; $lines[] = $c['notes']; }
  $lines[] = '';
  foreach ($o['sheets'] as $id => $slots) {
    $tally = array_count_values(array_filter($slots, 'is_string'));
    if (!$tally) continue;
    $lines[] = $L['sheet'] . ' ' . preg_replace('/\D+/', '', $id) . ' (' . array_sum($tally) . '/' . count($slots) . ')';
    arsort($tally);
    foreach ($tally as $t => $n) $lines[] = '  ' . $n . 'x ' . token_label((string)$t, $lang);
  }
  if ($base !== '') { $lines[] = ''; $lines[] = $L['view']; $lines[] = $base . '/?order=' . $o['code']; }
  $who = $c['company'] !== '' ? $c['company'] : $c['name'];
  if ($prefix !== '') array_unshift($lines, $prefix, '');
  $subject = '=?UTF-8?B?' . base64_encode(($prefix !== '' ? $prefix . ' · ' : '') . str_replace('{code}', $o['code'], $L['subject']) . ($who !== '' ? ' · ' . $who : '')) . '?=';
  return [$subject, implode("\n", $lines)];
}

/* Stuurt de akkoord-mail; geeft per ontvanger terug of PHP mail() hem heeft aangenomen, en logt dat in data/mail.log. */
function notify(array $o, string $prefix = ''): array {
  global $CFG, $DIR;
  $to = recipients();
  if (!$to || !function_exists('mail')) return [];
  $c = $o['customer'];
  $base = app_base();
  $from = mail_header_safe((string)($CFG['mail_from'] ?? ''));
  $headers = "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n" . ($from !== '' ? "From: Global Fire Company <$from>\r\n" : '');
  if (filter_var($c['email'], FILTER_VALIDATE_EMAIL)) $headers .= 'Reply-To: ' . mail_header_safe($c['email']) . "\r\n";
  $params = ($from !== '' && preg_match('/^[^@\s"]+@[^@\s"]+$/', $from)) ? '-f' . $from : '';
  $result = [];
  foreach ($to as [$addr, $lang]) {
    [$subject, $body] = mail_body($o, $lang, $base, $prefix);
    $ok = $params !== '' ? @mail($addr, $subject, $body, $headers, $params) : false;
    if (!$ok) $ok = @mail($addr, $subject, $body, $headers);  // sommige hosts weigeren de -f afzender
    $result[] = ['to' => $addr, 'lang' => $lang, 'sent' => (bool)$ok];
  }
  if (is_dir($DIR) || @mkdir($DIR, 0750, true)) {
    $line = gmdate('c') . ' ' . $o['code'] . ' ' . implode(' ', array_map(function ($r) { return $r['to'] . '=' . ($r['sent'] ? 'ok' : 'FAILED'); }, $result)) . "\n";
    @file_put_contents(dirname($DIR) . '/mail.log', $line, FILE_APPEND | LOCK_EX);
  }
  return $result;
}

/* ---------- verzoek afhandelen ---------- */
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
  $in = $_GET;
} elseif ($method === 'POST') {
  $raw = file_get_contents('php://input', false, null, 0, 512 * 1024);
  $in = json_decode((string)$raw, true);
  if (!is_array($in)) fail('bad_json');
} else {
  fail('method', 405);
}
$action = (string)($in['action'] ?? '');

switch ($action) {
  case 'ping':
    out(['ok' => true, 'publicCreate' => !empty($CFG['public_create']),
      'admin' => !in_array((string)($CFG['admin_password'] ?? ''), ['', 'wijzig-mij'], true)]);

  case 'get':
    if (!valid_code($in['code'] ?? null)) fail('bad_code');
    $o = read_order($in['code']);
    if (!$o) fail('not_found', 404);
    out(['ok' => true, 'order' => public_view($o)]);

  case 'create':
    if ($method !== 'POST') fail('method', 405);
    if (empty($CFG['public_create'])) fail('create_disabled', 403);
    if (rate_limited((int)($CFG['create_limit_per_hour'] ?? 20))) fail('rate_limited', 429);
    $o = create_order(clean_customer($in['customer'] ?? []), lang_of($in['lang'] ?? ''), 'customer');
    out(['ok' => true, 'order' => public_view($o)]);

  case 'save':
  case 'submit':
    if ($method !== 'POST') fail('method', 405);
    if (!valid_code($in['code'] ?? null)) fail('bad_code');
    $o = with_order($in['code'], function (array $o) use ($in, $action) {
      if ($o['status'] !== 'draft') fail('locked', 409);
      if (array_key_exists('sheets', $in)) $o['sheets'] = clean_sheets($in['sheets']);
      if (array_key_exists('customer', $in)) $o['customer'] = clean_customer($in['customer']);
      if (lang_of($in['lang'] ?? '') !== '') $o['lang'] = $in['lang'];
      $o['updatedAt'] = gmdate('c');
      if ($action === 'submit') {
        if ($o['customer']['name'] === '' || !filter_var($o['customer']['email'], FILTER_VALIDATE_EMAIL)) fail('customer_required', 422);
        $filled = 0;
        foreach ((array)$o['sheets'] as $slots) $filled += count(array_filter($slots, 'is_string'));
        if (!$filled) fail('empty_order', 422);
        $o['status'] = 'submitted';
        $o['submittedAt'] = $o['updatedAt'];
      }
      return $o;
    });
    if ($action === 'submit') notify($o);
    out(['ok' => true, 'order' => public_view($o)]);

  case 'list':
    require_admin($in);
    $list = [];
    foreach (glob($DIR . '/*.json') ?: [] as $f) {
      $o = json_decode((string)file_get_contents($f), true);
      if (!is_array($o) || !valid_code($o['code'] ?? null)) continue;
      $filled = 0; $total = 0; $perSheet = [];
      foreach ((array)$o['sheets'] as $id => $slots) {
        $n = count(array_filter($slots, 'is_string'));
        $filled += $n; $total += count($slots);
        if ($n) $perSheet[$id] = array_count_values(array_filter($slots, 'is_string'));
      }
      $list[] = public_view($o) + ['createdBy' => $o['createdBy'] ?? '', 'filled' => $filled, 'totals' => (object)$perSheet];
    }
    usort($list, function ($a, $b) { return strcmp($b['updatedAt'], $a['updatedAt']); });
    out(['ok' => true, 'orders' => $list]);

  case 'admin_create':
    require_admin($in);
    $o = create_order(clean_customer($in['customer'] ?? []), lang_of($in['lang'] ?? ''), 'admin');
    out(['ok' => true, 'order' => public_view($o)]);

  case 'status':
    require_admin($in);
    if (!valid_code($in['code'] ?? null)) fail('bad_code');
    if (!in_array($in['status'] ?? null, STATUSES, true)) fail('bad_status');
    $o = with_order($in['code'], function (array $o) use ($in) {
      $o['status'] = $in['status'];
      $o['updatedAt'] = gmdate('c');
      return $o;
    });
    out(['ok' => true, 'order' => public_view($o)]);

  case 'test_mail':
    require_admin($in);
    $host = strtolower(preg_replace('/^www\./', '', preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? ''))));
    if (preg_match('/^[\d.]+$|^\[|^localhost$/', $host)) $host = '';  // lokaal testen: geen waarschuwing
    $from = strtolower((string)($CFG['mail_from'] ?? ''));
    $fromDomain = substr(strrchr($from, '@') ?: '', 1);
    $sample = ['code' => 'TEST-TEST-TEST', 'customer' => clean_customer(['name' => 'Test', 'company' => 'Test', 'email' => '']),
      'sheets' => ['sheet1' => ['Ambulance_Size_A_Type_1', 'Ambulance_Size_A_Type_1', null]]];
    out(['ok' => true, 'mailFunction' => function_exists('mail'), 'recipients' => count(recipients()), 'from' => $from,
      'fromMatchesHost' => $fromDomain !== '' && ($host === '' || $host === $fromDomain || substr($host, -strlen('.' . $fromDomain)) === '.' . $fromDomain),
      'results' => notify($sample, 'TEST')]);

  case 'delete':
    require_admin($in);
    if (!valid_code($in['code'] ?? null)) fail('bad_code');
    if (!is_file(path_for($in['code']))) fail('not_found', 404);
    @unlink(path_for($in['code']));
    out(['ok' => true]);

  default:
    fail('unknown_action');
}
