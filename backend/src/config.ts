import "dotenv/config";
import { z } from "zod";

function configureDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return;
  if (process.env.DATABASE_PROVIDER?.trim().toLowerCase() !== "mysql") return;

  const required = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`MySQL is missing required environment values: ${missing.join(", ")}.`);
  }

  const host = process.env.DB_HOST!.trim();
  const port = process.env.DB_PORT!.trim();
  const database = encodeURIComponent(process.env.DB_NAME!.trim());
  const username = encodeURIComponent(process.env.DB_USER!.trim());
  const password = encodeURIComponent(process.env.DB_PASSWORD!);
  process.env.DATABASE_URL = `mysql://${username}:${password}@${host}:${port}/${database}`;
}

configureDatabaseUrl();

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32).default("development-only-secret-change-me-now"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DESKTOP_WEB_DIR: z.string().trim().optional(),
  FBR_BEARER_TOKEN: z.string().trim().optional(),
  CHROME_EXECUTABLE_PATH: z.string().trim().optional(),
});

export const config = configSchema.parse(process.env);

if (
  config.NODE_ENV === "production"
  && ["development-only-secret-change-me-now", "generate-a-unique-random-secret-of-at-least-32-characters"].includes(config.JWT_SECRET)
) {
  throw new Error("Set a unique JWT_SECRET before starting in production.");
}
