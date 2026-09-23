import PDFDocument from "pdfkit";
import type { Response } from "express";

export type ReportColumn = { key: string; label: string; width?: number };
export type ReportPayload = {
  title: string;
  filters: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  schedule?: InvoiceSchedule;
};

export type InvoiceSchedule = {
  serialNo: number | string;
  date: string;
  accountCode: string;
  accountName: string;
  settings: { departmentAndDdo: string; costCenter: string; projectDescription: string; projectCode: string; subDetailFunction: string; grantNo: string; aaaAccountName: string; aaaAccountNumber: string; directorFinanceLabel: string; executiveDirectorLabel: string };
  rows: Array<{ chequeNo: string; date: string; amount: number; incomeTax: number; salesTax: number; netAmount: number; payee: string; purpose: string; accountCode: string; allocatedBudget: number; previousExpense: number; totalUpdated: number; balance: number }>;
};

const display = (value: unknown) => value == null ? "" : typeof value === "number" ? Math.round(value).toLocaleString() : String(value);
const whole = (value: number) => Math.round(value).toLocaleString();

const amountInWords = (value: number): string => {
  const ones = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const underThousand = (number: number): string => number < 20 ? ones[number] : number < 100 ? `${tens[Math.floor(number / 10)]}${number % 10 ? `-${ones[number % 10]}` : ""}` : `${ones[Math.floor(number / 100)]} Hundred${number % 100 ? ` ${underThousand(number % 100)}` : ""}`;
  if (!Number.isFinite(value) || value < 0) return "Zero";
  const number = Math.round(value);
  const groups: Array<[number, string]> = [[1_000_000_000, "Billion"], [1_000_000, "Million"], [1_000, "Thousand"]];
  for (const [unit, label] of groups) if (number >= unit) return `${underThousand(Math.floor(number / unit))} ${label}${number % unit ? ` ${amountInWords(number % unit)}` : ""}`;
  return underThousand(number);
};
export const numberToWordsPKR = (value: number): string => `Rupees:- ${amountInWords(value)} Only`;

export type ChequeAuthoritySchedulePdf = {
  serialNo: number | string; date: string; daoReferenceNo: string | null; daoReferenceDate: string | null;
  settings: { departmentAndDdo: string; aaaAccountName: string; aaaAccountNumber: string; costCenter: string; projectDescription: string; subDetailFunction: string; grantNo: string; directorFinanceLabel: string; executiveDirectorLabel: string; districtAccountsOfficerLabel: string; bankForwardingLabel: string };
  rows: Array<{ chequeNo: string; date: string; payee: string; amount: number; accountCode: string }>;
};

export function sendChequeAuthoritySchedule(document: PDFKit.PDFDocument, schedule: ChequeAuthoritySchedulePdf) {
  const left = 18, width = document.page.width - 36;
  const cell = (text: string, x: number, y: number, cellWidth: number, height: number, options: PDFKit.Mixins.TextOptions = {}) => {
    document.rect(x, y, cellWidth, height).lineWidth(0.7).stroke("#111");
    document.text(text, x + 3, y + 4, { width: cellWidth - 6, height: height - 7, ellipsis: true, ...options });
  };
  const drawRow = (values: string[], widths: number[], y: number, height: number, bold = false) => {
    let x = left;
    document.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 7.5 : 7.2);
    values.forEach((value, index) => { cell(value, x, y, widths[index], height, { align: index === 0 || index === 1 || index === 2 ? "center" : index === 4 ? "right" : "left" }); x += widths[index]; });
  };
  document.font("Times-Bold").fontSize(16).text("SCHEDULE OF ASSIGNMENT ACCOUNT CHEQUES", left, 17, { width, align: "center", underline: true, lineBreak: false });
  const labelWidth = 305, valueWidth = width - labelWidth;
  let y = 48;
  // The first row in the supplied authority form has separate serial and date
  // boxes. Keeping them as real cells prevents the date from overwriting the
  // department value (the issue in the previous printout).
  const serialValueWidth = 105, dateLabelWidth = 48, dateValueWidth = valueWidth - serialValueWidth - dateLabelWidth;
  document.font("Helvetica-Bold").fontSize(8); cell("Schedule Serial No.", left, y, labelWidth, 20);
  document.font("Helvetica").fontSize(8); cell(String(schedule.serialNo), left + labelWidth, y, serialValueWidth, 20, { align: "center" });
  document.font("Helvetica-Bold").fontSize(8); cell("Date:-", left + labelWidth + serialValueWidth, y, dateLabelWidth, 20, { align: "right" });
  document.font("Helvetica").fontSize(8); cell(schedule.date, left + labelWidth + serialValueWidth + dateLabelWidth, y, dateValueWidth, 20, { align: "center" });
  y += 20;
  const metadata = [["Name Of Department And DDO", schedule.settings.departmentAndDdo], ["Asaan Assignment Account Name & No.", `${schedule.settings.aaaAccountName} ${schedule.settings.aaaAccountNumber}`], ["Cost Center", schedule.settings.costCenter], ["Project Description", schedule.settings.projectDescription], ["Sub Detail Function", schedule.settings.subDetailFunction], ["Grant No.", schedule.settings.grantNo]];
  metadata.forEach(([label, value], index) => {
    document.font("Helvetica-Bold").fontSize(7.5); cell(label, left, y, labelWidth, 20);
    document.font(index === 0 || index === 1 || index === 4 ? "Helvetica-BoldOblique" : "Helvetica").fontSize(7.5); cell(value, left + labelWidth, y, valueWidth, 20);
    y += 20;
  });
  const widths = [34, 64, 50, 194, 74, width - 416];
  const headerHeight = 28, totalHeight = 26, signatureY = document.page.height - 198;
  const availableRows = Math.max(31, signatureY - y - headerHeight - totalHeight - 116);
  const rowHeight = Math.min(48, Math.max(31, Math.floor(availableRows / Math.max(schedule.rows.length, 1))));
  drawRow(["Sr. #", "Cheque #", "Date", "Payee's Name", "Amount", "Detailed Object Code"], widths, y, headerHeight, true); y += headerHeight;
  const total = schedule.rows.reduce((sum, row) => sum + row.amount, 0);
  schedule.rows.forEach((row, index) => { drawRow([String(index + 1), row.chequeNo, row.date, row.payee, whole(row.amount), row.accountCode], widths, y, rowHeight); y += rowHeight; });
  drawRow(["", "", "", "Total", whole(total), ""], widths, y, totalHeight, true); y += totalHeight + 13;
  document.font("Times-Bold").fontSize(13).text("Certificate", left, y, { width, underline: true, lineBreak: false }); y += 22;
  document.font("Times-Roman").fontSize(10).text("It is certified that money being drawn through above cheque/cheques is required for immediate disbursement and will not be kept in any bank account", left, y, { width, lineBreak: true }); y += 45;
  const signature = (lines: string[], x: number) => lines.forEach((line, index) => document.text(line, x, signatureY + index * 12, { width: 220, height: 12, align: "center", lineBreak: false }));
  document.font("Times-Bold").fontSize(10); signature(schedule.settings.directorFinanceLabel.split("\n"), left); signature(schedule.settings.executiveDirectorLabel.split("\n"), document.page.width - 238);
  const daoDate = schedule.daoReferenceDate || "";
  document.font("Times-Bold").fontSize(10).text(`No. DAO/GRW/TRY/AAA/HM/${schedule.daoReferenceNo || ""}`, left, signatureY + 62, { width: 280, lineBreak: false });
  document.text(`Dated ${daoDate}`, document.page.width - 250, signatureY + 62, { width: 220, align: "right", lineBreak: false });
  document.font("Times-Roman").fontSize(10).text(`Forwarded to ${schedule.settings.bankForwardingLabel} with the authorization to make payment to the above mentioned beneficiaries after confirming from confidential scroll sent by this office. It is also directed no payment should be made above the ceiling amount authorized by this office on form D.`, left, signatureY + 98, { width, lineBreak: true });
  document.font("Times-Bold").fontSize(11); schedule.settings.districtAccountsOfficerLabel.split("\n").forEach((line, index) => document.text(line, document.page.width - 245, document.page.height - 62 + index * 14, { width: 210, align: "center", lineBreak: false }));
}

export function sendAsaanAssignmentAccountSchedule(document: PDFKit.PDFDocument, schedule: InvoiceSchedule) {
  const left = 18, width = document.page.width - 36;
  const cell = (text: string, x: number, y: number, cellWidth: number, height: number, options: PDFKit.Mixins.TextOptions = {}) => { document.rect(x, y, cellWidth, height).stroke("#1b1f22"); document.text(text, x + 3, y + 4, { width: cellWidth - 6, height: height - 6, lineBreak: false, ellipsis: true, ...options }); };
  const row = (values: string[], widths: number[], y: number, height: number, bold = false) => { let x = left; document.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 8 : 7); values.forEach((value, index) => { cell(value, x, y, widths[index], height, { align: index === 0 || index > 5 ? "center" : "left" }); x += widths[index]; }); };
  document.font("Times-Bold").fontSize(18).text("SCHEDULE OF ASSAN ASSIGNMENT ACCOUNT", left, 15, { width, align: "center", underline: true, lineBreak: false });
  document.font("Helvetica-Bold").fontSize(8);
  const labelWidth = 180, valueWidth = width - labelWidth;
  let y = 43;
  const metadata = [["Schedule Serial No.", String(schedule.serialNo)], ["Name Of Department And DDO", schedule.settings.departmentAndDdo], ["Asaan Assignment Account Name", schedule.settings.aaaAccountName], ["Asaan Assignment Account Number", schedule.settings.aaaAccountNumber], ["Cost Center", schedule.settings.costCenter], ["Project Description", schedule.settings.projectDescription], ["Project Code", schedule.settings.projectCode], ["Sub Detail Function", schedule.settings.subDetailFunction], ["Grant No.", schedule.settings.grantNo]];
  metadata.forEach(([label, value], index) => { document.font("Helvetica-Bold"); cell(label, left, y, labelWidth, 20); document.font(index === 1 || index === 2 || index === 7 ? "Helvetica-BoldOblique" : "Helvetica"); cell(value, left + labelWidth, y, valueWidth, 20); if (index === 0) { document.font("Helvetica-Bold").text(`Date:- ${schedule.date}`, left + width - 180, y + 4, { width: 160, align: "right", lineBreak: false }); } y += 20; });
  const widths = [20, 38, 42, 48, 78, 72, 48, 50, 52, 50, 50];
  const headerHeight = 28;
  const signatureY = document.page.height - 78;
  const certificationHeight = 22 + 5 * 13;
  const totalHeight = 30;
  const wordsRowHeight = 22;
  const availableRowsHeight = Math.max(28, signatureY - y - headerHeight - totalHeight - wordsRowHeight - 20 - certificationHeight);
  const rowHeight = Math.min(34, Math.max(24, Math.floor(availableRowsHeight / Math.max(schedule.rows.length, 1))));
  row(["Sr.\n#", "Cheque #", "Date", "Gross\nAmount", "In Respect Of", "Purpose", "Allocated\nBudget", "Present\nBill", "Previous\nExpense", "Total\nUpdate", "Balance"], widths, y, headerHeight, true); y += headerHeight;
  const total = schedule.rows.reduce((sum, item) => sum + item.amount, 0);
  schedule.rows.forEach((item, index) => { row([String(index + 1), item.chequeNo, item.date, whole(item.amount), item.payee, `${item.accountCode} ${item.purpose}`, whole(item.allocatedBudget), whole(item.amount), whole(item.previousExpense), whole(item.totalUpdated), whole(item.balance)], widths, y, rowHeight); y += rowHeight; });
  // Keep one total only: the right-side Present Bill total.  The words are
  // placed in a bordered row directly below the Total label area.
  row(["", "", "", "", "", "Total", "", whole(total), "", "", ""], widths, y, totalHeight, true); y += totalHeight;
  // One merged, bold row keeps the amount in words clean with no empty
  // columns beside it.
  document.font("Helvetica-Bold").fontSize(7);
  cell(numberToWordsPKR(total), left, y, width, wordsRowHeight, { align: "center" });
  y += wordsRowHeight + 8;
  document.font("Times-Bold").fontSize(12).text("It is certified that", left, y, { width: width, height: 16, underline: true, lineBreak: false }); y += 20;
  document.font("Helvetica-Bold").fontSize(8);
  ["No ADVANCE withdrawal or en-block transfer of fund is made in Commercial Bank", "Payment made from AAA only for discharge of accrued Liabilities/Expenditures booked against 'WORK DONE'.", "No cheque issued for 'SELF'", "All payments of AAA made through Crossed Cheque to a valid name of 'PAYEE'", "No money should be OVERDRAWN from Asaan Assignment Account."].forEach((text, index) => { document.text(`${index + 1}:`, left, y, { width: 16, height: 10, lineBreak: false }); document.text(text, left + 18, y, { width: width - 18, height: 10, lineBreak: false }); y += 13; });
  const signature = (lines: string[], x: number) => lines.forEach((line, index) => document.text(line, x, signatureY + index * 12, { width: 220, height: 12, align: "center", lineBreak: false }));
  document.font("Helvetica-Bold").fontSize(9);
  signature(schedule.settings.directorFinanceLabel.split("\n"), left);
  signature(schedule.settings.executiveDirectorLabel.split("\n"), document.page.width - 238);
}

export function sendReport(req: { query: Record<string, unknown> }, res: Response, report: ReportPayload) {
  if (req.query.format !== "pdf") { res.json(report); return; }
  if (report.schedule) {
    const document = new PDFDocument({ size: "A4", layout: "portrait", margin: 18, bufferPages: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="invoice-schedule-${report.schedule.serialNo}.pdf"`);
    document.pipe(res);
    sendAsaanAssignmentAccountSchedule(document, report.schedule);
    document.end();
    return;
  }
  const document = new PDFDocument({ size: "A4", layout: report.columns.length > 6 ? "landscape" : "portrait", margin: 32, bufferPages: true });
  const filename = `${report.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  document.pipe(res);
  document.font("Helvetica-Bold").fontSize(15).text("Wazirabad Institute Of Cardiology, Wazirabad", { align: "center" });
  document.fontSize(13).text(report.title, { align: "center" });
  document.font("Helvetica").fontSize(8).text(`Generated: ${new Date().toLocaleString()}  |  ${report.filters || "All records"}`, { align: "center" });
  document.moveDown();
  const usable = document.page.width - 64;
  const requested = report.columns.reduce((sum, column) => sum + (column.width || 1), 0);
  const widths = report.columns.map((column) => usable * (column.width || 1) / requested);
  const drawRow = (row: Record<string, unknown>, bold = false) => {
    if (document.y > document.page.height - 55) document.addPage();
    const y = document.y;
    let x = 32;
    document.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7);
    report.columns.forEach((column, index) => {
      document.text(display(row[column.key]), x + 2, y + 2, { width: widths[index] - 4, height: 26, ellipsis: true });
      document.rect(x, y, widths[index], 28).stroke("#b8c2cc");
      x += widths[index];
    });
    document.y = y + 28;
  };
  drawRow(Object.fromEntries(report.columns.map((column) => [column.key, column.label])), true);
  report.rows.forEach((row) => drawRow(row));
  if (report.totals) drawRow({ ...Object.fromEntries(report.columns.map((column) => [column.key, ""])), ...report.totals }, true);
  const range = document.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    document.switchToPage(index);
    document.font("Helvetica").fontSize(8).text(`Page ${index + 1} of ${range.count}`, 32, document.page.height - 24, { width: document.page.width - 64, align: "center" });
  }
  document.end();
}
