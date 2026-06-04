import { describe, it, expect } from "vitest";

import { getBibleByMidvashSnippets, DEFAULTS } from "../src/runtime.ts";

/** Build a getPluginSetting-style getter from a flat map of key → value. */
function getter(values: Record<string, unknown> = {}) {
	return async (_pluginId: string, key: string) => (key in values ? values[key] : null);
}

describe("getBibleByMidvashSnippets", () => {
	it("returns inline JS+CSS when enabled with default settings", async () => {
		const snips = await getBibleByMidvashSnippets(getter());
		expect(snips.enabled).toBe(true);
		expect(snips.js).not.toContain("__SETTINGS__"); // token was substituted
		expect(snips.js).toContain("article"); // default selectors injected
		expect(snips.css).toContain(".midvash-tooltip");
	});

	it("does NOT emit color overrides by default (useCustomColors off)", async () => {
		const snips = await getBibleByMidvashSnippets(getter());
		// The base CSS *references* the custom props (var(--midvash-link-color, inherit)),
		// but no :root block should *define* them unless the admin opted in.
		expect(snips.css).not.toContain(":root");
	});

	it("emits color overrides only when useCustomColors is on", async () => {
		const snips = await getBibleByMidvashSnippets(getter({ useCustomColors: true }));
		expect(snips.css).toContain("--midvash-link-color: #B17027");
		expect(snips.css).toContain("--midvash-underline-line: none"); // underlineLinks default false
	});

	it("injects language-specific tooltip strings into the client JS", async () => {
		const pt = await getBibleByMidvashSnippets(getter());
		expect(pt.js).toContain("Ler mais ↗");
		// The injected settings carry the language-specific strings. (The bundle
		// also embeds a PT-BR fallback literal, so we assert on the injected one.)
		const en = await getBibleByMidvashSnippets(getter({ language: "en" }));
		expect(en.js).toContain('"readMore":"Read more ↗"');
	});

	it("returns empty snippets when disabled", async () => {
		const snips = await getBibleByMidvashSnippets(getter({ enabled: false }));
		expect(snips).toEqual({ enabled: false, js: "", css: "" });
	});

	it("exposes the client-relevant defaults", () => {
		expect(DEFAULTS.enabled).toBe(true);
		expect(DEFAULTS).not.toHaveProperty("cacheTtlSeconds"); // server-only field excluded
	});
});
