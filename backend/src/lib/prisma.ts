import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

if (process.env.WIC_LEGACY_JSON_TEXT === "1") {
  type LegacyParams = { args?: unknown; [key: string]: unknown };
  type LegacyNext = (params: LegacyParams) => Promise<unknown>;
  const client = prisma as unknown as {
    $use: (middleware: (params: LegacyParams, next: LegacyNext) => Promise<unknown>) => void;
  };
  const convert = (value: unknown, direction: "encode" | "decode", key = ""): unknown => {
    if (direction === "encode" && ((key === "itemTypes" && Array.isArray(value)) || (key === "details" && value && typeof value === "object"))) {
      return JSON.stringify(value);
    }
    if (direction === "decode" && (key === "itemTypes" || key === "details") && typeof value === "string") {
      try { return JSON.parse(value) as unknown; } catch { return value; }
    }
    if (Array.isArray(value)) return value.map((item) => convert(item, direction));
    if (!value || typeof value !== "object") return value;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, convert(child, direction, childKey)]));
  };
  client.$use(async (params, next) => {
    const result = await next({ ...params, args: convert(params.args, "encode") });
    return convert(result, "decode");
  });
}
