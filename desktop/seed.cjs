const bcrypt = require('../backend/node_modules/bcryptjs');
const { PrismaClient, UserRole } = require('../backend/node_modules/@prisma/client');
const { importMasterData } = require('../backend/prisma/import-master-data.cjs');

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const current = await prisma.user.findUnique({ where: { username } });
  if (!current) {
    await prisma.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 12),
        role: UserRole.ADMIN,
      },
    });
    console.log(`Administrator '${username}' is ready.`);
  } else {
    console.log(`Administrator '${username}' already exists; keeping its password.`);
  }

  const imported = await importMasterData(prisma);
  console.log(`Master lists ready: ${imported.accounts} account codes (${imported.accountsAdded} added), ${imported.payees} payees (${imported.payeesAdded} added).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
