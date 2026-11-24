# Spotify artist card setup

The public ishMusic page reads recent listening history after `nat_lyish` authorizes the Spotify app. It counts the tracks Spotify returns from the past seven days and displays the most frequent artist.

## Spotify app settings

Add this exact redirect URI to the Spotify app's Redirect URIs:

`https://ishpage.xyz/ishStuff/ishMusic/spotify.php`

The integration uses the `user-read-recently-played` scope. Connect while signed in to the Spotify account `nat_lyish`.

## Server configuration

The client secret and refresh token are stored with the other private API keys. In the deployed `rngmine/private` directory, copy `spotify-config.example.php` to `spotify-config.php` and replace the placeholder value for `client_secret` with the Spotify app's client secret. Both files are excluded from Git and the directory's `.htaccess` blocks web access. Never add the client secret or refresh token to source control. The client ID is configured in `spotify.php`. PHP must be able to make outbound HTTPS requests and write to `rngmine/private/`.

After deploying the page and server setting, open the Spotify Artist tab and choose **CONNECT NAT_LYISH SPOTIFY** while signed in to the one Spotify account the site should use. The first successful connection is bound to the site; later visitors cannot replace it, and everyone sees that account's artist card. The refresh token is written to `rngmine/private/spotify-token.json`, outside the ishMusic code directory, so normal code updates do not replace it. Existing tokens in the old `ishStuff/ishMusic/private/` location are migrated automatically on the first request after deployment. Keep `rngmine/private/` and its ignored files intact when deploying; to intentionally change the bound account, remove `rngmine/private/spotify-token.json` (or the path configured by `ISHPAGE_SPOTIFY_TOKEN_PATH`) and connect again as the desired account.

Spotify's recently played endpoint returns a limited history. The seven-day count is therefore based on the history Spotify provides, and may not include every play if the account listened to more tracks than the endpoint returns in its available pages.
