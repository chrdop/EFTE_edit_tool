import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions/index.js";
import authRouter from "./auth/index.js";
import { requireAuth } from "../middleware/auth.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use("/sessions", requireAuth);
router.use(sessionsRouter);

export default router;
