export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const wholeDay = (value: Date) => Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
export const daysBetween = (start?: Date | null, end?: Date | null) =>
  start && end ? Math.max(0, Math.round((wholeDay(end) - wholeDay(start)) / 86400000)) : 0;
export function calculateDueDate(orderDate?: Date | null, grossPeriodDays?: number | null) {
  if (!orderDate || grossPeriodDays == null || !Number.isFinite(grossPeriodDays) || grossPeriodDays < 0) return null;
  const due = new Date(orderDate); due.setUTCHours(0, 0, 0, 0); due.setUTCDate(due.getUTCDate() + Math.floor(grossPeriodDays)); return due;
}
export function lateDeliveryDays(orderDate?: Date | null, grossPeriodDays?: number | null, actualDate?: Date | null) {
  const due = calculateDueDate(orderDate, grossPeriodDays); return due && actualDate ? Math.max(0, daysBetween(due, actualDate)) : 0;
}

export type ItemTypeTaxRuleLike = { natureCategory: string | null; originCategory: string | null; incomeTaxPercent: unknown; salesTaxPercent: unknown; active?: boolean };
export function matchItemTypeTaxRule(itemTypes: string[] | null | undefined, rules: ItemTypeTaxRuleLike[]) {
  const types = Array.isArray(itemTypes) ? itemTypes : [];
  const nature = types.find((type) => type === "MEDICINE" || type === "DISPOSABLE") ?? null;
  const origin = types.find((type) => type === "LOCAL" || type === "IMPORTED") ?? null;
  const active = rules.filter((rule) => rule.active !== false);
  const rule = active.find((row) => row.natureCategory === nature && row.originCategory === origin)
    ?? active.find((row) => row.natureCategory === nature && row.originCategory === null)
    ?? active.find((row) => row.natureCategory === null && row.originCategory === origin)
    ?? null;
  return rule ? { incomeTaxPercent: Number(rule.incomeTaxPercent), salesTaxPercent: Number(rule.salesTaxPercent) } : null;
}

export function selectTaxRates(account: Record<string, unknown>, vendorType: "COMPANY" | "INDIVIDUAL" = "INDIVIDUAL", itemTypeRule?: { incomeTaxPercent: number; salesTaxPercent: number } | null, taxpayerStatus: "ACTIVE" | "INACTIVE" = "INACTIVE") {
  if (itemTypeRule) return itemTypeRule;
  const suffix = vendorType === "COMPANY" ? "Company" : "Individual";
  const tierField = `incomeTaxPercent${suffix}${taxpayerStatus === "ACTIVE" ? "Active" : "Inactive"}`;
  return {
    // Retain support for pre-matrix records while all current Account Codes use
    // the taxpayer-status tier fields above.
    incomeTaxPercent: Number(account[tierField] ?? account[`incomeTaxPercent${suffix}`] ?? 0),
    salesTaxPercent: Number(account[`salesTaxPercent${suffix}`] ?? 0),
  };
}

export type LdChargeSettings = { ldGracePeriodDays: number; ldRatePercentPerDay: number; ldMaxCapPercent: number | null };
/** Adjustable PPRA defaults. Admin settings can override these values. */
export const defaultLdChargeSettings: LdChargeSettings = { ldGracePeriodDays: 5, ldRatePercentPerDay: 0.067, ldMaxCapPercent: 10 };
export function chargeableLateDays(daysLate: number, gracePeriodDays: number) {
  return Math.max(0, daysLate - Math.max(0, Math.floor(gracePeriodDays)));
}
export function calculateLdCharges(amount: number, daysLate: number, settings: LdChargeSettings) {
  const chargeableDays = chargeableLateDays(daysLate, settings.ldGracePeriodDays);
  const uncapped = amount * chargeableDays * settings.ldRatePercentPerDay / 100;
  const capped = settings.ldMaxCapPercent == null ? uncapped : Math.min(uncapped, amount * settings.ldMaxCapPercent / 100);
  return roundMoney(capped);
}

/**
 * Pure L.D. calculator. Dates are normalized to calendar days, avoiding
 * timezone/time-of-day differences. Invalid or missing input returns zeroes.
 */
export function calculateLDCharges(deliveryDueDate?: Date | null, actualDeliveryDate?: Date | null, orderValue = 0, ldRatePercent = 0.067, gracePeriodDays = 5, maxLDCapPercent = 10) {
  if (!deliveryDueDate || !actualDeliveryDate || !Number.isFinite(orderValue) || orderValue <= 0) return { daysLate: 0, chargeableDays: 0, ldCharges: 0, isCapped: false };
  // 1) Whole calendar days late; early/on-time delivery is always zero.
  const daysLate = daysBetween(deliveryDueDate, actualDeliveryDate);
  // 2) Apply the configured grace period.
  const chargeableDays = Math.max(0, daysLate - Math.max(0, Math.floor(gracePeriodDays)));
  // 3) Daily percentage charge; 4) enforce the maximum percentage cap.
  const uncapped = orderValue * (Math.max(0, ldRatePercent) / 100) * chargeableDays;
  const maxCap = orderValue * (Math.max(0, maxLDCapPercent) / 100);
  const isCapped = uncapped > maxCap;
  console.log("[LD DEBUG]", { orderValue, ldRatePercent, deliveryDueDate, actualDeliveryDate, daysLate, gracePeriodDays, chargeableDays, uncapped, maxCap, ldCharges: isCapped ? maxCap : uncapped });
  return { daysLate, chargeableDays, ldCharges: roundMoney(isCapped ? maxCap : uncapped), isCapped };
}

/** Calculates shelf life using calendar days only, so time-of-day cannot skew the result. */
export function shelfLifePercent(manufacturingDate?: Date | null, expiryDate?: Date | null, actualDeliveryDate?: Date | null) {
  if (!manufacturingDate || !expiryDate || !actualDeliveryDate) return null;
  const totalShelfLifeDays = wholeDay(expiryDate) - wholeDay(manufacturingDate);
  if (totalShelfLifeDays <= 0) return null;
  const remainingDays = wholeDay(expiryDate) - wholeDay(actualDeliveryDate);
  // A negative result is intentional: it shows medicine was already expired on delivery.
  return (remainingDays / totalShelfLifeDays) * 100;
}

/** Reusable shelf-life and LD calculator. Dates are compared as calendar days. */
export function calculateShelfLifeAndDeductions(input: { orderDate?: Date | null; grossPeriodDays?: number | null; deliveryDueDate?: Date | null; actualDeliveryDate?: Date | null; manufacturingDate?: Date | null; expiryDate?: Date | null; orderValue: number; ldRatePercent?: number; settings?: LdChargeSettings; shelfLifeDeductionPercent?: number | null; shelfLifeSlabs?: Array<{ remainingPercentMin: unknown; remainingPercentMax?: unknown | null; penaltyPercent: unknown; active?: boolean }> }) {
  const settings = input.settings ?? defaultLdChargeSettings;
  const dueDate = calculateDueDate(input.orderDate, input.grossPeriodDays) ?? input.deliveryDueDate ?? null;
  const daysLate = dueDate && input.actualDeliveryDate ? daysBetween(dueDate, input.actualDeliveryDate) : 0;
  const chargeableDays = chargeableLateDays(daysLate, settings.ldGracePeriodDays);
  const totalShelfLifeDays = input.manufacturingDate && input.expiryDate ? Math.round((wholeDay(input.expiryDate) - wholeDay(input.manufacturingDate)) / 86400000) : null;
  const remainingShelfLifeDays = input.actualDeliveryDate && input.expiryDate ? Math.round((wholeDay(input.expiryDate) - wholeDay(input.actualDeliveryDate)) / 86400000) : null;
  const remainingShelfLifePercent = totalShelfLifeDays && totalShelfLifeDays > 0 && remainingShelfLifeDays != null ? Math.round((remainingShelfLifeDays / totalShelfLifeDays * 100) * 100) / 100 : null;
  const rate = input.shelfLifeDeductionPercent ?? matchingShelfLifePenalty(remainingShelfLifePercent, input.shelfLifeSlabs ?? []);
  return { dueDate, daysLate, chargeableDays, totalShelfLifeDays, remainingShelfLifeDays, remainingShelfLifePercent, deliveryStatus: daysLate > 0 ? "LATE DELIVERY" : "ON TIME", ldCharges: calculateLdCharges(input.orderValue, daysLate, { ...settings, ldRatePercentPerDay: input.ldRatePercent ?? settings.ldRatePercentPerDay }), shelfLifeDeductionPercent: rate, shelfLifeDeductionAmount: roundMoney(input.orderValue * rate / 100) };
}

export function matchingShelfLifePenalty(remainingPercent: number | null, slabs: Array<{ remainingPercentMin: unknown; remainingPercentMax?: unknown | null; penaltyPercent: unknown; active?: boolean }>) {
  if (remainingPercent == null) return 0;
  const activeSlabs = slabs.filter((item) => item.active !== false);
  // New simple policy rows are stored as 0-to-threshold; the lowest matching
  // threshold wins, so "below 50%" takes priority over "below 75%".
  const simpleSlab = activeSlabs.filter((item) => Number(item.remainingPercentMin) === 0 && item.remainingPercentMax != null)
    .filter((item) => remainingPercent < Number(item.remainingPercentMax))
    .sort((a, b) => Number(a.remainingPercentMax) - Number(b.remainingPercentMax))[0];
  if (simpleSlab) return Number(simpleSlab.penaltyPercent ?? 0);
  const slab = activeSlabs
    .sort((a, b) => Number(b.remainingPercentMin) - Number(a.remainingPercentMin))
    .find((item) => remainingPercent >= Number(item.remainingPercentMin) && (item.remainingPercentMax == null || remainingPercent <= Number(item.remainingPercentMax)));
  return Number(slab?.penaltyPercent ?? 0);
}
