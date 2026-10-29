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
4. Load `rngmine/` over HTTPS. The API creates the two required tables on its first request.

The example config is at `private/config.example.php`. Do not put database credentials in `index.html`, JavaScript, or a committed file.

## Add accounts manually

Connect to the Hostinger account with SSH or its terminal, change to the deployed RNGmine directory, and run:

```sh
php tools/provision-account.php username
```

The tool asks for the password twice and stores a PHP password hash in MySQL. It cannot be run through the website; the `tools` directory is blocked from web requests. Do not send passwords to the browser or add a signup page.

## Saved data and security notes

- A logged-in user's rolls, coal, progress, history, and badges are saved to that account and loaded on another device after login.
- Guest progress stays in that browser. If the user logs in, it is copied to the account only when that account does not already have a cloud save. Existing cloud data takes precedence; the guest save is kept locally to restore after logout.
- Passwords are hashed with `password_hash`; sessions use `HttpOnly`, `Secure` (on HTTPS), `SameSite=Strict` cookies and CSRF tokens.
- The game rules currently run in the browser. Cloud saves provide persistence, but they are not an anti-cheat boundary: a user who edits browser code can tamper with a client-generated save. Preventing that requires moving roll and mining validation to the server.
