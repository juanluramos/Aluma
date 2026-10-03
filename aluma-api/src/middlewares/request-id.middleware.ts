import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  req.requestId = randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  next();
}
