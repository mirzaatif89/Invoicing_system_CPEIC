import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Route not found" });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: error.issues });
    return;
  }
  if (error instanceof Error && "status" in error) {
    res.status(Number(error.status)).json({ error: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
};
