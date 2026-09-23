import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "./prisma.js";
import { getInstituteSettings } from "./instituteSettings.js";
import { numberToWordsPKR } from "./reportOutput.js";
import { calculateDueDate, calculateLDCharges, daysBetween, selectTaxRates, shelfLifePercent } from "./autoDeductions.js";

export const money = (value: unknown) => Number(value ?? 0);
export function contingentNetAmount(item: { amount: unknown; ldCharges?: unknown; shelfLifeDeduction?: unknown; incomeTax: unknown; salesTax: unknown }) {
  return Math.round((money(item.amount) - money(item.ldCharges) - money(item.shelfLifeDeduction) - money(item.incomeTax) - money(item.salesTax) + Number.EPSILON) * 100) / 100;
}
export function calculateBudgetPosition(totalBudget: number, presentBill: number, previousBill: number) {
  const totalUpToDate = presentBill + previousBill;
  return { totalBudget, presentBill, previousBill, totalUpToDate, balance: totalBudget - totalUpToDate };
}

export async function assembleContingentBill(invoiceId: number, itemId?: number, selectedItemIds?: number[]) {
  const requestedItemIds = selectedItemIds?.length ? [...new Set(selectedItemIds)] : itemId ? [itemId] : undefined;
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { accountCode: true, items: { where: requestedItemIds ? { id: { in: requestedItemIds } } : undefined, include: { payee: true } } },
  });
  const item = invoice?.items[0];
  if (!invoice || !item || (requestedItemIds && invoice.items.length !== requestedItemIds.length)) {
    throw Object.assign(new Error("One or more selected supply orders do not belong to this Contingent Bill"), { status: 400 });
  }
  const itemIds = invoice.items.map((row) => row.id);
  const itemIdValue = item.id;
  const lineSerial = item.lineSerial;

  const year = invoice.date.getUTCMonth() >= 6 ? invoice.date.getUTCFullYear() : invoice.date.getUTCFullYear() - 1;
  const dates = { gte: new Date(`${year}-07-01T00:00:00Z`), lte: new Date(`${year + 1}-06-30T23:59:59Z`) };
  const [budget, previous, settings] = await Promise.all([
    prisma.budgetDocumentItem.aggregate({
      _sum: { amount: true },
      where: { accountCodeId: invoice.accountCodeId, budgetDocument: { date: dates } },
    }),
    prisma.invoiceItem.aggregate({
      _sum: { amount: true },
      where: {
        invoice: { accountCodeId: invoice.accountCodeId, date: dates },
        NOT: { id: { in: itemIds } },
        OR: [
          { invoice: { date: { lt: invoice.date } } },
          { invoice: { date: invoice.date, serialNo: { lt: invoice.serialNo } } },
          { AND: [{ invoiceId: invoice.id }, { lineSerial: { lt: lineSerial } }] },
        ],
      },
    }),
    getInstituteSettings(),
  ]);

  const amount = invoice.items.reduce((sum, row) => sum + money((row as any).amount), 0), incomeTax = invoice.items.reduce((sum, row) => sum + money((row as any).incomeTax), 0), salesTax = invoice.items.reduce((sum, row) => sum + money((row as any).salesTax), 0);
  const dueDate = (item as any).deliveryDueDate || calculateDueDate((item as any).orderDate, (item as any).grossPeriodDays);
  const ldResult = calculateLDCharges(dueDate, (item as any).actualDeliveryDate, amount);
  const ldCharges = invoice.items.reduce((sum, row) => sum + money((row as any).ldCharges), 0) || ldResult.ldCharges;
  const shelfLifeDeduction = invoice.items.reduce((sum, row) => sum + money((row as any).shelfLifeDeduction), 0);
  const netAmount = contingentNetAmount({ amount, ldCharges, shelfLifeDeduction, incomeTax, salesTax });
  const accountCode = invoice.accountCode as any;
  const daysLate = ldResult.daysLate;
  const chargeableDays = ldResult.chargeableDays;
  const remainingShelfLifePercent = shelfLifePercent((item as any).manufacturingDate, (item as any).expiryDate, (item as any).actualDeliveryDate);
  const rates = selectTaxRates(accountCode, (item as any).payee?.vendorType ?? "INDIVIDUAL");
  return {
    invoiceId: invoice.id, itemId: itemIdValue, itemCount: invoice.items.length, serialNo: invoice.serialNo, date: invoice.date,
    accountCode,
    payee: (item as any).payee,
    item: { ...(item as any), amount, ldCharges, shelfLifeDeduction, incomeTax, salesTax, amountAfterCharges: amount - ldCharges - shelfLifeDeduction, daysLate, chargeableDays, netAmount, remainingShelfLifePercent },
    rates,
    budget: calculateBudgetPosition(money(budget._sum.amount), amount, money(previous._sum.amount)), settings,
  };
}

const clauses = [
  "Received payment and certified that the expenditure charged in this bill could not with due regard to the interest of the Public Services be avoided. I have satisfied myself that the charges entered in this bill have been really paid.",
  "Certified that all the articles detailed in the vouchers attached to the bill and in those retained in my office have been accounted for in the Stock Register.",
  "Certified that the Purchases billed for have been received in good order that their quantities are correct and their quality good, that the rates paid are not in excess of the accepted and market rates and that suitable notes of payment have been recorded against the indents and invoices concerned to prevent double payments.",
  "Certified that in respect of conveyance charged for in the bill, a suitable portion of the amount has been charged to Government and the balance sheet by the touring officers and their subordinates.",
  "Certified that the charges on account of electricity do not include any expenses on account of private consumption.",
  "Certified that Income tax will be deducted before making payment to the firm at the prescribed rates if due.",
];
const fmt = (value: number) => Math.round(value).toLocaleString("en-PK");
const date = (value: Date | null) => value ? value.toISOString().slice(0, 10).split("-").reverse().join("/") : "";
const logoPath = [
  resolve(process.cwd(), "..", "logo.png"),
  resolve(process.cwd(), "..", "frontend", "public", "logo.png"),
  resolve(process.cwd(), "logo.png"),
].find(existsSync);
export async function createContingentBillPdf(invoiceId: number, itemId?: number, selectedItemIds?: number[]) {
  const data = await assembleContingentBill(invoiceId, itemId, selectedItemIds);
  const doc = new PDFDocument({ size: "A4", margins: { top: 16, left: 18, right: 18, bottom: 16 }, bufferPages: true });
  const buffers: Buffer[] = []; doc.on("data", (chunk) => buffers.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(buffers))); doc.on("error", reject); });
  const accountCode = data.accountCode as any;
  const item = data.item as any;
  const itemTypes = Array.isArray(item.itemTypes) && item.itemTypes.length ? item.itemTypes.map(String) : [String(item.itemType ?? "LOCAL")];
  const categoryAmount = (category: string) => !itemTypes.includes(category) ? "-" : itemTypes.length === 1 ? fmt(item.amount) : "Selected";
  const left = 20, right = doc.page.width - 20, width = right - left;
  const line = (x1: number, y1: number, x2: number, y2: number) => doc.moveTo(x1, y1).lineTo(x2, y2).stroke("#111");
  const cell = (x: number, y: number, w: number, h: number, text = "", bold = false, align: "left" | "center" | "right" = "left", size = 7.4) => {
    doc.rect(x, y, w, h).stroke("#111");
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(text, x + 3, y + Math.max(2, (h - size) / 2 - 1), { width: w - 6, height: h - 3, align, ellipsis: true, lineBreak: false });
  };
  const amountRows = [
    ["Gross Amount", item.amount], ["L.D Charges", item.ldCharges], ["Shelf Life", item.shelfLifeDeduction],
    ["Amount after Charges", item.amountAfterCharges], [`Income Tax @ ${money(data.rates.incomeTaxPercent)}`, item.incomeTax],
    [`GST ${money(data.rates.salesTaxPercent)}%`, item.salesTax], ["Net Amount", item.netAmount],
  ] as const;

  if (logoPath) doc.image(logoPath, left, 17, { fit: [25, 25] });
  doc.font("Times-Bold").fontSize(10).text(data.settings.departmentAndDdo, 115, 18, { width: 350, align: "center" });
  const dcLabel = data.itemCount === 1 ? (item.dcNumber || "-") : "Multiple DCs";
  doc.font("Helvetica").fontSize(6.8).text(`Contingent Bill No. ${data.serialNo}  |  PO No. ${item.poNumber || "-"}  |  DC No. ${dcLabel}`, left, 43, { width, align: "center" });

  // Product split and firm details - official-format header block.
  cell(140, 57, 95, 16, "Medicine", true); cell(235, 57, 62, 16, categoryAmount("MEDICINE"), false, "right");
  cell(140, 73, 95, 16, "Disposable", true); cell(235, 73, 62, 16, categoryAmount("DISPOSABLE"), false, "right");
  cell(140, 89, 95, 16, "Total", true); cell(235, 89, 62, 16, fmt(item.amount), true, "right");
  doc.font("Helvetica-Bold").fontSize(7.5).text(data.payee.name, 355, 60, { width: 210, align: "center" });
  doc.font("Helvetica").fontSize(6.8).text(`NTN: ${data.payee.itaxNo || "-"}   |   ${item.procurementMode === "TENDER" ? "Tender" : item.procurementMode === "QUOTATION" ? "Quotation" : ""}`, 355, 75, { width: 210, align: "center" });

  const amountX = 392, amountY = 126, amountW = 165, labelW = 102, rowH = 17;
  doc.font("Times-Bold").fontSize(9).text("AMOUNT OF THE BILL...", 300, 132, { width: 86, align: "right" });
  cell(amountX, amountY, amountW, 17, "Rs.", true, "center", 8);
  amountRows.forEach(([label, value], index) => {
    const y = amountY + 17 + index * rowH;
    cell(amountX, y, labelW, rowH, label, index === amountRows.length - 1);
    cell(amountX + labelW, y, amountW - labelW, rowH, fmt(value), index === amountRows.length - 1, "right");
  });

  const budgetY = 151;
  [
    ["i) Allotment of the Year", data.budget.totalBudget], ["ii) Total of Present Bill", data.budget.presentBill],
    ["iii) Total of Previous Bill", data.budget.previousBill], ["iv) Total Up-to-date (ii)+ (iii)", data.budget.totalUpToDate],
    ["v) Balance (i)-(iv)", data.budget.balance],
  ].forEach(([label, value], index) => {
    const y = budgetY + index * 21;
    doc.font("Helvetica-Bold").fontSize(8).text(String(label), left, y, { width: 230 });
    doc.text("= Rs.", 250, y, { width: 43, align: "right" });
    line(298, y + 13, 370, y + 13);
    doc.font(index === 1 ? "Helvetica-Bold" : "Helvetica").text(fmt(Number(value)), 302, y, { width: 66, align: "right" });
  });

  const wordsY = 306;
  doc.font("Helvetica-Bold").fontSize(8.5).text("Rupees (in words):", left, wordsY, { width: 120 });
  doc.font("Helvetica-Bold").fontSize(7.4).text(numberToWordsPKR(item.netAmount).replace(/^Rupees:-\s*/, ""), 145, wordsY, { width: 410 });
  line(left, wordsY + 18, right, wordsY + 18);

  let y = 336;
  clauses.forEach((clause, index) => {
    doc.font("Helvetica").fontSize(7.3).text(`${index ? `${index}. ` : ""}${clause}`, left, y, { width, align: "justify" });
    y = doc.y + 2;
  });
  line(left, 492, right, 492);

  const preX = 100, preW = 290, valueX = 265;
  doc.font("Helvetica-Bold").fontSize(8.5).text("Pre-audited and Passed for :", preX, 505);
  [["Rs.", item.amount], ["Rupees", numberToWordsPKR(item.amount).replace(/^Rupees:-\s*/, "")]].forEach(([label, value], index) => {
    const yy = 523 + index * 19;
    doc.font("Helvetica-Bold").fontSize(8).text(String(label), preX, yy, { width: 62 });
    line(preX, yy + 14, preX + preW, yy + 14);
    doc.font("Helvetica-Bold").text(String(typeof value === "number" ? fmt(value) : value), valueX, yy, { width: preW - (valueX - preX), align: "right" });
  });
  doc.font("Helvetica-Bold").fontSize(8).text("Deductions:", preX, 564);
  [["I.Tax", item.incomeTax], ["L.D.", item.ldCharges], ["Shelf Life", item.shelfLifeDeduction], ["GST", item.salesTax], ["Cheque for Rs", item.netAmount]].forEach(([label, value], index) => {
    const yy = 580 + index * 15;
    doc.font(index === 4 ? "Helvetica-Bold" : "Helvetica").fontSize(8).text(String(label), preX, yy, { width: 90 });
    line(preX, yy + 13, preX + preW, yy + 13);
    doc.font(index === 4 ? "Helvetica-Bold" : "Helvetica").text(fmt(Number(value)), valueX, yy, { width: preW - (valueX - preX), align: "right" });
  });

  const signatureY = 671;
  [data.settings.accountOfficerLabel, data.settings.deputyDirectorFinanceLabel, data.settings.directorFinanceLabel].forEach((label, index) => {
    doc.font("Helvetica-Bold").fontSize(7.2).text(label, 45 + index * 175, signatureY, { width: 135, align: "center" });
  });
  line(left, 715, right, 715);
  doc.font("Times-Bold").fontSize(9).text("FOR USE IN AUDIT OFFICE/TREASURY", left, 724, { width, align: "center" });
  const auditRows = [["Token No.", "Date"], ["Pay Rs.", ""], ["Rupees (in words)", ""]] as const;
  auditRows.forEach(([label, rightLabel], index) => {
    const yy = 747 + index * 19;
    doc.font("Helvetica-Bold").fontSize(8).text(label, left + 4, yy, { width: 95 });
    line(left + 85, yy + 13, index === 2 ? right : 275, yy + 13);
    if (rightLabel) { doc.text(rightLabel, 445, yy, { width: 42 }); line(486, yy + 13, right, yy + 13); }
  });
  doc.font("Helvetica-Bold").fontSize(8).text("District Accounts Officer\nTreasury Officer", 70, 806, { width: 150, align: "center" });
  doc.text("Asstt. Accountant General\nAccounts Officer", 390, 806, { width: 150, align: "center" });
  doc.end(); return { buffer: await done, filename: `contingent-bill-${data.serialNo}-${item.lineSerial}.pdf` };
}
