# Institute Accounts API

Express and Prisma backend for the Institute Accounts system.

## Local setup

1. Edit the single private `.env` file and set a private `JWT_SECRET`.
2. Set `DATABASE_PROVIDER=mysql`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `CORS_ORIGIN`.
3. Install packages with `npm install`.
4. From the repository root, run `npm start`. This applies committed MySQL migrations and seeds the initial administrator.

The MySQL database named in `.env` stores all application records. The API is available at `http://localhost:4000`; check `GET /api/health`.

Useful commands:

```powershell
npm run prisma:generate
npm run db:deploy
npm run db:seed
npm run build
npm test
```

Prisma enums and JSON fields are retained and validated through the application schema. Existing MySQL data is not imported automatically.
