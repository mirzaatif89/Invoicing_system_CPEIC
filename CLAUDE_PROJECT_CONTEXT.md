# Institute Accounts System — Project Context

Windows-oriented Institute Accounts, invoice, and contingent-bill system.

## Stack

- Frontend: React, TypeScript, Vite (`frontend/`)
- Backend: Express, TypeScript, Prisma (`backend/`)
- Database: SQLite (`backend/prisma/schema.prisma`)
- Desktop/offline packaging: Electron (`desktop/`)

## Start locally

1. Install dependencies with `npm install` and `npm run install:all`.
2. Set `DATABASE_URL="file:./data/invoice_app_for_usman.db"` in `backend/.env` and configure `JWT_SECRET`.
3. Run `npm start` from the repository root. It applies SQLite migrations, seeds the initial administrator, and starts the API and frontend.

Development uses ports 4000 (API) and 5173 (frontend). The SQLite file is in `backend/prisma/data/`.

## Main modules

- Invoice entry/list and cheque status
- PO supply entry, delivery calculations, and deductions
- Contingent bills and PO history
- Tax/FBR status, payment reports, budget documents, payee/account-code management
- Electron desktop app uses a per-user SQLite file in AppData; FBR calls need internet

## Business rules

- A completed PO cannot be added to another contingent/final invoice.
- A supply can only be selected once for a contingent bill.
- Cheque, income-tax, and sales-tax status are stored separately.
- PO supply L.D. and shelf-life deductions are entered as manual PKR amounts.
- PO Supply Entry supports medicine, disposable, imported, and local item categories.
- Item Type Tax Rates are admin-configurable. Exact nature+origin rules take priority, then nature-only, then origin-only; account-code rates are the fallback.

## Key paths

- API routes: `backend/src/routes/`
- Contingent PDF: `backend/src/lib/contingentBill.ts`
- Prisma schema/migrations: `backend/prisma/`
- Frontend pages: `frontend/src/pages/`
- Sidebar/routes: `frontend/src/components/Layout.tsx`, `frontend/src/App.tsx`

The SQLite switch does not automatically import prior MySQL data. Keep old data intact unless a separate import is requested.
