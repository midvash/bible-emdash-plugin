import { defineConfig } from "tsdown";

/**
 * Build config for npm distribution.
 *
 * Dev, tests, and `npm run typecheck` all run against `src/` directly — this
 * build only produces the published `dist/` (ESM + .d.mts types) that the
 * package `exports` map points to. The marketplace tarball is built separately
 * by `emdash plugin bundle`, which re-bundles `src/sandbox-entry.ts` into a
 * single backend.js.
 */
export default defineConfig({
	entry: ["src/index.ts", "src/sandbox-entry.ts", "src/runtime.ts", "src/middleware.ts"],
	format: "esm",
	dts: true,
	platform: "neutral",
	// Keep host/peer modules out of both the JS bundle and the .d.ts bundle.
	// (Listing them also stops the dts bundler from trying to inline astro's
	// transitive CommonJS type deps like postcss/typescript.)
	external: ["emdash", "emdash/plugin", "astro"],
	clean: true,
	outDir: "dist",
});
