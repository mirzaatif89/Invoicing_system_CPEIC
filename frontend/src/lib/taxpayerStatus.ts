import type { VendorTaxStatus } from "../api";

export function resolveTaxpayerStatus(history: VendorTaxStatus[] = [], asOf: string | Date = new Date()): "ACTIVE" | "INACTIVE" {
  const date = new Date(asOf); date.setHours(23, 59, 59, 999);
  const current = history.filter((entry) => new Date(entry.effectiveFrom) <= date).sort((a, b) => +new Date(b.effectiveFrom) - +new Date(a.effectiveFrom))[0];
  return !current || (current.status === "ACTIVE" && current.validUntil && new Date(current.validUntil) < date) ? "INACTIVE" : current.status;
}
