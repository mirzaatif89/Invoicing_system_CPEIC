import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { config } from "../config.js";

export type AtlKind = "income" | "sales";
const sources: Record<AtlKind, string> = {
  income: "https://download.fbr.gov.pk/IT/ATL_IT.xlsx",
  sales: "https://download.fbr.gov.pk/ST/ATL_ST.xlsx",
};
const cacheDirectory = path.resolve(process.cwd(), "data", "fbr-atl");
const cacheMaxAge = 24 * 60 * 60 * 1000;
const downloads = new Map<AtlKind, Promise<string>>();
const normalize = (value: unknown) => String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function cachedFile(kind: AtlKind) {
  const file = path.join(cacheDirectory, `${kind}.xlsx`);
  let hasStaleCache = false;
  try { const cached = await stat(file); hasStaleCache = cached.size > 1000; if (Date.now() - cached.mtimeMs < cacheMaxAge) return file; } catch { /* Download below. */ }
  const pending = downloads.get(kind);
  if (pending) return pending;
  const download = (async () => {
    await mkdir(cacheDirectory, { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      let response: Response | undefined, lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          response = await fetch(sources[kind], { headers: { "User-Agent": "Mozilla/5.0 WIC-Accounts/1.0", Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*" }, signal: AbortSignal.timeout(10 * 60 * 1000) });
          if (response.ok && response.body) break;
          lastError = new Error(`HTTP ${response.status}`);
        } catch (error) { lastError = error; }
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
      if (!response?.ok || !response.body) throw new Error(`FBR ATL download failed${lastError instanceof Error ? `: ${lastError.message}` : ""}`);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("spreadsheet") && !contentType.includes("octet-stream")) throw new Error("FBR returned an unexpected ATL file format");
      await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporary));
      if ((await stat(temporary)).size < 1000) throw new Error("FBR ATL download was incomplete");
      await rename(temporary, file);
      return file;
    } catch (error) { await unlink(temporary).catch(() => undefined); if (hasStaleCache) return file; throw error; }
    finally { downloads.delete(kind); }
  })();
  downloads.set(kind, download);
  return download;
}

export async function checkFbrAtl(kind: AtlKind, registrationNo: string) {
  const file = await cachedFile(kind), target = normalize(registrationNo);
  const targets = new Set([target, target.replace(/^0+/, "")]);
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(file, { worksheets: "emit", sharedStrings: "cache", styles: "ignore", hyperlinks: "ignore" });
  for await (const worksheet of workbook) {
    let headers: string[] = [];
    for await (const row of worksheet) {
      const values = (row.values as unknown[]).slice(1).map((value) => typeof value === "object" && value && "text" in value ? String((value as { text: unknown }).text) : String(value ?? "").trim());
      if (!headers.length) { headers = values.map((value, index) => value || `Column ${index + 1}`); continue; }
      const matched = values.some((value) => { const candidate = normalize(value); return candidate.length >= 6 && (targets.has(candidate) || targets.has(candidate.replace(/^0+/, ""))); });
      if (matched) return { active: true, registrationNo, taxpayer: Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]).filter(([, value]) => value)), source: sources[kind], listCachedAt: (await stat(file)).mtime.toISOString() };
    }
  }
  return { active: false, registrationNo, taxpayer: null, source: sources[kind], listCachedAt: (await stat(file)).mtime.toISOString() };
}

export async function checkFbrStatl(registrationNo: string, date: string) {
  if (!config.FBR_BEARER_TOKEN) return null;
  const url = new URL("https://gw.fbr.gov.pk/dist/v1/statl");
  url.search = new URLSearchParams({ regno: registrationNo.replace(/\D/g, ""), date }).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${config.FBR_BEARER_TOKEN}`, Accept: "application/json" }, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`FBR STATL API returned HTTP ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const status = String(payload.status ?? "");
  return { active: /^active$/i.test(status), registrationNo, taxpayer: { Status: status || "Unknown" }, source: url.origin + url.pathname, listCachedAt: new Date().toISOString(), fbrResponse: payload };
}
