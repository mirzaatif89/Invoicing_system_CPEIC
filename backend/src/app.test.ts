import { describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("./lib/prisma.js", () => ({
  prisma: { user: { findUnique: vi.fn(), count: vi.fn().mockResolvedValue(1) } },
}));

import { app } from "./app.js";

describe("API", () => {
  it("reports health", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.database).toBe("connected");
  });

  it("rejects invalid login input", async () => {
    const response = await request(app).post("/api/auth/login").send({ username: "", password: "x" });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("protects the current-user endpoint", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
  });
});
