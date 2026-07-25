// Root-level Vercel Serverless Function entry point.
//
// This file lives in /api/ at the monorepo root so Vercel discovers it as a
// serverless function automatically. It re-exports the Express app from the
// esbuild-bundled output at artifacts/api-server/dist/index.mjs.
//
// The build command (in root vercel.json) runs the api-server esbuild bundle
// before Vercel compiles this function, so dist/index.mjs exists at deploy time.
//
// Vercel's @vercel/node builder compiles this file with tsc — it does NOT
// bundle relative imports. Only api/index.js is deployed to the lambda; sibling
// directories are NOT included unless explicitly configured via `includeFiles`.
//
// The `includeFiles` setting in vercel.json ensures the dist/ directory is
// packaged into the lambda alongside the compiled function.
export { default } from "../artifacts/api-server/dist/index.mjs";
