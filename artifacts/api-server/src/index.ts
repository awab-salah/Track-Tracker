import app from "./app";
import { logger } from "./lib/logger";

// Vercel serverless runtime:
//   - Vercel sets process.env.VERCEL=1 at runtime
//   - Vercel's @vercel/node Express preset wraps the default export of this
//     module as the HTTP request handler. We must NOT start a long-running
//     HTTP server, and we must NOT require PORT (Vercel does not provide
//     one — it does not make sense for a serverless function).
//
// Local / non-Vercel runtime:
//   - Read PORT from the environment and start the long-running HTTP server
//     via app.listen().
if (!process.env.VERCEL) {
  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

export default app;
