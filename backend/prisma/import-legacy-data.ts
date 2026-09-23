import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

type AccountRow = { code?: string; name?: string; category?: string };
type PayeeRow = { code?: string; name?: string; address?: string; phone?: string };
type Summary = { created: number; updated: number; skipped: number };
const prisma = new PrismaClient();
const here = __dirname;
const clean = (value: string | undefined) => value?.trim() ?? "";
const nullable = (value: string | undefined) => clean(value) || null;

async function csv<T>(name: string): Promise<T[]> {
  const content = await readFile(path.join(here, "seed-data", name), "utf8");
  return parse(content, { columns: true, skip_empty_lines: true, bom: true, trim: true }) as T[];
}
async function importAccounts(rows: AccountRow[]): Promise<Summary> {
  const summary = { created: 0, updated: 0, skipped: 0 };
  const valid = rows.filter((row, index) => { if (!clean(row.name) || !clean(row.code)) { console.warn(`Skipping account_codes.csv row ${index + 2}: code and name are required.`); summary.skipped++; return false; } return true; });
  const existing = new Set((await prisma.accountCode.findMany({ where: { code: { in: valid.map(r => clean(r.code)) } }, select: { code: true } })).map(r => r.code));
  for (const row of valid) { const code = clean(row.code); await prisma.accountCode.upsert({ where: { code }, create: { code, name: clean(row.name), category: nullable(row.category) }, update: { name: clean(row.name), category: nullable(row.category) } }); existing.has(code) ? summary.updated++ : summary.created++; }
  return summary;
}
async function importPayees(rows: PayeeRow[]): Promise<Summary> {
  const summary = { created: 0, updated: 0, skipped: 0 };
  const valid = rows.filter((row, index) => { if (!clean(row.name) || !clean(row.code)) { console.warn(`Skipping payees.csv row ${index + 2}: code and name are required.`); summary.skipped++; return false; } return true; });
  const existing = new Set((await prisma.payee.findMany({ where: { code: { in: valid.map(r => clean(r.code)) } }, select: { code: true } })).map(r => r.code));
  for (const row of valid) { const code = clean(row.code); const data = { name: clean(row.name), addressLine1: nullable(row.address), addressLine2: null, phone: nullable(row.phone) }; await prisma.payee.upsert({ where: { code }, create: { code, ...data, itaxNo: null }, update: data }); existing.has(code) ? summary.updated++ : summary.created++; }
  return summary;
}
async function main() {
  const [accountRows, payeeRows] = await Promise.all([csv<AccountRow>("account_codes.csv"), csv<PayeeRow>("payees.csv")]);
  const accounts = await importAccounts(accountRows); const payees = await importPayees(payeeRows);
  console.log("Legacy data import complete.");
  console.log(`Account codes: ${accounts.created} created, ${accounts.updated} updated, ${accounts.skipped} skipped.`);
  console.log(`Payees: ${payees.created} created, ${payees.updated} updated, ${payees.skipped} skipped.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
