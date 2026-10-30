# RNGmine accounts on Hostinger

The account service uses PHP sessions and a Hostinger MySQL database. It has no public registration route. Account rows are created only with the CLI provisioning tool.

## Requirements

- PHP 8.1 or newer with `PDO_MySQL` enabled.
- HTTPS enabled for the site.
- A MySQL database and database user created in Hostinger hPanel.

## Configure the database

1. In hPanel, create a MySQL database and a database user, then grant that user access to the database.
2. In the deployed `rngmine/private` directory, copy `config.example.php` to `config.php`.
3. Fill in the database host, database name, username, and password from hPanel. Keep `config.php` private; it is excluded from Git and the `private/.htaccess` file blocks web access.
4. Load `rngmine/` over HTTPS. The API creates the account, save, profile, roll-blurb, and comment tables on its first request.

The example config is at `private/config.example.php`. Do not put database credentials in `index.html`, JavaScript, or a committed file.

## Configure accounts without SSH

You can manage the account list with Hostinger File Manager:

1. In `rngmine/private`, copy `config.example.php` to `config.php` and enter the database connection details in `config.php`.
2. In the same directory, copy `accounts.example.php` to `accounts.php`.
3. Edit `accounts.php` and add one entry for each friend, using a unique site-only password:

```php
return [
    'friendname' => 'a-unique-password-for-this-site',
    'anotherfriend' => 'another-unique-password',
];
```

The account file is under `private/`, which is blocked from web requests and excluded from Git. Passwords in this manually edited file are plain text, so use passwords that are not used anywhere else. On successful login, the PHP backend also stores a password hash in MySQL. Keep `accounts.php` present: while it exists, it is the allowed-account list, and removing an entry disables that login. No signup page is available.

The CLI tool `tools/provision-account.php` is an alternative for hosts with SSH access; it is not needed for the File Manager setup.

## Saved data and security notes

- A logged-in user's rolls, coal, progress, history, and badges are saved to that account and loaded on another device after login.
- The public Leaderboard has separate Best roll, Total EP, and Coal mined tabs. Each ranks active accounts by the selected statistic and shows the user's chosen public display name and color; guest-only browser data is not listed.
- The Blurbs tab beside Leaderboard lists answers shared with logged-in rolls, including the roll rarity, percentile, and timestamp. Logged-in users can comment on entries; comment lists start collapsed. Edit the public question pool in `js/blurb-questions.js`; questions are not shown in the public feed.
- Users can edit their public display name and leaderboard color from the dropdown opened by clicking their name in the top bar. These profile settings are saved with the account and appear publicly on the leaderboard.
- Guest progress stays in that browser until login. A successful login deletes the browser's guest save and loads only the account's cloud save; it never merges guest rolls, coal, badges, or history into the account. If that account has roll history, login opens on its latest roll with the coal mine visible.
- Logging out clears the account's cached data from that browser. The account's cloud save remains available the next time the user logs in.
- Passwords are hashed with `password_hash`; sessions use `HttpOnly`, `Secure` (on HTTPS), `SameSite=Strict` cookies and CSRF tokens.
- The game rules currently run in the browser. Cloud saves provide persistence, but they are not an anti-cheat boundary: a user who edits browser code can tamper with a client-generated save. Preventing that requires moving roll and mining validation to the server.
