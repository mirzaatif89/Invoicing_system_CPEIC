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
  const production = process.env.NODE_ENV === "production";
  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
    select: { id: true },
  });
  const username = process.env.ADMIN_USERNAME?.trim() || (production ? "" : "admin");
  const password = process.env.ADMIN_PASSWORD || (production ? "" : "ChangeMe123!");
  const resetBootstrapPassword = process.env.RESET_BOOTSTRAP_ADMIN_PASSWORD === "true";

  if (!existingAdmin || resetBootstrapPassword) {
    if (!username || !password) {
      throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD before initializing a production database.");
    }
    if (production && password === "ChangeMe123!") {
      throw new Error("ADMIN_PASSWORD must be changed from the development default before production deployment.");
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { username },
      update: { passwordHash, role: UserRole.ADMIN, active: true },
      create: { username, passwordHash, role: UserRole.ADMIN },
    });
  }

  const imported = await importMasterData(prisma);
  console.log(`Master lists ready: ${imported.accounts} account codes (${imported.accountsAdded} added), ${imported.payees} payees (${imported.payeesAdded} added).`);

  if (resetBootstrapPassword && existingAdmin) console.log(`Administrator '${username}' password was reset.`);
  else console.log(existingAdmin ? "An administrator already exists." : `Administrator '${username}' was created.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
