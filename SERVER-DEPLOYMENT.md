# Server deployment

This archive includes the current SQLite database. Treat it as confidential: it contains application accounts and records.

## 1. Prepare the server

Use a Linux server with a current Node.js LTS release. Upload and extract the ZIP outside a public web directory, for example `/var/www/institute-accounts-system`.

Copy `backend/.env.production.example` to `backend/.env`, then set a unique `JWT_SECRET` (at least 32 characters). Its `CORS_ORIGIN` is already set to `https://skillful-maroon-boar.37-27-52-96.cpanel.site`. Do not commit or share this `.env` file.

### cPanel Node.js selector

For this cPanel account, use the cPanel-specific ZIP and extract its **contents** directly into `/home/apexium2/cardiology_app` (do not leave them inside another nested folder). Set the startup file to `app.js`, then click **Run NPM Install**. Its lightweight root package skips the desktop Electron dependencies; its installation script explicitly targets this application directory, installs the backend and frontend packages, and builds the production frontend automatically.

In the **Environment variables** section, add:

```text
DATABASE_URL=file:./data/invoice_app_for_usman.db
JWT_SECRET=<a unique secret of at least 32 characters>
CORS_ORIGIN=https://skillful-maroon-boar.37-27-52-96.cpanel.site
DESKTOP_WEB_DIR=../frontend/dist
```

Keep the Node.js application in Production mode. Do not add `PORT`: cPanel provides it. Click **Save** (or Restart Application) after adding the variables. The `app.js` file is specifically for cPanel's startup-file field.

## 2. Install and start

From the extracted project directory, run:

```bash
npm ci --prefix backend
npm ci --prefix frontend
npm run build
npm run start:production
```

The application will listen on port 4000. `start:production` applies any database migrations, retains the included records, adds only missing seed data, and serves the built frontend and API from the same Node process.

For a persistent service, run the last command with systemd or PM2.

## 3. Reverse proxy example

Put Nginx (or your hosting panel's reverse proxy) in front of port 4000 and enable HTTPS. Replace `your-domain.example` below:

```nginx
server {
    listen 80;
    server_name your-domain.example;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

After HTTPS is enabled, ensure `CORS_ORIGIN` in `backend/.env` exactly matches the public address: `https://skillful-maroon-boar.37-27-52-96.cpanel.site`.

## Database backup

The live data file is `backend/prisma/data/invoice_app_for_usman.db`. Back it up regularly while the application is stopped or with the application's backup feature. Never overwrite this file during an upgrade unless you intend to replace the server's records.
