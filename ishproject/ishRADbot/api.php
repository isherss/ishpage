<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const ISHRADBOT_NAME = 'ish';
const ISHRADBOT_CODE = 7419;
const ISHRADBOT_MEMBERSHIP_TYPE = 3; // Steam
const ISHRADBOT_RAID_MODE = 4;
const ISHRADBOT_CACHE_SECONDS = 120;

function radbotReply(int $status, array $payload): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function radbotApiKey(): string
{
    $environmentKey = getenv('BUNGIE_API_KEY');
    if (is_string($environmentKey) && trim($environmentKey) !== '') {
        return trim($environmentKey);
    }

    $privateConfigPath = dirname(__DIR__, 2) . '/rngmine/private/bungie.php';
    if (is_file($privateConfigPath)) {
        $privateConfig = require $privateConfigPath;
        if (is_array($privateConfig) && is_string($privateConfig['apiKey'] ?? null)) {
            return trim($privateConfig['apiKey']);
        }
    }
    return '';
}

function radbotBungie(string $path, string $apiKey, ?array $body = null): array
{
    if (!function_exists('curl_init')) {
        throw new RuntimeException('The site PHP setup needs the cURL extension enabled for Bungie API requests.');
    }
    $handle = curl_init('https://www.bungie.net/Platform' . $path);
    if ($handle === false) {
        throw new RuntimeException('Could not start the Bungie API request.');
    }
    $headers = ['X-API-Key: ' . $apiKey, 'Accept: application/json'];
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 18,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_USERAGENT => 'ishRADbot/1.0',
    ];
    if ($body !== null) {
        $jsonBody = json_encode($body);
        if (!is_string($jsonBody)) {
            curl_close($handle);
            throw new RuntimeException('Could not encode the Bungie API request.');
        }
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = $jsonBody;
        $options[CURLOPT_HTTPHEADER][] = 'Content-Type: application/json';
    }
    curl_setopt_array($handle, $options);
    $responseText = curl_exec($handle);
    $curlError = curl_error($handle);
    $httpStatus = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    if (!is_string($responseText)) {
        throw new RuntimeException('Bungie API request failed: ' . ($curlError ?: 'no response received'));
    }
    $decoded = json_decode($responseText, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Bungie returned a response that could not be read.');
    }
    if ($httpStatus < 200 || $httpStatus >= 300 || (int) ($decoded['ErrorCode'] ?? 0) !== 1) {
        $message = trim((string) ($decoded['Message'] ?? 'Bungie API request was rejected.'));
        throw new RuntimeException($message);
    }
    $result = $decoded['Response'] ?? [];
    return is_array($result) ? $result : [];
}

function radbotActivityDefinition(int $hash, string $apiKey, array &$definitionCache): array
{
    if (isset($definitionCache[$hash])) {
        return $definitionCache[$hash];
    }
    $definition = radbotBungie('/Destiny2/Manifest/DestinyActivityDefinition/' . $hash . '/?lc=en', $apiKey);
    $definitionCache[$hash] = $definition;
    return $definition;
}

function radbotBuildData(string $apiKey): array
{
    $search = radbotBungie('/Destiny2/SearchDestinyPlayerByBungieName/' . ISHRADBOT_MEMBERSHIP_TYPE . '/', $apiKey, [
        'displayName' => ISHRADBOT_NAME,
        'displayNameCode' => ISHRADBOT_CODE,
    ]);
    if (!is_array($search) || count($search) === 0) {
        throw new RuntimeException('Could not find ish#7419 on Steam. Check the Bungie name and platform.');
    }
    $member = null;
    foreach ($search as $candidate) {
        if (!is_array($candidate)) continue;
        if ((int) ($candidate['membershipType'] ?? -1) !== ISHRADBOT_MEMBERSHIP_TYPE) continue;
        if (isset($candidate['bungieGlobalDisplayName']) && strcasecmp((string) $candidate['bungieGlobalDisplayName'], ISHRADBOT_NAME) !== 0) continue;
        if (isset($candidate['bungieGlobalDisplayNameCode']) && (int) $candidate['bungieGlobalDisplayNameCode'] !== ISHRADBOT_CODE) continue;
        $member = $candidate;
        break;
    }
    if (!is_array($member) || empty($member['membershipId'])) {
        throw new RuntimeException('Bungie found the name, but did not return a Steam membership for it.');
    }

    $membershipId = (string) $member['membershipId'];
    $profile = radbotBungie('/Destiny2/' . ISHRADBOT_MEMBERSHIP_TYPE . '/Profile/' . rawurlencode($membershipId) . '/?components=100,200,204,1000', $apiKey);
    $characters = $profile['characters']['data'] ?? [];
    $characterActivities = $profile['characterActivities']['data'] ?? [];
    $transitory = $profile['profileTransitoryData']['data'] ?? [];

    $activityDefinitionCache = [];
    $activeCharacter = null;
    foreach ($characterActivities as $characterId => $activityData) {
        if (!is_array($activityData) || (int) ($activityData['currentActivityHash'] ?? 0) === 0) continue;
        if ($activeCharacter === null || (string) ($activityData['dateActivityStarted'] ?? '') > (string) ($activeCharacter['started'] ?? '')) {
            $activeCharacter = [
                'hash' => (int) $activityData['currentActivityHash'],
                'started' => (string) ($activityData['dateActivityStarted'] ?? ''),
            ];
        }
    }

    $status = 'In orbit';
    $activityName = '';
    if ($activeCharacter !== null) {
        $status = 'In an activity';
        try {
            $activityDefinition = radbotActivityDefinition($activeCharacter['hash'], $apiKey, $activityDefinitionCache);
            $activityName = trim((string) ($activityDefinition['displayProperties']['name'] ?? ''));
        } catch (Throwable $ignored) {
            $activityName = '';
        }
    } elseif (!is_array($characters) || count($characters) === 0) {
        $status = 'Status unavailable';
    }

    $partyNames = [];
    foreach (($transitory['partyMembers'] ?? []) as $partyMember) {
        if (!is_array($partyMember)) continue;
        $name = trim((string) ($partyMember['displayName'] ?? ''));
        if ($name === '' || (string) ($partyMember['membershipId'] ?? '') === $membershipId) continue;
        $partyNames[mb_strtolower($name)] = $name;
    }
    $partyNames = array_values($partyNames);
    natcasesort($partyNames);
    $partyNames = array_values($partyNames);

    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $today = $now->format('Y-m-d');
    $weekStart = $now->modify('-6 days')->setTime(0, 0);
    $monthStart = $now->modify('-29 days')->setTime(0, 0);
    $weekDays = [];
    for ($offset = 6; $offset >= 0; $offset--) {
        $weekDays[] = $now->modify('-' . $offset . ' days')->format('Y-m-d');
    }

    $raidCounts = [];
    $seenInstances = [];
    $historyWarnings = [];
    foreach (array_keys(is_array($characters) ? $characters : []) as $characterId) {
        $page = 0;
        while ($page < 10) {
            $historyPath = '/Destiny2/' . ISHRADBOT_MEMBERSHIP_TYPE . '/Account/' . rawurlencode($membershipId)
                . '/Character/' . rawurlencode((string) $characterId) . '/Stats/Activities/?'
                . http_build_query(['count' => 250, 'mode' => ISHRADBOT_RAID_MODE, 'page' => $page]);
            try {
                $history = radbotBungie($historyPath, $apiKey);
            } catch (Throwable $error) {
                $historyWarnings[] = $error->getMessage();
                break;
            }
            $activities = $history['activities'] ?? [];
            if (!is_array($activities) || count($activities) === 0) break;
            $oldestPeriod = null;
            foreach ($activities as $entry) {
                if (!is_array($entry)) continue;
                $period = (string) ($entry[' period'] ?? $entry['period'] ?? '');
                $timestamp = strtotime($period);
                if ($timestamp === false) continue;
                $oldestPeriod = $timestamp;
                $day = gmdate('Y-m-d', $timestamp);
                if ($timestamp < $monthStart->getTimestamp()) continue;
                $activityDetails = $entry['activityDetails'] ?? [];
                $instanceId = (string) ($activityDetails['instanceId'] ?? '');
                if ($instanceId !== '' && isset($seenInstances[$instanceId])) continue;
                $completion = $entry['values']['completed']['basic']['value'] ?? null;
                if (!is_numeric($completion) || (float) $completion < 1) continue;
                $definitionHash = (int) ($activityDetails['directorActivityHash'] ?? 0);
                if ($definitionHash === 0) $definitionHash = (int) ($activityDetails['referenceId'] ?? 0);
                if ($definitionHash === 0) continue;
                if ($instanceId !== '') $seenInstances[$instanceId] = true;
                try {
                    $definition = radbotActivityDefinition($definitionHash, $apiKey, $activityDefinitionCache);
                } catch (Throwable $ignored) {
                    $definition = [];
                }
                $raidName = trim((string) ($definition['displayProperties']['name'] ?? ''));
                if ($raidName === '') $raidName = 'Raid ' . $definitionHash;
                if (!isset($raidCounts[$raidName])) $raidCounts[$raidName] = ['days' => [], 'week' => 0, 'month' => 0];
                $raidCounts[$raidName]['month']++;
                if ($timestamp >= $weekStart->getTimestamp()) {
                    $raidCounts[$raidName]['week']++;
                    $raidCounts[$raidName]['days'][$day] = ($raidCounts[$raidName]['days'][$day] ?? 0) + 1;
                }
            }
            if ($oldestPeriod !== null && $oldestPeriod < $monthStart->getTimestamp()) break;
            if (count($activities) < 250) break;
            $page++;
        }
    }

    uasort($raidCounts, static function (array $left, array $right): int {
        return strcasecmp((string) array_key_first([$left]), (string) array_key_first([$right]));
    });
    $raids = [];
    foreach ($raidCounts as $raidName => $counts) {
        $days = [];
        foreach ($weekDays as $day) $days[$day] = (int) ($counts['days'][$day] ?? 0);
        $raids[] = ['name' => (string) $raidName, 'days' => $days, 'last7Days' => (int) $counts['week'], 'last30Days' => (int) $counts['month']];
    }

    $playerName = trim((string) ($member['bungieGlobalDisplayName'] ?? ISHRADBOT_NAME)) . '#' . str_pad((string) ($member['bungieGlobalDisplayNameCode'] ?? ISHRADBOT_CODE), 4, '0', STR_PAD_LEFT);
    return [
        'player' => ['displayName' => $playerName, 'membershipType' => ISHRADBOT_MEMBERSHIP_TYPE],
        'status' => $status,
        'activityName' => $activityName,
        'partyMembers' => $partyNames,
        'weekDays' => $weekDays,
        'raids' => $raids,
        'updatedAt' => gmdate(DATE_ATOM),
        'historyWarning' => count($historyWarnings) > 0 ? 'Some character activity histories could not be loaded. Public stats/privacy settings may limit access.' : '',
    ];
}

$apiKey = radbotApiKey();
if ($apiKey === '') {
    radbotReply(503, ['error' => 'Bungie API key is not configured. Add it to BUNGIE_API_KEY on the server or to rngmine/private/bungie.php.']);
}

$cachePath = dirname(__DIR__, 2) . '/rngmine/private/ishradbot-cache.json';
if (is_file($cachePath) && (time() - (int) filemtime($cachePath)) < ISHRADBOT_CACHE_SECONDS) {
    $cached = json_decode((string) file_get_contents($cachePath), true);
    if (is_array($cached)) radbotReply(200, $cached);
}

try {
    $data = radbotBuildData($apiKey);
    @file_put_contents($cachePath, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE), LOCK_EX);
    radbotReply(200, $data);
} catch (Throwable $error) {
    error_log('ishRADbot Bungie API error: ' . $error->getMessage());
    radbotReply(502, ['error' => 'Could not retrieve ishRADbot data from Bungie. Check the server API key, player privacy, or Bungie API availability.']);
}