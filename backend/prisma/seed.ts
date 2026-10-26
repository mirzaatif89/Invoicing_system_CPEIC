import "dotenv/config";
import bcrypt from "bcryptjs";
import path from "node:path";
import { createRequire } from "node:module";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();
const loadModule = createRequire(path.join(__dirname, "seed.ts"));
const { importMasterData } = loadModule("./import-master-data.cjs") as {
  importMasterData: (client: PrismaClient, directory?: string) => Promise<{
    accounts: number; payees: number; accountsAdded: number; payeesAdded: number;
  }>;
};

async function main() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { username },
    update: { role: UserRole.ADMIN, active: true },
    create: { username, passwordHash, role: UserRole.ADMIN },
  });

  const imported = await importMasterData(prisma);
  console.log(`Master lists ready: ${imported.accounts} account codes (${imported.accountsAdded} added), ${imported.payees} payees (${imported.payeesAdded} added).`);

  console.log(`Admin user '${username}' is ready.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
