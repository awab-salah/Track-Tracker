import { Router, type IRouter } from "express";
// Use explicit `.js` extension so Vercel's tsc-compiled output loads
// under Node ESM without ERR_UNSUPPORTED_DIR_IMPORT. See src/app.ts.
import healthRouter from "./health.js";
import zaincashRouter from "./zaincash.js";
import zaincashV2Router from "./zaincash-v2.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(zaincashRouter);
// V2 routes are mounted at /api/zaincash/v2/* — completely isolated from V1
// at /api/zaincash/*. V1 endpoints are unchanged.
router.use(zaincashV2Router);

export default router;
