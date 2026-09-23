export type VendorType = "COMPANY" | "INDIVIDUAL";
export type Payee = { id: number; code: string; name: string; addressLine1?: string; addressLine2?: string; phone?: string; itaxNo?: string; vendorType: VendorType };
export type AccountCode = { id: number; code: string; name: string; category?: string; incomeTaxPercentCompanyActive:number|string; incomeTaxPercentCompanyInactive:number|string; incomeTaxPercentIndividualActive:number|string; incomeTaxPercentIndividualInactive:number|string; incomeTaxPercentCompany?:number|string; incomeTaxPercentIndividual?:number|string; salesTaxPercentCompany:number|string; salesTaxPercentIndividual:number|string; printFundLabel?:string; sanctionPurposeText?:string };
export type VendorTaxStatus = { id:number; status:"ACTIVE"|"INACTIVE"; effectiveFrom:string; validUntil?:string|null; notes?:string|null };
export type InvoiceItem = { id?: number; payeeId: number; amount: number|string; incomeTax:number|string; salesTax:number|string; ldCharges:number|string; shelfLifeDeduction:number|string; shelfLifeDeductionPercent?:number|string|null; netAmount:number; poNumber?:string; poDate?:string; dcNumber?:string; procurementMode?:"TENDER"|"QUOTATION"; orderDate?:string; gracePeriodDays?:number|null; deliveryDays?:number|null; itemType?:"IMPORTED"|"LOCAL"; deliveryDueDate?:string; actualDeliveryDate?:string; manufacturingDate?:string; expiryDate?:string; chequeNo?:string; chequePaid?:boolean; incomeTaxPaid?:boolean; salesTaxPaid?:boolean; purpose?:string; lineSerial:number; payee:Pick<Payee,"id"|"code"|"name"|"itaxNo"|"vendorType"> };
export type Invoice = { id: number; serialNo: number; date: string; accountCodeId: number; accountCode: Pick<AccountCode,"id"|"code"|"name">; items: InvoiceItem[] };
export type LdChargeSettings = { ldGracePeriodDays: number; ldRatePercentPerDay: number; ldMaxCapPercent: number | null };
export type ShelfLifePenaltySlab = { id?: number; itemCategory?: "IMPORTED"|"LOCAL"; remainingPercentMin: number|string; remainingPercentMax?: number|string|null; penaltyPercent: number|string; active: boolean; notes?: string|null };
export type ItemTypeTaxRule = { id?: number; natureCategory: "MEDICINE"|"DISPOSABLE"|null; originCategory: "LOCAL"|"IMPORTED"|null; incomeTaxPercent: number|string; salesTaxPercent: number|string; active: boolean; notes?: string|null };
export type BudgetType = "Original" | "Revised" | "Supplementary";
export type BudgetDocumentItem = { id?:number; accountCodeId:number; amount:number|string; lineSerial:number; accountCode:Pick<AccountCode,"id"|"code"|"name"> };
export type BudgetDocument = { id:number; date:string; budgetType:BudgetType; documentNo:number; details?:string; items:BudgetDocumentItem[] };

export function fiscalYearStart(date: string) {
  const [year, month] = date.split("-").map(Number);
  return month >= 7 ? year : year - 1;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...options.headers } });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login" && path !== "/auth/me") {
      window.dispatchEvent(new CustomEvent("app:authentication-required"));
    }
    const detail = Array.isArray(data.details)
      ? data.details.map((issue: { path?: string[]; message?: string }) => `${issue.path?.join(".") || "field"}: ${issue.message || "invalid"}`).join("; ")
      : "";
    throw new Error(response.status === 401 ? "Your login session has expired. Please log in again." : detail || data.error || "Request failed");
  }
  return data;
}
