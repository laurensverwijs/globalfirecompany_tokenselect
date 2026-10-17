<?php
/* Global Fire Company – orderopslag voor de sheet samensteller.
 * Eén bestand, geen database: elke bestelling is een JSON-bestand in api/data/orders/.
 * Klantgegevens staan daarin versleuteld (sleutel in api/secret-key.php, of 'data_key' in config.php).
 * Orders worden na 'retention_months' zonder wijziging automatisch verwijderd.
 * Vereist PHP 7.4 of nieuwer. Instellingen staan in api/config.php.
 *
 * Klant:  GET  ?action=ping | ?action=get&code=…
 *         POST {action: create | save | submit, …}
 * Beheer: POST {action: login} geeft een token; daarna {action: list | admin_create | status | delete | users | user_save | user_delete | password | test_mail, token, …}
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

/* Enkele regel: alle stuurtekens eruit (ook tab/CR/LF, zodat ze nergens in een kop of lijst kunnen lekken).
 * Meerdere regels (opmerkingen): CR wegnormaliseren, regeleindes en tabs behouden. */
function str($v, int $max, bool $multiline = false): string {
  if (!is_string($v)) return '';
  if ($multiline) {
    $v = preg_replace('/\r\n?/', "\n", $v) ?? '';
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '';
  } else {
    $v = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v) ?? '';
  }
  $v = trim($v);
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
    'notes' => str($c['notes'] ?? '', 2000, true),
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

/* ---------- versleuteling van klantgegevens ---------- */

/* 32-byte sleutel: uit config ('data_key', base64), anders uit api/secret-key.php, die bij het eerste gebruik wordt aangemaakt.
 * Zonder deze sleutel zijn de klantgegevens niet meer te lezen: maak er een back-up van. */
function data_key(): string {
  global $CFG;
  static $key = null;
  if ($key !== null) return $key;
  $cfg = (string)($CFG['data_key'] ?? '');
  if ($cfg !== '') {
    $k = base64_decode($cfg, true);
    if ($k === false || strlen($k) !== 32) fail('bad_data_key', 500);
    return $key = $k;
  }
  $file = __DIR__ . '/secret-key.php';
  if (is_file($file)) {
    $k = base64_decode((string)(require $file), true);
    if ($k === false || strlen($k) !== 32) fail('bad_data_key', 500);
    return $key = $k;
  }
  $k = random_bytes(32);
  $php = "<?php\n// Sleutel voor de klantgegevens in data/orders. NIET verwijderen of overschrijven: zonder deze sleutel zijn ze niet meer te lezen.\nreturn '" . base64_encode($k) . "';\n";
  $fh = @fopen($file, 'x');  // 'x': nooit een bestaande sleutel overschrijven
  if (!$fh) {
    if (is_file($file)) { $key = null; return data_key(); }
    fail('storage', 500);
  }
  fwrite($fh, $php); fclose($fh); @chmod($file, 0600);
  return $key = $k;
}

function encrypt_data(array $v): string {
  $plain = json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  if (function_exists('sodium_crypto_secretbox')) {
    $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
    return 's1:' . base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, data_key()));
  }
  $iv = random_bytes(12); $tag = '';
  $ct = openssl_encrypt($plain, 'aes-256-gcm', data_key(), OPENSSL_RAW_DATA, $iv, $tag);
  if ($ct === false) fail('crypto', 500);
  return 'o1:' . base64_encode($iv . $tag . $ct);
}

function decrypt_data(string $s): ?array {
  $raw = base64_decode(substr($s, 3), true);
  if ($raw === false) return null;
  $plain = false;
  if (strncmp($s, 's1:', 3) === 0 && function_exists('sodium_crypto_secretbox_open')) {
    $n = SODIUM_CRYPTO_SECRETBOX_NONCEBYTES;
    if (strlen($raw) > $n) $plain = sodium_crypto_secretbox_open(substr($raw, $n), substr($raw, 0, $n), data_key());
  } elseif (strncmp($s, 'o1:', 3) === 0 && strlen($raw) > 28) {
    $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', data_key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
  }
  $v = is_string($plain) ? json_decode($plain, true) : null;
  return is_array($v) ? $v : null;
}

function read_order(string $code): ?array { return read_order_file(path_for($code)); }

/* Leest een orderbestand; versleutelde klantgegevens ('customerEnc') komen terug als 'customer'. Oude onversleutelde orders blijven leesbaar. */
function read_order_file(string $p): ?array {
  if (!is_file($p)) return null;
  $d = json_decode((string)file_get_contents($p), true);
  if (!is_array($d)) return null;
  if (isset($d['customerEnc'])) {
    $c = is_string($d['customerEnc']) ? decrypt_data($d['customerEnc']) : null;
    $d['customer'] = clean_customer($c ?? []);
    unset($d['customerEnc']);
  } else {
    $d['customer'] = clean_customer($d['customer'] ?? []);
  }
  return $d;
}

function write_order(array $o): void {
  global $DIR;
  if (!is_dir($DIR) && !@mkdir($DIR, 0750, true)) fail('storage', 500);
  $tmp = $DIR . '/.' . $o['code'] . '.' . bin2hex(random_bytes(4)) . '.tmp';
  $o['customerEnc'] = encrypt_data($o['customer'] ?? []);
  unset($o['customer']);
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

function rate_limited(int $limit, string $name = 'ratelimit', bool $record = true): bool {
  global $DIR;
  if ($limit <= 0) return false;
  if (!is_dir($DIR) && !@mkdir($DIR, 0750, true)) return false;
  $file = $DIR . '/.' . $name . '.json';
  $fh = fopen($file, 'c+');
  if (!$fh || !flock($fh, LOCK_EX)) return false;
  $data = json_decode((string)stream_get_contents($fh), true) ?: [];
  $ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . __DIR__);
  $now = time();
  foreach ($data as $k => $hits) { $data[$k] = array_values(array_filter($hits, function ($t) use ($now) { return $t > $now - 3600; })); if (!$data[$k]) unset($data[$k]); }
  $limited = count($data[$ip] ?? []) >= $limit;
  if (!$limited && $record) $data[$ip][] = $now;
  ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($data));
  flock($fh, LOCK_UN); fclose($fh);
  return $limited;
}

/* ---------- gebruikers en inloggen ----------
 * Hoofdbeheerder: gebruikersnaam "admin" met admin_password uit config.php (platte tekst of hash).
 * Overige gebruikers staan versleuteld in data/users.json, met rol 'admin' (alles) of 'user' (orders maken, bekijken, status, PDF).
 * Na inloggen krijgt de browser een sessietoken (12 uur geldig); het wachtwoord wordt niet bewaard. */
const ROLES = ['admin', 'user'];
const SESSION_HOURS = 12;

function master_password(): string {
  global $CFG;
  $pw = (string)($CFG['admin_password'] ?? '');
  return ($pw === '' || $pw === 'wijzig-mij') ? '' : $pw;
}
function check_password(string $given, string $stored): bool {
  if ($stored === '') return false;
  return preg_match('/^\$(2y|argon2i|argon2id)\$/', $stored) === 1 ? password_verify($given, $stored) : hash_equals($stored, $given);
}
function valid_username($u): bool { return is_string($u) && preg_match('/^[a-z0-9._@-]{2,60}$/', $u) === 1; }

/* Leest of wijzigt de gebruikerslijst onder een slot; $fn krijgt de lijst en geeft hem gewijzigd terug. */
function users(?callable $fn = null): array {
  global $DIR;
  $file = dirname($DIR) . '/users.json';
  if (!is_dir(dirname($file))) return [];
  $fh = @fopen($file, 'c+');
  if (!$fh || !flock($fh, $fn ? LOCK_EX : LOCK_SH)) fail('storage', 500);
  $raw = json_decode((string)stream_get_contents($fh), true);
  $list = (is_array($raw) && is_string($raw['enc'] ?? null)) ? (decrypt_data($raw['enc']) ?? []) : [];
  if ($fn) {
    $list = array_values($fn($list));
    ftruncate($fh, 0); rewind($fh);
    fwrite($fh, json_encode(['enc' => encrypt_data($list)]));
    @chmod($file, 0600);
  }
  flock($fh, LOCK_UN); fclose($fh);
  return $list;
}
function find_user(array $list, string $name): ?array {
  foreach ($list as $u) if (($u['name'] ?? '') === $name) return $u;
  return null;
}

/* Sessies: alleen de hash van het token wordt bewaard. */
function sessions(?callable $fn = null): array {
  global $DIR;
  if (!is_dir($DIR) && !@mkdir($DIR, 0750, true)) fail('storage', 500);
  $fh = fopen($DIR . '/.sessions.json', 'c+');
  if (!$fh || !flock($fh, LOCK_EX)) fail('storage', 500);
  $data = json_decode((string)stream_get_contents($fh), true) ?: [];
  $now = time();
  foreach ($data as $k => $v) if (($v['exp'] ?? 0) < $now) unset($data[$k]);
  if ($fn) $data = $fn($data);
  ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($data));
  flock($fh, LOCK_UN); fclose($fh);
  return $data;
}

function login(array $in): array {
  global $CFG;
  $max = (int)($CFG['login_attempts_per_hour'] ?? 10);
  if (rate_limited($max, 'loginfail', false)) fail('rate_limited', 429);
  $name = strtolower(trim((string)($in['username'] ?? '')));
  if ($name === '') $name = 'admin';
  $given = is_string($in['password'] ?? null) ? $in['password'] : '';
  $user = null;
  if ($name === 'admin' && master_password() !== '') {
    if (check_password($given, master_password())) $user = ['name' => 'admin', 'role' => 'admin', 'master' => true];
  } elseif (valid_username($name)) {
    $u = find_user(users(), $name);
    if ($u && !empty($u['active']) && check_password($given, (string)($u['hash'] ?? ''))) $user = ['name' => $u['name'], 'role' => $u['role']];
  }
  if (!$user) {
    if (master_password() === '' && !users()) fail('admin_disabled', 403);
    rate_limited($max, 'loginfail');
    usleep(400000);
    fail('bad_password', 401);
  }
  $token = bin2hex(random_bytes(32));
  sessions(function ($d) use ($token, $user) { $d[hash('sha256', $token)] = $user + ['exp' => time() + SESSION_HOURS * 3600]; return $d; });
  if (empty($user['master'])) users(function ($l) use ($user) { foreach ($l as &$u) if ($u['name'] === $user['name']) $u['lastLogin'] = gmdate('c'); return $l; });
  return ['token' => $token, 'user' => ['name' => $user['name'], 'role' => $user['role'], 'master' => !empty($user['master'])]];
}

/* Controleert het sessietoken en de rol; geeft de gebruiker terug. Een geblokkeerde of verwijderde gebruiker is direct uitgelogd. */
function require_user(array $in, string $role = 'user'): array {
  $token = is_string($in['token'] ?? null) ? $in['token'] : '';
  if (!preg_match('/^[0-9a-f]{64}$/', $token)) fail('bad_password', 401);
  $key = hash('sha256', $token);
  $s = sessions()[$key] ?? null;
  if (!$s) fail('bad_password', 401);
  if (empty($s['master'])) {
    $u = find_user(users(), $s['name']);
    if (!$u || empty($u['active'])) { sessions(function ($d) use ($key) { unset($d[$key]); return $d; }); fail('bad_password', 401); }
    $s['role'] = $u['role'];
  } elseif (master_password() === '') fail('bad_password', 401);
  if ($role === 'admin' && $s['role'] !== 'admin') fail('forbidden', 403);
  return $s;
}

function user_view(array $u): array {
  return ['name' => $u['name'], 'role' => $u['role'], 'active' => !empty($u['active']), 'createdAt' => $u['createdAt'] ?? '', 'lastLogin' => $u['lastLogin'] ?? ''];
}
function new_password_ok($p): bool { return is_string($p) && strlen($p) >= 12 && strlen($p) <= 200; }

/* Logboek per order: wie deed wat (AVG: verantwoording). */
function log_event(array $o, string $by, string $what): array {
  $o['log'] = array_slice(array_merge((array)($o['log'] ?? []), [['at' => gmdate('c'), 'by' => $by, 'what' => $what]]), -50);
  return $o;
}

function lang_of($v): string { return (is_string($v) && preg_match('/^[a-z]{2}$/', $v)) ? $v : ''; }

/* Adres van de app voor de links in de e-mail: alleen uit config ('app_url').
 * Nooit afgeleid van de Host-kop van het verzoek: die is door de bezoeker te vervalsen, waarmee
 * iemand een nep-adres in de mail naar het beheer zou kunnen zetten. Zonder 'app_url' komen er geen links in de mail. */
function app_base(): string {
  global $CFG;
  return rtrim((string)($CFG['app_url'] ?? ''), '/');
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

/* Eén keer per dag: orders die langer dan retention_months niet zijn gewijzigd verwijderen, oude regels uit mail.log halen
 * en orders van vóór de versleuteling alsnog versleutelen. */
function housekeeping(): void {
  global $CFG, $DIR;
  if (!is_dir($DIR)) return;
  $mark = $DIR . '/.housekeeping';
  if (is_file($mark) && filemtime($mark) > time() - 86400) return;
  $fh = @fopen($mark, 'c');
  if (!$fh || !flock($fh, LOCK_EX | LOCK_NB)) return;
  touch($mark);
  $months = (int)($CFG['retention_months'] ?? 6);
  $cutoff = $months > 0 ? gmdate('c', strtotime('-' . $months . ' months')) : '';
  $lock = fopen($DIR . '/.lock', 'c');
  if ($lock && flock($lock, LOCK_EX)) {
    foreach (glob($DIR . '/*.json') ?: [] as $f) {
      $o = read_order_file($f);
      if (!$o || !valid_code($o['code'] ?? null) || basename($f) !== $o['code'] . '.json') continue;
      if ($cutoff !== '' && (string)($o['updatedAt'] ?? '') < $cutoff) { @unlink($f); continue; }
      $raw = json_decode((string)file_get_contents($f), true);
      if (is_array($raw) && !isset($raw['customerEnc'])) write_order($o);
    }
    flock($lock, LOCK_UN); fclose($lock);
  }
  $log = dirname($DIR) . '/mail.log';
  if ($cutoff !== '' && is_file($log)) {
    $keep = array_filter(file($log) ?: [], function ($l) use ($cutoff) { return substr($l, 0, 25) >= substr($cutoff, 0, 25); });
    @file_put_contents($log, implode('', $keep), LOCK_EX);
  }
  flock($fh, LOCK_UN); fclose($fh);
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
housekeeping();

switch ($action) {
  case 'ping':
    out(['ok' => true, 'publicCreate' => !empty($CFG['public_create']),
      'admin' => master_password() !== '' || count(users()) > 0,
      'retentionMonths' => (int)($CFG['retention_months'] ?? 6),
      'version' => trim((string)@file_get_contents(dirname(__DIR__) . '/VERSION'))]);

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
        if (($in['privacy'] ?? null) !== true) fail('privacy_required', 422);
        $o['privacyAcceptedAt'] = $o['updatedAt'];
        $filled = 0;
        foreach ((array)$o['sheets'] as $slots) $filled += count(array_filter($slots, 'is_string'));
        if (!$filled) fail('empty_order', 422);
        $o['status'] = 'submitted';
        $o['submittedAt'] = $o['updatedAt'];
        $o = log_event($o, 'customer', 'submitted');
      }
      return $o;
    });
    if ($action === 'submit') notify($o);
    out(['ok' => true, 'order' => public_view($o)]);

  case 'login':
    out(['ok' => true] + login($in));

  case 'logout':
    $t = is_string($in['token'] ?? null) ? $in['token'] : '';
    sessions(function ($d) use ($t) { unset($d[hash('sha256', $t)]); return $d; });
    out(['ok' => true]);

  case 'me':
    $me = require_user($in);
    out(['ok' => true, 'user' => ['name' => $me['name'], 'role' => $me['role'], 'master' => !empty($me['master'])]]);

  case 'list':
    require_user($in);
    $list = [];
    foreach (glob($DIR . '/*.json') ?: [] as $f) {
      $o = read_order_file($f);
      if (!$o || !valid_code($o['code'] ?? null)) continue;
      $filled = 0; $total = 0; $perSheet = [];
      foreach ((array)$o['sheets'] as $id => $slots) {
        $n = count(array_filter($slots, 'is_string'));
        $filled += $n; $total += count($slots);
        if ($n) $perSheet[$id] = array_count_values(array_filter($slots, 'is_string'));
      }
      $list[] = public_view($o) + ['createdBy' => $o['createdBy'] ?? '', 'log' => $o['log'] ?? [], 'filled' => $filled, 'totals' => (object)$perSheet];
    }
    usort($list, function ($a, $b) { return strcmp($b['updatedAt'], $a['updatedAt']); });
    out(['ok' => true, 'orders' => $list]);

  case 'admin_create':
    $me = require_user($in);
    $o = create_order(clean_customer($in['customer'] ?? []), lang_of($in['lang'] ?? ''), $me['name']);
    $o = with_order($o['code'], function (array $o) use ($me) { return log_event($o, $me['name'], 'created'); });
    out(['ok' => true, 'order' => public_view($o)]);

  case 'status':
    $me = require_user($in);
    if (!valid_code($in['code'] ?? null)) fail('bad_code');
    if (!in_array($in['status'] ?? null, STATUSES, true)) fail('bad_status');
    $o = with_order($in['code'], function (array $o) use ($in, $me) {
      $o['status'] = $in['status'];
      $o['updatedAt'] = gmdate('c');
      return log_event($o, $me['name'], 'status:' . $in['status']);
    });
    out(['ok' => true, 'order' => public_view($o)]);

  case 'make_hash':
    require_user($in, 'admin');
    $new = $in['newPassword'] ?? null;
    if (!is_string($new) || strlen($new) < 12 || strlen($new) > 200 || strpbrk($new, "'\\") !== false) fail('bad_password_format');
    out(['ok' => true, 'hash' => password_hash($new, PASSWORD_DEFAULT)]);

  case 'test_mail':
    require_user($in, 'admin');
    $host = strtolower(preg_replace('/^www\./', '', preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? ''))));
    if (preg_match('/^[\d.]+$|^\[|^localhost$/', $host)) $host = '';  // lokaal testen: geen waarschuwing
    $from = strtolower((string)($CFG['mail_from'] ?? ''));
    $fromDomain = substr(strrchr($from, '@') ?: '', 1);
    $sample = ['code' => 'TEST-TEST-TEST', 'customer' => clean_customer(['name' => 'Test', 'company' => 'Test', 'email' => '']),
      'sheets' => ['sheet1' => ['Ambulance_Size_A_Type_1', 'Ambulance_Size_A_Type_1', null]]];
    out(['ok' => true, 'mailFunction' => function_exists('mail'), 'recipients' => count(recipients()), 'from' => $from,
      'fromMatchesHost' => $fromDomain !== '' && ($host === '' || $host === $fromDomain || substr($host, -strlen('.' . $fromDomain)) === '.' . $fromDomain),
      'results' => notify($sample, 'TEST')]);

  case 'users':
    require_user($in, 'admin');
    out(['ok' => true, 'users' => array_map('user_view', users())]);

  case 'user_save':
    $me = require_user($in, 'admin');
    $name = strtolower(trim((string)($in['name'] ?? '')));
    if (!valid_username($name) || $name === 'admin') fail('bad_username');
    $role = in_array($in['role'] ?? null, ROLES, true) ? $in['role'] : 'user';
    $pw = $in['password'] ?? null;
    if ($pw !== null && $pw !== '' && !new_password_ok($pw)) fail('bad_password_format');
    users(function ($list) use ($name, $role, $pw, $in) {
      $found = false;
      foreach ($list as &$u) {
        if ($u['name'] !== $name) continue;
        $found = true;
        $u['role'] = $role;
        if (array_key_exists('active', $in)) $u['active'] = (bool)$in['active'];
        if (is_string($pw) && $pw !== '') $u['hash'] = password_hash($pw, PASSWORD_DEFAULT);
      }
      unset($u);
      if (!$found) {
        if (!is_string($pw) || $pw === '') fail('bad_password_format');
        if (count($list) >= 50) fail('too_many_users');
        $list[] = ['name' => $name, 'role' => $role, 'hash' => password_hash($pw, PASSWORD_DEFAULT), 'active' => true, 'createdAt' => gmdate('c')];
      }
      return $list;
    });
    out(['ok' => true, 'users' => array_map('user_view', users())]);

  case 'user_delete':
    require_user($in, 'admin');
    $name = (string)($in['name'] ?? '');
    users(function ($list) use ($name) { return array_filter($list, function ($u) use ($name) { return $u['name'] !== $name; }); });
    out(['ok' => true, 'users' => array_map('user_view', users())]);

  case 'password':
    $me = require_user($in);
    if (!empty($me['master'])) fail('master_password');
    $u = find_user(users(), $me['name']);
    if (!$u || !check_password((string)($in['old'] ?? ''), (string)$u['hash'])) { usleep(400000); fail('bad_old_password', 401); }
    if (!new_password_ok($in['new'] ?? null)) fail('bad_password_format');
    users(function ($list) use ($me, $in) { foreach ($list as &$x) if ($x['name'] === $me['name']) $x['hash'] = password_hash($in['new'], PASSWORD_DEFAULT); return $list; });
    out(['ok' => true]);

  case 'delete':
    require_user($in, 'admin');
    if (!valid_code($in['code'] ?? null)) fail('bad_code');
    if (!is_file(path_for($in['code']))) fail('not_found', 404);
    @unlink(path_for($in['code']));
    out(['ok' => true]);

  default:
    fail('unknown_action');
}
