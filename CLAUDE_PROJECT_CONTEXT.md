# Institute Accounts System — Claude Project Context

This is a Windows-oriented Institute Accounts, Invoice and Contingent Bill system.

## Stack

- Frontend: React, TypeScript, Vite (`frontend/`)
- Backend: Express, TypeScript, Prisma (`backend/`)
- Database: MySQL 8, defined by `backend/prisma/schema.prisma`
- Desktop/offline packaging: Electron (`desktop/`)

## Start locally

1. Install dependencies: `npm install` then `npm run install:all`
2. Configure `backend/.env` with `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` and `PORT`.
3. Apply migrations: `npm run db:deploy --prefix backend`
4. Start: `npm start`

The frontend uses port 5173 and API port 4000 in development.

## Main modules

- Invoice entry/list and final cheque status
- PO Supply Entry: DCs against a PO, delivery-date calculations, manual L.D. and shelf-life deductions, selectable item categories
- Contingent Bills: creates bills from selected PO supplies and prints the official bill layout
- PO Details: PO history with date entered, total DCs, gross, paid and pending amounts
- FBR reports/status checker, payment reports, budget documents, payee/account code management
- Electron offline app: starts bundled MySQL and backend locally; FBR calls require internet

## Important current business rules

- A completed PO cannot be added to a new contingent/final invoice again.
- A supply can only be selected once for a contingent bill.
- Cheque, income-tax and sales-tax status is stored separately.
- PO supply L.D. and Shelf Life are entered as manual PKR amounts.
- PO Supply Entry supports multiple item categories: Medicine, Disposable, Imported, Local. `item_types` is a JSON column; `item_type` remains the primary category for compatibility.
- Item Type Tax Rates are admin-configurable in `Policy Name → Item Type Tax Rates`. Exact nature+origin rules take priority, then nature-only, then origin-only; Account Code rates remain the fallback. Manual tax amounts on invoices remain overrides.

## Key paths

- API routes: `backend/src/routes/`
- Contingent PDF: `backend/src/lib/contingentBill.ts`
- Prisma schema/migrations: `backend/prisma/`
- Frontend pages: `frontend/src/pages/`
- Sidebar/routes: `frontend/src/components/Layout.tsx`, `frontend/src/App.tsx`

## Notes for changes

- Run `npm run build` after source changes.
- When modifying Prisma schema: add a new migration, run `npm run db:deploy --prefix backend`, then `npx prisma generate --schema prisma/schema.prisma` from `backend/`.
- Never add generated folders (`node_modules`, `dist`, `release`) to a source archive.
