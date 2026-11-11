<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

const ISHRADBOT_NAME = 'ish';
const ISHRADBOT_CODE = 7419;
const ISHRADBOT_MEMBERSHIP_TYPE = 3; // Steam
const ISHRADBOT_RAID_MODE = 4;

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

function radbotRaidHubApiKey(): string
{
    $environmentKey = getenv('RAIDHUB_API_KEY');
    if (is_string($environmentKey) && trim($environmentKey) !== '') return trim($environmentKey);

    $privateConfigPath = dirname(__DIR__, 2) . '/rngmine/private/raidhub.php';
    if (is_file($privateConfigPath)) {
        $privateConfig = require $privateConfigPath;
        if (is_array($privateConfig) && is_string($privateConfig['apiKey'] ?? null)) return trim($privateConfig['apiKey']);
    }
    return '';
}

function radbotRaidHub(string $path, string $apiKey, ?array $body = null): array
{
    if (!function_exists('curl_init')) throw new RuntimeException('The site PHP setup needs the cURL extension enabled for RaidHub API requests.');
    $handle = curl_init('https://api.raidhub.io' . $path);
    if ($handle === false) throw new RuntimeException('Could not start the RaidHub API request.');
    $headers = ['x-api-key: ' . $apiKey, 'Accept: application/json'];
    $options = [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 10, CURLOPT_HTTPHEADER => $headers, CURLOPT_USERAGENT => 'ishRADbot/1.0'];
    if ($body !== null) {
        $jsonBody = json_encode($body);
        if (!is_string($jsonBody)) { curl_close($handle); throw new RuntimeException('Could not encode the RaidHub API request.'); }
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = $jsonBody;
        $options[CURLOPT_HTTPHEADER][] = 'Content-Type: application/json';
    }
    curl_setopt_array($handle, $options);
    $responseText = curl_exec($handle);
    $curlError = curl_error($handle);
    $httpStatus = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
    if (!is_string($responseText)) throw new RuntimeException('RaidHub API request failed: ' . ($curlError ?: 'no response received'));
    $decoded = json_decode($responseText, true);
    if (!is_array($decoded) || $httpStatus < 200 || $httpStatus >= 300 || empty($decoded['success'])) {
        throw new RuntimeException(is_array($decoded) ? (string) ($decoded['message'] ?? 'RaidHub API request was rejected.') : 'RaidHub returned an unreadable response.');
    }
    $response = $decoded['response'] ?? [];
    return is_array($response) ? $response : [];
}

function radbotResolveBungiePlayerNames(array $membershipIds, string $apiKey, string $cachePath): array
{
    $cache = is_file($cachePath) ? json_decode((string) file_get_contents($cachePath), true) : [];
    if (!is_array($cache)) $cache = [];
    $now = time();
    $resolved = [];
    $pending = [];
    foreach (array_unique($membershipIds) as $membershipId) {
        $membershipId = trim((string) $membershipId);
        if ($membershipId === '') continue;
        $cached = $cache[$membershipId] ?? null;
        if (is_array($cached) && (int) ($cached['expires'] ?? 0) > $now && trim((string) ($cached['label'] ?? '')) !== '') {
            $resolved[$membershipId] = (string) $cached['label'];
        } else {
            $pending[$membershipId] = null;
        }
    }
    if (count($pending) === 0 || !function_exists('curl_multi_init') || !function_exists('curl_init')) return $resolved;

    $multi = curl_multi_init();
    $handles = [];
    foreach (array_keys($pending) as $membershipId) {
        $url = 'https://www.bungie.net/Platform/User/GetMembershipsById/' . rawurlencode($membershipId) . '/' . ISHRADBOT_MEMBERSHIP_TYPE . '/';
        $handle = curl_init($url);
        if ($handle === false) continue;
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => ['X-API-Key: ' . $apiKey, 'Accept: application/json'],
            CURLOPT_USERAGENT => 'ishRADbot/1.0',
        ]);
        curl_multi_add_handle($multi, $handle);
        $handles[$membershipId] = $handle;
    }
    $active = null;
    do {
        $multiStatus = curl_multi_exec($multi, $active);
        if ($active && $multiStatus === CURLM_OK) {
            $selected = curl_multi_select($multi, 1.0);
            if ($selected === -1) usleep(10000);
        }
    } while ($active && $multiStatus === CURLM_OK);

    foreach ($handles as $membershipId => $handle) {
        $raw = curl_multi_getcontent($handle);
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (is_array($data) && (int) ($data['ErrorCode'] ?? 0) === 1) {
            foreach (($data['Response']['destinyMemberships'] ?? []) as $candidate) {
                if (!is_array($candidate) || (string) ($candidate['membershipId'] ?? '') !== (string) $membershipId) continue;
                $name = trim((string) ($candidate['bungieGlobalDisplayName'] ?? ''));
                $code = $candidate['bungieGlobalDisplayNameCode'] ?? null;
                if ($name === '') break;
                $label = is_numeric($code) ? $name . '#' . str_pad((string) $code, 4, '0', STR_PAD_LEFT) : $name;
                $resolved[$membershipId] = $label;
                $cache[$membershipId] = ['label' => $label, 'expires' => $now + 604800];
                break;
            }
        }
        curl_multi_remove_handle($multi, $handle);
        curl_close($handle);
    }
    curl_multi_close($multi);
    if (count($resolved) > 0) @file_put_contents($cachePath, json_encode($cache, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE), LOCK_EX);
    return $resolved;
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

function radbotLoadDefinitionCache(string $cachePath): array
{
    if (!is_file($cachePath)) return [];
    $data = json_decode((string) file_get_contents($cachePath), true);
    return is_array($data) ? $data : [];
}

function radbotSaveDefinitionCache(string $cachePath, array $definitions): void
{
    @file_put_contents($cachePath, json_encode($definitions, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE), LOCK_EX);
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

    $privateCacheDir = dirname(__DIR__, 2) . '/rngmine/private';
    $definitionsCachePath = $privateCacheDir . '/ishradbot-definitions.json';
    $activityDefinitionCache = radbotLoadDefinitionCache($definitionsCachePath);
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
    $partyMemberIds = [];
    foreach (($transitory['partyMembers'] ?? []) as $partyMember) {
        if (!is_array($partyMember)) continue;
        $name = trim((string) ($partyMember['displayName'] ?? ''));
        $partyMembershipId = trim((string) ($partyMember['membershipId'] ?? ''));
        if ($partyMembershipId !== '' && $partyMembershipId === $membershipId) continue;
        if ($name === '' && $partyMembershipId === '') continue;
        $key = $partyMembershipId !== '' ? $partyMembershipId : mb_strtolower($name);
        $partyNames[$key] = $name !== '' ? $name : 'Guardian ' . substr($partyMembershipId, -6);
        if ($partyMembershipId !== '') $partyMemberIds[$partyMembershipId] = true;
    }
    $raidHubApiKey = radbotRaidHubApiKey();
    if ($raidHubApiKey !== '' && count($partyMemberIds) > 0) {
        try {
            $playerData = radbotRaidHub('/player/basic/batch', $raidHubApiKey, ['membershipIds' => array_slice(array_keys($partyMemberIds), 0, 12)]);
            foreach (($playerData['players'] ?? []) as $player) {
                if (!is_array($player)) continue;
                $playerId = trim((string) ($player['membershipId'] ?? ''));
                $globalName = trim((string) ($player['bungieGlobalDisplayName'] ?? ''));
                $globalCode = $player['bungieGlobalDisplayNameCode'] ?? null;
                if ($playerId === '' || $globalName === '' || !is_numeric($globalCode)) continue;
                $partyNames[$playerId] = $globalName . '#' . str_pad((string) $globalCode, 4, '0', STR_PAD_LEFT);
            }
        } catch (Throwable $ignored) {
            // Preserve Bungie's last-known party name if RaidHub lookup fails.
        }
    }
    $unresolvedIds = [];
    foreach (array_keys($partyMemberIds) as $partyMembershipId) {
        if (!isset($partyNames[$partyMembershipId]) || strpos($partyNames[$partyMembershipId], '#') === false) $unresolvedIds[] = $partyMembershipId;
    }
    if (count($unresolvedIds) > 0) {
        $bungieNames = radbotResolveBungiePlayerNames($unresolvedIds, $apiKey, $privateCacheDir . '/ishradbot-player-names.json');
        foreach ($bungieNames as $partyMembershipId => $playerName) $partyNames[$partyMembershipId] = $playerName;
    }
    $partyNames = array_values($partyNames);
    natcasesort($partyNames);
    $partyNames = array_values($partyNames);

    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    // The default chart only needs seven reporting days. Its date boundary is
    // 03:00 America/Chicago; subtract seven days from that boundary.
    $central = new DateTimeZone('America/Chicago');
    $chartBoundary = $now->setTimezone($central)->setTime(3, 0);
    if ($now->setTimezone($central) < $chartBoundary) $chartBoundary = $chartBoundary->modify('-1 day');
    $historyStart = $chartBoundary->modify('-7 days')->setTimezone(new DateTimeZone('UTC'))->getTimestamp();
    $raidEvents = [];
    $recentActivity = null;
    $raidHashes = [];
    $latestActivityCandidate = null;
    $seenInstances = [];
    $historyWarnings = [];
    $raidHubHistoryLoaded = false;
    if ($raidHubApiKey !== '') {
        try {
            $manifestPath = $privateCacheDir . '/ishradbot-raidhub-manifest.json';
            $manifestCache = null;
            if (is_file($manifestPath) && (time() - (int) filemtime($manifestPath)) < 86400) {
                $manifestCache = json_decode((string) file_get_contents($manifestPath), true);
            }
            if (!is_array($manifestCache) || !is_array($manifestCache['activityDefinitions'] ?? null)) {
                $manifestCache = radbotRaidHub('/manifest', $raidHubApiKey);
                @file_put_contents($manifestPath, json_encode($manifestCache, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE), LOCK_EX);
            }
            $raidNameById = [];
            $activityNameById = [];
            foreach (($manifestCache['activityDefinitions'] ?? []) as $definition) {
                if (!is_array($definition)) continue;
                $activityId = (string) ($definition['id'] ?? '');
                $activityName = trim((string) ($definition['name'] ?? ''));
                if ($activityId !== '' && $activityName !== '') $activityNameById[$activityId] = $activityName;
                if ($activityId !== '' && $activityName !== '' && !empty($definition['isRaid'])) $raidNameById[$activityId] = $activityName;
            }
            $instancesPath = '/player/' . rawurlencode($membershipId) . '/instances?' . http_build_query([
                'completed' => 'true',
                'minDate' => gmdate(DATE_ATOM, $historyStart),
                'maxDate' => gmdate(DATE_ATOM, $now->getTimestamp()),
            ], '', '&', PHP_QUERY_RFC3986);
            $instanceResponse = radbotRaidHub($instancesPath, $raidHubApiKey);
            $instances = $instanceResponse['instances'] ?? $instanceResponse;
            if (!is_array($instances)) throw new RuntimeException('RaidHub returned an invalid instance list.');
            $mostRecentTimestamp = 0;
            foreach ($instances as $instance) {
                if (!is_array($instance) || (isset($instance['completed']) && !$instance['completed'])) continue;
                $timestamp = strtotime((string) ($instance['dateCompleted'] ?? ''));
                if ($timestamp === false || $timestamp < $historyStart) continue;
                $instanceId = (string) ($instance['instanceId'] ?? '');
                $activityId = (string) ($instance['activityId'] ?? '');
                $activityName = trim((string) ($instance['metadata']['activityName'] ?? '')) ?: ($activityNameById[$activityId] ?? '');
                if ($timestamp > $mostRecentTimestamp && $activityName !== '') {
                    $activityPlayers = [];
                    foreach (($instance['players'] ?? []) as $activityPlayer) {
                        if (!is_array($activityPlayer)) continue;
                        $playerName = trim((string) ($activityPlayer['bungieGlobalDisplayName'] ?? ''));
                        $playerCode = $activityPlayer['bungieGlobalDisplayNameCode'] ?? null;
                        if ($playerName !== '' && is_numeric($playerCode)) $activityPlayers[] = $playerName . '#' . str_pad((string) $playerCode, 4, '0', STR_PAD_LEFT);
                        elseif (trim((string) ($activityPlayer['displayName'] ?? '')) !== '') $activityPlayers[] = trim((string) $activityPlayer['displayName']);
                    }
                    natcasesort($activityPlayers);
                    $recentActivity = [
                        'name' => $activityName,
                        'startedAt' => (string) ($instance['dateStarted'] ?? ''),
                        'completedAt' => (string) ($instance['dateCompleted'] ?? ''),
                        'durationSeconds' => (int) ($instance['duration'] ?? 0),
                        'players' => array_values($activityPlayers),
                    ];
                    $mostRecentTimestamp = $timestamp;
                }
                $raidName = $raidNameById[$activityId] ?? '';
                if ($raidName === '') continue;
                if ($instanceId !== '' && isset($seenInstances[$instanceId])) continue;
                if ($instanceId !== '') $seenInstances[$instanceId] = true;
                $raidEvents[] = ['raid' => $raidName, 'timestamp' => $timestamp, 'instanceId' => $instanceId];
            }
            $raidHubHistoryLoaded = true;
        } catch (Throwable $error) {
            $historyWarnings[] = 'RaidHub history lookup failed: ' . $error->getMessage();
        }
    }

    if (!$raidHubHistoryLoaded) {
      foreach (array_keys(is_array($characters) ? $characters : []) as $characterId) {
        $page = 0;
        while ($page < 4) {
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
                if ($timestamp < $historyStart) continue;
                $activityDetails = $entry['activityDetails'] ?? [];
                $instanceId = (string) ($activityDetails['instanceId'] ?? '');
                if ($instanceId !== '' && isset($seenInstances[$instanceId])) continue;
                $completion = $entry['values']['completed']['basic']['value'] ?? null;
                if (!is_numeric($completion) || (float) $completion < 1) continue;
                if ($instanceId !== '' && ($latestActivityCandidate === null || $timestamp > $latestActivityCandidate['timestamp'])) {
                    $latestActivityCandidate = ['instanceId' => $instanceId, 'timestamp' => $timestamp];
                }
                $definitionHash = (int) ($activityDetails['directorActivityHash'] ?? 0);
                if ($definitionHash === 0) $definitionHash = (int) ($activityDetails['referenceId'] ?? 0);
                if ($definitionHash === 0) continue;
                if ($instanceId !== '') $seenInstances[$instanceId] = true;
                $raidHashes[$definitionHash] = true;
                $raidEvents[] = ['raidHash' => $definitionHash, 'timestamp' => $timestamp, 'instanceId' => $instanceId];
            }
            if ($oldestPeriod !== null && $oldestPeriod < $historyStart) break;
            if (count($activities) < 250) break;
            $page++;
        }
        }
    }

    if (!$raidHubHistoryLoaded) {
        // Resolve each unique raid hash only once after collecting history.
        $raidNames = [];
        foreach (array_keys($raidHashes) as $definitionHash) {
            try {
                $definition = radbotActivityDefinition((int) $definitionHash, $apiKey, $activityDefinitionCache);
            } catch (Throwable $ignored) {
                $definition = [];
            }
            $raidNames[$definitionHash] = trim((string) ($definition['displayProperties']['name'] ?? '')) ?: 'Raid ' . $definitionHash;
        }
        radbotSaveDefinitionCache($definitionsCachePath, $activityDefinitionCache);
        foreach ($raidEvents as &$raidEvent) {
            $raidEvent['raid'] = $raidNames[$raidEvent['raidHash']] ?? 'Raid ' . $raidEvent['raidHash'];
            unset($raidEvent['raidHash']);
        }
        unset($raidEvent);
    }

    usort($raidEvents, static fn(array $left, array $right): int => $left['timestamp'] <=> $right['timestamp']);

    {
        // The chart history is raid-only. Query the latest completed activity
        // separately so the recent panel can show any mode without expanding
        // the chart's seven-day raid data.
        foreach (array_keys(is_array($characters) ? $characters : []) as $characterId) {
            try {
                $historyPath = '/Destiny2/' . ISHRADBOT_MEMBERSHIP_TYPE . '/Account/' . rawurlencode($membershipId)
                    . '/Character/' . rawurlencode((string) $characterId) . '/Stats/Activities/?'
                    . http_build_query(['count' => 25, 'mode' => 0, 'page' => 0]);
                $latestHistory = radbotBungie($historyPath, $apiKey);
                $latestEntries = $latestHistory['activities'] ?? [];
                foreach (is_array($latestEntries) ? $latestEntries : [] as $latestEntry) {
                    if (!is_array($latestEntry)) continue;
                    $completion = $latestEntry['values']['completed']['basic']['value'] ?? null;
                    $period = (string) ($latestEntry['period'] ?? '');
                    $timestamp = strtotime($period);
                    $details = $latestEntry['activityDetails'] ?? [];
                    $candidateId = trim((string) ($details['instanceId'] ?? ''));
                    if (!is_numeric($completion) || (float) $completion < 1 || $timestamp === false || $candidateId === '') continue;
                    if ($latestActivityCandidate === null || $timestamp > $latestActivityCandidate['timestamp']) {
                        $latestActivityCandidate = ['instanceId' => $candidateId, 'timestamp' => $timestamp];
                    }
                    // History is returned newest first; one completed entry per character is enough.
                    break;
                }
            } catch (Throwable $error) {
                $historyWarnings[] = $error->getMessage();
            }
        }
    }

    $raidHubRecentTimestamp = is_array($recentActivity) ? strtotime((string) ($recentActivity['completedAt'] ?? '')) : false;
    if ($latestActivityCandidate !== null && ($raidHubRecentTimestamp === false || $latestActivityCandidate['timestamp'] > $raidHubRecentTimestamp)) {
        $instanceId = (string) $latestActivityCandidate['instanceId'];
        if ($instanceId !== '') {
            try {
                $report = radbotBungie('/Destiny2/Stats/PostGameCarnageReport/' . rawurlencode($instanceId) . '/', $apiKey);
                $entries = $report['entries'] ?? [];
                $activityDetails = $report['activityDetails'] ?? [];
                $reportPlayers = [];
                $durationSeconds = 0;
                foreach (is_array($entries) ? $entries : [] as $entry) {
                    if (!is_array($entry)) continue;
                    $player = $entry['player']['destinyUserInfo'] ?? [];
                    if (is_array($player)) {
                        $globalName = trim((string) ($player['bungieGlobalDisplayName'] ?? ''));
                        $globalCode = $player['bungieGlobalDisplayNameCode'] ?? null;
                        $displayName = trim((string) ($player['displayName'] ?? ''));
                        if ($globalName !== '' && is_numeric($globalCode)) $reportPlayers[] = $globalName . '#' . str_pad((string) $globalCode, 4, '0', STR_PAD_LEFT);
                        elseif ($displayName !== '') $reportPlayers[] = $displayName;
                    }
                    $entryDuration = $entry['values']['activityDurationSeconds']['basic']['value'] ?? 0;
                    if (is_numeric($entryDuration)) $durationSeconds = max($durationSeconds, (int) round((float) $entryDuration));
                }
                $period = trim((string) ($report['period'] ?? ''));
                $startedAt = $period !== '' ? $period : gmdate(DATE_ATOM, (int) $latestActivityCandidate['timestamp']);
                $completedAt = $durationSeconds > 0
                    ? gmdate(DATE_ATOM, (strtotime($startedAt) ?: (int) $latestActivityCandidate['timestamp']) + $durationSeconds)
                    : gmdate(DATE_ATOM, (int) $latestActivityCandidate['timestamp']);
                natcasesort($reportPlayers);
                $activityHash = (int) ($activityDetails['directorActivityHash'] ?? 0);
                if ($activityHash === 0) $activityHash = (int) ($activityDetails['referenceId'] ?? 0);
                $activityDefinition = [];
                if ($activityHash > 0) {
                    try { $activityDefinition = radbotActivityDefinition($activityHash, $apiKey, $activityDefinitionCache); }
                    catch (Throwable $ignored) { $activityDefinition = []; }
                }
                $recentActivity = [
                    'name' => trim((string) ($activityDefinition['displayProperties']['name'] ?? '')) ?: 'Completed activity',
                    'startedAt' => $startedAt,
                    'completedAt' => $completedAt,
                    'durationSeconds' => $durationSeconds,
                    'players' => array_values(array_unique($reportPlayers)),
                ];
            } catch (Throwable $error) {
                $historyWarnings[] = $error->getMessage();
            }
        }
    }
    radbotSaveDefinitionCache($definitionsCachePath, $activityDefinitionCache);

    $playerName = trim((string) ($member['bungieGlobalDisplayName'] ?? ISHRADBOT_NAME)) . '#' . str_pad((string) ($member['bungieGlobalDisplayNameCode'] ?? ISHRADBOT_CODE), 4, '0', STR_PAD_LEFT);
    return [
        'schemaVersion' => 3,
        'player' => ['displayName' => $playerName, 'membershipType' => ISHRADBOT_MEMBERSHIP_TYPE],
        'status' => $status,
        'activityName' => $activityName,
        'recentActivity' => $recentActivity,
        'partyMembers' => $partyNames,
        'raidEvents' => $raidEvents,
        'updatedAt' => gmdate(DATE_ATOM),
        'historyWarning' => count($historyWarnings) > 0 ? 'Some character activity histories could not be loaded. Public stats/privacy settings may limit access.' : '',
    ];
}

$apiKey = radbotApiKey();
if ($apiKey === '') {
    radbotReply(503, ['error' => 'Bungie API key is not configured. Add it to BUNGIE_API_KEY on the server or to rngmine/private/bungie.php.']);
}

$cachePath = dirname(__DIR__, 2) . '/rngmine/private/ishradbot-cache.json';
$forceRefresh = isset($_GET['refresh']) && $_GET['refresh'] === '1';
$cached = null;
if (is_file($cachePath)) {
    $cached = json_decode((string) file_get_contents($cachePath), true);
    if (!is_array($cached)) $cached = null;
}
// Serve stale data immediately. The page requests a refresh in the background.
// Older cached payloads did not include an all-modes recent activity lookup.
// Force one refresh after this version is deployed so the panel can populate.
if (!$forceRefresh && is_array($cached) && (int) ($cached['schemaVersion'] ?? 0) >= 3) radbotReply(200, $cached);

// If another request is already refreshing, reuse the saved response instead
// of making every visitor wait on its own serial Bungie request chain.
$lockPath = $cachePath . '.lock';
$lock = @fopen($lockPath, 'c');
if ($lock !== false && !flock($lock, LOCK_EX | LOCK_NB)) {
    fclose($lock);
    if (is_array($cached)) radbotReply(200, $cached);
    header('Retry-After: 5');
    radbotReply(503, ['error' => 'Bungie data is warming up. Please retry shortly.']);
}

try {
    $data = radbotBuildData($apiKey);
    @file_put_contents($cachePath, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE), LOCK_EX);
    if (is_resource($lock)) { flock($lock, LOCK_UN); fclose($lock); }
    radbotReply(200, $data);
} catch (Throwable $error) {
    if (is_resource($lock)) { flock($lock, LOCK_UN); fclose($lock); }
    if (is_array($cached)) radbotReply(200, $cached);
    error_log('ishRADbot Bungie API error: ' . $error->getMessage());
    radbotReply(502, ['error' => 'Could not retrieve ishRADbot data from Bungie. Check the server API key, player privacy, or Bungie API availability.']);
}
