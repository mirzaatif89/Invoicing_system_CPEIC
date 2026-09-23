import { prisma } from "./prisma.js";

export function automaticFiscalYearStart(date = new Date()) {
  return date.getUTCFullYear() - (date.getUTCMonth() < 6 ? 1 : 0);
}

export async function defaultFiscalYearStart() {
  const setting = await prisma.setting.findUnique({ where: { key: "currentFiscalYearOverride" } });
  return setting?.value ? Number(setting.value.slice(0, 4)) : automaticFiscalYearStart();
}
