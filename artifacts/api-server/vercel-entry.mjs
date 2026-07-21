// Vercel @vercel/express runtime entrypoint.
//
// Vercel's @vercel/express runtime (@vercel/express/dist/index.js) detects
// the framework entrypoint by:
//
//   1. Scanning these filenames in the project root:
//        validFilenames = ["app", "index", "server", "src/app", "src/index", "src/server"]
//        validExtensions = ["js", "cjs", "mjs", "ts", "cts", "mts"]
//      ...and returning the FIRST file whose content matches the regex
//      /(?:from|require|import)\s*(?:\(\s*)?["']express["']\s*(?:\))?/
//      (i.e., directly imports express).
//
//   2. If no validFilenames file matches, falling back to package.json#main
//      — but ONLY if that file also matches the regex.
//
//   3. Otherwise THROWING "No entrypoint found which imports express" and
//      failing the deployment.
//
// We can't satisfy step 1 without Vercel tsc-compiling src/app.ts (which
// crashes at runtime due to @workspace/api-zod shipping only .ts sources).
// We can't satisfy step 2 with dist/index.mjs because esbuild inlines
// express (so the bundled file has no `from "express"` text for the regex
// to match).
//
// This wrapper file satisfies step 2: it directly imports `express` (so
// the regex matches) AND re-exports the actual Express app from the
// esbuild-bundled dist/index.mjs (which has all dependencies inlined
// and loads cleanly under Node ESM).
//
// The `import "express"` is a side-effect import — it ensures the
// express package is resolvable from node_modules (it's a runtime
// dependency in package.json) but doesn't actually use it, because
// dist/index.mjs already has express inlined. The import is here
// solely to make Vercel's regex check pass.
//
// Set package.json#main to this file so Vercel uses it as the framework
// entrypoint for non-/api/* paths (e.g. GET /).
import "express";
export { default } from "./dist/index.mjs";
