import pino from "pino";

// The pino-pretty transport spawns a worker thread via thread-stream that
// loads a separate worker file (pino-pretty.mjs / pino-worker.mjs) from
// disk. In Vercel's serverless runtime those worker files are not
// deployed alongside the lambda entry, so thread-stream throws ENOENT
// synchronously inside pino's constructor at module-load time, which
// crashes the lambda with FUNCTION_INVOCATION_FAILED.
//
// Only enable the pretty transport for local, non-Vercel development.
const usePrettyTransport =
  !process.env.VERCEL && process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(usePrettyTransport
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
