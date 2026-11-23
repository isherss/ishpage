<?php
declare(strict_types=1);

const SPOTIFY_CLIENT_ID = '0028cf65156e46e7a2253b63542d59c1';
const SPOTIFY_REDIRECT_URI = 'https://ishpage.xyz/ishStuff/ishMusic/spotify.php';
const SPOTIFY_SCOPE = 'user-read-recently-played';

function jsonResponse(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function spotifyRequest(string $url, string $method = 'GET', array $headers = [], ?string $body = null): array
{
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $body ?? '',
        'ignore_errors' => true,
        'timeout' => 15,
    ]]);
    $response = @file_get_contents($url, false, $context);
    $status = 0;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $match)) {
            $status = (int) $match[1];
            break;
        }
    }
    $decoded = is_string($response) ? json_decode($response, true) : null;
    return [$status, is_array($decoded) ? $decoded : [], is_string($response) ? $response : ''];
}

function tokenPath(): string
{
    return __DIR__ . '/private/spotify-token.json';
}

function artistCachePath(): string
{
    return __DIR__ . '/private/artist-cache.json';
}

function readSavedToken(): array
{
    $contents = @file_get_contents(tokenPath());
    $token = is_string($contents) ? json_decode($contents, true) : null;
    return is_array($token) ? $token : [];
}

function saveToken(array $token): void
{
    $directory = dirname(tokenPath());
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Could not create the private Spotify token directory.');
    }
    $temporary = tokenPath() . '.' . bin2hex(random_bytes(5)) . '.tmp';
    $encoded = json_encode($token, JSON_UNESCAPED_SLASHES);
    if ($encoded === false || file_put_contents($temporary, $encoded, LOCK_EX) === false) {
        throw new RuntimeException('Could not save Spotify authorization.');
    }
    @chmod($temporary, 0600);
    if (!rename($temporary, tokenPath())) {
        @unlink($temporary);
        throw new RuntimeException('Could not save Spotify authorization.');
    }
    @chmod(tokenPath(), 0600);
}

function clientSecret(): string
{
    $secret = getenv('ISHPAGE_SPOTIFY_CLIENT_SECRET');
    if (is_string($secret) && trim($secret) !== '') {
        return trim($secret);
    }

    // Keep the Spotify secret beside the other server-side API keys.
    $privateConfigPath = dirname(__DIR__, 2) . '/rngmine/private/spotify-config.php';
    if (is_file($privateConfigPath)) {
        $privateConfig = require $privateConfigPath;
        if (is_array($privateConfig) && !empty($privateConfig['spotify_client_secret'])) {
            return trim((string) $privateConfig['spotify_client_secret']);
        }
    }
    return '';
}

function refreshAccessToken(array $saved): array
{
    $refreshToken = (string) ($saved['refresh_token'] ?? '');
    if ($refreshToken === '' || clientSecret() === '') {
        return [];
    }
    [$status, $response] = spotifyRequest(
        'https://accounts.spotify.com/api/token',
        'POST',
        [
            'Authorization: Basic ' . base64_encode(SPOTIFY_CLIENT_ID . ':' . clientSecret()),
            'Content-Type: application/x-www-form-urlencoded',
        ],
        http_build_query(['grant_type' => 'refresh_token', 'refresh_token' => $refreshToken])
    );
    if ($status < 200 || $status >= 300 || empty($response['access_token'])) {
        return [];
    }
    $saved['access_token'] = $response['access_token'];
    $saved['expires_at'] = time() + (int) ($response['expires_in'] ?? 3600);
    if (!empty($response['refresh_token'])) {
        $saved['refresh_token'] = $response['refresh_token'];
    }
    saveToken($saved);
    return $saved;
}

function validAccessToken(array $saved): array
{
    if (!empty($saved['access_token']) && (int) ($saved['expires_at'] ?? 0) > time() + 60) {
        return $saved;
    }
    return refreshAccessToken($saved);
}

function finishCallback(): void
{
    if (!empty($_GET['error'])) {
        http_response_code(400);
        exit('Spotify authorization was declined. You can close this window.');
    }
    $expectedState = (string) ($_SESSION['spotify_oauth_state'] ?? '');
    $actualState = (string) ($_GET['state'] ?? '');
    unset($_SESSION['spotify_oauth_state']);
    if ($expectedState === '' || !hash_equals($expectedState, $actualState) || empty($_GET['code'])) {
        http_response_code(400);
        exit('Spotify authorization could not be verified. Return to ishMusic and try again.');
    }
    if (clientSecret() === '') {
        http_response_code(500);
        exit('The site administrator must configure ISHPAGE_SPOTIFY_CLIENT_SECRET on the server.');
    }
    [$status, $response] = spotifyRequest(
        'https://accounts.spotify.com/api/token',
        'POST',
        [
            'Authorization: Basic ' . base64_encode(SPOTIFY_CLIENT_ID . ':' . clientSecret()),
            'Content-Type: application/x-www-form-urlencoded',
        ],
        http_build_query([
            'grant_type' => 'authorization_code',
            'code' => (string) $_GET['code'],
            'redirect_uri' => SPOTIFY_REDIRECT_URI,
        ])
    );
    if ($status < 200 || $status >= 300 || empty($response['access_token']) || empty($response['refresh_token'])) {
        http_response_code(502);
        exit('Spotify could not complete authorization. Check the client credentials and redirect URI.');
    }
    try {
        saveToken([
            'access_token' => $response['access_token'],
            'refresh_token' => $response['refresh_token'],
            'expires_at' => time() + (int) ($response['expires_in'] ?? 3600),
        ]);
    } catch (Throwable $error) {
        http_response_code(500);
        exit('Spotify connected, but the site could not securely save the refresh token.');
    }
    header('Location: /ishStuff/ishMusic/#spotifyArtist', true, 303);
    exit;
}

function getArtistSummary(): void
{
    $cachedContents = @file_get_contents(artistCachePath());
    $cached = is_string($cachedContents) ? json_decode($cachedContents, true) : null;
    if (is_array($cached) && (int) ($cached['cached_at'] ?? 0) > time() - 300) {
        unset($cached['cached_at']);
        jsonResponse($cached);
    }
    $saved = validAccessToken(readSavedToken());
    if (empty($saved['access_token'])) {
        jsonResponse(['connected' => false]);
    }

    $after = (int) floor((time() - 7 * 24 * 60 * 60) * 1000);
    $url = 'https://api.spotify.com/v1/me/player/recently-played?' . http_build_query(['after' => $after, 'limit' => 50]);
    $counts = [];
    $pages = 0;
    $updatedAt = gmdate(DATE_ATOM);
    while ($url !== '' && $pages < 20) {
        [$status, $page] = spotifyRequest($url, 'GET', ['Authorization: Bearer ' . $saved['access_token']]);
        if ($status === 401) {
            $saved = refreshAccessToken($saved);
            if (empty($saved['access_token'])) {
                jsonResponse(['error' => 'Spotify authorization expired. Reconnect the account.'], 401);
            }
            [$status, $page] = spotifyRequest($url, 'GET', ['Authorization: Bearer ' . $saved['access_token']]);
        }
        if ($status < 200 || $status >= 300) {
            jsonResponse(['error' => 'Spotify could not return recent listening history (HTTP ' . $status . ').'], 502);
        }
        $items = $page['items'] ?? [];
        foreach ($items as $item) {
            $playedAt = strtotime((string) ($item['played_at'] ?? ''));
            if ($playedAt === false || $playedAt < time() - 7 * 24 * 60 * 60) {
                continue;
            }
            foreach (($item['track']['artists'] ?? []) as $artist) {
                $id = (string) ($artist['id'] ?? $artist['name'] ?? '');
                if ($id === '') {
                    continue;
                }
                if (!isset($counts[$id])) {
                    $counts[$id] = ['artist' => (string) ($artist['name'] ?? 'Unknown artist'), 'plays' => 0, 'image' => ''];
                }
                $counts[$id]['plays']++;
            }
        }
        $url = (string) ($page['next'] ?? '');
        $pages++;
    }
    if ($counts === []) {
        $summary = ['connected' => true, 'artist' => null, 'updated' => $updatedAt];
        @file_put_contents(artistCachePath(), json_encode($summary + ['cached_at' => time()]), LOCK_EX);
        jsonResponse($summary);
    }
    uasort($counts, static fn(array $left, array $right): int => $right['plays'] <=> $left['plays']);
    $winner = reset($counts);
    $summary = [
        'connected' => true,
        'artist' => $winner['artist'],
        'plays' => $winner['plays'],
        'image' => $winner['image'],
        'updated' => $updatedAt,
    ];
    @file_put_contents(artistCachePath(), json_encode($summary + ['cached_at' => time()]), LOCK_EX);
    jsonResponse($summary);
}

$secure = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_set_cookie_params(['httponly' => true, 'secure' => $secure, 'samesite' => 'Lax', 'path' => '/']);
session_start();
$action = (string) ($_GET['action'] ?? 'callback');

if ($action === 'artist') {
    if (clientSecret() === '') {
        jsonResponse(['connected' => false, 'configured' => false]);
    }
    getArtistSummary();
}

if ($action === 'connect') {
    if (clientSecret() === '') {
        http_response_code(503);
        exit('The site administrator must configure ISHPAGE_SPOTIFY_CLIENT_SECRET on the server before connecting Spotify.');
    }
    $state = bin2hex(random_bytes(24));
    $_SESSION['spotify_oauth_state'] = $state;
    $authorize = 'https://accounts.spotify.com/authorize?' . http_build_query([
        'client_id' => SPOTIFY_CLIENT_ID,
        'response_type' => 'code',
        'redirect_uri' => SPOTIFY_REDIRECT_URI,
        'scope' => SPOTIFY_SCOPE,
        'state' => $state,
    ]);
    header('Location: ' . $authorize, true, 302);
    exit;
}

if ($action === 'callback') {
    if (!empty($_GET['code']) || !empty($_GET['error'])) {
        finishCallback();
    }
    jsonResponse(['error' => 'Unknown Spotify action.'], 400);
}

jsonResponse(['error' => 'Unknown Spotify action.'], 400);
