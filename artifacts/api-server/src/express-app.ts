import express, { type Express } from "express";
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

app.use("/api", router);

export default app;
