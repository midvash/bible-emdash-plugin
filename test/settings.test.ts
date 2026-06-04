import { describe, it, expect } from "vitest";

import { DEFAULTS, SETTINGS_SCHEMA, buildAdminFields, loadSettings } from "../src/lib/settings.ts";

type Field = { type: string; action_id: string; label: string; initial_value: unknown; [k: string]: unknown };

describe("settings single source of truth", () => {
	it("schema and defaults describe exactly the same keys", () => {
		expect(Object.keys(SETTINGS_SCHEMA).sort()).toEqual(Object.keys(DEFAULTS).sort());
	});

	it("every schema default equals the canonical DEFAULTS value (no drift)", () => {
		for (const [key, def] of Object.entries(SETTINGS_SCHEMA)) {
			expect(def.default).toEqual((DEFAULTS as Record<string, unknown>)[key]);
		}
	});

	it("includes useCustomColors (regression: it used to be missing from the schema)", () => {
		expect(SETTINGS_SCHEMA).toHaveProperty("useCustomColors");
		expect(DEFAULTS.useCustomColors).toBe(false);
	});

	it("defaults underlineLinks to false (regression: schema once said true)", () => {
		expect(DEFAULTS.underlineLinks).toBe(false);
		expect(SETTINGS_SCHEMA.underlineLinks.default).toBe(false);
	});
});

describe("buildAdminFields", () => {
	const fields = buildAdminFields(DEFAULTS) as Field[];
	const byId = Object.fromEntries(fields.map((f) => [f.action_id, f])) as Record<string, Field>;

	it("emits one field per schema key, pre-filled with current values", () => {
		expect(fields).toHaveLength(Object.keys(SETTINGS_SCHEMA).length);
		expect(byId.language.initial_value).toBe(DEFAULTS.language);
		expect(byId.enabled.initial_value).toBe(DEFAULTS.enabled);
	});

	it("maps setting types to Block Kit element types", () => {
		expect(byId.enabled.type).toBe("toggle");
		expect(byId.language.type).toBe("select");
		expect(byId.selectors.type).toBe("text_input");
		expect(byId.cacheTtlSeconds.type).toBe("number_input");
	});

	it("carries select options, including the full version list", () => {
		expect(Array.isArray(byId.language.options)).toBe(true);
		expect((byId.defaultVersion.options as unknown[]).length).toBeGreaterThanOrEqual(20);
	});

	it("carries number bounds and multiline flags", () => {
		expect(byId.cacheTtlSeconds.min).toBe(60);
		expect(byId.cacheTtlSeconds.max).toBe(31_536_000);
		expect(byId.selectors.multiline).toBe(true);
		expect(byId.linkColor.multiline).toBe(false);
	});
});

describe("loadSettings", () => {
	it("overlays persisted values over the defaults", async () => {
		const stored: Record<string, unknown> = {
			"settings:language": "en",
			"settings:theme": "dark",
		};
		const s = await loadSettings(async (key) => stored[key] ?? null);
		expect(s.language).toBe("en");
		expect(s.theme).toBe("dark");
		expect(s.defaultVersion).toBe(DEFAULTS.defaultVersion); // untouched key keeps default
	});

	it("falls back entirely to defaults when nothing is stored", async () => {
		const s = await loadSettings(async () => null);
		expect(s).toEqual(DEFAULTS);
	});

	it("ignores undefined values from the getter", async () => {
		const s = await loadSettings(async () => undefined);
		expect(s).toEqual(DEFAULTS);
	});
});
