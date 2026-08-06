import { Router, type IRouter } from "express";
// Use explicit `.js` extension so Vercel's tsc-compiled output loads
// under Node ESM without ERR_UNSUPPORTED_DIR_IMPORT. See src/app.ts.
import healthRouter from "./health.js";
import zaincashRouter from "./zaincash.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(zaincashRouter);

export default router;
