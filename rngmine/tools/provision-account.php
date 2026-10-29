<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../lib/bootstrap.php';

function read_secret(string $prompt): string
{
    fwrite(STDOUT, $prompt);
    $hidden = DIRECTORY_SEPARATOR === '/' && function_exists('shell_exec');
    if ($hidden) {
        shell_exec('stty -echo');
    }
    $value = trim((string) fgets(STDIN));
    if ($hidden) {
        shell_exec('stty echo');
        fwrite(STDOUT, PHP_EOL);
    }
    return $value;
}

$username = $argv[1] ?? '';
if ($username === '') {
    fwrite(STDOUT, 'Username: ');
    $username = trim((string) fgets(STDIN));
}
if (!preg_match('/^[A-Za-z0-9_.-]{3,32}$/', $username)) {
    fwrite(STDERR, "Username must be 3–32 characters: letters, numbers, dot, underscore, or hyphen.\n");
    exit(1);
}

$password = read_secret('Password (at least 12 characters): ');
$confirm = read_secret('Confirm password: ');
if (strlen($password) < 12 || !hash_equals($password, $confirm)) {
    fwrite(STDERR, "Passwords must match and be at least 12 characters long.\n");
    exit(1);
}

try {
    $pdo = rng_db();
    $insert = $pdo->prepare('INSERT INTO rngmine_users (username, username_key, password_hash) VALUES (?, ?, ?)');
    $insert->execute([$username, strtolower($username), password_hash($password, PASSWORD_DEFAULT)]);
    fwrite(STDOUT, "Account created for {$username}. No public signup route is available.\n");
} catch (PDOException $error) {
    if ((string) $error->getCode() === '23000') {
        fwrite(STDERR, "That username already exists.\n");
    } else {
        error_log($error->getMessage());
        fwrite(STDERR, "Account creation failed. Check the private database configuration.\n");
    }
    exit(1);
}
