# MySQL setup

## Local Workbench database

Run this in MySQL Workbench while connected as an administrative MySQL user. Replace the example password with a newly generated password and save it in a password manager.

```sql
CREATE DATABASE IF NOT EXISTS school_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'institute_app'@'localhost'
  IDENTIFIED BY 'replace-with-a-new-strong-password';

GRANT ALL PRIVILEGES ON school_db.* TO 'institute_app'@'localhost';
FLUSH PRIVILEGES;
```

If you need to rotate an existing app-user password, use:

```sql
ALTER USER 'institute_app'@'localhost' IDENTIFIED BY 'replace-with-a-new-strong-password';
FLUSH PRIVILEGES;
```

Edit the single ignored `backend/.env` file and set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`. Use the password directly in `DB_PASSWORD`; no URL encoding is needed. Start with `npm.cmd start`.

## What is stored where

- `.env` contains infrastructure settings such as the separate MySQL host, port, database, user, and password fields, JWT signing key, allowed frontend origin, and only the first administrator bootstrap password.
- MySQL stores invoices, users, roles, settings, audit history, master records, and all data entered through the application.
- The User Management screen creates additional administrators, accountants, finance managers, and users. Their passwords are bcrypt hashes in MySQL, never plaintext environment variables.
- To deliberately reset only the bootstrap administrator password, set `RESET_BOOTSTRAP_ADMIN_PASSWORD=true` for one start, then immediately change it back to `false`. Normal starts never reset an existing user's password.
