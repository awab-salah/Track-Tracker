// Vercel Serverless Function entry point.
//
// Vercel's @vercel/node builder compiles this file with `tsc` (NOT esbuild),
// so it does NOT bundle relative imports. Only api/index.js is deployed to
// the lambda — sibling directories like src/ are NOT included.
//
// To get a self-contained Express app into the lambda, we re-export from
// dist/index.mjs, which is the esbuild-bundled output of src/index.ts.
// esbuild bundles ALL dependencies (express, cors, pino-http, pino,
// @workspace/api-zod, etc.) into a single file, so no external imports
// are needed at runtime.
//
// vercel.json (in the same directory) uses `functions[].includeFiles` to
// ensure the dist/ directory is included in the lambda's deployment
// package.
export { default } from "../dist/index.mjs";
