import type { Request, Response, NextFunction } from "express";

const validTokens = new Set<string>();

export function addToken(token: string): void {
  validTokens.add(token);
}

export function removeToken(token: string): void {
  validTokens.delete(token);
}

export function isValidToken(token: string): boolean {
  return validTokens.has(token);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  if (!isValidToken(token)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
