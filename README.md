# Institute Accounts, Payroll & Invoice Management System

Accounting and invoice management app with a React frontend, Express API, Prisma ORM, local SQLite support, and MySQL server deployment support.

## Run locally

Install dependencies once:

```powershell
npm install
npm run install:all
```

The project uses one private environment file only: `backend/.env`. It is ignored by Git. Configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `CORS_ORIGIN`, and initial admin credentials, then start the app:

```powershell
npm start
```

The first start applies MySQL migrations, creates master data, and creates the initial administrator if one does not exist. Open http://localhost:5173 and sign in using `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `backend/.env`, then change the password after signing in.

`npm start` starts the database setup, API, and frontend using the MySQL configuration in this one file. Ctrl+C stops the API and frontend.

See `MYSQL-SETUP.md` for the database-user and deployment steps.

## Build and tests

```powershell
npm run build
npm test
```

## Portable Windows desktop app

Build a copyable Windows x64 desktop executable with:

```powershell
npm run desktop:package
```

The output is `release/Institute-Accounts-System-Portable.exe`. Copy it to another Windows x64 PC and open it; Node.js and MySQL are not required. The app stores its SQLite database and settings in the current Windows user's AppData folder under `Institute Accounts System Desktop`. Database records persist across restarts and app updates. Use the application's backup feature before moving the database to another computer.

For the easiest launch, keep `Open-Institute-Accounts-System.bat` beside the portable executable and double-click the `.bat` file. It puts temporary app files in a `.portable-temp` folder beside the launcher, so keep about 770 MB free on that drive. The launcher also clears `ELECTRON_RUN_AS_NODE`, which can otherwise prevent the desktop window from opening. Directly opening the `.exe` uses Windows' normal temporary folder; set `TEMP` and `TMP` to a drive with enough free space if needed.

The desktop package includes the account-code and payee-code seed lists. At first launch it adds missing rows to the user's SQLite database and keeps existing local records unchanged.

The desktop app starts with `admin` / `ChangeMe123!` if its database has no administrator yet. Change the password after signing in.

## Existing MySQL data

The SQLite switch does not convert or remove the previous MySQL data. The old MySQL files remain in their existing folders and can be migrated separately if needed. The application starts with a new SQLite database unless a migration/import is performed.

## Included modules

- Secure login, user administration, password change, and audit log
- Payee and account-code management
- Invoice entry and editing, cheques, tax handling, and contingent bills
- Purchase-order supply tracking, delivery dates, and deductions
- Budget documents, fiscal-year summaries, and account-wise balances
- Printable reports, PDF layouts, Excel exports, backup and restore
