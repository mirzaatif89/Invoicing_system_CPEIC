import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { config } from "../config.js";

export type IrisKind = "income" | "sales";
type Session = { browser: Browser; page: Page; kind: IrisKind; userId: number; expiresAt: number; expiryTimer: NodeJS.Timeout };
type PrintDocument = { pdf: Buffer; userId: number; expiresAt: number; expiryTimer: NodeJS.Timeout };
const sessions = new Map<string, Session>();
const printDocuments = new Map<string, PrintDocument>();
const SESSION_TTL = 5 * 60_000;
const PORTAL_URL = "https://iris.fbr.gov.pk/#verifications";

function chromePath() {
  const candidates = [config.CHROME_EXECUTABLE_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"];
  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!found) throw new Error("Chrome was not found. Set CHROME_EXECUTABLE_PATH in backend/.env.");
  return found;
}
async function closeSession(id: string) { const session = sessions.get(id); sessions.delete(id); if (session) { clearTimeout(session.expiryTimer); await session.browser.close().catch(() => undefined); } }
function closePrintDocument(id: string) { const document = printDocuments.get(id); printDocuments.delete(id); if (document) clearTimeout(document.expiryTimer); }
function expiryTimer(id: string) { const timer = setTimeout(() => void closeSession(id), SESSION_TTL); timer.unref(); return timer; }
function printExpiryTimer(id: string) { const timer = setTimeout(() => closePrintDocument(id), SESSION_TTL); timer.unref(); return timer; }
function pruneSessions() { const now = Date.now(); for (const [id, session] of sessions) if (session.expiresAt <= now) void closeSession(id); }
function storePrintDocument(dataUrl: string, userId: number) {
  const payload = dataUrl.match(/^data:application\/pdf;base64,(.+)$/)?.[1];
  if (!payload) return "";
  const id = crypto.randomUUID(), expiresAt = Date.now() + SESSION_TTL;
  printDocuments.set(id, { pdf: Buffer.from(payload, "base64"), userId, expiresAt, expiryTimer: printExpiryTimer(id) });
  return id;
}
export function getIrisPrintDocument(id: string, userId: number) {
  const document = printDocuments.get(id);
  if (!document || document.userId !== userId || document.expiresAt <= Date.now()) { if (document) closePrintDocument(id); throw new Error("This IRIS print document has expired. Please verify the status again."); }
  return document.pdf;
}
function readablePortalMessage(value: string) {
  let text = value;
  try {
    const parsed = JSON.parse(value) as { Entries?: { Entry?: Array<{ Response?: string }> }; response?: string; Response?: string };
    text = parsed.Entries?.Entry?.map((entry) => entry.Response ?? "").filter(Boolean).join("\n") || parsed.response || parsed.Response || value;
  } catch { /* Some IRIS responses are already plain text. */ }
  return text.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function salesTaxLabelDataUrl() {
  const candidates = [path.resolve(process.cwd(), "FBR_Sales_Tax_Label.png"), path.resolve(process.cwd(), "..", "FBR_Sales_Tax_Label.png")];
  const labelPath = candidates.find((candidate) => fs.existsSync(candidate));
  return labelPath ? `data:image/png;base64,${fs.readFileSync(labelPath).toString("base64")}` : "";
}
async function renderSalesTaxPrint(browser: Browser, responseHtml: string) {
  const label = salesTaxLabelDataUrl();
  if (!label) return "";
  const printPage = await browser.newPage();
  try {
    await printPage.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:10mm 12mm}body{margin:0;color:#000;font:12px Arial,Helvetica,sans-serif}.label{display:block;width:100%;height:auto;border-top:1px solid #4aa43f;border-bottom:1px solid #168dcc}.content{padding:10px 9px;line-height:1.25}.content p{margin:0 0 9px}.content b{display:inline-block;min-width:175px}.content font{color:#00e!important}</style></head><body><img class="label" src="${label}"><main class="content">${responseHtml}</main></body></html>`, { waitUntil: "load", timeout: 30_000 });
    const pdf = await printPage.pdf({ format: "A4", printBackground: true });
    return `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`;
  } finally { await printPage.close().catch(() => undefined); }
}
async function downloadOriginalIrisPrint(browser: Browser, page: Page, kind: IrisKind) {
  const selector = 'i.fa-print, .fa-print, [class*=print i], img[src*=print i], [title*=print i], [aria-label*=print i], [data-icon*=print i]';
  await page.waitForSelector(selector, { timeout: 10_000, visible: true }).catch(() => undefined);
  const printIcon = await page.$(selector);
  if (!printIcon) return "";
  const popupTarget = browser.waitForTarget((target) => target.opener() === page.target(), { timeout: 10_000 });
  await printIcon.evaluate((icon) => ((icon.closest("button, a") || icon) as HTMLElement).click());
  const target = await popupTarget;
  const printPage = await target.page();
  if (!printPage) return "";
  try {
    await printPage.waitForFunction(() => document.readyState === "complete", { timeout: 10_000 }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 750));
    const label = salesTaxLabelDataUrl();
    if (label) await printPage.evaluate((source) => {
      const image = document.createElement("img");
      image.src = source; image.alt = "Federal Board of Revenue - Online Verification";
      image.style.cssText = "display:block;width:100%;height:auto;margin:0 0 12px 0;break-inside:avoid";
      document.body.insertBefore(image, document.body.firstChild);
    }, label);
    const pdf = await printPage.pdf({ format: "A4", printBackground: true });
    return `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`;
  } finally { await printPage.close().catch(() => undefined); }
}
async function captchaImage(page: Page) { const canvas = await page.waitForSelector("canvas.captcha-canvas", { timeout: 30_000, visible: true }); if (!canvas) throw new Error("IRIS captcha did not load."); const image = await canvas.screenshot({ encoding: "base64" }); return `data:image/png;base64,${image}`; }
async function setNativeValue(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector, { timeout: 30_000 });
  await page.$eval(selector, (element, nextValue) => { const input = element as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, nextValue); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); input.dispatchEvent(new Event("blur", { bubbles: true })); }, value);
}
export async function createIrisSession(input: { kind: IrisKind; parameterType: string; registrationNo: string; date?: string; userId: number }) {
  pruneSessions();
  if ([...sessions.values()].filter((item) => item.userId === input.userId).length >= 4) throw new Error("Too many open IRIS checks. Please wait a few minutes and try again.");
  const browser = await puppeteer.launch({ headless: true, executablePath: chromePath(), env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled", "--window-size=1440,1000"] });
  const page = await browser.newPage();
  try {
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36");
    await page.evaluateOnNewDocument(() => Object.defineProperty(navigator, "webdriver", { get: () => undefined }));
    await page.goto(PORTAL_URL, { waitUntil: "networkidle2", timeout: 120_000 });
    if (input.kind === "sales") {
      await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("a, li, div")].find((node) => node.textContent?.trim() === "Active Taxpayer List (Sales Tax)")?.click());
      await page.waitForFunction(() => document.body.innerText.includes("Check Sales Tax Active Taxpayer"), { timeout: 30_000 });
    }
    const radio = `input[type=radio][value="${input.parameterType.replace(/["\\]/g, "")}"]`;
    await page.waitForSelector(radio, { timeout: 30_000 });
    await page.$eval(radio, (element) => (element as HTMLInputElement).click());
    await page.waitForFunction(() => (document.querySelector<HTMLInputElement>("#regNo")?.maxLength ?? 0) !== 0);
    await setNativeValue(page, "#regNo", input.registrationNo);
    if (input.kind === "income" && input.date) await setNativeValue(page, "#date", input.date);
    const id = crypto.randomUUID(), expiresAt = Date.now() + SESSION_TTL;
    sessions.set(id, { browser, page, kind: input.kind, userId: input.userId, expiresAt, expiryTimer: expiryTimer(id) });
    return { sessionId: id, captchaImage: await captchaImage(page), expiresAt: new Date(expiresAt).toISOString(), source: PORTAL_URL };
  } catch (error) { await browser.close().catch(() => undefined); throw error; }
}
function getSession(id: string, userId: number) { pruneSessions(); const session = sessions.get(id); if (!session || session.userId !== userId) throw new Error("IRIS session expired. Please load a new captcha."); session.expiresAt = Date.now() + SESSION_TTL; clearTimeout(session.expiryTimer); session.expiryTimer = expiryTimer(id); return session; }
export async function refreshIrisCaptcha(id: string, userId: number) {
  const session = getSession(id, userId);
  await session.page.evaluate(() => document.querySelector<HTMLElement>("canvas.captcha-canvas")?.parentElement?.parentElement?.parentElement?.querySelector<HTMLElement>("button")?.click());
  await new Promise((resolve) => setTimeout(resolve, 400));
  return { captchaImage: await captchaImage(session.page), expiresAt: new Date(session.expiresAt).toISOString() };
}
export async function verifyIrisSession(id: string, userId: number, captcha: string) {
  const session = getSession(id, userId), page = session.page;
  await setNativeValue(page, 'input[placeholder="Enter "]', captcha);
  const messages: string[] = [];
  let portalResponseHtml = "";
  const dialogHandler = async (dialog: { message(): string; accept(): Promise<void> }) => { messages.push(dialog.message()); await dialog.accept(); };
  const responseHandler = async (response: { request(): { resourceType(): string }; url(): string; text(): Promise<string> }) => {
    if (!["xhr", "fetch"].includes(response.request().resourceType())) return;
    try {
      const text = await response.text();
      if (text && text.length < 12_000) {
        messages.push(text);
        try {
          const parsed = JSON.parse(text) as { Entries?: { Entry?: Array<{ Response?: string }> }; response?: string; Response?: string };
          portalResponseHtml ||= parsed.Entries?.Entry?.map((entry) => entry.Response ?? "").filter(Boolean).join("<br>") || parsed.response || parsed.Response || "";
        } catch { /* Non-JSON portal response. */ }
      }
    } catch { /* The portal may navigate before a response body is readable. */ }
  };
  page.on("dialog", dialogHandler);
  page.on("response", responseHandler);
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim().toLowerCase() === "verify")?.click());
  await new Promise((resolve) => setTimeout(resolve, 6_000));
  page.off("dialog", dialogHandler);
  page.off("response", responseHandler);
  let pageText = "";
  try { pageText = await page.evaluate(() => { const visible = (element: Element) => { const rect = (element as HTMLElement).getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }; const elements = [".swal2-popup", ".modal.show", "mat-dialog-container", ".result", "table", ".alert", ".toast"].flatMap((selector) => [...document.querySelectorAll(selector)]).filter(visible); return elements.map((element) => (element as HTMLElement).innerText.trim()).filter(Boolean).join("\n\n"); }); } catch { /* A portal navigation can briefly replace the execution context. */ }
  const result = [...messages.map(readablePortalMessage), pageText].filter(Boolean).join("\n\n").slice(0, 12000) || "IRIS submitted the request but returned no readable result.";
  const captchaRejected = /captcha/i.test(result) && /(invalid|incorrect|wrong|required|enter)/i.test(result);
  if (captchaRejected) return { success: false, captchaRejected: true, message: result, captchaImage: await captchaImage(page), source: PORTAL_URL };
  const safeResponseHtml = portalResponseHtml.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*(["']).*?\1/gi, "");
  let printPdf = safeResponseHtml ? await downloadOriginalIrisPrint(session.browser, page, session.kind).catch(() => "") : "";
  if (!printPdf && safeResponseHtml) printPdf = await renderSalesTaxPrint(session.browser, safeResponseHtml).catch(() => "");
  const printDocumentId = printPdf ? storePrintDocument(printPdf, userId) : "";
  await closeSession(id); return { success: true, found: !/no\s+record\s+exists|record\s+not\s+found/i.test(result), captchaRejected: false, message: result, printPdf: printDocumentId ? `/api/fbr-portal/print/${printDocumentId}` : "", source: PORTAL_URL };
}
