import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

type AppRole = "ADMIN" | "ACCOUNTANT" | "USER";
type TokenPayload = { sub: string; username: string; role: AppRole };

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const [scheme, bearerToken] = req.headers.authorization?.split(" ") ?? [];
  const token = scheme === "Bearer" ? bearerToken : req.cookies?.access_token;
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as TokenPayload;
    req.user = { id: Number(payload.sub), username: payload.username, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAnyRole(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export const requireRole = (role: AppRole) => requireAnyRole(role);
