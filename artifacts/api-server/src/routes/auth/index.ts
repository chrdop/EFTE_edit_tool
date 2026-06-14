import { Router, type IRouter } from "express";
import crypto from "crypto";
import { addToken } from "../../middleware/auth.js";

const router: IRouter = Router();

router.post("/auth/login", (req, res): void => {
  const appPassword = process.env["APP_PASSWORD"];

  if (!appPassword) {
    res.status(503).json({ error: "Passwortschutz nicht konfiguriert. Bitte APP_PASSWORD setzen." });
    return;
  }

  const { password } = req.body as { password?: unknown };

  if (typeof password !== "string" || password !== appPassword) {
    res.status(401).json({ error: "Falsches Passwort." });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  addToken(token);

  res.json({ token });
});

export default router;
