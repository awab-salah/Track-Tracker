// Vercel Serverless Function entry point.
//
// Vercel's @vercel/node builder looks for files in the `api/` directory and
// wraps each one as a serverless function. The default export of this file
// is the Express app (from ../src/app), which @vercel/node detects and
// invokes as `app(req, res)` for each incoming HTTP request.
//
// The Express app itself (and all middleware/routes) is defined in
// ../src/app.ts. This file only re-exports it so Vercel has an unambiguous
// entry point at the conventional location.
export { default } from "../src/app";
