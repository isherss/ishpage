# Spotify artist card setup

The public ishMusic page reads recent listening history after `nat_lyish` authorizes the Spotify app. It counts the tracks Spotify returns from the past seven days and displays the most frequent artist.

## Spotify app settings

Add this exact redirect URI to the Spotify app's Redirect URIs:

`https://ishpage.xyz/ishStuff/ishMusic/spotify.php`

The integration uses the `user-read-recently-played` scope. Connect while signed in to the Spotify account `nat_lyish`.

## Server configuration

The client secret is stored with the other private API keys. In the deployed `rngmine/private` directory, copy `spotify-config.example.php` to `spotify-config.php` and replace the placeholder value for `client_secret` with the Spotify app's client secret. The file is excluded from Git and the directory's `.htaccess` blocks web access. Never add the client secret or refresh token to source control. The client ID is configured in `spotify.php`. PHP must be able to make outbound HTTPS requests and write to `ishStuff/ishMusic/private/`.

After deploying the page and server setting, open the Spotify Artist tab and choose **CONNECT NAT_LYISH SPOTIFY** while signed in to the one Spotify account the site should use. The first successful connection is bound to the site; later visitors cannot replace it, and everyone sees that account's artist card. The refresh token is written to the protected `private/spotify-token.json` file so visitors do not need to sign in. To intentionally change the bound account, remove that token file from the deployed `ishStuff/ishMusic/private/` directory and connect again as the desired account.

Spotify's recently played endpoint returns a limited history. The seven-day count is therefore based on the history Spotify provides, and may not include every play if the account listened to more tracks than the endpoint returns in its available pages.
