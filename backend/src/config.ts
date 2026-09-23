import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1).default("mysql://root:YOUR_MYSQL_PASSWORD@localhost:3306/institute_accounts"),
  JWT_SECRET: z.string().min(32).default("development-only-secret-change-me-now"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DESKTOP_WEB_DIR: z.string().trim().optional(),
  FBR_BEARER_TOKEN: z.string().trim().optional(),
  CHROME_EXECUTABLE_PATH: z.string().trim().optional(),
});

export const config = configSchema.parse(process.env);
