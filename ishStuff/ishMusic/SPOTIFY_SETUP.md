# Spotify artist card setup

The public ishMusic page reads recent listening history after `nat_lyish` authorizes the Spotify app. It counts the tracks Spotify returns from the past seven days and displays the most frequent artist.

## Spotify app settings

Add this exact redirect URI to the Spotify app's Redirect URIs:

`https://ishpage.xyz/ishStuff/ishMusic/spotify.php`

The integration uses the `user-read-recently-played` scope. Connect while signed in to the Spotify account `nat_lyish`.

## Server configuration

Set the Spotify app's client secret in the web server's environment as:

`ISHPAGE_SPOTIFY_CLIENT_SECRET`

The client ID is configured in `spotify.php`. Never add the client secret or refresh token to source control. PHP must be able to make outbound HTTPS requests and write to `ishStuff/ishMusic/private/`.

After deploying the page and server setting, open the Spotify Artist tab and choose **CONNECT NAT_LYISH SPOTIFY**. The refresh token is written to the protected `private/spotify-token.json` file so the public page can refresh its API access without asking visitors to sign in.

Spotify's recently played endpoint returns a limited history. The seven-day count is therefore based on the history Spotify provides, and may not include every play if the account listened to more tracks than the endpoint returns in its available pages.
