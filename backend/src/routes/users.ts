import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole("ADMIN"));
usersRouter.get("/", async (_req, res) => res.json({ data: await prisma.user.findMany({ select: { id: true, username: true, role: true, active: true, createdAt: true, updatedAt: true }, orderBy: { username: "asc" } }) }));
usersRouter.post("/", async (req, res) => {
  const input = z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(8).max(128), role: z.nativeEnum(UserRole) }).parse(req.body);
  try { res.status(201).json(await prisma.user.create({ data: { username: input.username, passwordHash: await bcrypt.hash(input.password, 12), role: input.role }, select: { id: true, username: true, role: true, active: true } })); }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { res.status(409).json({ error: "Username already exists" }); return; } throw error; }
});
usersRouter.put("/:id", async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const input = z.object({ role: z.nativeEnum(UserRole), active: z.boolean() }).parse(req.body);
  if (id === req.user!.id && !input.active) { res.status(400).json({ error: "You cannot deactivate your own account" }); return; }
  try { res.json(await prisma.user.update({ where: { id }, data: input, select: { id: true, username: true, role: true, active: true } })); }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") { res.status(404).json({ error: "User not found" }); return; } throw error; }
});
