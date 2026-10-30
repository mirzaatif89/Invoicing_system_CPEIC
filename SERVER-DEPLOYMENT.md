# MySQL server deployment

The server configuration uses MySQL and has its own Prisma schema and migrations, so all server records are stored in MySQL rather than in a file inside the release directory.

## 1. Create the MySQL database and app user

Create a database and a least-privilege user through your hosting panel or MySQL Workbench. The app user needs privileges only on this application database. Use `utf8mb4`.

```sql
CREATE DATABASE institute_accounts CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'institute_app'@'%' IDENTIFIED BY 'use-a-new-strong-password';
GRANT ALL PRIVILEGES ON institute_accounts.* TO 'institute_app'@'%';
FLUSH PRIVILEGES;
```

For a database on the same server, replace `'%'` with `'localhost'`. Do not use the MySQL `root` account in the application. If a password has ever been shared in a screenshot or chat, rotate it before deployment.

## 2. Configure the private environment file

Create or edit the single `backend/.env` file on the server and set all values below. Do not commit this file.

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
DATABASE_PROVIDER=mysql
DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_NAME="institute_accounts"
DB_USER="institute_app"
DB_PASSWORD="use-the-strong-password-created-above"
JWT_SECRET="a-unique-random-secret-with-at-least-32-characters"
JWT_EXPIRES_IN=8h
CORS_ORIGIN="https://skillful-maroon-boar.37-27-52-96.cpanel.site"
DESKTOP_WEB_DIR="../frontend/dist"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="a-unique-12-plus-character-bootstrap-password"
```

Use the password directly in `DB_PASSWORD`; the application safely creates its internal connection URL. `ADMIN_USERNAME` and `ADMIN_PASSWORD` are used only when the database has no administrator; after the first successful start, create additional administrators and staff from User Management. Passwords are hashed in MySQL, not kept in `.env`.

## 3. Install, build, and start

On a Linux server with a current Node.js LTS version:

```bash
npm ci --prefix backend
npm ci --prefix frontend
npm run build
npm run start:production
```

`start:production` generates the MySQL Prisma client, applies only unapplied migrations, seeds missing master lists, creates the bootstrap administrator only when needed, and then starts the server.

## cPanel Node.js selector

Upload the cPanel package and extract its contents directly into the application root. Set the startup file to `app.js`, add every environment variable from step 2 in cPanel's **Environment variables** section, and click **Run NPM Install**. For this cPanel account, the package resolves its install script from `/home/apexium2/cardiology_app` so cPanel's virtual-environment working directory cannot break the install.

The cPanel install script builds the backend using the MySQL Prisma schema. At startup, `app.js` applies pending migrations and seed data before serving the API and compiled frontend. Do not set a fixed `PORT` in cPanel when the panel supplies one.

## Data transfer and backups

For an existing SQLite installation, sign in as an administrator, download a JSON backup from **Utilities → Backup / Restore Database**, then restore it after the MySQL server is running. Take a fresh backup before each upgrade. MySQL backups should also be scheduled through your hosting provider or `mysqldump`.
