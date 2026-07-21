// Vercel Serverless Function entry point — DIAGNOSTIC VERSION.
//
// This file wraps the Express app import in a try/catch so that if the
// module fails to load, the actual error message is returned as the HTTP
// response instead of the opaque FUNCTION_INVOCATION_FAILED.
//
// Once the root cause is identified and fixed, this file should be
// replaced with the simple `export { default } from "../src/app";`.

let handler;

try {
  // Use dynamic import to catch any module-load error.
  // Top-level await is supported in Node 18+ / Vercel Node 24.x runtime.
  const mod = await import("../src/app");
  handler = mod.default;
  if (typeof handler !== "function") {
    throw new Error(
      `Expected default export of ../src/app to be a function (Express app), got ${typeof handler}`,
    );
  }
} catch (err) {
  // Capture the error and return it as the HTTP response so we can see
  // exactly what failed at module load time.
  handler = (req, res) => {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        {
          error: "Module load failed in api/index.ts",
          name: err?.name,
          message: err?.message,
          stack: err?.stack,
          cause: err?.cause,
          code: err?.code,
        },
        null,
        2,
      ),
    );
  };
}

export default handler;
