import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string().min(1).default("file:./data/invoice_app_for_usman.db"),
  JWT_SECRET: z.string().min(32).default("development-only-secret-change-me-now"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DESKTOP_WEB_DIR: z.string().trim().optional(),
  FBR_BEARER_TOKEN: z.string().trim().optional(),
  CHROME_EXECUTABLE_PATH: z.string().trim().optional(),
});

export const config = configSchema.parse(process.env);
