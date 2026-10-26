const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');

function readRows(directory, fileName) {
  const text = fs.readFileSync(path.join(directory, fileName), 'utf8');
  return parse(text, { columns: true, skip_empty_lines: true, bom: true, trim: true });
}

async function importMasterData(prisma, directory = path.join(__dirname, 'seed-data')) {
  const accountRows = readRows(directory, 'account_codes.csv');
  const payeeRows = readRows(directory, 'payees.csv');
  const accountCodes = [...new Set(accountRows.map((row) => String(row.code || '').trim()).filter(Boolean))];
  const payeeCodes = [...new Set(payeeRows.map((row) => String(row.code || '').trim()).filter(Boolean))];
  const [existingAccounts, existingPayees] = await Promise.all([
    prisma.accountCode.findMany({ where: { code: { in: accountCodes } }, select: { code: true } }),
    prisma.payee.findMany({ where: { code: { in: payeeCodes } }, select: { code: true } }),
  ]);
  const knownAccountCodes = new Set(existingAccounts.map(({ code }) => code));
  const knownPayeeCodes = new Set(existingPayees.map(({ code }) => code));
  const accountsToCreate = [];
  const payeesToCreate = [];

  for (const row of accountRows) {
    const code = String(row.code || '').trim();
    const name = String(row.name || '').trim();
    if (!code || !name) continue;
    if (knownAccountCodes.has(code)) continue;
    knownAccountCodes.add(code);
    accountsToCreate.push({ code, name, category: String(row.category || '').trim() || null });
  }

  for (const row of payeeRows) {
    const code = String(row.code || '').trim();
    const name = String(row.name || '').trim();
    if (!code || !name) continue;
    if (knownPayeeCodes.has(code)) continue;
    knownPayeeCodes.add(code);
    payeesToCreate.push({
      code,
      name,
      addressLine1: String(row.address || '').trim() || null,
      phone: String(row.phone || '').trim() || null,
    });
  }

  if (accountsToCreate.length) await prisma.accountCode.createMany({ data: accountsToCreate });
  if (payeesToCreate.length) await prisma.payee.createMany({ data: payeesToCreate });

  return { accounts: accountRows.length, payees: payeeRows.length, accountsAdded: accountsToCreate.length, payeesAdded: payeesToCreate.length };
}

module.exports = { importMasterData };
