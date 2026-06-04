import { defineConfig } from "tsdown";

/**
 * Build the four published entry points to `dist/*.js` + `.d.ts`.
 *
 * `emdash` (and its subpaths) and `astro` are externalized — they are peers
 * provided by the host app, never bundled. The client bundle (books table,
 * tooltip JS/CSS strings, parser) is internal and gets inlined into each entry
 * that imports it.
 */
export default defineConfig({
	entry: [
		"src/index.ts",
		"src/sandbox-entry.ts",
		"src/runtime.ts",
		"src/middleware.ts",
	],
	format: "esm",
	dts: true,
	clean: true,
	deps: {
		// Peers provided by the host app — never bundle them.
		neverBundle: [/^emdash(\/.*)?$/, /^astro(\/.*)?$/],
	},
});
