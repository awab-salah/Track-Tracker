// Root-level Vercel Serverless Function entry point.
//
// This file lives in /api/ at the monorepo root so Vercel discovers it as a
// serverless function automatically. It re-exports the Express app from the
// esbuild-bundled output at artifacts/api-server/dist/index.mjs.
//
// Using .mjs extension ensures Vercel treats this as ESM — the esbuild bundle
// (dist/index.mjs) is ESM and cannot be require()'d from CommonJS.
//
// The build command (in root vercel.json) runs the api-server esbuild bundle
// before deployment, so dist/index.mjs exists at deploy time.
//
// The `includeFiles` setting in vercel.json ensures the dist/ directory is
// packaged into the lambda alongside the compiled function.
export { default } from "../artifacts/api-server/dist/index.mjs";
