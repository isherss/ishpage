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

    if ($action === 'leaderboard' && $method === 'GET') {
        $manualAccounts = rng_manual_accounts();
        $query = $pdo->query('SELECT u.username, p.display_name, p.name_color, s.state_json FROM rngmine_users u LEFT JOIN rngmine_profiles p ON p.user_id = u.id LEFT JOIN rngmine_saves s ON s.user_id = u.id');
        $leaders = [];
        foreach ($query->fetchAll() as $row) {
            if ($manualAccounts !== null && !isset($manualAccounts[strtolower($row['username'])])) {
                continue;
            }
            $state = json_decode((string) ($row['state_json'] ?? ''), true);
            if (!is_array($state)) {
                $state = [];
            }

            $best = is_array($state['best'] ?? null) ? $state['best'] : null;
            if ($best === null && is_array($state['history'] ?? null)) {
                foreach ($state['history'] as $entry) {
                    if (is_array($entry) && is_numeric($entry['total'] ?? null)
                        && ($best === null || (int) $entry['total'] > (int) ($best['total'] ?? 0))) {
                        $best = ['n' => $entry['n'] ?? null, 'total' => $entry['total']];
                    }
                }
            }
            $bestRoll = is_array($best) && is_numeric($best['n'] ?? null) ? (int) $best['n'] : null;
            $bestRollEp = is_array($best) && is_numeric($best['total'] ?? null) ? max(0, (int) $best['total']) : 0;
            $leaders[] = [
                'displayName' => is_string($row['display_name'] ?? null) && trim($row['display_name']) !== '' ? $row['display_name'] : (string) $row['username'],
                'nameColor' => is_string($row['name_color'] ?? null) && preg_match('/^#[0-9A-Fa-f]{6}$/', $row['name_color']) ? strtoupper($row['name_color']) : '#27F549',
                'bestRoll' => $bestRoll,
                'bestRollEp' => $bestRollEp,
                'coalMined' => max(0, (int) ($state['coalTotal'] ?? 0)),
                'rollsEarned' => max(0, (int) ($state['bonus'] ?? 0)),
                'currentCoal' => max(0, (int) ($state['progress'] ?? 0)),
                'coalLost' => max(0, (int) ($state['coalTotal'] ?? 0) - (max(0, (int) ($state['bonus'] ?? 0)) * 40 + max(0, (int) ($state['progress'] ?? 0)))),
                'totalEp' => max(0, (int) ($state['lifetime'] ?? 0)),
            ];
        }
        $blurbs = [];
        $blurbQuery = $pdo->query('SELECT b.id, b.roll_value, b.ep, b.blurb, UNIX_TIMESTAMP(b.created_at) AS created_at, u.username, p.display_name, p.name_color FROM rngmine_roll_blurbs b INNER JOIN rngmine_users u ON u.id = b.user_id LEFT JOIN rngmine_profiles p ON p.user_id = u.id ORDER BY b.created_at DESC, b.id DESC');
        foreach ($blurbQuery->fetchAll() as $row) {
            if ($manualAccounts !== null && !isset($manualAccounts[strtolower($row['username'])])) {
                continue;
            }
            $blurbs[] = [
                'id' => (int) $row['id'],
                'username' => (string) $row['username'],
                'displayName' => is_string($row['display_name'] ?? null) && trim($row['display_name']) !== '' ? $row['display_name'] : (string) $row['username'],
                'nameColor' => is_string($row['name_color'] ?? null) && preg_match('/^#[0-9A-Fa-f]{6}$/', $row['name_color']) ? strtoupper($row['name_color']) : '#27F549',
                'roll' => (int) $row['roll_value'],
                'ep' => (int) $row['ep'],
                'blurb' => (string) $row['blurb'],
                'createdAt' => (int) $row['created_at'],
            ];
        }
        $commentsByBlurb = [];
        $commentQuery = $pdo->query('SELECT c.id, c.blurb_id, c.comment_text, UNIX_TIMESTAMP(c.created_at) AS created_at, u.username, p.display_name, p.name_color FROM rngmine_blurb_comments c INNER JOIN rngmine_users u ON u.id = c.user_id LEFT JOIN rngmine_profiles p ON p.user_id = u.id ORDER BY c.created_at ASC, c.id ASC');
        foreach ($commentQuery->fetchAll() as $row) {
            if ($manualAccounts !== null && !isset($manualAccounts[strtolower($row['username'])])) {
                continue;
            }
            $blurbId = (int) $row['blurb_id'];
            $commentsByBlurb[$blurbId][] = [
                'id' => (int) $row['id'],
                'username' => (string) $row['username'],
                'displayName' => is_string($row['display_name'] ?? null) && trim($row['display_name']) !== '' ? $row['display_name'] : (string) $row['username'],
                'nameColor' => is_string($row['name_color'] ?? null) && preg_match('/^#[0-9A-Fa-f]{6}$/', $row['name_color']) ? strtoupper($row['name_color']) : '#27F549',
                'comment' => (string) $row['comment_text'],
                'createdAt' => (int) $row['created_at'],
            ];
        }
        foreach ($blurbs as &$blurb) {
            $blurb['comments'] = $commentsByBlurb[$blurb['id']] ?? [];
        }
        unset($blurb);
        usort($leaders, static function (array $a, array $b): int {
            return ($b['totalEp'] <=> $a['totalEp'])
                ?: ($b['bestRollEp'] <=> $a['bestRollEp'])
                ?: ($b['coalMined'] <=> $a['coalMined'])
                ?: strcasecmp($a['displayName'], $b['displayName']);
        });
        rng_json(['leaders' => $leaders, 'blurbs' => $blurbs]);
    }

    if ($action === 'session' && $method === 'GET') {
        $id = $_SESSION['user_id'] ?? null;
        if (!is_int($id) && !ctype_digit((string) $id)) {
            rng_json(['authenticated' => false]);
        }
        $query = $pdo->prepare('SELECT u.id, u.username, p.display_name, p.name_color FROM rngmine_users u LEFT JOIN rngmine_profiles p ON p.user_id = u.id WHERE u.id = ?');
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
        rng_json([
            'authenticated' => true,
            'username' => $user['username'],
            'displayName' => is_string($user['display_name'] ?? null) && trim($user['display_name']) !== '' ? $user['display_name'] : $user['username'],
            'nameColor' => is_string($user['name_color'] ?? null) && preg_match('/^#[0-9A-Fa-f]{6}$/', $user['name_color']) ? strtoupper($user['name_color']) : '#27F549',
            'csrf' => $_SESSION['csrf'],
        ]);
    }

    if ($action === 'profile' && $method === 'GET') {
        $user = rng_require_user($pdo);
        $query = $pdo->prepare('SELECT display_name, name_color FROM rngmine_profiles WHERE user_id = ?');
        $query->execute([(int) $user['id']]);
        $profile = $query->fetch();
        rng_json([
            'displayName' => $profile && trim($profile['display_name']) !== '' ? $profile['display_name'] : $user['username'],
            'nameColor' => $profile && preg_match('/^#[0-9A-Fa-f]{6}$/', $profile['name_color']) ? strtoupper($profile['name_color']) : '#27F549',
        ]);
    }

    if ($action === 'profile' && in_array($method, ['PUT', 'POST'], true)) {
        if (!rng_same_origin()) {
            rng_json(['error' => 'Request rejected.'], 403);
        }
        $data = rng_request_json();
        $user = rng_require_user($pdo);
        rng_require_csrf($data);
        if (!is_string($data['displayName'] ?? null) || !is_string($data['nameColor'] ?? null)) {
            rng_json(['error' => 'Enter a display name and choose a valid hex color.'], 400);
        }
        $displayName = trim($data['displayName']);
        $nameColor = strtoupper(trim($data['nameColor']));
        if (!preg_match('/^[^\x00-\x1F\x7F]{1,24}$/u', $displayName)) {
            rng_json(['error' => 'Display name must be 1 to 24 characters.'], 400);
        }
        if (!preg_match('/^#[0-9A-F]{6}$/', $nameColor)) {
            rng_json(['error' => 'Choose a valid six-digit hex color.'], 400);
        }
        $save = $pdo->prepare('INSERT INTO rngmine_profiles (user_id, display_name, name_color) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), name_color = VALUES(name_color), updated_at = CURRENT_TIMESTAMP');
        $save->execute([(int) $user['id'], $displayName, $nameColor]);
        rng_json(['displayName' => $displayName, 'nameColor' => $nameColor]);
    }

    if ($action === 'roll-blurb' && $method === 'POST') {
        if (!rng_same_origin()) {
            rng_json(['error' => 'Request rejected.'], 403);
        }
        $data = rng_request_json();
        $user = rng_require_user($pdo);
        rng_require_csrf($data);
        if (!is_numeric($data['roll'] ?? null) || !is_numeric($data['ep'] ?? null) || !is_string($data['blurb'] ?? null) || !is_string($data['rolledAt'] ?? null)) {
            rng_json(['error' => 'Invalid roll blurb.'], 400);
        }
        $roll = (int) $data['roll'];
        $ep = (int) $data['ep'];
        $blurb = trim($data['blurb']);
        $characters = preg_match_all('/./us', $blurb);
        $rolledAt = strtotime($data['rolledAt']);
        if ($roll < 0 || $roll > 1000000 || $ep < 0 || $ep > 1000000000 || $blurb === '' || $characters === false || $characters > 500 || $rolledAt === false) {
            rng_json(['error' => 'Blurb must be 1 to 500 characters.'], 400);
        }
        $save = $pdo->prepare('INSERT INTO rngmine_roll_blurbs (user_id, roll_value, ep, blurb, created_at) VALUES (?, ?, ?, ?, FROM_UNIXTIME(?))');
        $save->execute([(int) $user['id'], $roll, $ep, $blurb, $rolledAt]);
        rng_json(['ok' => true]);
    }
    if ($action === 'blurb-comment' && $method === 'POST') {
        if (!rng_same_origin()) {
            rng_json(['error' => 'Request rejected.'], 403);
        }
        $data = rng_request_json();
        $user = rng_require_user($pdo);
        rng_require_csrf($data);
        if (!is_numeric($data['blurbId'] ?? null) || !is_string($data['comment'] ?? null)) {
            rng_json(['error' => 'Invalid comment.'], 400);
        }
        $blurbId = (int) $data['blurbId'];
        $comment = trim($data['comment']);
        $characters = preg_match_all('/./us', $comment);
        if ($blurbId < 1 || $comment === '' || $characters === false || $characters > 1000) {
            rng_json(['error' => 'Comments must be 1 to 1000 characters.'], 400);
        }
        $exists = $pdo->prepare('SELECT id FROM rngmine_roll_blurbs WHERE id = ?');
        $exists->execute([$blurbId]);
        if (!$exists->fetch()) {
            rng_json(['error' => 'Blurb not found.'], 404);
        }
        $save = $pdo->prepare('INSERT INTO rngmine_blurb_comments (blurb_id, user_id, comment_text) VALUES (?, ?, ?)');
        $save->execute([$blurbId, (int) $user['id'], $comment]);
        rng_json(['ok' => true]);
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
        if (!is_string($state) || strlen($state) > 15000000) {
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
