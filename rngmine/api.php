<?php
declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
rng_start_session();

$action = (string) ($_GET['action'] ?? '');
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

try {
    $pdo = rng_db();

    if ($action === 'session' && $method === 'GET') {
        $id = $_SESSION['user_id'] ?? null;
        if (!is_int($id) && !ctype_digit((string) $id)) {
            rng_json(['authenticated' => false]);
        }
        $query = $pdo->prepare('SELECT id, username FROM rngmine_users WHERE id = ?');
        $query->execute([(int) $id]);
        $user = $query->fetch();
        if (!$user) {
            $_SESSION = [];
            session_destroy();
            rng_json(['authenticated' => false]);
        }
        if (!isset($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        rng_json(['authenticated' => true, 'username' => $user['username'], 'csrf' => $_SESSION['csrf']]);
    }

    if ($action === 'login' && $method === 'POST') {
        if (!rng_same_origin()) {
            rng_json(['error' => 'Request rejected.'], 403);
        }
        $data = rng_request_json();
        $username = trim((string) ($data['username'] ?? ''));
        $password = (string) ($data['password'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_.-]{3,32}$/', $username) || $password === '' || strlen($password) > 1024) {
            rng_json(['error' => 'Invalid username or password.'], 400);
        }

        $now = time();
        if (($now - (int) ($_SESSION['login_window'] ?? 0)) > 900) {
            $_SESSION['login_window'] = $now;
            $_SESSION['login_attempts'] = 0;
        }
        if ((int) ($_SESSION['login_attempts'] ?? 0) >= 8) {
            rng_json(['error' => 'Too many attempts. Wait 15 minutes and try again.'], 429);
        }
        $_SESSION['login_attempts'] = (int) ($_SESSION['login_attempts'] ?? 0) + 1;

        $fileAccounts = rng_manual_accounts();
        if ($fileAccounts !== null) {
            $manualAccount = $fileAccounts[strtolower($username)] ?? null;
            if (!$manualAccount || !hash_equals($manualAccount['password'], $password)) {
                rng_json(['error' => 'Invalid username or password.'], 401);
            }
            $username = $manualAccount['username'];
            $query = $pdo->prepare('SELECT id, username, password_hash FROM rngmine_users WHERE username_key = ?');
            $query->execute([strtolower($username)]);
            $user = $query->fetch();
            if (!$user) {
                $insert = $pdo->prepare('INSERT INTO rngmine_users (username, username_key, password_hash) VALUES (?, ?, ?)');
                $insert->execute([$username, strtolower($username), password_hash($password, PASSWORD_DEFAULT)]);
                $query->execute([strtolower($username)]);
                $user = $query->fetch();
            } elseif (!password_verify($password, $user['password_hash'])) {
                $update = $pdo->prepare('UPDATE rngmine_users SET password_hash = ? WHERE id = ?');
                $update->execute([password_hash($password, PASSWORD_DEFAULT), (int) $user['id']]);
            }
        } else {
            $query = $pdo->prepare('SELECT id, username, password_hash FROM rngmine_users WHERE username_key = ?');
            $query->execute([strtolower($username)]);
            $user = $query->fetch();
            if (!$user || !password_verify($password, $user['password_hash'])) {
                rng_json(['error' => 'Invalid username or password.'], 401);
            }
        }

        session_regenerate_id(true);
        $_SESSION['user_id'] = (int) $user['id'];
        $_SESSION['login_attempts'] = 0;
        $_SESSION['login_window'] = $now;
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $update = $pdo->prepare('UPDATE rngmine_users SET password_hash = ? WHERE id = ?');
            $update->execute([password_hash($password, PASSWORD_DEFAULT), (int) $user['id']]);
        }
        rng_json(['authenticated' => true, 'username' => $user['username'], 'csrf' => $_SESSION['csrf']]);
    }

    if ($action === 'logout' && $method === 'POST') {
        if (!rng_same_origin()) {
            rng_json(['error' => 'Request rejected.'], 403);
        }
        $data = rng_request_json();
        rng_require_user($pdo);
        rng_require_csrf($data);
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'],
                'secure' => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => $params['samesite'] ?? 'Strict',
            ]);
        }
        session_destroy();
        rng_json(['ok' => true]);
    }

    if ($action === 'state' && $method === 'GET') {
        $user = rng_require_user($pdo);
        $query = $pdo->prepare('SELECT state_json, updated_at FROM rngmine_saves WHERE user_id = ?');
        $query->execute([(int) $user['id']]);
        $row = $query->fetch();
        rng_json(['state' => $row ? json_decode($row['state_json'], true) : null]);
    }

    if ($action === 'state' && in_array($method, ['PUT', 'POST'], true)) {
        if (!rng_same_origin()) {
            rng_json(['error' => 'Request rejected.'], 403);
        }
        $data = rng_request_json();
        $user = rng_require_user($pdo);
        rng_require_csrf($data);
        if (!isset($data['state']) || !is_array($data['state'])) {
            rng_json(['error' => 'Invalid save data.'], 400);
        }
        $state = json_encode($data['state'], JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        if (!is_string($state) || strlen($state) > 500000) {
            rng_json(['error' => 'Save data is too large.'], 413);
        }
        $save = $pdo->prepare('INSERT INTO rngmine_saves (user_id, state_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_json = VALUES(state_json), updated_at = CURRENT_TIMESTAMP');
        $save->execute([(int) $user['id'], $state]);
        rng_json(['ok' => true]);
    }

    rng_json(['error' => 'Not found.'], 404);
} catch (Throwable $error) {
    error_log('RNGmine account API: ' . $error->getMessage());
    if ($error instanceof RuntimeException && str_contains($error->getMessage(), 'not configured')) {
        rng_json(['error' => 'Account service is not configured yet.'], 503);
    }
    rng_json(['error' => 'Account service is temporarily unavailable.'], 503);
}
