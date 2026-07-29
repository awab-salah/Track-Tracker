// Thin re-export shim.
//
// Vercel's @vercel/express runtime detects the framework entrypoint by
// scanning these filenames (per @vercel/express/dist/index.js):
//
//   validFilenames = ["app", "index", "server", "src/app", "src/index", "src/server"]
//   validExtensions = ["js", "cjs", "mjs", "ts", "cts", "mts"]
//
// ...and returning the FIRST file whose content matches the regex
// /(?:from|require|import)\s*(?:\(\s*)?["']express["']\s*(?:\))?/ — i.e.
// the first file that directly imports express.
//
// package.json#main is only consulted as a FALLBACK if NONE of the
// validFilenames files imports express.
//
// Previously this file was named src/app.ts and directly imported
// `express`, so Vercel picked it as the entrypoint — compiling it with
// `tsc` (NOT esbuild) into src/app.js inside the lambda. That tsc
// output could not be loaded by Node's ESM loader, because the
// transitive import `@workspace/api-zod` only ships TypeScript sources
// (its package.json exports "./src/index.ts"). Node ESM cannot load
// .ts files, so the lambda crashed with ERR_MODULE_NOT_FOUND and
// Vercel returned 500 FUNCTION_INVOCATION_FAILED for every non-/api/*
// request (GET /, POST /, HEAD /, GET /index, ...).
//
// Fix: this file (src/app.ts, which IS in Vercel's validFilenames list)
// no longer imports `express` directly — it only re-exports the app
// from src/express-app.ts (which is NOT in validFilenames, so Vercel
// never looks at it). With no validFilenames file importing express,
// Vercel falls back to package.json#main ("dist/index.mjs") — the
// esbuild-bundled file that has zero runtime imports of
// @workspace/api-zod (it's inlined at build time). The lambda loads
// cleanly and returns Express's default 404 ("Cannot GET /") instead
// of crashing.
//
// All existing imports of `app from "./app"` (e.g., src/index.ts)
// continue to work unchanged — they get the Express app via this
// re-export.
export { default } from "./express-app.js";
