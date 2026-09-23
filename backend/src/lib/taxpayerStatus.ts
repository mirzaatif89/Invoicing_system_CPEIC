export type TaxpayerStatusValue = "ACTIVE" | "INACTIVE";
export function resolveTaxpayerStatus(history: { status: TaxpayerStatusValue; effectiveFrom: Date; validUntil: Date | null }[], asOfDate: Date): TaxpayerStatusValue {
  const asOf = new Date(asOfDate); asOf.setHours(23, 59, 59, 999);
  const current = history.filter((entry) => new Date(entry.effectiveFrom) <= asOf).sort((a, b) => +new Date(b.effectiveFrom) - +new Date(a.effectiveFrom))[0];
  // Unknown history is conservatively treated as INACTIVE.
  if (!current) return "INACTIVE";
  return current.status === "ACTIVE" && current.validUntil && new Date(current.validUntil) < asOf ? "INACTIVE" : current.status;
}
