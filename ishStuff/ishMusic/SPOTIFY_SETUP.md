# Spotify artist card setup

The public ishMusic page reads recent listening history after `nat_lyish` authorizes the Spotify app. It counts the tracks Spotify returns from the past seven days and displays the most frequent artist.

## Spotify app settings

Add this exact redirect URI to the Spotify app's Redirect URIs:

`https://ishpage.xyz/ishStuff/ishMusic/spotify.php`

The integration uses the `user-read-recently-played` scope. Connect while signed in to the Spotify account `nat_lyish`.

## Server configuration

The client secret must stay on the server. The environment variable option is:

`ISHPAGE_SPOTIFY_CLIENT_SECRET`

For Hostinger shared PHP hosting, hPanel's deployment environment variables apply to Node.js apps, not this PHP site. Instead, use Hostinger File Manager to create `spotify-config.php` in the account directory just above `public_html` (typically `domains/ishpage.xyz/spotify-config.php`). Put this in the file, replacing the placeholder with the Spotify app's client secret:

```php
<?php
return [
    'spotify_client_secret' => 'PASTE_CLIENT_SECRET_HERE',
];
```

Do not put that file inside `public_html`, and never add the client secret or refresh token to source control. The client ID is configured in `spotify.php`. PHP must be able to make outbound HTTPS requests and write to `ishStuff/ishMusic/private/`.

After deploying the page and server setting, open the Spotify Artist tab and choose **CONNECT NAT_LYISH SPOTIFY**. The refresh token is written to the protected `private/spotify-token.json` file so the public page can refresh its API access without asking visitors to sign in.

Spotify's recently played endpoint returns a limited history. The seven-day count is therefore based on the history Spotify provides, and may not include every play if the account listened to more tracks than the endpoint returns in its available pages.
