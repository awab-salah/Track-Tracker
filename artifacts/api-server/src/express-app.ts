import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
// IMPORTANT: Use explicit `.js` extensions on relative imports.
//
// Vercel's @vercel/node Express framework preset ALSO compiles src/app.ts
// (the file that exports `app`) into a serverless function with `tsc` —
// NOT esbuild. Unlike esbuild, `tsc` does NOT rewrite directory imports
// like "./routes" to "./routes/index.js" at build time, and Node's ESM
// loader (which Vercel uses) refuses to resolve directory imports —
// throwing ERR_UNSUPPORTED_DIR_IMPORT and crashing the lambda with
// FUNCTION_INVOCATION_FAILED for every request that hits this function
// (any path NOT matched by /api/* — e.g. GET /).
//
// Adding `.js` extensions is the standard ESM-compatible pattern: TS
// resolves `./routes/index.js` to `./routes/index.ts` at type-check time,
// and Node resolves it to the emitted `./routes/index.js` at runtime.
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Root URL handler ──────────────────────────────────────────────────────
//
// Vercel's `vercel.json` rewrites every path (`/(.*)`) to the `/api`
// serverless function, so visiting the deployment root URL
// (https://track-tracker-api-server.vercel.app/) — e.g. by clicking the
// "Visit" button on the Vercel deployment dashboard — invokes this lambda
// with `req.url === "/"`. Without a handler for `/`, Express returns its
// default HTML 404 "Cannot GET /", which the user reported as
// "500 FUNCTION_INVOCATION_FAILED" (the deployment appears broken even
// though the function is healthy).
//
// This handler returns a 200 JSON status document so the deployment root
// URL responds cleanly.
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    name: "track-tracker-api-server",
    status: "ok",
    endpoints: {
      health: "/api/healthz",
    },
  });
});

app.use("/api", router);

// ── Catch-all 404 handler ─────────────────────────────────────────────────
//
// Any unmatched path (e.g. `/foo`, `/api/unknown`) returns a structured
// JSON 404 instead of Express's default HTML "Cannot GET /" page. This
// makes the API consistently return JSON for every route, whether the
// route exists or not.
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "not_found",
    message: `Cannot ${req.method} ${req.url}`,
  });
});

export default app;
