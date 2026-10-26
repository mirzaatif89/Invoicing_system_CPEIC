import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128),
});

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const credentials = credentialsSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { username: credentials.username } });
  const valid = user?.active && (await bcrypt.compare(credentials.password, user.passwordHash));

  if (!user || !valid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const options: SignOptions = { expiresIn: config.JWT_EXPIRES_IN as SignOptions["expiresIn"] };
  const token = jwt.sign(
    { username: user.username, role: user.role },
    config.JWT_SECRET,
    { ...options, subject: String(user.id) },
  );

  res.cookie("access_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production" && !config.DESKTOP_WEB_DIR,
    maxAge: 8 * 60 * 60 * 1000,
  });
  res.json({ user: { id: user.id, username: user.username, role: user.role } });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("access_token");
  res.status(204).send();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, username: true, role: true, active: true },
  });
  if (!user?.active) {
    res.status(401).json({ error: "User is no longer active" });
    return;
  }
  res.json({ user });
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const input = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(128) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(input.newPassword, 12) } });
  res.json({ message: "Password changed successfully" });
});
