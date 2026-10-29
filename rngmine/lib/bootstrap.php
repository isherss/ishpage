<?php
declare(strict_types=1);

function rng_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $configFile = __DIR__ . '/../private/config.php';
    if (!is_file($configFile)) {
        throw new RuntimeException('Account storage is not configured.');
    }

    $config = require $configFile;
    foreach (['host', 'database', 'username', 'password'] as $key) {
        if (!isset($config[$key]) || !is_string($config[$key]) || $config[$key] === '') {
            throw new RuntimeException('Account storage is not configured.');
        }
    }

    $charset = $config['charset'] ?? 'utf8mb4';
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $config['host'], $config['database'], $charset);
    $pdo = new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    $pdo->exec("CREATE TABLE IF NOT EXISTS rngmine_users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(32) NOT NULL,
        username_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS rngmine_saves (
        user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        state_json MEDIUMTEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT rngmine_saves_user_fk FOREIGN KEY (user_id) REFERENCES rngmine_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS rngmine_profiles (
        user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        display_name VARCHAR(96) NOT NULL,
        name_color CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '#27F549',
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT rngmine_profiles_user_fk FOREIGN KEY (user_id) REFERENCES rngmine_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    return $pdo;
}

/** Return manually maintained username/password pairs, or null when DB accounts are used. */
function rng_manual_accounts(): ?array
{
    $accountsFile = __DIR__ . '/../private/accounts.php';
    if (!is_file($accountsFile)) {
        return null;
    }

    $accounts = require $accountsFile;
    if (!is_array($accounts)) {
        throw new RuntimeException('Manual account file must return an array.');
    }

    $normalized = [];
    foreach ($accounts as $username => $password) {
        $username = (string) $username;
        if (!preg_match('/^[A-Za-z0-9_.-]{3,32}$/', $username)
            || !is_string($password)
            || $password === ''
            || strlen($password) > 1024) {
            throw new RuntimeException('Manual account file contains an invalid entry.');
        }
        $normalized[strtolower($username)] = ['username' => $username, 'password' => $password];
    }

    return $normalized;
}

function rng_json(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function rng_start_session(): void
{
    $secure = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
    $dir = str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')));
    $path = rtrim($dir, '/') . '/';
    if ($path === '//') {
        $path = '/';
    }

    session_name('RNGMINESESSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => $path,
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function rng_same_origin(): bool
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        return true;
    }
    $originHost = strtolower((string) parse_url($origin, PHP_URL_HOST));
    $requestHost = strtolower((string) parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST));
    return $originHost !== '' && $originHost === $requestHost;
}

function rng_request_json(): array
{
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > 524288) {
        rng_json(['error' => 'Request is too large.'], 413);
    }
    $raw = file_get_contents('php://input');
    if ($raw === false || strlen($raw) > 524288) {
        rng_json(['error' => 'Request is too large.'], 413);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        rng_json(['error' => 'Invalid request.'], 400);
    }
    return $data;
}

function rng_require_user(PDO $pdo): array
{
    $id = $_SESSION['user_id'] ?? null;
    if (!is_int($id) && !ctype_digit((string) $id)) {
        rng_json(['error' => 'Please log in.'], 401);
    }
    $query = $pdo->prepare('SELECT id, username FROM rngmine_users WHERE id = ?');
    $query->execute([(int) $id]);
    $user = $query->fetch();
    if (!$user) {
        $_SESSION = [];
        session_destroy();
        rng_json(['error' => 'Please log in.'], 401);
    }
    return $user;
}

function rng_require_csrf(array $data): void
{
    $token = $data['csrf'] ?? '';
    if (!is_string($token) || !isset($_SESSION['csrf']) || !hash_equals((string) $_SESSION['csrf'], $token)) {
        rng_json(['error' => 'Your session expired. Please try again.'], 403);
    }
}
