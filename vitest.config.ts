import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			// bundle.ts is a browser-code template string (not executed in Node);
			// it gets its own jsdom-based test instead of line coverage here.
			reporter: ["text-summary", "text"],
			thresholds: {
				statements: 90,
				branches: 85,
				functions: 90,
				lines: 90,
			},
		},
	},
});
