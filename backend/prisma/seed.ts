import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { username },
    update: { role: UserRole.ADMIN, active: true },
    create: { username, passwordHash, role: UserRole.ADMIN },
  });

  const masterDataPath = path.join(process.cwd(), "desktop", "master-data.json");
  if (fs.existsSync(masterDataPath)) {
    const masterData = JSON.parse(fs.readFileSync(masterDataPath, "utf8")) as {
      accounts: Array<Record<string, unknown>>;
      payees: Array<Record<string, unknown>>;
    };
    const withoutSystemFields = ({ id, createdAt, updatedAt, ...record }: Record<string, unknown>) => record;
    await prisma.accountCode.createMany({
      data: masterData.accounts.map(withoutSystemFields) as never[],
      skipDuplicates: true,
    });
    await prisma.payee.createMany({
      data: masterData.payees.map(withoutSystemFields) as never[],
      skipDuplicates: true,
    });
    console.log(`Imported ${masterData.accounts.length} account codes and ${masterData.payees.length} payees.`);
  }

  console.log(`Admin user '${username}' is ready.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
